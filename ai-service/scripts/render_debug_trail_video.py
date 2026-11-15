"""
IBVAP Debug Video Renderer (STEP 4)
Renders tracking trails, smoothed bounding boxes, kinematics (velocity/direction),
and ANPR plate overlays onto video frames and exports to samples/debug_videos/tracking_trails_debug.mp4.
All output in samples/debug_videos/ is gitignored.
"""

import os
import sys
import cv2
import numpy as np

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
AI_SERVICE_DIR = os.path.dirname(SCRIPT_DIR)
ROOT_DIR = os.path.dirname(AI_SERVICE_DIR)
SAMPLES_DIR = os.path.join(ROOT_DIR, "samples")
DEBUG_VIDEOS_DIR = os.path.join(SAMPLES_DIR, "debug_videos")
os.makedirs(DEBUG_VIDEOS_DIR, exist_ok=True)

if AI_SERVICE_DIR not in sys.path:
    sys.path.insert(0, AI_SERVICE_DIR)

from app.services.detector import SurveillanceDetector
from app.services.low_light import compute_frame_luminance, apply_clahe_enhancement
from app.config import settings

# Distinct color palette for track IDs
PALETTE = [
    (0, 255, 0),    # Bright Green
    (255, 128, 0),  # Bright Blue/Cyan
    (0, 165, 255),  # Orange
    (255, 0, 255),  # Magenta
    (0, 255, 255),  # Yellow
    (50, 205, 50),  # Lime
    (238, 130, 238),# Violet
    (0, 215, 255),  # Gold
    (255, 105, 180),# Hot pink
    (30, 144, 255), # Dodger blue
]


def get_color(track_id: int):
    return PALETTE[track_id % len(PALETTE)]


def render_debug_video(
    input_video_path: str,
    output_video_path: str,
    max_frames: int = 120,
):
    if not os.path.exists(input_video_path):
        print(f"Error: Input file {input_video_path} does not exist.")
        return

    cap = cv2.VideoCapture(input_video_path)
    if not cap.isOpened():
        print(f"Error: Failed to open {input_video_path}")
        return

    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH) or 1280)
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT) or 720)

    fourcc = cv2.VideoWriter_fourcc(*"mp4v")
    out = cv2.VideoWriter(output_video_path, fourcc, fps, (width, height))

    detector = SurveillanceDetector()
    detector.reset()

    # Track trails history: track_id -> [(x_px, y_px)]
    trails = {}

    frame_idx = 0
    print(f"Rendering tracking trails from {os.path.basename(input_video_path)} -> {output_video_path} ...")

    while cap.isOpened() and frame_idx < max_frames:
        ret, frame = cap.read()
        if not ret or frame is None:
            break

        frame_idx += 1
        t_sec = frame_idx / fps

        # Low-light enhancement if applicable
        lum = compute_frame_luminance(frame)
        if lum < settings.LOW_LIGHT_LUMINANCE_THRESHOLD and settings.ENABLE_LOW_LIGHT_CLAHE:
            proc_frame = apply_clahe_enhancement(frame)
        else:
            proc_frame = frame

        entities, _ = detector.process_frame(proc_frame, timestamp_sec=t_sec)

        # Draw on frame copy
        canvas = frame.copy()

        # Update and draw trails
        active_ids = set()
        for ent in entities:
            tid = ent.id
            active_ids.add(tid)
            color = get_color(tid)

            # Pixel coords
            bx = int(ent.bbox.x * width)
            by = int(ent.bbox.y * height)
            bw = int(ent.bbox.width * width)
            bh = int(ent.bbox.height * height)

            # Footpoint
            foot_x = bx + bw // 2
            foot_y = by + bh

            if tid not in trails:
                trails[tid] = []
            trails[tid].append((foot_x, foot_y))
            if len(trails[tid]) > 40:
                trails[tid].pop(0)

            # Draw trajectory trail polyline with thickness
            pts = trails[tid]
            if len(pts) > 1:
                for k in range(1, len(pts)):
                    alpha = k / len(pts)
                    thickness = max(1, int(3 * alpha))
                    cv2.line(canvas, pts[k - 1], pts[k], color, thickness)

            # Draw footpoint dot
            cv2.circle(canvas, (foot_x, foot_y), 5, (0, 0, 255), -1)
            cv2.circle(canvas, (foot_x, foot_y), 7, color, 2)

            # Draw smoothed bounding box
            cv2.rectangle(canvas, (bx, by), (bx + bw, by + bh), color, 2)

            # Draw corner accents
            line_len = min(15, bw // 4, bh // 4)
            cv2.line(canvas, (bx, by), (bx + line_len, by), color, 3)
            cv2.line(canvas, (bx, by), (bx, by + line_len), color, 3)
            cv2.line(canvas, (bx + bw, by), (bx + bw - line_len, by), color, 3)
            cv2.line(canvas, (bx + bw, by), (bx + bw, by + line_len), color, 3)

            # Label banner
            label = f"ID #{tid} [{ent.class_name.upper()}] {ent.confidence}%"
            if ent.velocity > 0:
                label += f" | {ent.velocity} px/s {ent.direction}"
            if ent.anpr and ent.anpr.plate_text:
                label += f" | [PLATE: {ent.anpr.plate_text}]"

            (lw, lh), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.45, 1)
            label_y = max(18, by - 5)
            cv2.rectangle(canvas, (bx, label_y - lh - 4), (bx + lw + 8, label_y + 2), (20, 20, 20), -1)
            cv2.putText(canvas, label, (bx + 4, label_y - 2), cv2.FONT_HERSHEY_SIMPLEX, 0.45, color, 1)

        # Prune stale trails of disappeared tracks
        for tid in list(trails.keys()):
            if tid not in active_ids and len(trails[tid]) > 0:
                trails[tid].pop(0)

        # Header HUD
        hud = f"IBVAP DEBUG OVERLAY | Frame: {frame_idx:04d} | Active Tracks: {len(entities)} | FPS: {fps:.1f}"
        cv2.rectangle(canvas, (0, 0), (width, 32), (15, 15, 15), -1)
        cv2.putText(canvas, hud, (20, 22), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 255), 2)

        out.write(canvas)

    cap.release()
    out.release()
    print(f"Debug trail video rendered successfully: {output_video_path} ({frame_idx} frames)")


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="Render tracking trails debug videos")
    parser.add_argument("--frames", type=int, default=150, help="Frames to render per video")
    args = parser.parse_args()

    day_clip = os.path.join(SAMPLES_DIR, "whatsapp_video_2026_09_09_533pm.mp4")
    night_clip = os.path.join(SAMPLES_DIR, "whatsapp_video_2026_09_09_842pm.mp4")

    out_day = os.path.join(DEBUG_VIDEOS_DIR, "tracking_trails_day_debug.mp4")
    out_night = os.path.join(DEBUG_VIDEOS_DIR, "tracking_trails_night_debug.mp4")

    if os.path.exists(day_clip):
        print(f"\n--- Rendering Day Tracking Trails ({args.frames} frames) ---")
        render_debug_video(day_clip, out_day, max_frames=args.frames)

    if os.path.exists(night_clip):
        print(f"\n--- Rendering Night Tracking Trails ({args.frames} frames) ---")
        render_debug_video(night_clip, out_night, max_frames=args.frames)
