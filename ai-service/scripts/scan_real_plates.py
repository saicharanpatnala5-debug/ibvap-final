import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import cv2
import numpy as np
from fast_alpr import ALPR
from app.services.anpr import PlateValidator

alpr = ALPR(
    detector_model="yolo-v9-t-384-license-plate-end2end",
    ocr_model="cct-s-v2-global-model"
)

cap = cv2.VideoCapture("../samples/whatsapp_video_2026_09_09_842pm.mp4")
frame_idx = 0
found_plates = []
while cap.isOpened():
    ret, frame = cap.read()
    if not ret:
        break
    frame_idx += 1
    if frame_idx % 10 == 0:
        res = alpr.predict(frame)
        if res:
            for r in res:
                bx = r.detection.bounding_box
                raw_text = r.ocr.text if r.ocr else ""
                cleaned = PlateValidator.clean_text(raw_text)
                corrected = PlateValidator.position_aware_correction(cleaned)
                is_valid, ftype, vstatus = PlateValidator.validate(corrected)
                found_plates.append((frame_idx, bx, r.detection.confidence, raw_text, corrected, is_valid, vstatus))
cap.release()

print(f"Total plate detections on full frames (sampled every 10 frames): {len(found_plates)}")
for f, bx, conf, raw, corr, is_v, vstat in found_plates:
    print(f"Frame {f:3d}: conf={conf:.2f} raw='{raw}' corr='{corr}' valid={is_v} ({vstat}) box=({bx.x1},{bx.y1},{bx.x2},{bx.y2})")
