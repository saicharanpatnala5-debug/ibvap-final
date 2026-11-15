"""
IBVAP ANPR Diagnosis (Round 4 - Step 1)
Extracts and saves 20 debug crops per clip showing exactly what is passed to OCR today.
All output in samples/debug_crops_round4/ is strictly gitignored.
"""

import os
import sys
import cv2
import numpy as np

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
AI_SERVICE_DIR = os.path.dirname(SCRIPT_DIR)
ROOT_DIR = os.path.dirname(AI_SERVICE_DIR)
SAMPLES_DIR = os.path.join(ROOT_DIR, "samples")
DEBUG_CROPS_DIR = os.path.join(SAMPLES_DIR, "debug_crops_round4")
os.makedirs(DEBUG_CROPS_DIR, exist_ok=True)

if AI_SERVICE_DIR not in sys.path:
    sys.path.insert(0, AI_SERVICE_DIR)

from app.services.detector import SurveillanceDetector
from app.services.anpr import crop_license_plate_region, locate_plate_contour_fallback
from app.services.low_light import compute_frame_luminance, apply_clahe_enhancement


def diagnose_clip(video_name: str, target_count: int = 20):
    video_path = os.path.join(SAMPLES_DIR, video_name)
    if not os.path.exists(video_path):
        print(f"Video {video_name} not found.")
        return []

    print(f"\n--- Diagnosing OCR Input Crops for: {video_name} ---")
    cap = cv2.VideoCapture(video_path)
    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0

    detector = SurveillanceDetector()
    detector.reset()

    saved_crops = []
    frame_idx = 0

    while cap.isOpened() and len(saved_crops) < target_count:
        ret, frame = cap.read()
        if not ret or frame is None:
            break

        frame_idx += 1
        t_sec = frame_idx / fps
        h, w = frame.shape[:2]

        lum = compute_frame_luminance(frame)
        if lum < 60:
            proc_frame = apply_clahe_enhancement(frame)
        else:
            proc_frame = frame

        entities, _ = detector.process_frame(proc_frame, timestamp_sec=t_sec)

        for ent in entities:
            if ent.class_name in ["car", "truck", "bus", "motorcycle"]:
                bx = max(0, int(ent.bbox.x * w))
                by = max(0, int(ent.bbox.y * h))
                bw = min(w - bx, int(ent.bbox.width * w))
                bh = min(h - by, int(ent.bbox.height * h))

                if bw < 25 or bh < 20:
                    continue

                veh_crop = proc_frame[by:by+bh, bx:bx+bw]
                if veh_crop.size == 0:
                    continue

                # Exactly what is passed to OCR today:
                plate_crop = crop_license_plate_region(veh_crop)

                crop_idx = len(saved_crops) + 1
                base_tag = f"{video_name[:12]}_crop_{crop_idx:02d}_tr{ent.id}"

                veh_file = os.path.join(DEBUG_CROPS_DIR, f"{base_tag}_vehicle.jpg")
                plate_file = os.path.join(DEBUG_CROPS_DIR, f"{base_tag}_plate.jpg")

                cv2.imwrite(veh_file, veh_crop)
                cv2.imwrite(plate_file, plate_crop)

                ph, pw = plate_crop.shape[:2]
                saved_crops.append({
                    "crop_idx": crop_idx,
                    "track_id": ent.id,
                    "class": ent.class_name,
                    "veh_shape": veh_crop.shape,
                    "plate_shape": plate_crop.shape,
                    "plate_file": plate_file,
                })
                print(f"  Crop #{crop_idx:02d} (Track #{ent.id} {ent.class_name}): Veh={veh_crop.shape} -> Plate Crop={plate_crop.shape}")

                if len(saved_crops) >= target_count:
                    break

    cap.release()
    print(f"Saved {len(saved_crops)} debug crops to: {DEBUG_CROPS_DIR}")
    return saved_crops


if __name__ == "__main__":
    day_crops = diagnose_clip("whatsapp_video_2026_09_09_533pm.mp4", target_count=20)
    night_crops = diagnose_clip("whatsapp_video_2026_09_09_842pm.mp4", target_count=20)
    print("\n================ DIAGNOSIS SUMMARY ================")
    print(f"Day Clip Crops Saved: {len(day_crops)}")
    print(f"Night Clip Crops Saved: {len(night_crops)}")
