"""
IBVAP ANPR Engine Head-to-Head Comparison Benchmark (Deliverable 2)
Compares:
1. fast-alpr (yolo-v9-t-384 detector + cct-s-v2-global-model OCR)
2. RapidOCR (PP-OCRv4 ONNX text detector + text recognizer)
3. Hybrid Engine (fast-alpr yolo-v9 detector + RapidOCR OCR on plate crop)

Evaluated on:
- Same 220 synthetic license plate variations (clean, blur, noise, perspective, low-light)
- Real vehicle crops from WhatsApp surveillance clips (eligible: >= 120x80 px)

Computes:
- Exact Match %
- 1-Char Error %
- CER % (Strictly: total_char_edit_errors / total_gt_characters * 100)
- Format Validity %
- Average Latency (ms/sample)
"""

import os
import sys
import csv
import json
import time
import cv2
import numpy as np

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
AI_SERVICE_DIR = os.path.dirname(SCRIPT_DIR)
ROOT_DIR = os.path.dirname(AI_SERVICE_DIR)
SAMPLES_DIR = os.path.join(ROOT_DIR, "samples")
SYNTHETIC_DIR = os.path.join(SAMPLES_DIR, "synthetic_plates")
OUTPUT_JSON = os.path.join(SAMPLES_DIR, "anpr_engine_comparison.json")

if AI_SERVICE_DIR not in sys.path:
    sys.path.insert(0, AI_SERVICE_DIR)

from app.services.anpr import (
    PlateValidator,
    preprocess_plate_crop,
    bgr_to_base64_jpeg,
    compute_crop_sharpness,
)


def levenshtein_distance(s1: str, s2: str) -> int:
    """Computes Levenshtein edit distance between two strings."""
    if len(s1) < len(s2):
        return levenshtein_distance(s2, s1)
    if len(s2) == 0:
        return len(s1)

    previous_row = range(len(s2) + 1)
    for i, c1 in enumerate(s1):
        current_row = [i + 1]
        for j, c2 in enumerate(s2):
            insertions = previous_row[j + 1] + 1
            deletions = current_row[j] + 1
            substitutions = previous_row[j] + (c1 != c2)
            current_row.append(min(insertions, deletions, substitutions))
        previous_row = current_row

    return previous_row[-1]


def load_engines():
    print("[1/4] Initializing ANPR engines...", flush=True)
    from fast_alpr import ALPR
    from rapidocr_onnxruntime import RapidOCR

    fast_alpr = ALPR(
        detector_model="yolo-v9-t-384-license-plate-end2end",
        ocr_model="cct-s-v2-global-model",
    )
    rapid_ocr = RapidOCR()
    print(" Engines loaded: fast-alpr ONNX & RapidOCR ONNX", flush=True)
    return fast_alpr, rapid_ocr


