import os
import sys
import cv2
import json
from collections import defaultdict

ROOT_DIR = r"C:\Users\SAI CHARAN\.gemini\antigravity\scratch\ibvap-final"
AI_DIR = os.path.join(ROOT_DIR, "ai-service")
if AI_DIR not in sys.path:
    sys.path.insert(0, AI_DIR)

from app.services.detector import SurveillanceDetector

VIDEO_PATH = os.path.join(ROOT_DIR, "samples", "whatsapp_video_2026_09_09_842pm.mp4")

def count_entities_across_clip():
    cap = cv2.VideoCapture(VIDEO_PATH)
    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 536)

    detector = SurveillanceDetector()
    detector.reset()

    tracks_seen = {} # id -> {class, first_frame, last_frame, frame_count, min_y, max_y}
    persons_seen = {}

    frame_idx = 0
    while cap.isOpened():
        ret, frame = cap.read()
        if not ret or frame is None:
            break

        video_time = frame_idx / fps
        entities, _ = detector.process_frame(frame, video_time)

        for e in entities:
            cls = (e.class_name or "").lower()
            tid = e.id
            if tid not in tracks_seen:
                tracks_seen[tid] = {
                    "id": tid,
                    "class": cls,
                    "first_frame": frame_idx,
                    "first_time": round(video_time, 2),
                    "last_frame": frame_idx,
                    "last_time": round(video_time, 2),
                    "hits": 1
                }
            else:
                tracks_seen[tid]["last_frame"] = frame_idx
                tracks_seen[tid]["last_time"] = round(video_time, 2)
                tracks_seen[tid]["hits"] += 1

        frame_idx += 1

    cap.release()

    # Filter out 1-2 frame transient noise
    confirmed_tracks = [t for t in tracks_seen.values() if t["hits"] >= 5]

    class_counts = defaultdict(list)
    for t in confirmed_tracks:
        class_counts[t["class"]].append(t)

    print(f"Total confirmed tracks (>=5 hits): {len(confirmed_tracks)}")
    for cls, trks in sorted(class_counts.items()):
        print(f"  Class '{cls}': {len(trks)} tracks")
        for t in trks[:5]:
            print(f"    Track #{t['id']} (t={t['first_time']}s to {t['last_time']}s, hits={t['hits']})")

if __name__ == "__main__":
    count_entities_across_clip()
