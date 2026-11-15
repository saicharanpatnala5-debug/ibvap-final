"""
IBVAP Tracking Evaluation & Benchmarking Suite (ROUND 3)
Evaluates tracking quality across real clips in samples/ and computes:
1. ALL TRACKS:
   - Unique track IDs
   - Average track lifetime (seconds)
   - Share of tracks shorter than 1 second (ghost tracks %)
   - Track fragmentation count
   - ID changes / switches per minute
2. CONFIRMED INTERIOR TRACKS (Honest Metric):
   - Excludes tracks that start or end within a border margin (default 0.05 = 5%)
   - Excludes tracks truncated by video start (t <= 1.0s) or video end (t >= t_end - 1.0s)
   - Computes interior unique IDs, lifetime, interior ghost share (<1s), interior fragmentations, and interior ID changes/min.
3. Multiple Runs:
   - Evaluates full video across N runs (default 3) and computes median FPS and timings.
"""

import argparse
import glob
import json
import math
import os
import statistics
import sys
import time
from typing import Dict, List, Any, Tuple
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


def is_border_point(x: float, y: float, margin: float = 0.05) -> bool:
    """Checks whether normalized (x, y) coordinates fall within the border margin."""
    return x < margin or x > (1.0 - margin) or y < margin or y > (1.0 - margin)


def is_border_box(box: Any, margin: float = 0.04) -> bool:
    """Checks if any bounding box edge touches the frame boundary."""
    bx = getattr(box, "x", 0.0)
    by = getattr(box, "y", 0.0)
    bw = getattr(box, "width", 0.0)
    bh = getattr(box, "height", 0.0)
    return bx < margin or (bx + bw) > (1.0 - margin) or by < margin or (by + bh) > (1.0 - margin)


