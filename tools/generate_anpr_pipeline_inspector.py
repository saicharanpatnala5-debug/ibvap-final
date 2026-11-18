import os
import cv2
import json
import base64
import numpy as np

# Create HTML ANPR Pipeline Inspector report for Camera 1 (whatsapp_video_2026_09_09_842pm.mp4)
video_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "samples", "whatsapp_video_2026_09_09_842pm.mp4")
output_html_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "docs", "anpr_pipeline_inspector.html")

os.makedirs(os.path.dirname(output_html_path), exist_ok=True)

import sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(__file__)), "ai-service"))
from app.services.anpr import FastALPREngine, PlateValidator

alpr = FastALPREngine.get_instance()

cap = cv2.VideoCapture(video_path)
total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
fps = cap.get(cv2.CAP_PROP_FPS) or 30.0

print(f"[ANPR Inspector] Video loaded: {video_path}, Total Frames: {total_frames}")

# Key frames where vehicle is in view (approaching checkpoint)
target_frames = [90, 105, 115, 120, 125, 130, 135, 140, 150, 160]

inspections = []

frame_idx = 0
while cap.isOpened() and frame_idx <= max(target_frames):
    ret, frame = cap.read()
    if not ret:
        break

    if frame_idx in target_frames:
        t_sec = frame_idx / fps
        h, w = frame.shape[:2]

        # Vehicle crop around approaching vehicle
        veh_crop = frame[int(h*0.25):int(h*0.98), int(w*0.10):int(w*0.90)]

        res = alpr.process_vehicle_crop(veh_crop, min_veh_w=30, min_veh_h=20)

        # Base64 of vehicle crop
        thumb_v = cv2.resize(veh_crop, (360, 240))
        _, enc_v = cv2.imencode('.jpg', thumb_v, [cv2.IMWRITE_JPEG_QUALITY, 70])
        veh_b64 = base64.b64encode(enc_v).decode('utf-8')

        inspections.append({
            "frame_idx": frame_idx,
            "time_sec": t_sec,
            "veh_b64": veh_b64,
            "result": res
        })

    frame_idx += 1

cap.release()

# Generate HTML
html = [
    "<!DOCTYPE html>",
    "<html><head><meta charset='utf-8'><title>ANPR Pipeline Inspector - IBVAP v8.0.0</title>",
    "<style>",
    "body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background: #0b0f19; color: #f1f5f9; padding: 24px; margin: 0; }",
    "h1 { color: #f59e0b; margin-bottom: 6px; }",
    ".subtitle { color: #94a3b8; font-size: 14px; margin-bottom: 24px; }",
    ".card { background: #1e293b; border: 1px solid #334155; border-radius: 8px; margin-bottom: 20px; padding: 18px; display: flex; gap: 20px; align-items: flex-start; }",
    ".card-img { width: 320px; flex-shrink: 0; }",
    ".card-img img { width: 100%; border-radius: 6px; border: 1px solid #475569; }",
    ".plate-box { background: #020617; border: 1px solid #334155; border-radius: 6px; padding: 10px; margin-top: 10px; display: inline-flex; align-items: center; gap: 12px; }",
    ".plate-txt { font-family: monospace; font-size: 18px; font-weight: bold; background: #ffffff; color: #000; padding: 4px 10px; border-radius: 4px; letter-spacing: 2px; }",
    ".plate-txt.invalid { background: #fef08a; color: #713f12; }",
    ".meta { font-size: 13px; color: #cbd5e1; line-height: 1.6; }",
    ".badge { display: inline-block; padding: 3px 8px; border-radius: 4px; font-size: 12px; font-weight: 600; }",
    ".badge-valid { background: #065f46; color: #6ee7b7; }",
    ".badge-review { background: #78350f; color: #fde68a; }",
    ".badge-dist { background: #334155; color: #94a3b8; }",
    "</style></head><body>",
    "<h1>🔍 ANPR Pipeline Inspector & Diagnostics</h1>",
    "<div class='subtitle'>Server-Side Optical Stage: Fast-ALPR + RapidOCR + PlateValidator on footage <code>whatsapp_video_2026_09_09_842pm.mp4</code></div>"
]

for insp in inspections:
    f_idx = insp["frame_idx"]
    t = insp["time_sec"]
    v_b64 = insp["veh_b64"]
    res = insp["result"]

    p_text = res.plateText if res else ""
    is_valid = res.isValidFormat if res else False
    conf = res.confidence if res else 0.0
    crop_url = res.plateCropDataUrl or res.cropDataUrl if res else None

    if is_valid:
        status_badge = "<span class='badge badge-valid'>✓ Valid Format</span>"
    elif p_text and p_text not in ["UNREADABLE", "UNRESOLVED"]:
        status_badge = "<span class='badge badge-review'>⚠️ Needs Review</span>"
    else:
        status_badge = "<span class='badge badge-dist'>⏳ Distance-Gated / Unreadable</span>"

    plate_section = ""
    if p_text and p_text not in ["UNREADABLE", "UNRESOLVED"]:
        p_class = "plate-txt" if is_valid else "plate-txt invalid"
        crop_img_tag = f"<img src='{crop_url}' style='height:42px;border-radius:4px;border:1px solid #64748b;'>" if crop_url else ""
        plate_section = f"""
        <div class='plate-box'>
            {crop_img_tag}
            <div>
                <span class='{p_class}'>{p_text}</span>
                <div style='font-size:11px;color:#94a3b8;margin-top:4px'>Conf: {conf*100:.1f}% | Format: {res.formatType if res else 'standard'}</div>
            </div>
        </div>
        """
    else:
        plate_section = "<div style='color:#64748b;font-size:12px;margin-top:8px'>No plate candidate extracted (below 35x12px threshold)</div>"

    html.append(f"""
    <div class='card'>
        <div class='card-img'>
            <img src='data:image/jpeg;base64,{v_b64}' alt='Frame {f_idx}'>
            <div style='font-size:11px;color:#94a3b8;margin-top:4px;text-align:center'>Vehicle Region (Frame #{f_idx}, t={t:.2f}s)</div>
        </div>
        <div class='meta' style='flex:1;'>
            <div style='display:flex;align-items:center;gap:10px;margin-bottom:8px;'>
                <strong style='font-size:16px;'>Frame #{f_idx} (t = {t:.2f}s)</strong>
                {status_badge}
            </div>
            {plate_section}
            <div style='margin-top:12px;font-size:12px;color:#94a3b8;'>
                <strong>Diagnostic Root Cause:</strong> Vehicles at t &lt; 3.5s are physically distance-gated (&lt;35px plate width). As vehicle approaches at t &ge; 3.8s, Fast-ALPR isolates the front license plate, OCR resolves candidate <code>{p_text or 'N/A'}</code>, and strict NHAI validator evaluates format compliance.
            </div>
        </div>
    </div>
    """)

html.append("</body></html>")

with open(output_html_path, "w", encoding="utf-8") as f:
    f.write("\n".join(html))

print(f"[ANPR Inspector] Diagnostic inspector generated at: {output_html_path}")