def run_synthetic_benchmark(fast_alpr, rapid_ocr):
    print("\n[2/4] Running Benchmark on 220 Synthetic Plates...", flush=True)
    labels_csv = os.path.join(SYNTHETIC_DIR, "labels.csv")
    records = []
    with open(labels_csv, "r", newline="") as f:
        reader = csv.DictReader(f)
        for row in reader:
            records.append(row)

    total_samples = len(records)
    print(f" Loaded {total_samples} synthetic plate records from labels.csv", flush=True)

    engines = {
        "fast-alpr (cct-s-v2)": "fast_alpr",
        "RapidOCR (raw)": "rapid_raw",
        "RapidOCR (preprocessed)": "rapid_prep",
    }

    results = {}

    for engine_name, engine_key in engines.items():
        print(f"\n Evaluating: {engine_name} ...", flush=True)
        exact_count = 0
        one_char_count = 0
        valid_count = 0
        total_ed = 0
        total_chars = 0
        latencies = []

        cat_breakdown = {}

        for idx, rec in enumerate(records, 1):
            cat = rec["category"]
            gt = rec["ground_truth"].upper().replace(" ", "").replace("-", "")
            img_path = os.path.join(SYNTHETIC_DIR, rec["filename"])

            if cat not in cat_breakdown:
                cat_breakdown[cat] = {
                    "total": 0,
                    "exact": 0,
                    "one_char": 0,
                    "valid": 0,
                    "ed": 0,
                    "chars": 0,
                    "latencies": [],
                }

            img = cv2.imread(img_path)
            if img is None:
                continue

            t0 = time.perf_counter()
            raw_text = ""
            try:
                if engine_key == "fast_alpr":
                    pred = fast_alpr.ocr.predict(img)
                    raw_text = pred.text if pred else ""
                elif engine_key == "rapid_raw":
                    ocr_res, _ = rapid_ocr(img)
                    if ocr_res:
                        raw_text = "".join([line[1] for line in ocr_res])
                elif engine_key == "rapid_prep":
                    prep = preprocess_plate_crop(img)
                    ocr_res, _ = rapid_ocr(prep)
                    if ocr_res:
                        raw_text = "".join([line[1] for line in ocr_res])
            except Exception as e:
                raw_text = ""

            elapsed_ms = (time.perf_counter() - t0) * 1000
            latencies.append(elapsed_ms)

            cleaned = PlateValidator.clean_text(raw_text)
            corrected = PlateValidator.position_aware_correction(cleaned)
            is_valid, ftype, vstatus = PlateValidator.validate(corrected)

            ed = levenshtein_distance(gt, corrected)
            is_exact = (gt == corrected)
            is_1char = (ed <= 1)

            if is_exact:
                exact_count += 1
                cat_breakdown[cat]["exact"] += 1
            if is_1char:
                one_char_count += 1
                cat_breakdown[cat]["one_char"] += 1
            if is_valid:
                valid_count += 1
                cat_breakdown[cat]["valid"] += 1

            total_ed += ed
            total_chars += len(gt)
            cat_breakdown[cat]["total"] += 1
            cat_breakdown[cat]["ed"] += ed
            cat_breakdown[cat]["chars"] += len(gt)
            cat_breakdown[cat]["latencies"].append(elapsed_ms)

            if idx % 50 == 0 or idx == total_samples:
                print(f"   [{idx}/{total_samples}] current exact={exact_count} ({exact_count/idx*100:.1f}%)", flush=True)

        exact_pct = (exact_count / total_samples) * 100.0 if total_samples else 0.0
        one_char_pct = (one_char_count / total_samples) * 100.0 if total_samples else 0.0
        cer_pct = (total_ed / total_chars) * 100.0 if total_chars else 0.0
        valid_pct = (valid_count / total_samples) * 100.0 if total_samples else 0.0
        avg_lat = float(np.mean(latencies)) if latencies else 0.0

        print(f" -> {engine_name}: Exact={exact_pct:.2f}% | <=1Char={one_char_pct:.2f}% | CER={cer_pct:.2f}% ({total_ed}/{total_chars}) | Valid={valid_pct:.2f}% | Latency={avg_lat:.1f}ms", flush=True)

        results[engine_name] = {
            "total_samples": total_samples,
            "exact_matches": exact_count,
            "exact_match_pct": round(exact_pct, 2),
            "one_char_pct": round(one_char_pct, 2),
            "total_char_errors": total_ed,
            "total_gt_characters": total_chars,
            "cer_pct": round(cer_pct, 2),
            "format_valid_pct": round(valid_pct, 2),
            "avg_latency_ms": round(avg_lat, 2),
            "categories": {
                c: {
                    "samples": d["total"],
                    "exact_match_pct": round((d["exact"] / d["total"]) * 100.0, 2) if d["total"] else 0.0,
                    "cer_pct": round((d["ed"] / d["chars"]) * 100.0, 2) if d["chars"] else 0.0,
                    "avg_latency_ms": round(float(np.mean(d["latencies"])), 2) if d["latencies"] else 0.0,
                }
                for c, d in cat_breakdown.items()
            },
        }

    return results


