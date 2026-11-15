"""
IBVAP Model & Resolution Benchmark Suite (STEP 3)
Benchmarks yolo26n vs yolo26s at imgsz 640 and 960 across both real video clips.
Measures: FPS, latency, total detections, unique track IDs, avg lifetime, ghost %, fragmentations, ID changes/min.
"""

import os
import sys
import time
import math
import json
import cv2
import numpy as np

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
AI_SERVICE_DIR = os.path.dirname(SCRIPT_DIR)
ROOT_DIR = os.path.dirname(AI_SERVICE_DIR)
SAMPLES_DIR = os.path.join(ROOT_DIR, "samples")

if AI_SERVICE_DIR not in sys.path:
    sys.path.insert(0, AI_SERVICE_DIR)

from app.services.detector import SurveillanceDetector
from app.services.low_light import compute_frame_luminance, apply_clahe_enhancement
from app.config import settings


def evaluate_config(model_name: str, imgsz: int, clip_name: str, max_frames: int = 60):
    video_path = os.path.join(SAMPLES_DIR, clip_name)
    if not os.path.exists(video_path):
        return None

    cap = cv2.VideoCapture(video_path)
    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0

    detector = SurveillanceDetector()
    detector.set_model(model_name=model_name, imgsz=imgsz)

    frame_times = []
    total_detections = 0
    tracks = {}
    frame_idx = 0

    t_start = time.perf_counter()

    while cap.isOpened() and frame_idx < max_frames:
        ret, frame = cap.read()
        if not ret or frame is None:
            break

        frame_idx += 1
        t_sec = frame_idx / fps

        lum = compute_frame_luminance(frame)
        if ("night" in clip_name.lower() or "842" in clip_name or lum < 60) and settings.ENABLE_LOW_LIGHT_CLAHE:
            proc_frame = apply_clahe_enhancement(frame)
        else:
            proc_frame = frame

        t0 = time.perf_counter()
        entities, plates = detector.process_frame(proc_frame, timestamp_sec=t_sec)
        proc_time = time.perf_counter() - t0
        frame_times.append(proc_time)

        total_detections += len(entities)

        for ent in entities:
            tid = ent.id
            cx = ent.bbox.x + ent.bbox.width / 2.0
            cy = ent.bbox.y + ent.bbox.height / 2.0
            if tid not in tracks:
                tracks[tid] = {
                    "first_seen": t_sec,
                    "last_seen": t_sec,
                    "hits": 1,
                    "positions": [(cx, cy, t_sec)],
                }
            else:
                tracks[tid]["last_seen"] = t_sec
                tracks[tid]["hits"] += 1
                tracks[tid]["positions"].append((cx, cy, t_sec))

    cap.release()
    total_elapsed = time.perf_counter() - t_start
    measured_fps = frame_idx / max(0.001, total_elapsed)
    avg_latency_ms = float(np.mean(frame_times)) * 1000.0 if frame_times else 0.0

    unique_ids = len(tracks)
    lifetimes = [t["last_seen"] - t["first_seen"] for t in tracks.values()]
    avg_lifetime = (sum(lifetimes) / len(lifetimes)) if lifetimes else 0.0
    ghosts = [t for t in tracks.values() if (t["last_seen"] - t["first_seen"]) < 1.0]
    ghost_share = (len(ghosts) / unique_ids * 100.0) if unique_ids > 0 else 0.0

    duration_sec = frame_idx / fps
    fragmentation_count = 0
    track_list = list(tracks.items())
    for i in range(len(track_list)):
        tid1, t1 = track_list[i]
        lx, ly, lt = t1["positions"][-1]
        for j in range(len(track_list)):
            if i == j: continue
            tid2, t2 = track_list[j]
            fx, fy, ft = t2["positions"][0]
            dt = ft - lt
            if 0.0 < dt <= 1.5:
                dist = math.hypot(fx - lx, fy - ly)
                if dist < 0.15:
                    fragmentation_count += 1
                    break

    id_changes_per_min = (fragmentation_count / max(0.01, duration_sec)) * 60.0

    return {
        "model": model_name,
        "imgsz": imgsz,
        "clip": clip_name,
        "frames": frame_idx,
        "fps": round(measured_fps, 2),
        "avg_latency_ms": round(avg_latency_ms, 2),
        "total_detections": total_detections,
        "detections_per_frame": round(total_detections / max(1, frame_idx), 2),
        "unique_ids": unique_ids,
        "avg_lifetime_sec": round(avg_lifetime, 2),
        "ghost_share_pct": round(ghost_share, 1),
        "fragmentations": fragmentation_count,
        "id_changes_per_min": round(id_changes_per_min, 2),
    }


def main():
    models = ["yolo26n.pt", "yolo26s.pt"]
    resolutions = [640, 960]
    clips = ["whatsapp_video_2026_09_09_533pm.mp4", "whatsapp_video_2026_09_09_842pm.mp4"]

    benchmark_matrix = []

    print("\n" + "="*85)
    print("      IBVAP MODEL & RESOLUTION BENCHMARK MATRIX (STEP 3)      ")
    print("="*85)

    for m in models:
        for r in resolutions:
            for c in clips:
                print(f"Testing {m} @ imgsz={r} on {c} ...", flush=True)
                res = evaluate_config(model_name=m, imgsz=r, clip_name=c, max_frames=50)
                if res:
                    benchmark_matrix.append(res)
                    print(f"  -> FPS: {res['fps']:<5} | Detections: {res['total_detections']:<4} ({res['detections_per_frame']}/fr) | IDs: {res['unique_ids']:<3} | Ghosts: {res['ghost_share_pct']}% | Frags: {res['fragmentations']}")

    out_file = os.path.join(ROOT_DIR, "samples", "model_benchmark_results.json")
    with open(out_file, "w") as f:
        json.dump(benchmark_matrix, f, indent=2)

    print("\n" + "="*85)
    print(f"{'Model':<10} | {'imgsz':<5} | {'Clip':<30} | {'FPS':<6} | {'Det/Fr':<6} | {'IDs':<4} | {'Ghosts':<7} | {'Frags':<5}")
    print("-"*85)
    for b in benchmark_matrix:
        clip_short = b['clip'][:28]
        print(f"{b['model']:<10} | {b['imgsz']:<5} | {clip_short:<30} | {b['fps']:<6} | {b['detections_per_frame']:<6} | {b['unique_ids']:<4} | {b['ghost_share_pct']:<7}% | {b['fragmentations']:<5}")
    print("="*85)
    print(f"Benchmark results saved to: {out_file}\n")


if __name__ == "__main__":
    main()