def compute_track_metrics(
    track_dict: Dict[int, Dict[str, Any]],
    duration_sec: float,
    border_margin: float = 0.05,
    temporal_margin: float = 1.0,
) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    """
    Computes both 'All Tracks' metrics and 'Confirmed Interior Tracks' metrics.
    """
    all_unique_ids = len(track_dict)
    if all_unique_ids == 0:
        empty = {
            "unique_ids": 0,
            "avg_lifetime_sec": 0.0,
            "ghost_share_pct": 0.0,
            "fragmentations": 0,
            "id_changes_per_min": 0.0,
        }
        return empty, empty

    # ----------------- ALL TRACKS -----------------
    all_lifetimes = [t["last_seen"] - t["first_seen"] for t in track_dict.values()]
    all_avg_lifetime = sum(all_lifetimes) / len(all_lifetimes)
    all_ghosts = [t for t in track_dict.values() if (t["last_seen"] - t["first_seen"]) < 1.0]
    all_ghost_share = (len(all_ghosts) / all_unique_ids) * 100.0

    all_frags = 0
    all_items = list(track_dict.items())
    for i in range(len(all_items)):
        tid1, t1 = all_items[i]
        lx, ly, lt = t1["positions"][-1]
        for j in range(len(all_items)):
            if i == j:
                continue
            tid2, t2 = all_items[j]
            fx, fy, ft = t2["positions"][0]
            dt = ft - lt
            if 0.0 < dt <= 1.5:
                if math.hypot(fx - lx, fy - ly) < 0.15:
                    all_frags += 1
                    break

    all_id_changes_per_min = (all_frags / max(0.01, duration_sec)) * 60.0
    all_metrics = {
        "unique_ids": all_unique_ids,
        "avg_lifetime_sec": round(all_avg_lifetime, 2),
        "ghost_share_pct": round(all_ghost_share, 1),
        "fragmentations": all_frags,
        "id_changes_per_min": round(all_id_changes_per_min, 2),
    }

    # ----------------- CONFIRMED INTERIOR TRACKS -----------------
    # Exclude tracks whose initial observation is on the border (entered view)
    # Exclude tracks whose final observation is on the border (exited view)
    # Exclude tracks born at the start of video (t <= temporal_margin)
    # Exclude tracks dying at the end of video (t >= duration_sec - temporal_margin)
    interior_tracks: Dict[int, Dict[str, Any]] = {}
    for tid, t in track_dict.items():
        first_x, first_y, first_t = t["positions"][0]
        last_x, last_y, last_t = t["positions"][-1]

        # Check temporal margins
        if first_t <= temporal_margin:
            continue
        if last_t >= (duration_sec - temporal_margin):
            continue

        # Check spatial border margins
        first_box = t.get("first_box")
        last_box = t.get("last_box")
        if first_box and is_border_box(first_box, border_margin):
            continue
        if last_box and is_border_box(last_box, border_margin):
            continue
        if is_border_point(first_x, first_y, border_margin):
            continue
        if is_border_point(last_x, last_y, border_margin):
            continue

        interior_tracks[tid] = t

    interior_unique_ids = len(interior_tracks)
    if interior_unique_ids == 0:
        interior_metrics = {
            "unique_ids": 0,
            "avg_lifetime_sec": 0.0,
            "ghost_share_pct": 0.0,
            "fragmentations": 0,
            "id_changes_per_min": 0.0,
        }
    else:
        int_lifetimes = [t["last_seen"] - t["first_seen"] for t in interior_tracks.values()]
        int_avg_lifetime = sum(int_lifetimes) / len(int_lifetimes)
        int_ghosts = [t for t in interior_tracks.values() if (t["last_seen"] - t["first_seen"]) < 1.0]
        int_ghost_share = (len(int_ghosts) / interior_unique_ids) * 100.0

        int_frags = 0
        int_items = list(interior_tracks.items())
        for i in range(len(int_items)):
            tid1, t1 = int_items[i]
            lx, ly, lt = t1["positions"][-1]
            for j in range(len(int_items)):
                if i == j:
                    continue
                tid2, t2 = int_items[j]
                fx, fy, ft = t2["positions"][0]
                dt = ft - lt
                if 0.0 < dt <= 1.5:
                    if math.hypot(fx - lx, fy - ly) < 0.15:
                        int_frags += 1
                        break

        int_id_changes_per_min = (int_frags / max(0.01, duration_sec)) * 60.0
        interior_metrics = {
            "unique_ids": interior_unique_ids,
            "avg_lifetime_sec": round(int_avg_lifetime, 2),
            "ghost_share_pct": round(int_ghost_share, 1),
            "fragmentations": int_frags,
            "id_changes_per_min": round(int_id_changes_per_min, 2),
        }

    return all_metrics, interior_metrics


def run_single_pass(
    video_path: str,
    detector: SurveillanceDetector,
    max_frames: int = 0,
) -> Tuple[Dict[int, Dict[str, Any]], int, float, float]:
    detector.reset()
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        raise RuntimeError(f"Could not open {video_path}")

    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
    duration_sec = total_frames / max(1.0, fps)

    tracks: Dict[int, Dict[str, Any]] = {}
    frame_idx = 0
    t_start = time.perf_counter()

    while cap.isOpened():
        if max_frames > 0 and frame_idx >= max_frames:
            break
        ret, frame = cap.read()
        if not ret or frame is None:
            break

        frame_idx += 1
        t_sec = frame_idx / fps

        lum = compute_frame_luminance(frame)
        if lum < settings.LOW_LIGHT_LUMINANCE_THRESHOLD and settings.ENABLE_LOW_LIGHT_CLAHE:
            frame = apply_clahe_enhancement(frame)

        entities, _ = detector.process_frame(frame, t_sec)

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
                    "first_box": ent.bbox,
                    "last_box": ent.bbox,
                    "positions": [(cx, cy, t_sec)],
                }
            else:
                tracks[tid]["last_seen"] = t_sec
                tracks[tid]["hits"] += 1
                tracks[tid]["last_box"] = ent.bbox
                tracks[tid]["positions"].append((cx, cy, t_sec))

    cap.release()
    elapsed = time.perf_counter() - t_start
    measured_fps = frame_idx / max(0.001, elapsed)
    actual_duration = frame_idx / fps

    return tracks, frame_idx, actual_duration, measured_fps


