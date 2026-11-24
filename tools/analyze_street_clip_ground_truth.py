import cv2
import json
import os
import numpy as np

VIDEO_PATH = "samples/whatsapp_video_2026_09_09_842pm.mp4"

def analyze_video():
    if not os.path.exists(VIDEO_PATH):
        print(f"File not found: {VIDEO_PATH}")
        return

    cap = cv2.VideoCapture(VIDEO_PATH)
    fps = cap.get(cv2.CAP_PROP_FPS)
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    duration = total_frames / fps if fps > 0 else 0

    print(f"Analyzing {VIDEO_PATH}: {total_frames} frames, {fps:.1f} FPS, {duration:.2f}s")

    # Sample keyframes at 1s intervals
    sample_interval = int(fps)
    frames_data = []

    frame_idx = 0
    while cap.isOpened():
        ret, frame = cap.read()
        if not ret:
            break
        
        if frame_idx % sample_interval == 0:
            timestamp = frame_idx / fps
            # Compute average luminance of the frame (0-255)
            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            avg_lux = float(np.mean(gray))
            frames_data.append({
                "frame": frame_idx,
                "timestamp_sec": round(timestamp, 2),
                "avg_luminance": round(avg_lux, 2)
            })
        frame_idx += 1

    cap.release()
    print(f"Sampled {len(frames_data)} key timestamps.")
    print("Sample luminance values:")
    for f in frames_data[:6]:
        print(f"  t={f['timestamp_sec']}s (frame {f['frame']}): lux={f['avg_luminance']}")

    return frames_data

if __name__ == "__main__":
    analyze_video()
