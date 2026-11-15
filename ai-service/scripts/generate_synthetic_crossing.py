"""
Synthetic Crossing Paths Video & Ground Truth Generator (STEP 4)
Generates a realistic synthetic video clip with multiple vehicles crossing paths,
including mutual occlusion, and exports ground truth annotations in MOTChallenge format:
<frame>, <id>, <bb_left>, <bb_top>, <bb_width>, <bb_height>, <conf>, <class>, <visibility>
"""

import os
import cv2
import numpy as np

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
AI_SERVICE_DIR = os.path.dirname(SCRIPT_DIR)
ROOT_DIR = os.path.dirname(AI_SERVICE_DIR)
SAMPLES_DIR = os.path.join(ROOT_DIR, "samples")
SYNTHETIC_DIR = os.path.join(SAMPLES_DIR, "synthetic")
os.makedirs(SYNTHETIC_DIR, exist_ok=True)


def generate_crossing_video(
    output_video_path: str,
    output_gt_path: str,
    width: int = 1280,
    height: int = 720,
    fps: int = 30,
    duration_sec: int = 6,
):
    total_frames = fps * duration_sec
    fourcc = cv2.VideoWriter_fourcc(*"mp4v")
    out = cv2.VideoWriter(output_video_path, fourcc, fps, (width, height))

    # Define 3 target trajectories (crossing paths)
    # Target 1: Red vehicle moving left to right (y ~ 360)
    # Target 2: Blue vehicle moving right to left (y ~ 380, crossing Target 1 in the middle)
    # Target 3: Green vehicle moving top to bottom (x ~ 640, crossing at frame 90)

    gt_lines = []

    # Road background
    base_bg = np.full((height, width, 3), 40, dtype=np.uint8)
    # Road markings
    cv2.rectangle(base_bg, (0, 260), (width, 480), (70, 70, 70), -1)
    cv2.rectangle(base_bg, (520, 0), (760, height), (70, 70, 70), -1)
    # Lane dashes
    for x in range(0, width, 60):
        cv2.line(base_bg, (x, 370), (x + 30, 370), (200, 200, 200), 3)

    obj_w, obj_h = 160, 90

    for frame_idx in range(1, total_frames + 1):
        frame = base_bg.copy()
        t = (frame_idx - 1) / total_frames  # 0.0 to 1.0

        # Target 1: moving West -> East
        x1 = int(-180 + t * (width + 360))
        y1 = 300
        # Target 2: moving East -> West
        x2 = int(width + 180 - t * (width + 360))
        y2 = 340
        # Target 3: moving North -> South
        x3 = 580
        y3 = int(-120 + t * (height + 240))

        targets = [
            (1, x1, y1, (0, 0, 200), "Target-1-Red"),
            (2, x2, y2, (200, 100, 0), "Target-2-Blue"),
            (3, x3, y3, (0, 180, 0), "Target-3-Green"),
        ]

        # Draw targets in depth order (Target 1 is furthest, then 3, then 2)
        # Target 1
        if -obj_w < x1 < width:
            cv2.rectangle(frame, (x1, y1), (x1 + obj_w, y1 + obj_h), (30, 30, 200), -1)
            cv2.rectangle(frame, (x1, y1), (x1 + obj_w, y1 + obj_h), (255, 255, 255), 2)
            cv2.putText(frame, "CAR-1", (x1 + 10, y1 + 50), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (255, 255, 255), 2)
            # Clip gt to screen
            gx = max(0, x1)
            gy = max(0, y1)
            gw = min(width - gx, (x1 + obj_w) - gx)
            gh = min(height - gy, (y1 + obj_h) - gy)
            if gw > 20 and gh > 20:
                # MOT format: <frame>, <id>, <bb_left>, <bb_top>, <bb_width>, <bb_height>, <conf>, <class>, <visibility>
                gt_lines.append(f"{frame_idx},1,{gx},{gy},{gw},{gh},1,1,1.0\n")

        # Target 3 (vertical cross)
        if -obj_h < y3 < height:
            cv2.rectangle(frame, (x3, y3), (x3 + obj_h, y3 + obj_w), (20, 160, 20), -1)
            cv2.rectangle(frame, (x3, y3), (x3 + obj_h, y3 + obj_w), (255, 255, 255), 2)
            cv2.putText(frame, "TRUCK-3", (x3 + 5, y3 + 60), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2)
            gx = max(0, x3)
            gy = max(0, y3)
            gw = min(width - gx, (x3 + obj_h) - gx)
            gh = min(height - gy, (y3 + obj_w) - gy)
            if gw > 20 and gh > 20:
                gt_lines.append(f"{frame_idx},3,{gx},{gy},{gw},{gh},1,1,1.0\n")

        # Target 2 (foreground horizontal cross)
        if -obj_w < x2 < width:
            cv2.rectangle(frame, (x2, y2), (x2 + obj_w, y2 + obj_h), (210, 80, 20), -1)
            cv2.rectangle(frame, (x2, y2), (x2 + obj_w, y2 + obj_h), (255, 255, 255), 2)
            cv2.putText(frame, "BUS-2", (x2 + 15, y2 + 50), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (255, 255, 255), 2)
            gx = max(0, x2)
            gy = max(0, y2)
            gw = min(width - gx, (x2 + obj_w) - gx)
            gh = min(height - gy, (y2 + obj_h) - gy)
            if gw > 20 and gh > 20:
                gt_lines.append(f"{frame_idx},2,{gx},{gy},{gw},{gh},1,1,1.0\n")

        # Overlay frame counter
        cv2.putText(frame, f"SYNTHETIC CROSSING GT - Frame {frame_idx:03d}/{total_frames}", (30, 40),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 255, 255), 2)

        out.write(frame)

    out.release()

    with open(output_gt_path, "w", encoding="utf-8") as f:
        f.writelines(gt_lines)

    print(f"Generated synthetic crossing video: {output_video_path} ({total_frames} frames)")
    print(f"Generated MOT Challenge ground truth: {output_gt_path} ({len(gt_lines)} records)")


if __name__ == "__main__":
    vid_path = os.path.join(SYNTHETIC_DIR, "crossing_paths_occlusion.mp4")
    gt_path = os.path.join(SYNTHETIC_DIR, "crossing_paths_gt.txt")
    generate_crossing_video(vid_path, gt_path)