def run_real_footage_comparison(fast_alpr, rapid_ocr):
    print("\n[3/4] Running Comparison on Real Footage Vehicle Crops...", flush=True)
    video_files = [
        f for f in sorted(os.listdir(SAMPLES_DIR))
        if f.lower().endswith(('.mp4', '.avi', '.mov', '.mkv'))
    ]

    from app.services.detector import SurveillanceDetector
    detector = SurveillanceDetector()

    eligible_crops = []  # list of (vid_name, frame_idx, track_id, cls, bgr_crop)

    for vid_name in video_files:
        vid_path = os.path.join(SAMPLES_DIR, vid_name)
        cap = cv2.VideoCapture(vid_path)
        if not cap.isOpened():
            continue

        fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
        frame_idx = 0
        detector.reset()

        while cap.isOpened():
            ret, frame = cap.read()
            if not ret or frame is None:
                break
            frame_idx += 1
            if frame_idx % 4 != 0:
                continue  # sample every 4 frames

            t_sec = frame_idx / fps
            h, w = frame.shape[:2]
            entities, _ = detector.process_frame(frame, timestamp_sec=t_sec)

            for ent in entities:
                if ent.class_name in ["car", "truck", "bus", "truck/bus", "two-wheeler", "three-wheeler"]:
                    bx = int(ent.bbox.x * w)
                    by = int(ent.bbox.y * h)
                    bw = int(ent.bbox.width * w)
                    bh = int(ent.bbox.height * h)
                    # Resolution filter for ANPR eligibility: bbox >= 120x80 px
                    if bw >= 120 and bh >= 80:
                        x1, y1 = max(0, bx), max(0, by)
                        x2, y2 = min(w, bx + bw), min(h, by + bh)
                        crop = frame[y1:y2, x1:x2]
                        if crop.size > 0:
                            eligible_crops.append((vid_name, frame_idx, ent.id, ent.class_name, crop))

        cap.release()

    # Deduplicate to best/largest crop per (video, track_id)
    best_crops_by_track = {}
    for vid, f_idx, tid, cls, crop in eligible_crops:
        key = (vid, tid)
        area = crop.shape[0] * crop.shape[1]
        if key not in best_crops_by_track or area > best_crops_by_track[key]["area"]:
            best_crops_by_track[key] = {
                "vid": vid,
                "frame": f_idx,
                "track_id": tid,
                "cls": cls,
                "crop": crop,
                "area": area,
            }

    unique_eligible = list(best_crops_by_track.values())
    print(f" Identified {len(unique_eligible)} unique eligible vehicle tracks (>=120x80 px) across footage.", flush=True)

    # Now evaluate the 3 engines on each unique eligible vehicle crop:
    # 1. fast-alpr: detector + cct-s-v2 OCR
    # 2. RapidOCR: contour fallback detector + RapidOCR
    # 3. Hybrid: fast-alpr detector + RapidOCR on detected plate crop
    real_results = {
        "fast_alpr": {"detected_plates": 0, "reads": [], "valid_format": 0},
        "rapid_ocr": {"detected_plates": 0, "reads": [], "valid_format": 0},
        "hybrid": {"detected_plates": 0, "reads": [], "valid_format": 0},
    }

    for item in unique_eligible:
        veh_crop = item["crop"]
        vh, vw = veh_crop.shape[:2]

        # 1. fast-alpr
        try:
            alpr_preds = fast_alpr.predict(veh_crop)
            if alpr_preds and len(alpr_preds) > 0:
                best = max(alpr_preds, key=lambda r: float(r.detection.confidence))
                real_results["fast_alpr"]["detected_plates"] += 1
                raw = best.ocr.text if best.ocr else ""
                cleaned = PlateValidator.clean_text(raw)
                corrected = PlateValidator.position_aware_correction(cleaned)
                is_valid, ftype, _ = PlateValidator.validate(corrected)
                if is_valid:
                    real_results["fast_alpr"]["valid_format"] += 1
                real_results["fast_alpr"]["reads"].append({
                    "track_id": item["track_id"],
                    "raw": raw,
                    "corrected": corrected,
                    "valid": is_valid,
                })
        except Exception:
            pass

        # 2. RapidOCR (with contour crop)
        try:
            from app.services.anpr import locate_plate_contour_fallback
            plate_cand = locate_plate_contour_fallback(veh_crop)
            prep = preprocess_plate_crop(plate_cand)
            res, _ = rapid_ocr(prep)
            if res:
                real_results["rapid_ocr"]["detected_plates"] += 1
                raw = "".join([l[1] for l in res])
                cleaned = PlateValidator.clean_text(raw)
                corrected = PlateValidator.position_aware_correction(cleaned)
                is_valid, ftype, _ = PlateValidator.validate(corrected)
                if is_valid:
                    real_results["rapid_ocr"]["valid_format"] += 1
                real_results["rapid_ocr"]["reads"].append({
                    "track_id": item["track_id"],
                    "raw": raw,
                    "corrected": corrected,
                    "valid": is_valid,
                })
        except Exception:
            pass

        # 3. Hybrid: fast-alpr detector for plate bbox, then RapidOCR for characters
        try:
            alpr_preds = fast_alpr.predict(veh_crop)
            if alpr_preds and len(alpr_preds) > 0:
                best = max(alpr_preds, key=lambda r: float(r.detection.confidence))
                bx = best.detection.bounding_box
                x1, y1, x2, y2 = max(0, int(bx.x1)), max(0, int(bx.y1)), min(vw, int(bx.x2)), min(vh, int(bx.y2))
                tight_plate = veh_crop[y1:y2, x1:x2]
                if tight_plate.size > 0:
                    real_results["hybrid"]["detected_plates"] += 1
                    prep = preprocess_plate_crop(tight_plate)
                    res, _ = rapid_ocr(prep)
                    raw = "".join([l[1] for l in res]) if res else ""
                    cleaned = PlateValidator.clean_text(raw)
                    corrected = PlateValidator.position_aware_correction(cleaned)
                    is_valid, ftype, _ = PlateValidator.validate(corrected)
                    if is_valid:
                        real_results["hybrid"]["valid_format"] += 1
                    real_results["hybrid"]["reads"].append({
                        "track_id": item["track_id"],
                        "raw": raw,
                        "corrected": corrected,
                        "valid": is_valid,
                    })
        except Exception:
            pass

    print(f"\nReal Footage Results on {len(unique_eligible)} Eligible Vehicles:", flush=True)
    print(f" fast-alpr: Plates localized={real_results['fast_alpr']['detected_plates']}, Valid Indian reads={real_results['fast_alpr']['valid_format']}", flush=True)
    print(f" RapidOCR:  Plates localized={real_results['rapid_ocr']['detected_plates']}, Valid Indian reads={real_results['rapid_ocr']['valid_format']}", flush=True)
    print(f" Hybrid:    Plates localized={real_results['hybrid']['detected_plates']}, Valid Indian reads={real_results['hybrid']['valid_format']}", flush=True)

    return {
        "eligible_vehicle_tracks": len(unique_eligible),
        "results": real_results,
    }


def main():
    fast_alpr, rapid_ocr = load_engines()
    synth_res = run_synthetic_benchmark(fast_alpr, rapid_ocr)
    real_res = run_real_footage_comparison(fast_alpr, rapid_ocr)

    final_payload = {
        "timestamp": int(time.time()),
        "synthetic_220_benchmark": synth_res,
        "real_footage_comparison": real_res,
    }

    with open(OUTPUT_JSON, "w") as f:
        json.dump(final_payload, f, indent=2)

    print(f"\n[4/4] Comprehensive ANPR Comparison saved to: {OUTPUT_JSON}", flush=True)


if __name__ == "__main__":
    main()
