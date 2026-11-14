"""
IBVAP Surveillance Detection Quality & Debug Frame Evaluator
Evaluates YOLO detection quality, tracking continuity, and low-light enhancement.
Writes annotated visualization frames to 'samples/debug_detections/'.
"""

import os
import sys
import json
import time
import cv2
import numpy as np

# Ensure ai-service root is on sys.path
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
AI_SERVICE_DIR = os.path.dirname(SCRIPT_DIR)
if AI_SERVICE_DIR not in sys.path:
    sys.path.insert(0, AI_SERVICE_DIR)

from app.services.detector import SurveillanceDetector
from app.services.low_light import apply_clahe_enhancement, compute_frame_luminance


def run_detection_evaluation(
    samples_dir: str = os.path.normpath(os.path.join(AI_SERVICE_DIR, "../samples")),
    output_debug_dir: str = os.path.normpath(os.path.join(AI_SERVICE_DIR, "../samples/debug_detections")),
    max_frames_per_video: int = 150,
):
    print(f"\n=======================================================")
    print(f"      IBVAP DETECTION & TRACKING EVALUATOR            ")
    print(f"=======================================================")

    os.makedirs(output_debug_dir, exist_ok=True)

    detector = SurveillanceDetector()
    print(f"Detector initialized using: {detector.active_model_name} on device {detector.device}")

    video_files = [
        f for f in os.listdir(samples_dir)
        if f.lower().endswith(('.mp4', '.avi', '.mov', '.mkv'))
    ]

    if not video_files:
        print(f"No sample video files found in '{samples_dir}'.")
        return {}

    overall_metrics = {
        "model": detector.active_model_name,
        "device": detector.device,
        "videos_evaluated": [],
    }

    for vid_name in video_files:
        vid_path = os.path.join(samples_dir, vid_name)
        print(f"\nEvaluating footage: {vid_name}")

        cap = cv2.VideoCapture(vid_path)
        if not cap.isOpened():
            print(f"Failed to open video: {vid_path}")
            continue

        fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
        total_video_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        frame_idx = 0
        detected_frames_count = 0
        total_detections = 0
        unique_track_ids = set()
        processing_times = []

        vid_debug_dir = os.path.join(output_debug_dir, os.path.splitext(vid_name)[0])
        os.makedirs(vid_debug_dir, exist_ok=True)

        while cap.isOpened() and frame_idx < max_frames_per_video:
            ret, frame = cap.read()
            if not ret or frame is None:
                break

            t0 = time.perf_counter()

            # Apply low-light enhancement if it's the night clip or luminance < 60
            lum = compute_frame_luminance(frame)
            if "night" in vid_name.lower() or lum < 60.0:
                proc_frame = apply_clahe_enhancement(frame)
                was_enhanced = True
            else:
                proc_frame = frame
                was_enhanced = False

            timestamp_sec = frame_idx / fps
            entities, plates = detector.process_frame(proc_frame, timestamp_sec=timestamp_sec)

            elapsed = time.perf_counter() - t0
            processing_times.append(elapsed)

            if entities:
                detected_frames_count += 1
                total_detections += len(entities)
                for e in entities:
                    unique_track_ids.add(e.id)

            # Save annotated debug frame for every 5th frame or when entities exist
            if frame_idx % 5 == 0 or (entities and frame_idx % 2 == 0):
                annotated = proc_frame.copy()
                h, w = annotated.shape[:2]

                # Draw entities
                for e in entities:
                    bx = int(e.bbox.x * w)
                    by = int(e.bbox.y * h)
                    bw = int(e.bbox.width * w)
                    bh = int(e.bbox.height * h)

                    # Color scheme by class
                    color = (0, 255, 0) if e.class_name == "person" else (255, 140, 0)
                    cv2.rectangle(annotated, (bx, by), (bx + bw, by + bh), color, 2)

                    # Label
                    label = f"ID:{e.id} {e.class_name} {e.confidence}% {e.speed} {e.direction}"
                    if e.anpr and e.anpr.plateText:
                        label += f" [{e.anpr.plateText}]"

                    cv2.rectangle(annotated, (bx, max(0, by - 22)), (bx + len(label) * 8 + 10, by), color, -1)
                    cv2.putText(annotated, label, (bx + 4, max(12, by - 6)), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (0, 0, 0), 1, cv2.LINE_AA)

                # Info banner
                info_text = f"Frame {frame_idx}/{total_video_frames} | Entities: {len(entities)} | TrackIDs: {len(unique_track_ids)}"
                if was_enhanced:
                    info_text += " [CLAHE Enhanced]"
                cv2.rectangle(annotated, (10, 10), (w - 10, 36), (20, 20, 20), -1)
                cv2.putText(annotated, info_text, (18, 28), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 220, 255), 1, cv2.LINE_AA)

                debug_frame_path = os.path.join(vid_debug_dir, f"frame_{frame_idx:04d}.jpg")
                cv2.imwrite(debug_frame_path, annotated)

            frame_idx += 1

        cap.release()

        avg_proc_time = float(np.mean(processing_times)) if processing_times else 0.0
        fps_achieved = (1.0 / avg_proc_time) if avg_proc_time > 0 else 0.0
        avg_det_per_frame = (total_detections / frame_idx) if frame_idx > 0 else 0.0

        vid_stats = {
            "video_name": vid_name,
            "frames_processed": frame_idx,
            "detected_frames": detected_frames_count,
            "total_detections": total_detections,
            "avg_detections_per_frame": round(avg_det_per_frame, 2),
            "unique_track_ids": len(unique_track_ids),
            "avg_latency_ms": round(avg_proc_time * 1000, 2),
            "inference_fps": round(fps_achieved, 2),
            "debug_frames_dir": vid_debug_dir,
        }
        overall_metrics["videos_evaluated"].append(vid_stats)

        print(f"  Processed {frame_idx} frames in {sum(processing_times):.2f}s ({fps_achieved:.1f} FPS)")
        print(f"  Total Detections: {total_detections} (Avg: {avg_det_per_frame:.2f}/frame)")
        print(f"  Unique Track IDs: {len(unique_track_ids)}")
        print(f"  Debug frames saved to: {vid_debug_dir}")

    eval_json_path = os.path.join(AI_SERVICE_DIR, "../samples/detection_eval_results.json")
    with open(eval_json_path, "w") as f:
        json.dump(overall_metrics, f, indent=2)

    print(f"\nDetection evaluation complete. Report saved to: {eval_json_path}")
    print(f"=======================================================\n")
    return overall_metrics


if __name__ == "__main__":
    run_detection_evaluation()
