"""
IBVAP Pre-Analysis Caching & Accuracy Benchmark Tool
Runs authoritative server-side video analysis (YOLO26s + ByteTrack + Awiros Indian ANPR)
on surveillance clips, benchmarking runtime performance and generating disk cache.
"""

import os
import sys
import time
import json
import hashlib
import cv2
import numpy as np

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR = os.path.dirname(SCRIPT_DIR)
AI_DIR = os.path.join(ROOT_DIR, "ai-service")
if AI_DIR not in sys.path:
    sys.path.insert(0, AI_DIR)

from app.services.detector import SurveillanceDetector
from app.services.anpr import FastALPREngine
from app.services.low_light import compute_frame_luminance
from app.config import settings

CACHE_DIRS = [
    os.path.join(ROOT_DIR, ".cache", "video_analysis"),
    os.path.join(AI_DIR, ".cache", "video_analysis"),
]
for d in CACHE_DIRS:
    os.makedirs(d, exist_ok=True)


def compute_video_hash(file_path: str) -> str:
    file_size = os.path.getsize(file_path)
    with open(file_path, "rb") as f:
        head = f.read(8 * 1024 * 1024)
    return hashlib.sha256(head + str(file_size).encode()).hexdigest()[:16]


def preanalyze_video(video_path: str, step_sec: float = 0.20):
    if not os.path.exists(video_path):
        print(f"[Pre-Analysis] SKIP: File not found: {video_path}")
        return None

    v_hash = compute_video_hash(video_path)
    print(f"\n=======================================================")
    print(f"[Pre-Analysis] Video: {os.path.basename(video_path)}")
    print(f"[Pre-Analysis] Hash: {v_hash}")
    print(f"[Pre-Analysis] Path: {video_path}")
    print(f"=======================================================")

    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        print(f"[Pre-Analysis] ERROR: Failed to open video {video_path}")
        return None

    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
    duration = total_frames / fps if fps > 0 else 5.0
    w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH) or 1280)
    h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT) or 720)

    step_frames = max(1, int(round(step_sec * fps)))
    total_steps = int(np.ceil(total_frames / step_frames))

    detector = SurveillanceDetector()
    detector.reset()
    engine = FastALPREngine.get_instance()

    cached_frames = []
    t_start = time.perf_counter()

    for step_idx in range(total_steps):
        f_idx = min(total_frames - 1, step_idx * step_frames)
        cap.set(cv2.CAP_PROP_POS_FRAMES, f_idx)
        ret, frame = cap.read()
        if not ret or frame is None:
            break

        timestamp_sec = round(f_idx / fps, 2)
        avg_lum = compute_frame_luminance(frame)
        is_night = avg_lum < settings.LOW_LIGHT_LUMINANCE_THRESHOLD

        ents, _ = detector.process_frame(frame, timestamp_sec)

        tracked_objects = []
        plate_result = None

        for ent in ents:
            anpr_dict = None
            if getattr(ent, "anpr", None):
                anpr_dict = ent.anpr.dict() if hasattr(ent.anpr, "dict") else ent.anpr
            elif ent.class_name in ["car", "truck", "bus", "truck/bus", "two-wheeler", "motorcycle"]:
                bx = ent.bbox
                vx1 = max(0, int((bx.x - bx.width * 0.08) * w))
                vy1 = max(0, int((bx.y - bx.height * 0.08) * h))
                vx2 = min(w, int((bx.x + bx.width * 1.08) * w))
                vy2 = min(h, int((bx.y + bx.height * 1.08) * h))
                v_crop = frame[vy1:vy2, vx1:vx2]
                if v_crop.shape[0] >= 20 and v_crop.shape[1] >= 30:
                    res = engine.process_vehicle_crop(v_crop, track_id=ent.id, vehicle_class=ent.class_name)
                    if res.isReadable and res.plateText:
                        anpr_dict = res.dict() if hasattr(res, "dict") else res
                        ent.anpr = res

            ent_dict = {
                "id": ent.id,
                "class": ent.class_name,
                "confidence": round(ent.confidence / 100.0 if ent.confidence > 1 else ent.confidence, 2),
                "bbox": {
                    "x": ent.bbox.x,
                    "y": ent.bbox.y,
                    "width": ent.bbox.width,
                    "height": ent.bbox.height,
                },
                "velocity": getattr(ent, "velocity", 0.0),
                "direction": getattr(ent, "direction", "Stationary"),
                "speed": getattr(ent, "speed", "0 px/s"),
                "state": getattr(ent, "state", "confirmed"),
                "appearance": ent.appearance.dict() if getattr(ent, "appearance", None) and hasattr(ent.appearance, "dict") else getattr(ent, "appearance", None),
                "anpr": anpr_dict,
            }
            tracked_objects.append(ent_dict)

            if anpr_dict and anpr_dict.get("isReadable") and anpr_dict.get("plateText"):
                plate_result = {
                    "plate": anpr_dict.get("plateText"),
                    "confidence": anpr_dict.get("confidence"),
                    "cropUrl": anpr_dict.get("plateCropDataUrl") or anpr_dict.get("cropDataUrl"),
                    "isValidFormat": anpr_dict.get("isValidFormat"),
                    "formatType": anpr_dict.get("formatType"),
                    "validationStatus": anpr_dict.get("validationStatus"),
                }

        cached_frames.append({
            "timestamp": timestamp_sec,
            "objects": tracked_objects,
            "luminance": round(avg_lum, 1),
            "isNight": is_night,
            "plateResult": plate_result,
        })

    cap.release()
    t_elapsed = time.perf_counter() - t_start
    analyzed_fps = round(len(cached_frames) / max(0.01, t_elapsed), 2)
    native_fps_equiv = round(total_frames / max(0.01, t_elapsed), 2)

    result_payload = {
        "status": "ok",
        "videoId": v_hash,
        "videoPath": os.path.basename(video_path),
        "duration": round(duration, 2),
        "fps": round(fps, 1),
        "totalFrames": len(cached_frames),
        "stepSec": step_sec,
        "analysisTimeSec": round(t_elapsed, 2),
        "analysisFps": analyzed_fps,
        "modelUsed": settings.YOLO_MODEL,
        "imgsz": settings.IMGSZ,
        "device": detector.device,
        "frames": cached_frames,
        "isComplete": True,
    }

    # Save to all cache directories
    for c_dir in CACHE_DIRS:
        out_f = os.path.join(c_dir, f"{v_hash}.json")
        with open(out_f, "w", encoding="utf-8") as f:
            json.dump(result_payload, f)
        print(f"[Pre-Analysis] Saved cache: {out_f}")

        # Also save alias by basename without ext (e.g. whatsapp_video_2026_09_09_842pm.json)
        alias_f = os.path.join(c_dir, f"{os.path.splitext(os.path.basename(video_path))[0]}.json")
        with open(alias_f, "w", encoding="utf-8") as f:
            json.dump(result_payload, f)

    print(f"[Pre-Analysis] Complete: {len(cached_frames)} frames in {t_elapsed:.2f}s ({analyzed_fps} FPS analysis, {native_fps_equiv} FPS equivalent)")
    return result_payload


