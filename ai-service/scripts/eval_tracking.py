"""
IBVAP Tracking Evaluation & Benchmarking Suite
Evaluates tracking quality across clips in samples/ and computes proxy metrics:
- Unique track IDs
- Average track lifetime (seconds)
- Share of tracks shorter than 1 second (ghost tracks %)
- Track fragmentation (new ID appearing within 1.5s near where another vanished)
- ID changes / switches per minute
- Processing throughput (FPS)
"""

import argparse
import glob
import json
import math
import os
import sys
import time
from typing import Dict, List, Any
import cv2
import numpy as np

# Ensure app package is importable
current_dir = os.path.dirname(os.path.abspath(__file__))
parent_dir = os.path.dirname(current_dir)
if parent_dir not in sys.path:
    sys.path.insert(0, parent_dir)

from app.services.detector import SurveillanceDetector
from app.services.low_light import compute_frame_luminance, apply_clahe_enhancement
from app.config import settings


def run_video_evaluation(video_path: str, detector: SurveillanceDetector) -> Dict[str, Any]:
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        print(f"Error: Could not open {video_path}")
        return {}

    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH) or 640)
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT) or 360)
    duration_sec = total_frames / max(1.0, fps)

    # Per-track records: track_id -> { "first_seen": t, "last_seen": t, "hits": n, "positions": [(x, y, t)] }
    tracks: Dict[int, Dict[str, Any]] = {}
    frame_times: List[float] = []

    frame_idx = 0
    start_eval_time = time.time()

    while cap.isOpened():
        ret, frame = cap.read()
        if not ret or frame is None:
            break

        frame_idx += 1
        t_sec = frame_idx / fps
        t_start_proc = time.time()

        # Low light check & CLAHE
        lum = compute_frame_luminance(frame)
        if lum < settings.LOW_LIGHT_LUMINANCE_THRESHOLD and settings.ENABLE_LOW_LIGHT_CLAHE:
            frame = apply_clahe_enhancement(frame)

        # Process through tracker
        entities, _ = detector.process_frame(frame, t_sec)
        frame_times.append(time.time() - t_start_proc)

        # Record observations
        for ent in entities:
            tid = ent.id
            cx = ent.bbox.x + ent.bbox.width / 2.0
            cy = ent.bbox.y + ent.bbox.height / 2.0

            if tid not in tracks:
                tracks[tid] = {
                    "first_seen": t_sec,
                    "last_seen": t_sec,
                    "hits": 1,
                    "class": ent.class_name,
                    "positions": [(cx, cy, t_sec)],
                }
            else:
                tracks[tid]["last_seen"] = t_sec
                tracks[tid]["hits"] += 1
                tracks[tid]["positions"].append((cx, cy, t_sec))

    cap.release()
    total_elapsed = time.time() - start_eval_time
    avg_fps = frame_idx / max(0.001, total_elapsed)

    # Compute metrics
    unique_ids = len(tracks)
    if unique_ids == 0:
        return {
            "file": os.path.basename(video_path),
            "frames": frame_idx,
            "duration_sec": round(duration_sec, 2),
            "unique_track_ids": 0,
            "avg_lifetime_sec": 0.0,
            "ghost_share_pct": 0.0,
            "fragmentations": 0,
            "id_changes_per_min": 0.0,
            "fps": round(avg_fps, 1),
        }

    lifetimes = [t["last_seen"] - t["first_seen"] for t in tracks.values()]
    avg_lifetime = sum(lifetimes) / len(lifetimes)

    # Ghost tracks: active for less than 1.0 second
    ghost_tracks = [t for t in tracks.values() if (t["last_seen"] - t["first_seen"]) < 1.0]
    ghost_share = (len(ghost_tracks) / unique_ids) * 100.0

    # Fragmentation: a new track appearing within 1.5s near where another track vanished
    fragmentation_count = 0
    track_list = list(tracks.items())

    for i in range(len(track_list)):
        tid1, t1 = track_list[i]
        last_x, last_y, last_t = t1["positions"][-1]

        for j in range(len(track_list)):
            if i == j:
                continue
            tid2, t2 = track_list[j]
            first_x, first_y, first_t = t2["positions"][0]

            # Did track 2 start shortly after track 1 vanished? (0.0 < delta_t <= 1.5s)
            delta_t = first_t - last_t
            if 0.0 < delta_t <= 1.5:
                # Spatial proximity: Euclidean distance in normalized screen coords < 0.15
                dist = math.hypot(first_x - last_x, first_y - last_y)
                if dist < 0.15:
                    fragmentation_count += 1
                    break

    id_changes_per_min = (fragmentation_count / max(0.01, duration_sec)) * 60.0

    return {
        "file": os.path.basename(video_path),
        "frames": frame_idx,
        "duration_sec": round(duration_sec, 2),
        "unique_track_ids": unique_ids,
        "avg_lifetime_sec": round(avg_lifetime, 2),
        "ghost_share_pct": round(ghost_share, 1),
        "fragmentations": fragmentation_count,
        "id_changes_per_min": round(id_changes_per_min, 2),
        "fps": round(avg_fps, 1),
    }