def evaluate_video_multirun(
    video_path: str,
    detector: SurveillanceDetector,
    runs: int = 3,
    max_frames: int = 0,
) -> Dict[str, Any]:
    fps_measurements = []
    best_tracks = None
    frames_count = 0
    duration_sec = 0.0

    filename = os.path.basename(video_path)
    print(f"\n--- Evaluating {filename} ({runs} runs) ---")

    for r in range(1, runs + 1):
        print(f"  Run {r}/{runs} ...", end="", flush=True)
        tracks, frames_count, duration_sec, run_fps = run_single_pass(video_path, detector, max_frames=max_frames)
        fps_measurements.append(run_fps)
        print(f" FPS: {run_fps:.2f} ({frames_count} frames)")
        if best_tracks is None:
            best_tracks = tracks

    median_fps = statistics.median(fps_measurements)

    all_metrics, interior_metrics = compute_track_metrics(
        track_dict=best_tracks or {},
        duration_sec=duration_sec,
        border_margin=0.05,
        temporal_margin=1.0,
    )

    return {
        "file": filename,
        "frames": frames_count,
        "duration_sec": round(duration_sec, 2),
        "median_fps": round(median_fps, 2),
        "fps_runs": [round(f, 2) for f in fps_measurements],
        "all_tracks": all_metrics,
        "confirmed_interior": interior_metrics,
    }


def main():
    parser = argparse.ArgumentParser(description="Evaluate IBVAP Tracking Performance (ROUND 3).")
    parser.add_argument("--samples", type=str, default="samples", help="Path to samples directory.")
    parser.add_argument("--out", type=str, default="../samples/round3_tracking_results.json", help="Output JSON path.")
    parser.add_argument("--runs", type=int, default=3, help="Number of benchmark runs for median FPS (default: 3).")
    parser.add_argument("--max-frames", type=int, default=0, help="Max frames per clip (0 = all frames).")
    args = parser.parse_args()

    sample_dir = args.samples
    if not os.path.exists(sample_dir) and os.path.exists(os.path.join("..", sample_dir)):
        sample_dir = os.path.join("..", sample_dir)

    video_files = []
    for ext in ("*.mp4", "*.avi", "*.mov", "*.mkv", "*.webm"):
        video_files.extend(glob.glob(os.path.join(sample_dir, ext)))
    video_files = [
        f for f in video_files
        if "debug" not in os.path.basename(f)
        and "synthetic" not in os.path.basename(f)
        and "crossing" not in os.path.basename(f)
    ]

    if not video_files:
        print(f"No video files found in '{sample_dir}'.")
        return

    print("==========================================================================================")
    print(f"   IBVAP TRACKING EVALUATION (ROUND 3: CONFIRMED INTERIOR & ALL TRACKS, {args.runs} RUNS)")
    print("==========================================================================================")
    print(f"Found {len(video_files)} video clips in '{sample_dir}'\n")

    detector = SurveillanceDetector()
    results = []

    for vpath in video_files:
        res = evaluate_video_multirun(vpath, detector, runs=args.runs, max_frames=args.max_frames)
        results.append(res)

    print("\n" + "=" * 105)
    print(f"{'Video File':<32} | {'Med FPS':<7} | {'ALL IDs':<7} | {'ALL Ghost':<9} | {'INT IDs':<7} | {'INT Ghost':<9} | {'INT Frags':<9} | {'INT ID/m'}")
    print("-" * 105)
    for r in results:
        a = r["all_tracks"]
        c = r["confirmed_interior"]
        print(
            f"{r['file']:<32} | {r['median_fps']:>7.2f} | "
            f"{a['unique_ids']:>7} | {a['ghost_share_pct']:>8.1f}% | "
            f"{c['unique_ids']:>7} | {c['ghost_share_pct']:>8.1f}% | "
            f"{c['fragmentations']:>9} | {c['id_changes_per_min']:>8.2f}"
        )
    print("=" * 105)

    os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)
    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2)
    print(f"\nDetailed evaluation results saved to: {args.out}")


if __name__ == "__main__":
    main()
