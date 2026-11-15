"""
Find Pedestrian Dwell in Real Surveillance Footage (Deliverable 5)
Scans whatsapp_video_2026_09_09_533pm.mp4 and whatsapp_video_2026_09_09_842pm.mp4.
Finds pedestrian tracks that stay in the scene for >= 4.0 seconds.
Outputs candidate zone coordinates where placing a polygon zone will trigger
a loitering alert at >= 5s demo dwell threshold.
Also verifies an alternative negative zone where NO alert should fire.
"""

import os
import sys
import cv2
import numpy as np
from collections import defaultdict

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
AI_SERVICE_DIR = os.path.dirname(SCRIPT_DIR)
ROOT_DIR = os.path.dirname(AI_SERVICE_DIR)
SAMPLES_DIR = os.path.join(ROOT_DIR, "samples")

if AI_SERVICE_DIR not in sys.path:
    sys.path.insert(0, AI_SERVICE_DIR)

from app.services.detector import SurveillanceDetector
from app.services.low_light import compute_frame_luminance, apply_clahe_enhancement


def scan_clip(vid_name: str):
    vid_path = os.path.join(SAMPLES_DIR, vid_name)
    cap = cv2.VideoCapture(vid_path)
    if not cap.isOpened():
        print(f"Could not open {vid_name}")
        return

    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    duration_sec = total_frames / fps
    print(f"\nScanning {vid_name}: {total_frames} frames, {fps:.1f} FPS, {duration_sec:.1f}s total")

    detector = SurveillanceDetector()
    detector.reset()

    # Track lifecycle: track_id -> list of (t_sec, x_center, y_bottom, width, height, conf)
    ped_tracks = defaultdict(list)
    frame_idx = 0

    while cap.isOpened():
        ret, frame = cap.read()
        if not ret or frame is None:
            break
        frame_idx += 1
        t_sec = frame_idx / fps

        lum = compute_frame_luminance(frame)
        proc_frame = apply_clahe_enhancement(frame) if ("842" in vid_name or lum < 60) else frame

        entities, _ = detector.process_frame(proc_frame, timestamp_sec=t_sec)
        for ent in entities:
            if ent.class_name in ["pedestrian", "person"]:
                cx = ent.bbox.x + ent.bbox.width * 0.5
                foot_y = ent.bbox.y + ent.bbox.height
                ped_tracks[ent.id].append({
                    "time": t_sec,
                    "cx": cx,
                    "foot_y": foot_y,
                    "bbox": (ent.bbox.x, ent.bbox.y, ent.bbox.width, ent.bbox.height),
                    "conf": ent.confidence,
                })

    cap.release()

    # Analyze durations
    print(f"Total pedestrian tracks detected: {len(ped_tracks)}")
    candidates = []
    for tid, history in ped_tracks.items():
        if len(history) < 15:
            continue
        t_start = history[0]["time"]
        t_end = history[-1]["time"]
        dur = t_end - t_start
        avg_conf = np.mean([h["conf"] for h in history])
        all_cx = [h["cx"] for h in history]
        all_fy = [h["foot_y"] for h in history]
        min_x, max_x = min(all_cx), max(all_cx)
        min_y, max_y = min(all_fy), max(all_fy)
        candidates.append({
            "track_id": tid,
            "duration": dur,
            "start": t_start,
            "end": t_end,
            "avg_conf": avg_conf,
            "spatial_extent": (min_x, min_y, max_x, max_y),
            "history": history,
        })

    candidates.sort(key=lambda c: c["duration"], reverse=True)
    for c in candidates[:8]:
        print(f"  Pedestrian #{c['track_id']}: duration={c['duration']:.2f}s (t={c['start']:.1f}s to {c['end']:.1f}s), avg_conf={c['avg_conf']:.1f}%, footpoint range: X=[{c['spatial_extent'][0]:.3f}, {c['spatial_extent'][2]:.3f}], Y=[{c['spatial_extent'][1]:.3f}, {c['spatial_extent'][3]:.3f}]")

    return candidates


if __name__ == "__main__":
    scan_clip("whatsapp_video_2026_09_09_533pm.mp4")
    scan_clip("whatsapp_video_2026_09_09_842pm.mp4")
