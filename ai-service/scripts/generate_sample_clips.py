"""
Generates realistic surveillance benchmark clips in samples/ using Ultralytics real image assets:
1. crossing_paths_occlusion.mp4: Two realistic pedestrians crossing paths with a 1.2-second occlusion gap and intermittent 1-frame flickers.
2. night_perimeter_motion.mp4: Low-light scene (luminance ~35) with a pedestrian traversing across a perimeter line with varying contrast.
"""

import os
import cv2
import numpy as np
import ultralytics


def create_sample_clips(output_dir: str = "samples"):
    os.makedirs(output_dir, exist_ok=True)
    fourcc = cv2.VideoWriter_fourcc(*"mp4v")

    assets_dir = os.path.join(os.path.dirname(ultralytics.__file__), "assets")
    bus_path = os.path.join(assets_dir, "bus.jpg")
    zidane_path = os.path.join(assets_dir, "zidane.jpg")

    bus_img = cv2.imread(bus_path) if os.path.exists(bus_path) else None
    zidane_img = cv2.imread(zidane_path) if os.path.exists(zidane_path) else None

    # Extract realistic pedestrian crops
    if zidane_img is not None:
        # Crop person
        h_z, w_z = zidane_img.shape[:2]
        p1_crop = cv2.resize(zidane_img[int(h_z * 0.15) : int(h_z * 0.95), int(w_z * 0.2) : int(w_z * 0.65)], (70, 150))
    else:
        p1_crop = np.full((150, 70, 3), (180, 80, 50), dtype=np.uint8)

    if bus_img is not None:
        # Crop person on right
        h_b, w_b = bus_img.shape[:2]
        p2_crop = cv2.resize(bus_img[int(h_b * 0.4) : int(h_b * 0.9), int(w_b * 0.05) : int(w_b * 0.25)], (70, 150))
    else:
        p2_crop = np.full((150, 70, 3), (50, 60, 200), dtype=np.uint8)

    # 1. Crossing paths with occlusion & ghost flickers
    clip1_path = os.path.join(output_dir, "crossing_paths_occlusion.mp4")
    fps = 30
    width, height = 640, 360
    num_frames = 180  # 6 seconds
    out = cv2.VideoWriter(clip1_path, fourcc, fps, (width, height))

    for f in range(num_frames):
        frame = np.full((height, width, 3), 70, dtype=np.uint8)
        # Background road / floor texture
        cv2.line(frame, (0, 280), (width, 280), (100, 100, 100), 2)
        cv2.line(frame, (0, 310), (width, 310), (90, 90, 90), 1)

        t = f / num_frames
        # Target 1 moving left to right
        x1 = int(30 + t * (width - 130))
        y1 = 140

        # Target 2 moving right to left
        x2 = int((width - 100) - t * (width - 130))
        y2 = 145

        # Mutual occlusion between frames 78 and 108
        is_occluded = 82 <= f <= 104

        # Overlay Target 1
        if not is_occluded or f % 2 == 0:
            ch, cw = p1_crop.shape[:2]
            if 0 <= y1 and y1 + ch <= height and 0 <= x1 and x1 + cw <= width:
                frame[y1 : y1 + ch, x1 : x1 + cw] = p1_crop

        # Overlay Target 2 (drawn in front during occlusion)
        ch2, cw2 = p2_crop.shape[:2]
        if 0 <= y2 and y2 + ch2 <= height and 0 <= x2 and x2 + cw2 <= width:
            frame[y2 : y2 + ch2, x2 : x2 + cw2] = p2_crop

        # Occasional 1-frame ghost flicker (frame 40 and frame 145)
        if f in (40, 145):
            ghost = cv2.resize(p1_crop, (40, 90))
            frame[80:170, 290:330] = ghost

        out.write(frame)
    out.release()
    print(f"[Sample Clips] Created {clip1_path}")

    # 2. Night perimeter motion with low contrast
    clip2_path = os.path.join(output_dir, "night_perimeter_motion.mp4")
    num_frames2 = 150  # 5 seconds
    out2 = cv2.VideoWriter(clip2_path, fourcc, fps, (width, height))

    dark_p1 = (p1_crop.astype(np.float32) * 0.35).astype(np.uint8)

    for f in range(num_frames2):
        frame = np.full((height, width, 3), 25, dtype=np.uint8)  # Low light lum ~25
        # Perimeter line
        cv2.line(frame, (240, 0), (240, height), (45, 45, 45), 2)

        t = f / num_frames2
        x = int(50 + t * (width - 130))
        y = 150

        ch, cw = dark_p1.shape[:2]
        if 0 <= y and y + ch <= height and 0 <= x and x + cw <= width:
            frame[y : y + ch, x : x + cw] = dark_p1

        # Sensor flicker at f=65
        if f == 65:
            frame[100:190, 420:460] = cv2.resize(dark_p1, (40, 90))

        out2.write(frame)
    out2.release()
    print(f"[Sample Clips] Created {clip2_path}")


if __name__ == "__main__":
    create_sample_clips()
