#!/usr/bin/env python3
"""
Measures exact Analyze pipeline timing on real clips across quality levels:
- Fast: yolo26n.pt @ 640
- Balanced: yolo26s.pt @ 960
- High: yolo26s.pt @ 1280
Outputs measured timings (seconds, FPS, per-frame latency) for DEMO_GUIDE.md and REPORT.md.
"""

import os
import sys
import time
import json
import cv2

# Set path for ai-service imports
ai_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "ai-service"))
sys.path.insert(0, ai_dir)

from app.services.detector import SurveillanceDetector

def benchmark_clip(detector, clip_path, quality, max_frames=None):
    detector.set_quality(quality)
    detector.reset()

    cap = cv2.VideoCapture(clip_path)
    if not cap.isOpened():
        raise RuntimeError(f"Cannot open video: {clip_path}")

    total_video_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    video_fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    video_duration = total_video_frames / video_fps

    frames_to_process = min(total_video_frames, max_frames) if max_frames else total_video_frames

    print(f"\n--- Measuring {os.path.basename(clip_path)} | Quality: {quality.upper()} ({detector.active_model_name}) ---", flush=True)
    print(f"Total video frames: {total_video_frames} ({video_duration:.1f}s) | Processing: {frames_to_process} frames", flush=True)

    start_time = time.time()
    processed_count = 0

    while cap.isOpened() and processed_count < frames_to_process:
        ret, frame = cap.read()
        if not ret:
            break
        ts = processed_count / video_fps
        _ = detector.process_frame(frame, timestamp_sec=ts)
        processed_count += 1
        if processed_count % 100 == 0 or processed_count == frames_to_process:
            el = time.time() - start_time
            cur_fps = processed_count / el
            print(f"  Frame {processed_count}/{frames_to_process} ({processed_count/frames_to_process*100:.1f}%) - {cur_fps:.2f} FPS", flush=True)

    elapsed_sec = time.time() - start_time
    cap.release()

    fps = processed_count / elapsed_sec if elapsed_sec > 0 else 0
    ms_per_frame = (elapsed_sec / processed_count * 1000) if processed_count > 0 else 0

    result = {
        "clip": os.path.basename(clip_path),
        "quality": quality,
        "model": detector.active_model_name,
        "processed_frames": processed_count,
        "total_video_frames": total_video_frames,
        "video_duration_sec": round(video_duration, 2),
        "total_analyze_time_sec": round(elapsed_sec, 2),
        "analyze_fps": round(fps, 2),
        "ms_per_frame": round(ms_per_frame, 1),
    }
    return result

def main():
    root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    day_clip = os.path.join(root, "samples", "whatsapp_video_2026_09_09_533pm.mp4")
    night_clip = os.path.join(root, "samples", "whatsapp_video_2026_09_09_842pm.mp4")

    clips = [day_clip, night_clip]
    qualities = ["fast", "balanced", "high"]

    print("Initializing SurveillanceDetector...", flush=True)
    detector = SurveillanceDetector()

    all_results = []
    for c in clips:
        if not os.path.exists(c):
            print(f"Clip not found: {c}, skipping")
            continue
        for q in qualities:
            res = benchmark_clip(detector, c, q)
            all_results.append(res)
            print(f"Result: {res['clip']} @ {res['quality'].upper()} -> {res['total_analyze_time_sec']}s ({res['analyze_fps']} FPS, {res['ms_per_frame']} ms/frame)", flush=True)

    out_file = os.path.join(root, "samples", "demo_timing_measurements.json")
    with open(out_file, "w") as f:
        json.dump(all_results, f, indent=2)

    print(f"\nAll timing benchmarks completed and saved to: {out_file}", flush=True)

if __name__ == "__main__":
    main()
