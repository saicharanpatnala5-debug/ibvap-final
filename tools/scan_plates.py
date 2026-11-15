import cv2, os, glob
from fast_alpr import ALPR

alpr = ALPR(
    detector_model='yolo-v9-t-384-license-plate-end2end',
    ocr_model='global-plates-mobile-vit-v2-model'
)

for video_path in sorted(glob.glob('samples/*.mp4')):
    print(f'=== Scanning {video_path} ===')
    cap = cv2.VideoCapture(video_path)
    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    f_idx = 0
    plate_detections = []
    while cap.isOpened():
        ret, frame = cap.read()
        if not ret: break
        # check every 2nd frame (15 fps)
        if f_idx % 2 == 0:
            t = f_idx / fps
            results = alpr.predict(frame)
            if results:
                for r in results:
                    text = r.ocr.text if r.ocr else ''
                    conf_list = r.ocr.confidence if (r.ocr and r.ocr.confidence) else []
                    avg_conf = sum(conf_list) / len(conf_list) if conf_list else 0.0
                    bb = r.detection.bounding_box
                    # save crop if confidence > 0.3
                    crop_name = ""
                    if avg_conf > 0.3:
                        bx1, by1, bx2, by2 = max(0, int(bb.x1)), max(0, int(bb.y1)), min(frame.shape[1], int(bb.x2)), min(frame.shape[0], int(bb.y2))
                        if bx2 > bx1 and by2 > by1:
                            crop = frame[by1:by2, bx1:bx2]
                            os.makedirs("scratch/plates", exist_ok=True)
                            clean_txt = "".join(c for c in text if c.isalnum())
                            crop_name = f"scratch/plates/plate_{os.path.basename(video_path)}_{f_idx}_{clean_txt}.jpg"
                            cv2.imwrite(crop_name, crop)
                    plate_detections.append((
                        t,
                        text,
                        avg_conf,
                        r.detection.confidence,
                        r.detection.bounding_box,
                        conf_list,
                        crop_name
                    ))
        f_idx += 1
    cap.release()
    print(f'Total plate detections in {video_path}: {len(plate_detections)}')
    for p in sorted(plate_detections, key=lambda x: x[2], reverse=True)[:30]:
        print(f'  t={p[0]:.2f}s, text="{p[1]}", avg_ocr_conf={p[2]:.2f}, det_conf={p[3]:.2f}, box={p[4]}')
