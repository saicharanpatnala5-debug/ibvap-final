import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import cv2
import glob
import numpy as np
from fast_alpr import ALPR
from app.services.anpr import PlateValidator

alpr = ALPR(
    detector_model="yolo-v9-t-384-license-plate-end2end",
    ocr_model="cct-s-v2-global-model"
)

crops = sorted(glob.glob("../samples/debug_crops_round4/*_vehicle.jpg"))
print(f"Total vehicle crops to test: {len(crops)}")

for c in crops:
    img = cv2.imread(c)
    vh, vw = img.shape[:2]
    if vh < 80 or vw < 120:
        print(f"{c}: [{vw}x{vh}] -> DISTANCE GATED (Plate not legible at this distance)")
        continue
    res = alpr.predict(img)
    if not res:
        print(f"{c}: [{vw}x{vh}] -> No plate detected")
    else:
        for r in res:
            bx = r.detection.bounding_box
            pw = bx.x2 - bx.x1
            ph = bx.y2 - bx.y1
            raw_text = r.ocr.text if r.ocr else ""
            cleaned = PlateValidator.clean_text(raw_text)
            corrected = PlateValidator.position_aware_correction(cleaned)
            is_valid, ftype, vstatus = PlateValidator.validate(corrected)
            mean_conf = float(np.mean(r.ocr.confidence) * 100.0) if r.ocr and r.ocr.confidence else 0.0
            print(f"{c}: [{vw}x{vh}] Plate:[{pw}x{ph}] det_conf:{round(r.detection.confidence,2)} raw:'{raw_text}' corrected:'{corrected}' valid:{is_valid} ({vstatus}) ocr_conf:{round(mean_conf, 1)}")
