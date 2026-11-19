import sys
import cv2

sys.path.insert(0, "ai-service")
from app.services.detector import SurveillanceDetector

cap = cv2.VideoCapture("samples/whatsapp_video_2026_09_09_842pm.mp4")
det = SurveillanceDetector()
fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
f = 0
tracks_seen = {}

print(f"Sampling video (fps={fps})...")
while cap.isOpened():
    ret, frame = cap.read()
    if not ret:
        break
    if f % 6 == 0:  # 5 FPS sampling
        ents, _ = det.process_frame(frame, f / fps)
        for e in ents:
            if e.class_name in ["car", "truck/bus", "two-wheeler", "truck", "bus", "motorcycle"]:
                tracks_seen.setdefault(e.id, {"class": e.class_name, "frames": [], "times": [], "bboxes": []})
                tracks_seen[e.id]["frames"].append(f)
                tracks_seen[e.id]["times"].append(round(f / fps, 2))
                tracks_seen[e.id]["bboxes"].append((e.bbox.x, e.bbox.y, e.bbox.width, e.bbox.height))
    f += 1

cap.release()
print("\n========== TRACKS IDENTIFIED BY SURVEILLANCE DETECTOR ==========")
for tid, info in sorted(tracks_seen.items(), key=lambda x: min(x[1]["times"])):
    t_min = min(info["times"])
    t_max = max(info["times"])
    count = len(info["times"])
    avg_box = [round(sum(c[i] for c in info["bboxes"]) / count, 3) for i in range(4)]
    print(f"Track {tid:3d}: {info['class']:12s} from {t_min:4.1f}s to {t_max:4.1f}s ({count:2d} samples, bbox={avg_box})")
print("=================================================================\n")
