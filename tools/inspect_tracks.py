import cv2, os, sys, json
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "ai-service"))
from app.services.detector import SurveillanceDetector

detector = SurveillanceDetector()
detector.set_quality("balanced")
detector.reset()

clip_path = os.path.join(os.path.dirname(__file__), "..", "samples", "whatsapp_video_2026_09_09_842pm.mp4")
cap = cv2.VideoCapture(clip_path)
fps = cap.get(cv2.CAP_PROP_FPS) or 30.0

track_info = {}
frame_idx = 0

while cap.isOpened():
    ret, frame = cap.read()
    if not ret: break
    t_sec = frame_idx / fps
    tracks, plates = detector.process_frame(frame, timestamp_sec=t_sec)
    for tr in tracks:
        tid = tr.id
        if tid not in track_info:
            track_info[tid] = {
                "id": tid,
                "class": tr.class_name,
                "first_t": round(t_sec, 2),
                "last_t": round(t_sec, 2),
                "hits": 1,
                "boxes": [tr.bbox],
                "speeds": [tr.speed] if tr.speed is not None else [],
                "plate": tr.anpr.plateText if tr.anpr else None,
                "classes_seen": {tr.class_name: 1}
            }
        else:
            rec = track_info[tid]
            rec["last_t"] = round(t_sec, 2)
            rec["hits"] += 1
            rec["boxes"].append(tr.bbox)
            if tr.speed is not None:
                rec["speeds"].append(tr.speed)
            if tr.anpr:
                rec["plate"] = tr.anpr.plateText
            rec["classes_seen"][tr.class_name] = rec["classes_seen"].get(tr.class_name, 0) + 1
    frame_idx += 1

cap.release()

print(f"Total tracks tracked in 842pm: {len(track_info)}")
with open("tools/tracks_842pm.json", "w") as f:
    json.dump([
        {
            "id": tr["id"],
            "class": tr["class"],
            "first_t": tr["first_t"],
            "last_t": tr["last_t"],
            "hits": tr["hits"],
            "classes_seen": tr["classes_seen"],
            "plate": tr["plate"],
            "max_w": round(max(b.width for b in tr["boxes"]), 3),
            "max_h": round(max(b.height for b in tr["boxes"]), 3),
        }
        for tr in track_info.values()
    ], f, indent=2)

sorted_tracks = sorted(track_info.values(), key=lambda x: x["hits"], reverse=True)
for tr in sorted_tracks[:25]:
    last_speed = tr["speeds"][-1] if tr["speeds"] else "0 px/s"
    max_w = round(max(b.width for b in tr["boxes"]), 3)
    max_h = round(max(b.height for b in tr["boxes"]), 3)
    print(f"Track #{tr['id']}: class={tr['class']} (seen: {tr['classes_seen']}), time={tr['first_t']}s-{tr['last_t']}s ({tr['hits']} hits), max_size={max_w}x{max_h}, speed={last_speed}, plate={tr['plate']}")
