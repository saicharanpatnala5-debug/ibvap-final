"""
IBVAP ANPR Diagnostic & Latency Benchmark Script
Extracts high-resolution diagnostic crops for all 5 ground truth vehicles from
samples/whatsapp_video_2026_09_09_842pm.mp4 and measures precise latency breakdowns.
"""

import os
import sys
import time
import json
import cv2
import numpy as np

# Ensure ai-service is in sys.path
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR = os.path.dirname(SCRIPT_DIR)
AI_DIR = os.path.join(ROOT_DIR, "ai-service")
if AI_DIR not in sys.path:
    sys.path.insert(0, AI_DIR)

from app.services.detector import SurveillanceDetector
from app.services.anpr import (
    FastALPREngine,
    PlateValidator,
    preprocess_plate_crop,
    query_awiros_ocr,
)

OUTPUT_DIR = os.path.join(ROOT_DIR, "artifacts", "anpr_debug")
os.makedirs(OUTPUT_DIR, exist_ok=True)

VIDEO_PATH = os.path.join(ROOT_DIR, "samples", "whatsapp_video_2026_09_09_842pm.mp4")
GOLDEN_PATH = os.path.join(ROOT_DIR, "samples", "golden_plates.json")

def run_diagnostic():
    if not os.path.exists(VIDEO_PATH):
        print(f"Error: Video not found at {VIDEO_PATH}")
        return

    with open(GOLDEN_PATH, "r", encoding="utf-8") as f:
        golden_data = json.load(f)

    tracks_meta = {t["trackId"]: t for t in golden_data["footage"][0]["tracks"]}

    cap = cv2.VideoCapture(VIDEO_PATH)
    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH) or 1280)
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT) or 720)

    print(f"[Diagnostic] Video opened: {width}x{height} @ {fps:.1f} FPS, {total_frames} frames")

    detector = SurveillanceDetector()
    engine = FastALPREngine.get_instance()

    decode_times = []
    detect_times = []
    crop_prep_times = []
    ocr_times = []
    validation_times = []

    # Target tracks to capture
    target_track_ids = {44, 101, 130, 147, 131}
    captured_tracks = {}

    frame_idx = 0
    while cap.isOpened():
        t0 = time.perf_counter()
        ret, frame = cap.read()
        t1 = time.perf_counter()
        if not ret or frame is None:
            break

        decode_times.append((t1 - t0) * 1000.0)
        timestamp_sec = frame_idx / fps

        # Detection + Tracking
        t_det0 = time.perf_counter()
        entities, _ = detector.process_frame(frame, timestamp_sec)
        t_det1 = time.perf_counter()
        detect_times.append((t_det1 - t_det0) * 1000.0)

        for ent in entities:
            if ent.id in target_track_ids:
                if ent.id not in captured_tracks:
                    captured_tracks[ent.id] = {
                        "track_id": ent.id,
                        "class_name": ent.class_name,
                        "candidates": []
                    }

                # Extract vehicle crop from native 1280x720 frame
                bx = ent.bbox
                vx1 = max(0, int(bx.x * width))
                vy1 = max(0, int(bx.y * height))
                vx2 = min(width, int((bx.x + bx.width) * width))
                vy2 = min(height, int((bx.y + bx.height) * height))
                veh_crop = frame[vy1:vy2, vx1:vx2]

                if veh_crop.size > 0 and veh_crop.shape[0] >= 30 and veh_crop.shape[1] >= 40:
                    # Measure plate localization + crop extraction + prep
                    t_prep0 = time.perf_counter()
                    # Run FastALPR to locate plate
                    best_cand = None
                    if engine._alpr is not None:
                        res_alpr = engine._alpr.predict(veh_crop)
                        if res_alpr and len(res_alpr) > 0:
                            for det in res_alpr:
                                b = det.detection.bounding_box
                                dx1, dy1, dx2, dy2 = int(b.x1), int(b.y1), int(b.x2), int(b.y2)
                                pw = dx2 - dx1
                                ph = dy2 - dy1
                                if pw >= 15 and ph >= 6:
                                    best_cand = (dx1, dy1, dx2, dy2)
                                    break
                    t_prep1 = time.perf_counter()

                    if best_cand is not None:
                        px1, py1, px2, py2 = best_cand
                        # Pad crop
                        pad_x = max(2, int((px2 - px1) * 0.08))
                        pad_y = max(2, int((py2 - py1) * 0.10))
                        c_px1 = max(0, px1 - pad_x)
                        c_py1 = max(0, py1 - pad_y)
                        c_px2 = min(veh_crop.shape[1], px2 + pad_x)
                        c_py2 = min(veh_crop.shape[0], py2 + pad_y)
                        plate_crop = veh_crop[c_py1:c_py2, c_px1:c_px2]

                        prep_crop = preprocess_plate_crop(plate_crop)
                        t_prep2 = time.perf_counter()
                        crop_prep_times.append((t_prep2 - t_prep0) * 1000.0)

                        # Measure Awiros OCR latency
                        t_ocr0 = time.perf_counter()
                        ar = float(plate_crop.shape[1]) / float(max(1, plate_crop.shape[0]))
                        is_dual = (ar < 2.1)
                        awiros_res = query_awiros_ocr(plate_crop, is_dual_row=is_dual)
                        if awiros_res is None or not awiros_res.get("text"):
                            awiros_res = query_awiros_ocr(prep_crop, is_dual_row=is_dual)
                        t_ocr1 = time.perf_counter()
                        ocr_times.append((t_ocr1 - t_ocr0) * 1000.0)

                        # Measure format validation latency
                        t_val0 = time.perf_counter()
                        plate_text = awiros_res.get("text", "") if awiros_res else ""
                        conf = awiros_res.get("confidence", 0.0) if awiros_res else 0.0
                        valid_info = PlateValidator.validate_indian_registration(plate_text)
                        t_val1 = time.perf_counter()
                        validation_times.append((t_val1 - t_val0) * 1000.0)

                        captured_tracks[ent.id]["candidates"].append({
                            "frame_idx": frame_idx,
                            "timestamp_sec": round(timestamp_sec, 2),
                            "veh_crop": veh_crop,
                            "plate_crop": plate_crop,
                            "prep_crop": prep_crop,
                            "raw_text": plate_text,
                            "confidence": conf,
                            "validation": valid_info,
                            "prep_ms": (t_prep2 - t_prep0) * 1000.0,
                            "ocr_ms": (t_ocr1 - t_ocr0) * 1000.0,
                            "val_ms": (t_val1 - t_val0) * 1000.0,
                        })

        frame_idx += 1

    cap.release()

    # Process and save best candidate for each track
    track_results = []
    for tid, data in captured_tracks.items():
        candidates = data["candidates"]
        if not candidates:
            continue

        # Choose best candidate by confidence and validity
        valid_cands = [c for c in candidates if c["validation"]["is_valid"]]
        best = max(valid_cands, key=lambda c: c["confidence"]) if valid_cands else max(candidates, key=lambda c: c["confidence"])

        meta = tracks_meta.get(tid, {})
        gt_plate = meta.get("visiblePlate", "")
        gt_norm = meta.get("standardNormalizedPlate", gt_plate)

        det_plate = best["raw_text"]
        det_norm = best["validation"].get("normalized_plate", det_plate)

        is_exact = (det_plate == gt_plate) or (det_norm == gt_norm)
        is_near = False
        if not is_exact and (len(det_plate) >= 4 and len(gt_plate) >= 4):
            # Check character distance
            import difflib
            sim = difflib.SequenceMatcher(None, det_plate, gt_plate).ratio()
            is_near = sim >= 0.70

        # Save crops
        veh_filename = f"track_{tid}_vehicle_crop.jpg"
        plate_filename = f"track_{tid}_plate_crop.jpg"
        prep_filename = f"track_{tid}_plate_prep.jpg"

        cv2.imwrite(os.path.join(OUTPUT_DIR, veh_filename), best["veh_crop"])
        cv2.imwrite(os.path.join(OUTPUT_DIR, plate_filename), best["plate_crop"])
        cv2.imwrite(os.path.join(OUTPUT_DIR, prep_filename), best["prep_crop"])

        track_results.append({
            "trackId": tid,
            "vehicleClass": data["class_name"],
            "bestFrame": best["frame_idx"],
            "timestampSec": best["timestamp_sec"],
            "groundTruthPlate": gt_plate,
            "groundTruthNormalized": gt_norm,
            "detectedPlate": det_plate,
            "detectedNormalized": det_norm,
            "confidence": round(best["confidence"], 1),
            "isValidFormat": best["validation"]["is_valid"],
            "formatType": best["validation"]["format_type"],
            "validationStatus": "Valid format" if best["validation"]["is_valid"] else "Needs review",
            "stateCode": best["validation"].get("state_code"),
            "stateName": best["validation"].get("state_name"),
            "rtoOffice": best["validation"].get("rto_office"),
            "matchStatus": "Exact Match" if is_exact else ("Near Match" if is_near else "Mismatch"),
            "latencyBreakdown": {
                "cropPrepMs": round(best["prep_ms"], 2),
                "ocrMs": round(best["ocr_ms"], 2),
                "valMs": round(best["val_ms"], 2),
                "totalAnprMs": round(best["prep_ms"] + best["ocr_ms"] + best["val_ms"], 2),
            },
            "crops": {
                "vehicleCrop": veh_filename,
                "plateCrop": plate_filename,
                "preprocessedCrop": prep_filename,
            }
        })

    def calc_stats(arr):
        if not arr:
            return {"avg": 0.0, "min": 0.0, "max": 0.0, "p95": 0.0}
        return {
            "avg": round(float(np.mean(arr)), 2),
            "min": round(float(np.min(arr)), 2),
            "max": round(float(np.max(arr)), 2),
            "p95": round(float(np.percentile(arr, 95)), 2),
        }

    summary = {
        "video": "samples/whatsapp_video_2026_09_09_842pm.mp4",
        "resolution": f"{width}x{height}",
        "totalFrames": total_frames,
        "fps": fps,
        "latencyBenchmark": {
            "videoDecodeMs": calc_stats(decode_times),
            "detectionAndTrackingMs": calc_stats(detect_times),
            "plateCropAndPrepMs": calc_stats(crop_prep_times),
            "awirosOcrInferenceMs": calc_stats(ocr_times),
            "formatValidationMs": calc_stats(validation_times),
        },
        "trackResults": track_results,
    }

    summary_path = os.path.join(OUTPUT_DIR, "diagnostic_summary.json")
    with open(summary_path, "w", encoding="utf-8") as f:
        json.dump(summary, f, indent=2)

    print("\n================ DIAGNOSTIC LATENCY BENCHMARK ================")
    print(f"Video Decode:          avg {summary['latencyBenchmark']['videoDecodeMs']['avg']} ms (p95: {summary['latencyBenchmark']['videoDecodeMs']['p95']} ms)")
    print(f"YOLO26 Detection/Track:avg {summary['latencyBenchmark']['detectionAndTrackingMs']['avg']} ms (p95: {summary['latencyBenchmark']['detectionAndTrackingMs']['p95']} ms)")
    print(f"Plate Crop & Prep:     avg {summary['latencyBenchmark']['plateCropAndPrepMs']['avg']} ms (p95: {summary['latencyBenchmark']['plateCropAndPrepMs']['p95']} ms)")
    print(f"Awiros OCR Inference:  avg {summary['latencyBenchmark']['awirosOcrInferenceMs']['avg']} ms (p95: {summary['latencyBenchmark']['awirosOcrInferenceMs']['p95']} ms)")
    print(f"Format Validation:     avg {summary['latencyBenchmark']['formatValidationMs']['avg']} ms (p95: {summary['latencyBenchmark']['formatValidationMs']['p95']} ms)")
    print("==============================================================")
    print("\n================ TRACK RESULTS VS GROUND TRUTH ================")
    for r in track_results:
        print(f"Track {r['trackId']} ({r['vehicleClass']}): GroundTruth='{r['groundTruthPlate']}' -> Detected='{r['detectedPlate']}' [{r['matchStatus']}], Conf={r['confidence']}%, Valid={r['isValidFormat']}, ANPR Total={r['latencyBreakdown']['totalAnprMs']}ms")
    print("==============================================================\n")
    print(f"Saved diagnostic crops and summary to: {OUTPUT_DIR}")

if __name__ == "__main__":
    run_diagnostic()
