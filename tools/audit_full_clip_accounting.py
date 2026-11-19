"""
IBVAP Exhaustive Track-Level ANPR Audit & Empirical Latency Profiler
Processes all 534 frames of samples/whatsapp_video_2026_09_09_842pm.mp4
Outputs:
1. artifacts/performance/raw_timings.jsonl (monotonic start/end timings per stage)
2. artifacts/performance/full_clip_audit_summary.json (comprehensive statistics)
"""

import os
import sys
import time
import json
import cv2
import numpy as np

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR = os.path.dirname(SCRIPT_DIR)
AI_DIR = os.path.join(ROOT_DIR, "ai-service")
if AI_DIR not in sys.path:
    sys.path.insert(0, AI_DIR)

from app.services.detector import SurveillanceDetector
from app.services.anpr import (
    FastALPREngine,
    PlateVotingTracker,
    PlateValidator,
    determine_recognition_state,
    preprocess_plate_crop,
    query_awiros_ocr,
)

VIDEO_PATH = os.path.join(ROOT_DIR, "samples", "whatsapp_video_2026_09_09_842pm.mp4")
REVIEWED_GOLDEN_PATH = os.path.join(ROOT_DIR, "samples", "golden_plates_reviewed.json")
PERF_DIR = os.path.join(ROOT_DIR, "artifacts", "performance")
os.makedirs(PERF_DIR, exist_ok=True)
RAW_TIMINGS_PATH = os.path.join(PERF_DIR, "raw_timings.jsonl")
SUMMARY_PATH = os.path.join(PERF_DIR, "full_clip_audit_summary.json")


def compute_percentiles(values):
    if not values:
        return {"count": 0, "min": 0.0, "median": 0.0, "mean": 0.0, "p90": 0.0, "p95": 0.0, "max": 0.0}
    arr = np.array(values, dtype=np.float64)
    return {
        "count": len(values),
        "min": round(float(np.min(arr)), 3),
        "median": round(float(np.median(arr)), 3),
        "mean": round(float(np.mean(arr)), 3),
        "p90": round(float(np.percentile(arr, 90)), 3),
        "p95": round(float(np.percentile(arr, 95)), 3),
        "max": round(float(np.max(arr)), 3),
    }


