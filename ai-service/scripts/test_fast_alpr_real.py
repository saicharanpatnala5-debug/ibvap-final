import glob
import cv2
import os
from fast_alpr import ALPR
import sys

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
AI_SERVICE_DIR = os.path.dirname(SCRIPT_DIR)
if AI_SERVICE_DIR not in sys.path:
    sys.path.insert(0, AI_SERVICE_DIR)

from app.services.anpr import PlateValidator

alpr = ALPR(
    detector_model='yolo-v9-t-384-license-plate-end2end',
    ocr_model='cct-xs-v2-global-model',
)

veh_files = sorted(glob.glob('../samples/debug_crops_round4/*_vehicle.jpg'))
print(f"Testing fast-alpr on {len(veh_files)} real vehicle crops...")

detected_count = 0
for vf in veh_files:
    img = cv2.imread(vf)
    if img is None:
        continue
    preds = alpr.predict(img)
    name = os.path.basename(vf)
    if preds:
        detected_count += 1
        for p in preds:
            raw_text = p.ocr.text
            conf = max(p.ocr.confidence) if p.ocr.confidence else 0.0
            cleaned = PlateValidator.clean_text(raw_text)
            corr = PlateValidator.position_aware_correction(cleaned)
            is_valid, ftype, stat = PlateValidator.validate(corr)
            print(f"[{name} {img.shape}] DETECTED: box={p.detection.bounding_box} | raw='{raw_text}' | corr='{corr}' | {stat}")
    else:
        print(f"[{name} {img.shape}] No plate detected")

print(f"\nPlates detected by fast-alpr: {detected_count} / {len(veh_files)}")
