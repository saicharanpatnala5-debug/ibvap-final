"""
IBVAP Stage-by-Stage Profiler & Baseline Benchmark
Measures exact per-stage latency (decode, detect, track, OCR) and tracking metrics.
"""

import os
import sys
import time
import math
import cv2
import numpy as np

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
AI_SERVICE_DIR = os.path.dirname(SCRIPT_DIR)
ROOT_DIR = os.path.dirname(AI_SERVICE_DIR)
SAMPLES_DIR = os.path.join(ROOT_DIR, "samples")

if AI_SERVICE_DIR not in sys.path:
    sys.path.insert(0, AI_SERVICE_DIR)

from app.services.detector import SurveillanceDetector
from app.services.low_light import compute_frame_luminance, apply_clahe_enhancement
from app.config import settings


def profile_clip(clip_name: str, max_frames: int = 100):
    video_path = os.path.join(SAMPLES_DIR, clip_name)
    if not os.path.exists(video_path):
        print(f"Error: {video_path} not found.")
        return None

    cap = cv2.VideoCapture(video_path)
    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)

    detector = SurveillanceDetector()

    decode_times = []
    detect_times = []
    track_times = []
    ocr_times = []
    total_times = []

    tracks = {}
    frame_idx = 0

    print(f"\nProfiling {clip_name} ({max_frames} frames)...", flush=True)

    t_start_all = time.perf_counter()

    while cap.isOpened() and frame_idx < max_frames:
        t0 = time.perf_counter()
        ret, frame = cap.read()
        if not ret or frame is None:
            break
        t_decode = time.perf_counter() - t0
        decode_times.append(t_decode * 1000.0)

        frame_idx += 1
        t_sec = frame_idx / fps
        h, w = frame.shape[:2]

        lum = compute_frame_luminance(frame)
        if ("night" in clip_name.lower() or "842" in clip_name or lum < 60) and settings.ENABLE_LOW_LIGHT_CLAHE:
            proc_frame = apply_clahe_enhancement(frame)
        else:
            proc_frame = frame

        # Instrument detection vs tracking vs OCR
        t_det_start = time.perf_counter()
        results = detector.model.track(
            source=proc_frame,
            persist=True,
            tracker=detector.tracker_config_path,
            conf=settings.CONF_THRESHOLD,
            iou=settings.IOU_THRESHOLD,
            imgsz=settings.IMGSZ,
            device=detector.device,
            verbose=False,
        )
        t_detect = time.perf_counter() - t_det_start
        detect_times.append(t_detect * 1000.0)

        # Measure OCR time separately
        t_ocr_start = time.perf_counter()
        raw_detections = []
        plates = []

        if results and len(results) > 0 and results[0].boxes is not None:
            boxes = results[0].boxes
            for box in boxes:
                cls_id = int(box.cls[0].item())
                cls_name = detector.model.names.get(cls_id, "unknown")
                if cls_name not in ["person", "car", "truck", "bus", "bicycle", "motorcycle", "backpack"]:
                    continue

                xyxy = box.xyxy[0].cpu().numpy()
                x1, y1, x2, y2 = xyxy
                conf_pct = int(round(float(box.conf[0].item()) * 100))
                track_id = int(box.id[0].item()) if box.id is not None else int(time.time() * 1000) % 9999

                from app.models.schemas import BoundingBox
                norm_box = BoundingBox(
                    x=max(0.0, float(x1 / w)),
                    y=max(0.0, float(y1 / h)),
                    width=min(1.0, float((x2 - x1) / w)),
                    height=min(1.0, float((y2 - y1) / h)),
                )
                ix1, iy1, ix2, iy2 = max(0, int(x1)), max(0, int(y1)), min(w, int(x2)), min(h, int(y2))
                obj_crop = proc_frame[iy1:iy2, ix1:ix2]

                from app.services.detector import extract_entity_appearance
                appearance = extract_entity_appearance(obj_crop, cls_name)

                # ANPR for vehicles (current synchronous logic)
                anpr_res = None
                if cls_name in ["car", "truck", "bus"]:
                    from app.services.anpr import crop_license_plate_region, compute_crop_sharpness
                    plate_crop = crop_license_plate_region(obj_crop)
                    sharpness = compute_crop_sharpness(plate_crop)
                    candidate_plate = detector._extract_plate_heuristic(plate_crop, track_id)
                    if candidate_plate:
                        confirmed = detector.plate_voter.add_reading(track_id, candidate_plate, sharpness=sharpness)
                        if confirmed:
                            anpr_res = confirmed
                            plates.append(confirmed)

                raw_detections.append({
                    "id": track_id,
                    "class": cls_name,
                    "bbox": norm_box,
                    "conf": conf_pct,
                    "appearance": appearance,
                    "anpr": anpr_res,
                })

        t_ocr = time.perf_counter() - t_ocr_start
        ocr_times.append(t_ocr * 1000.0)

        # Measure tracking update time
        t_track_start = time.perf_counter()
        entities = detector.tracking_manager.update_tracks(
            raw_detections=raw_detections,
            timestamp=t_sec,
            frame_width=w,
            frame_height=h,
        )
        t_track = time.perf_counter() - t_track_start
        track_times.append(t_track * 1000.0)

        total_frame_time = t_decode + t_detect + t_ocr + t_track
        total_times.append(total_frame_time * 1000.0)

        # Track observations
        for ent in entities:
            tid = ent.id
            cx = ent.bbox.x + ent.bbox.width / 2.0
            cy = ent.bbox.y + ent.bbox.height / 2.0
            if tid not in tracks:
                tracks[tid] = {
                    "first_seen": t_sec,
                    "last_seen": t_sec,
                    "hits": 1,
                    "positions": [(cx, cy, t_sec)],
                }
            else:
                tracks[tid]["last_seen"] = t_sec
                tracks[tid]["hits"] += 1
                tracks[tid]["positions"].append((cx, cy, t_sec))

    cap.release()
    total_elapsed = time.perf_counter() - t_start_all
    overall_fps = frame_idx / max(0.001, total_elapsed)

    # Compute tracking proxy metrics
    unique_ids = len(tracks)
    lifetimes = [t["last_seen"] - t["first_seen"] for t in tracks.values()]
    avg_lifetime = (sum(lifetimes) / len(lifetimes)) if lifetimes else 0.0
    ghosts = [t for t in tracks.values() if (t["last_seen"] - t["first_seen"]) < 1.0]
    ghost_share = (len(ghosts) / unique_ids * 100.0) if unique_ids > 0 else 0.0

    duration_sec = frame_idx / fps
    fragmentation_count = 0
    track_list = list(tracks.items())
    for i in range(len(track_list)):
        tid1, t1 = track_list[i]
        lx, ly, lt = t1["positions"][-1]
        for j in range(len(track_list)):
            if i == j: continue
            tid2, t2 = track_list[j]
            fx, fy, ft = t2["positions"][0]
            dt = ft - lt
            if 0.0 < dt <= 1.5:
                dist = math.hypot(fx - lx, fy - ly)
                if dist < 0.15:
                    fragmentation_count += 1
                    break

    id_changes_per_min = (fragmentation_count / max(0.01, duration_sec)) * 60.0

    result = {
        "clip": clip_name,
        "frames": frame_idx,
        "duration_sec": round(duration_sec, 2),
        "fps": round(overall_fps, 2),
        "decode_ms": round(float(np.mean(decode_times)), 2),
        "detect_ms": round(float(np.mean(detect_times)), 2),
        "ocr_ms": round(float(np.mean(ocr_times)), 2),
        "track_ms": round(float(np.mean(track_times)), 2),
        "total_ms": round(float(np.mean(total_times)), 2),
        "unique_ids": unique_ids,
        "avg_lifetime_sec": round(avg_lifetime, 2),
        "ghost_share_pct": round(ghost_share, 1),
        "fragmentations": fragmentation_count,
        "id_changes_per_min": round(id_changes_per_min, 2),
    }

    print(f"--- Results for {clip_name} ---")
    print(f"  FPS: {result['fps']} | Decode: {result['decode_ms']}ms | Detect: {result['detect_ms']}ms | OCR: {result['ocr_ms']}ms | Track: {result['track_ms']}ms")
    print(f"  Unique IDs: {result['unique_ids']} | Avg Lifetime: {result['avg_lifetime_sec']}s | Ghosts (<1s): {result['ghost_share_pct']}% | Frags: {result['fragmentations']} | ID Chg/min: {result['id_changes_per_min']}")
    return result


if __name__ == "__main__":
    import json
    results = []
    for c in ["whatsapp_video_2026_09_09_533pm.mp4", "whatsapp_video_2026_09_09_842pm.mp4"]:
        r = profile_clip(c, max_frames=50)
        if r: results.append(r)
    with open(os.path.join(ROOT_DIR, "samples", "baseline_profiling.json"), "w") as f:
        json.dump(results, f, indent=2)
    print("\nSaved baseline profiling to samples/baseline_profiling.json")