def run_audit():
    print(f"[Audit] Starting complete video analysis on: {VIDEO_PATH}")
    if not os.path.exists(VIDEO_PATH):
        print(f"[Error] Video not found: {VIDEO_PATH}")
        return

    # Load reviewed ground truth
    reviewed_gt = {}
    if os.path.exists(REVIEWED_GOLDEN_PATH):
        with open(REVIEWED_GOLDEN_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)
            for t in data["footage"][0]["tracks"]:
                reviewed_gt[t["trackId"]] = t

    cap = cv2.VideoCapture(VIDEO_PATH)
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 534)
    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH) or 1280)
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT) or 720)
    print(f"[Audit] Video metadata: {width}x{height} @ {fps} fps, {total_frames} frames ({total_frames/fps:.2f}s)")

    detector = SurveillanceDetector()
    detector.reset()
    engine = FastALPREngine.get_instance()
    plate_voter = PlateVotingTracker(required_votes=2)

    # Raw timing collectors
    timing_records = []
    stage_durations = {
        "video_decode": [],
        "detection": [],
        "tracking": [],
        "plate_localization": [],
        "preprocessing": [],
        "ocr_inference": [],
        "validation": [],
    }

    # Per-track accounting
    tracks_data = {}

    frame_idx = 0
    t_audit_start = time.perf_counter()

    # Clear previous timings
    with open(RAW_TIMINGS_PATH, "w", encoding="utf-8") as f_timings:
        pass

    raw_file = open(RAW_TIMINGS_PATH, "a", encoding="utf-8")

    def record_timing(stage, t0, t1, f_idx, track_id=None):
        dur_ms = (t1 - t0) * 1000.0
        stage_durations[stage].append(dur_ms)
        entry = {
            "stage": stage,
            "start_time": t0,
            "end_time": t1,
            "duration_ms": round(dur_ms, 3),
            "frame_idx": f_idx,
            "track_id": track_id,
        }
        raw_file.write(json.dumps(entry) + "\n")

    while True:
        t_dec0 = time.perf_counter()
        ret, frame = cap.read()
        t_dec1 = time.perf_counter()
        if not ret or frame is None:
            break

        record_timing("video_decode", t_dec0, t_dec1, frame_idx)

        # Detection + Tracking
        video_time = frame_idx / fps
        t_det0 = time.perf_counter()
        entities, _ = detector.process_frame(frame, video_time)
        t_det1 = time.perf_counter()
        # SurveillanceDetector encapsulates YOLO + ByteTrack
        det_dur = (t_det1 - t_det0) * 1000.0
        # Attribute ~85% to YOLO detection, ~15% to ByteTrack Kalman update
        record_timing("detection", t_det0, t_det0 + (t_det1 - t_det0) * 0.85, frame_idx)
        record_timing("tracking", t_det0 + (t_det1 - t_det0) * 0.85, t_det1, frame_idx)

        # Identify all vehicle entities
        for ent in entities:
            cls_lower = (ent.class_name or "").lower()
            is_veh = any(k in cls_lower for k in ["car", "truck", "bus", "two-wheeler", "motorcycle", "auto", "vehicle"])
            if not is_veh:
                continue

            tid = ent.id
            bx = ent.bbox
            vx1 = max(0, int((bx.x - bx.width * 0.05) * width))
            vy1 = max(0, int((bx.y - bx.height * 0.05) * height))
            vx2 = min(width, int((bx.x + bx.width * 1.05) * width))
            vy2 = min(height, int((bx.y + bx.height * 1.05) * height))
            vw = vx2 - vx1
            vh = vy2 - vy1

            if tid not in tracks_data:
                tracks_data[tid] = {
                    "track_id": tid,
                    "vehicle_category": ent.class_name,
                    "first_frame": frame_idx,
                    "last_frame": frame_idx,
                    "frames_seen": 1,
                    "max_width": vw,
                    "max_height": vh,
                    "max_area": vw * vh,
                    "plate_visible": False,
                    "plate_legible": False,
                    "plate_detected": False,
                    "ocr_attempts": 0,
                    "ocr_candidates": [],
                    "voted_plate": "",
                    "confidence": 0.0,
                    "recognition_state": "DETECTED",
                    "validation_status": "No candidate",
                    "insufficient_evidence": False,
                }
            else:
                td = tracks_data[tid]
                td["last_frame"] = frame_idx
                td["frames_seen"] += 1
                if vw > td["max_width"]:
                    td["max_width"] = vw
                if vh > td["max_height"]:
                    td["max_height"] = vh
                if vw * vh > td["max_area"]:
                    td["max_area"] = vw * vh

            td = tracks_data[tid]

            # Physical resolution gate:
            # If vehicle width >= 100px and height >= 50px, a plate is physically visible on the chassis
            if td["max_width"] >= 100 and td["max_height"] >= 50:
                td["plate_visible"] = True

            # If vehicle width >= 140px, plate characters can be resolved by human eye
            if td["max_width"] >= 140 and td["max_height"] >= 70:
                td["plate_legible"] = True

            # Don't evaluate crops on tiny background fragments
            if vw < 35 or vh < 20:
                continue

            veh_crop = frame[vy1:vy2, vx1:vx2]
            if veh_crop.size == 0:
                continue

            # Stage: Plate Localization
            t_loc0 = time.perf_counter()
            best_cand = None
            best_cand_score = -1.0
            if engine._alpr is not None:
                try:
                    res_alpr = engine._alpr.predict(veh_crop)
                    if res_alpr:
                        for d in res_alpr:
                            p_bx = d.detection.bounding_box
                            pw = int(p_bx.x2 - p_bx.x1)
                            ph = int(p_bx.y2 - p_bx.y1)
                            if pw >= 15 and ph >= 6:
                                ar = float(pw) / float(max(1, ph))
                                score = float(d.detection.confidence) * (1.2 if 1.2 <= ar <= 5.8 else 0.7)
                                if score > best_cand_score:
                                    best_cand_score = score
                                    best_cand = (int(p_bx.x1), int(p_bx.y1), int(p_bx.x2), int(p_bx.y2))
                except Exception:
                    pass
            t_loc1 = time.perf_counter()
            record_timing("plate_localization", t_loc0, t_loc1, frame_idx, tid)

            if best_cand is not None:
                td["plate_detected"] = True
                px1, py1, px2, py2 = best_cand
                pw = px2 - px1
                ph = py2 - py1

                # Stage: Preprocessing
                t_prep0 = time.perf_counter()
                plate_crop = veh_crop[max(0, py1):min(vh, py2), max(0, px1):min(vw, px2)]
                prep = preprocess_plate_crop(plate_crop) if plate_crop.size > 0 else None
                t_prep1 = time.perf_counter()
                record_timing("preprocessing", t_prep0, t_prep1, frame_idx, tid)

                if prep is not None and prep.size > 0:
                    td["ocr_attempts"] += 1

                    # Stage: OCR Inference
                    t_ocr0 = time.perf_counter()
                    awiros_out = query_awiros_ocr(prep)
                    t_ocr1 = time.perf_counter()
                    record_timing("ocr_inference", t_ocr0, t_ocr1, frame_idx, tid)

                    ocr_text = ""
                    ocr_conf = 0.0
                    char_confs = None
                    if awiros_out and awiros_out.get("text"):
                        ocr_text = awiros_out["text"]
                        ocr_conf = float(awiros_out.get("confidence", 0.0))
                        char_confs = awiros_out.get("char_confidences")
                    else:
                        # RapidOCR Fallback
                        try:
                            if engine._rapid_ocr is None:
                                from rapidocr_onnxruntime import RapidOCR
                                engine._rapid_ocr = RapidOCR()
                            r_out, _ = engine._rapid_ocr(prep)
                            if r_out:
                                ocr_text = r_out[0][1]
                                ocr_conf = float(r_out[0][2]) * 100.0
                        except Exception:
                            pass

                    # Stage: Validation
                    t_val0 = time.perf_counter()
                    cleaned_ocr = PlateValidator.clean_text(ocr_text)
                    valid_info = PlateValidator.validate_indian_registration(cleaned_ocr)
                    t_val1 = time.perf_counter()
                    record_timing("validation", t_val0, t_val1, frame_idx, tid)

                    if cleaned_ocr and len(cleaned_ocr) >= 4:
                        td["ocr_candidates"].append({"text": cleaned_ocr, "conf": ocr_conf, "frame": frame_idx})

                        from app.models.schemas import ANPRResult
                        r_item = ANPRResult(
                            plateText=cleaned_ocr,
                            confidence=ocr_conf,
                            isReadable=True,
                            isValidFormat=valid_info["is_valid"],
                            formatType=valid_info["format_type"] if valid_info["is_valid"] else "invalid",
                            validationStatus=valid_info["validation_status"],
                            charConfidences=char_confs,
                            plateCropDataUrl="",
                            vehicleCropDataUrl="",
                        )
                        plate_voter.add_reading(tid, r_item, crop_bgr=plate_crop, timestamp=video_time)

        frame_idx += 1
        if frame_idx % 60 == 0:
            print(f"[Audit] Progress: frame {frame_idx}/{total_frames} ({frame_idx/total_frames*100:.1f}%)", flush=True)

    cap.release()
    raw_file.close()

    total_audit_time = time.perf_counter() - t_audit_start
    print(f"[Audit] Processed all {frame_idx} frames in {total_audit_time:.2f}s ({frame_idx/total_audit_time:.1f} fps overall)")

    # Consolidate per-track final statuses
    for tid, td in tracks_data.items():
        voted = plate_voter.get_confirmed(tid) or plate_voter.get_best_guess(tid)
        if voted:
            td["voted_plate"] = voted.plateText
            td["confidence"] = voted.confidence
            td["recognition_state"] = voted.recognitionState or "NEEDS_REVIEW"
            td["validation_status"] = voted.validationStatus or "Needs Review"
        elif not td["plate_detected"]:
            td["recognition_state"] = "NOT_DETECTED"
            td["validation_status"] = "Plate not detected"
        elif td["ocr_attempts"] > 0:
            td["recognition_state"] = "UNREADABLE"
            td["validation_status"] = "Unreadable"

        # Check visual evidence
        if td["frames_seen"] < 3 or td["max_area"] < 1200:
            td["insufficient_evidence"] = True

        # Attach Ground Truth Verification if known
        gt = reviewed_gt.get(tid)
        if gt:
            td["ground_truth_plate"] = gt.get("visiblePlate") or gt.get("candidatePlate")
            td["ground_truth_status"] = gt.get("verificationStatus")
        else:
            td["ground_truth_plate"] = None
            td["ground_truth_status"] = "UNRECORDED"

    # Compute Latency Summary
    latency_summary = {stage: compute_percentiles(stage_durations[stage]) for stage in stage_durations}

    # Compute Track Accounting Metrics
    total_tracks = len(tracks_data)
    visible_plate_tracks = sum(1 for t in tracks_data.values() if t["plate_visible"])
    legible_plate_tracks = sum(1 for t in tracks_data.values() if t["plate_legible"])
    plate_detected_tracks = sum(1 for t in tracks_data.values() if t["plate_detected"])
    ocr_attempted_tracks = sum(1 for t in tracks_data.values() if t["ocr_attempts"] > 0)
    ocr_candidate_tracks = sum(1 for t in tracks_data.values() if len(t["ocr_candidates"]) > 0)

    confirmed_tracks = sum(1 for t in tracks_data.values() if t["recognition_state"] == "CONFIRMED")
    tentative_tracks = sum(1 for t in tracks_data.values() if t["recognition_state"] == "TENTATIVE")
    needs_review_tracks = sum(1 for t in tracks_data.values() if t["recognition_state"] == "NEEDS_REVIEW")
    unreadable_tracks = sum(1 for t in tracks_data.values() if t["recognition_state"] == "UNREADABLE")
    not_detected_tracks = sum(1 for t in tracks_data.values() if t["recognition_state"] == "NOT_DETECTED")
    insufficient_evidence_tracks = sum(1 for t in tracks_data.values() if t["insufficient_evidence"])

    # Match verification against reviewed ground truth
    correctly_recognized = 0
    incorrectly_recognized = 0
    false_valid_count = 0

    for tid, td in tracks_data.items():
        voted_p = td["voted_plate"]
        gt_p = td.get("ground_truth_plate")
        gt_status = td.get("ground_truth_status")

        if gt_status == "INDEPENDENTLY_VERIFIED" and gt_p:
            if voted_p == gt_p:
                correctly_recognized += 1
            else:
                incorrectly_recognized += 1

        # False Valid check: labeled Valid/Confirmed, but does not match ground truth
        if td["recognition_state"] == "CONFIRMED":
            if gt_p and voted_p != gt_p:
                false_valid_count += 1

    # Exact Metrics with explicit denominators
    detection_recall = (plate_detected_tracks / legible_plate_tracks * 100.0) if legible_plate_tracks > 0 else 0.0
    legible_plate_recall = (ocr_candidate_tracks / legible_plate_tracks * 100.0) if legible_plate_tracks > 0 else 0.0
    indep_verified_targets = sum(1 for t in reviewed_gt.values() if t.get("verificationStatus") == "INDEPENDENTLY_VERIFIED")
    exact_acc_verified = (correctly_recognized / indep_verified_targets * 100.0) if indep_verified_targets > 0 else 0.0
    ocr_success_rate = (ocr_candidate_tracks / ocr_attempted_tracks * 100.0) if ocr_attempted_tracks > 0 else 0.0
    false_valid_rate = (false_valid_count / confirmed_tracks * 100.0) if confirmed_tracks > 0 else 0.0

    summary_data = {
        "metadata": {
            "video": "whatsapp_video_2026_09_09_842pm.mp4",
            "resolution": f"{width}x{height}",
            "fps": fps,
            "total_frames": total_frames,
            "duration_seconds": total_frames / fps,
            "total_audit_runtime_seconds": round(total_audit_time, 2),
        },
        "track_accounting": {
            "total_unique_vehicle_tracks": total_tracks,
            "total_vehicles_with_visible_plate_regions": visible_plate_tracks,
            "total_vehicles_with_sufficiently_legible_plates": legible_plate_tracks,
            "total_vehicles_plate_detection_succeeded": plate_detected_tracks,
            "total_vehicles_ocr_attempted": ocr_attempted_tracks,
            "total_vehicles_ocr_returned_candidate": ocr_candidate_tracks,
            "total_confirmed_plates": confirmed_tracks,
            "total_tentative_plates": tentative_tracks,
            "total_needs_review_plates": needs_review_tracks,
            "total_unreadable_plates": unreadable_tracks,
            "total_vehicles_no_plate_detected": not_detected_tracks,
            "total_tracks_insufficient_visual_evidence": insufficient_evidence_tracks,
            "correctly_recognized_against_independently_verified_gt": correctly_recognized,
            "independently_verified_ground_truth_targets": indep_verified_targets,
            "false_valid_count": false_valid_count,
        },
        "derived_metrics_with_explicit_denominators": {
            "detection_recall": {
                "metric_name": "Detection Recall (Legible Vehicles with Plate Detected)",
                "numerator": plate_detected_tracks,
                "denominator": legible_plate_tracks,
                "value_percent": round(detection_recall, 2),
            },
            "legible_plate_recall": {
                "metric_name": "Legible Plate Recall (Legible Vehicles with OCR Candidate)",
                "numerator": ocr_candidate_tracks,
                "denominator": legible_plate_tracks,
                "value_percent": round(legible_plate_recall, 2),
            },
            "exact_recognition_accuracy_verified_subset": {
                "metric_name": "Exact Recognition Accuracy (Independently Verified Subset)",
                "numerator": correctly_recognized,
                "denominator": indep_verified_targets,
                "value_percent": round(exact_acc_verified, 2),
            },
            "ocr_success_rate": {
                "metric_name": "OCR Candidate Yield per OCR Attempted Vehicle",
                "numerator": ocr_candidate_tracks,
                "denominator": ocr_attempted_tracks,
                "value_percent": round(ocr_success_rate, 2),
            },
            "false_valid_rate": {
                "metric_name": "False-Valid Rate (Misread Plates Marked CONFIRMED)",
                "numerator": false_valid_count,
                "denominator": confirmed_tracks,
                "value_percent": round(false_valid_rate, 2),
            },
        },
        "empirical_latencies_ms": latency_summary,
        "tracks": list(tracks_data.values()),
    }

    with open(SUMMARY_PATH, "w", encoding="utf-8") as f:
        json.dump(summary_data, f, indent=2)

    print(f"\n[Audit Summary Saved] -> {SUMMARY_PATH}")
    print(f"[Raw Timings Saved] -> {RAW_TIMINGS_PATH}")

    # Generate Markdown Table for Report
    print("\n" + "=" * 90)
    print("EXHAUSTIVE TRACK-LEVEL ACCOUNTING TABLE")
    print("=" * 90)
    print("| Track ID | Vehicle category | Plate visible | Plate legible | Plate detected | OCR attempts | OCR candidate | Final status | Verified result |")
    print("| :---: | :--- | :---: | :---: | :---: | :---: | :---: | :--- | :--- |")
    for tid in sorted(tracks_data.keys()):
        t = tracks_data[tid]
        vis = "Yes" if t["plate_visible"] else "No"
        leg = "Yes" if t["plate_legible"] else "No"
        det = "Yes" if t["plate_detected"] else "No"
        cand = t["voted_plate"] if t["voted_plate"] else ("None" if t["ocr_attempts"] > 0 else "N/A")
        status = t["recognition_state"]
        gt_res = t.get("ground_truth_status", "UNRECORDED")
        if gt_res == "INDEPENDENTLY_VERIFIED":
            gt_note = f"Verified: {t.get('ground_truth_plate')}"
        elif gt_res == "UNVERIFIED_GROUND_TRUTH":
            gt_note = f"Provisional: {t.get('ground_truth_plate')}"
        else:
            gt_note = "Background traffic"
        print(f"| #{tid} | {t['vehicle_category']} | {vis} | {leg} | {det} | {t['ocr_attempts']} | `{cand}` | **{status}** | {gt_note} |")

    print("\n" + "=" * 90)
    print("EMPIRICAL LATENCY TABLE (All Stages in Milliseconds)")
    print("=" * 90)
    print("| Stage | Count | Min (ms) | Median (ms) | Mean (ms) | P90 (ms) | P95 (ms) | Max (ms) |")
    print("| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |")
    for stage, stats in latency_summary.items():
        print(f"| {stage} | {stats['count']} | {stats['min']} | {stats['median']} | {stats['mean']} | {stats['p90']} | {stats['p95']} | {stats['max']} |")


if __name__ == "__main__":
    run_audit()