def main():
    parser = argparse.ArgumentParser(description="Evaluate IBVAP Tracking Performance.")
    parser.add_argument("--samples", type=str, default="samples", help="Path to samples directory.")
    parser.add_argument("--out", type=str, default="tracking_eval_report.json", help="Output JSON results path.")
    parser.add_argument("--label", type=str, default="baseline", help="Evaluation label (e.g. baseline, tuned).")
    args = parser.parse_args()

    # Look in samples/ or ../samples/
    sample_dir = args.samples
    if not os.path.exists(sample_dir) and os.path.exists(os.path.join("..", sample_dir)):
        sample_dir = os.path.join("..", sample_dir)

    video_files = []
    for ext in ("*.mp4", "*.avi", "*.mov", "*.mkv", "*.webm"):
        video_files.extend(glob.glob(os.path.join(sample_dir, ext)))

    if not video_files:
        print(f"No video files found in '{sample_dir}'. Please add videos to run evaluation.")
        return

    print(f"\n========================================================")
    print(f"   IBVAP TRACKING EVALUATION ({args.label.upper()})")
    print(f"========================================================")
    print(f"Found {len(video_files)} video clips in '{sample_dir}'\n")

    detector = SurveillanceDetector()
    results = []

    for vpath in video_files:
        print(f"Evaluating: {os.path.basename(vpath)} ...", end="", flush=True)
        res = run_video_evaluation(vpath, detector)
        print(" Done!")
        if res and "file" in res:
            results.append(res)

    print("\n" + "=" * 80)
    print(f"{'Video File':<32} | {'IDs':<4} | {'Lifetime':<8} | {'Ghosts %':<9} | {'Frags':<5} | {'ID Chg/m':<8} | {'FPS':<5}")
    print("-" * 80)

    total_ids = 0
    total_ghosts = 0
    total_frags = 0
    total_duration = 0.0
    all_lifetimes = []
    all_fps = []

    for r in results:
        print(
            f"{r['file']:<32} | {r['unique_track_ids']:<4} | {r['avg_lifetime_sec']:>6}s | "
            f"{r['ghost_share_pct']:>7}% | {r['fragmentations']:<5} | {r['id_changes_per_min']:>7}  | {r['fps']:>5}"
        )
        total_ids += r["unique_track_ids"]
        total_duration += r["duration_sec"]
        total_frags += r["fragmentations"]
        all_lifetimes.append(r["avg_lifetime_sec"])
        all_fps.append(r["fps"])

    avg_lifetime_overall = sum(all_lifetimes) / len(all_lifetimes) if all_lifetimes else 0.0
    avg_fps_overall = sum(all_fps) / len(all_fps) if all_fps else 0.0
    overall_id_chg_per_min = (total_frags / max(0.01, total_duration)) * 60.0

    print("=" * 80)
    print(
        f"{'OVERALL AVERAGE / TOTAL':<32} | {total_ids:<4} | {round(avg_lifetime_overall, 2):>6}s | "
        f"{'-':<9} | {total_frags:<5} | {round(overall_id_chg_per_min, 2):>7}  | {round(avg_fps_overall, 1):>5}"
    )
    print("=" * 80 + "\n")

    summary_payload = {
        "label": args.label,
        "timestamp": int(time.time()),
        "total_clips": len(results),
        "total_track_ids": total_ids,
        "total_fragmentations": total_frags,
        "avg_track_lifetime_sec": round(avg_lifetime_overall, 2),
        "overall_id_changes_per_min": round(overall_id_chg_per_min, 2),
        "avg_fps": round(avg_fps_overall, 1),
        "clips": results,
    }

    out_file = args.out
    with open(out_file, "w") as f:
        json.dump(summary_payload, f, indent=2)
    print(f"Results saved to '{out_file}'\n")


if __name__ == "__main__":
    main()