def run():
    clips = [
        os.path.join(ROOT_DIR, "samples", "whatsapp_video_2026_09_09_842pm.mp4"),
        os.path.join(ROOT_DIR, "samples", "whatsapp_video_2026_09_09_533pm.mp4"),
        os.path.join(ROOT_DIR, "samples", "demo_scenario.mp4"),
    ]

    benchmark_summary = {}
    for clip in clips:
        if os.path.exists(clip):
            res = preanalyze_video(clip, step_sec=0.20)
            if res:
                benchmark_summary[os.path.basename(clip)] = {
                    "duration_sec": res["duration"],
                    "total_frames_analyzed": res["totalFrames"],
                    "analysis_time_sec": res["analysisTimeSec"],
                    "measured_analysis_fps": res["analysisFps"],
                    "model": res["modelUsed"],
                    "imgsz": res["imgsz"],
                    "device": res["device"],
                }
        else:
            print(f"[Pre-Analysis] Note: {clip} does not exist yet.")

    summary_file = os.path.join(ROOT_DIR, "docs", "PREANALYSIS_BENCHMARK.json")
    with open(summary_file, "w", encoding="utf-8") as f:
        json.dump(benchmark_summary, f, indent=2)
    print(f"\n[Pre-Analysis] Benchmark summary written to {summary_file}")


if __name__ == "__main__":
    run()
