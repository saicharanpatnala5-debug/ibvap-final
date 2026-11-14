"""
IBVAP Real Footage ANPR Review Sheet Generator
Processes real video footage from samples/, extracts candidate plate crops from detected vehicles,
runs the ANPR pipeline, and generates a standalone, self-contained visual inspection grid in 'docs/anpr_review.html'.
"""

import os
import sys
import base64
import time
import cv2
import numpy as np

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
AI_SERVICE_DIR = os.path.dirname(SCRIPT_DIR)
ROOT_DIR = os.path.dirname(AI_SERVICE_DIR)
SAMPLES_DIR = os.path.join(ROOT_DIR, "samples")
DOCS_DIR = os.path.join(ROOT_DIR, "docs")

if AI_SERVICE_DIR not in sys.path:
    sys.path.insert(0, AI_SERVICE_DIR)

from app.services.detector import SurveillanceDetector
from app.services.anpr import (
    crop_license_plate_region,
    compute_crop_sharpness,
    preprocess_plate_crop,
    PlateValidator,
)
from app.services.low_light import compute_frame_luminance, apply_clahe_enhancement


def frame_to_base64_jpeg(img_bgr: np.ndarray, quality: int = 90) -> str:
    """Encodes an image to a base64 Data URL JPEG string."""
    success, buffer = cv2.imencode(".jpg", img_bgr, [int(cv2.IMWRITE_JPEG_QUALITY), quality])
    if not success:
        return ""
    b64 = base64.b64encode(buffer).decode("utf-8")
    return f"data:image/jpeg;base64,{b64}"


def run_real_footage_anpr_review():
    os.makedirs(DOCS_DIR, exist_ok=True)
    print(f"\n=======================================================")
    print(f"      IBVAP REAL FOOTAGE ANPR REVIEW GENERATOR         ")
    print(f"=======================================================")

    detector = SurveillanceDetector()
    video_files = [
        f for f in os.listdir(SAMPLES_DIR)
        if f.lower().endswith(('.mp4', '.avi', '.mov', '.mkv'))
    ]

    if not video_files:
        print(f"No video files found in {SAMPLES_DIR}")
        return

    ocr = None
    try:
        from rapidocr_onnxruntime import RapidOCR
        ocr = RapidOCR()
        print("RapidOCR engine: READY")
    except Exception as e:
        print(f"RapidOCR unavailable: {e}")

    plate_records = []

    for vid_name in sorted(video_files):
        vid_path = os.path.join(SAMPLES_DIR, vid_name)
        print(f"Scanning clip: {vid_name} ...")
        cap = cv2.VideoCapture(vid_path)
        if not cap.isOpened():
            continue

        fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
        frame_idx = 0
        video_tracks_seen = {}

        while cap.isOpened() and frame_idx < 150:
            ret, frame = cap.read()
            if not ret or frame is None:
                break

            frame_idx += 1
            if frame_idx % 2 != 0:
                continue  # Sample every 2nd frame

            t_sec = frame_idx / fps
            h, w = frame.shape[:2]

            lum = compute_frame_luminance(frame)
            if "night" in vid_name.lower() or "842" in vid_name or lum < 60:
                proc_frame = apply_clahe_enhancement(frame)
            else:
                proc_frame = frame

            # Run detection & tracking
            entities, _ = detector.process_frame(proc_frame, timestamp_sec=t_sec)

            for ent in entities:
                if ent.class_name in ["car", "truck", "bus"]:
                    bx = int(ent.bbox.x * w)
                    by = int(ent.bbox.y * h)
                    bw = int(ent.bbox.width * w)
                    bh = int(ent.bbox.height * h)

                    # Extract vehicle crop
                    x1, y1 = max(0, bx), max(0, by)
                    x2, y2 = min(w, bx + bw), min(h, by + bh)
                    if (x2 - x1) < 30 or (y2 - y1) < 20:
                        continue

                    veh_crop = proc_frame[y1:y2, x1:x2]
                    plate_crop = crop_license_plate_region(veh_crop)
                    sharpness = compute_crop_sharpness(plate_crop)

                    key = (vid_name, ent.id)
                    # Keep if new or significantly sharper
                    if key not in video_tracks_seen or sharpness > video_tracks_seen[key]["sharpness"]:
                        # Perform OCR
                        read_text = "UNREADABLE"
                        conf = 0.0
                        status = "Unreadable"

                        if ocr is not None and plate_crop.size > 0:
                            prep = preprocess_plate_crop(plate_crop)
                            try:
                                ocr_out, _ = ocr(prep)
                                if ocr_out:
                                    raw_text = "".join([l[1] for l in ocr_out])
                                    conf_val = max([float(l[2]) * 100 for l in ocr_out])
                                    cleaned = PlateValidator.clean_text(raw_text)
                                    corrected = PlateValidator.position_aware_correction(cleaned)
                                    is_valid, ftype, vstatus = PlateValidator.validate(corrected)

                                    if corrected and len(corrected) >= 4:
                                        read_text = corrected
                                        conf = round(conf_val, 1)
                                        if is_valid and conf >= 60.0:
                                            status = "Valid format"
                                        elif conf >= 35.0:
                                            status = "Low confidence - needs review"
                                        else:
                                            status = "Unreadable"
                            except Exception:
                                pass

                        video_tracks_seen[key] = {
                            "video": vid_name,
                            "track_id": ent.id,
                            "timestamp_sec": t_sec,
                            "sharpness": sharpness,
                            "plate_crop": plate_crop,
                            "plate_text": read_text,
                            "confidence": conf,
                            "status": status,
                        }

        cap.release()
        for rec in video_tracks_seen.values():
            plate_records.append(rec)

    print(f"\nExtracted {len(plate_records)} unique vehicle plate candidates.")

    # Generate HTML Review Sheet
    html_cards = []
    for idx, rec in enumerate(plate_records, 1):
        crop_b64 = frame_to_base64_jpeg(rec["plate_crop"])
        read_text = rec["plate_text"]
        conf = rec["confidence"]
        status = rec["status"]

        # Badge colors
        if status == "Valid format":
            badge_class = "badge-valid"
            badge_border = "#22c55e"
        elif status == "Low confidence - needs review":
            badge_class = "badge-low"
            badge_border = "#f59e0b"
        else:
            badge_class = "badge-unreadable"
            badge_border = "#ef4444"

        minutes = int(rec["timestamp_sec"] // 60)
        seconds = rec["timestamp_sec"] % 60
        time_str = f"{minutes:02d}:{seconds:04.1f}s"

        card = f"""
        <div class="card" style="border-top: 4px solid {badge_border};">
          <div class="card-header">
            <span class="crop-id">Crop #{idx} (Track #{rec['track_id']})</span>
            <span class="status-badge {badge_class}">{status}</span>
          </div>
          <div class="crop-container">
            <img class="crop-img" src="{crop_b64}" alt="Plate crop #{idx}" />
          </div>
          <div class="card-body">
            <div class="plate-text-display">{read_text}</div>
            <div class="conf-bar-container">
              <div class="conf-bar-fill" style="width: {min(100, max(5, conf))}%; background-color: {badge_border};"></div>
            </div>
            <div class="meta-row">
              <span class="meta-label">Confidence:</span>
              <span class="meta-value">{conf}%</span>
            </div>
            <div class="meta-row">
              <span class="meta-label">Source Clip:</span>
              <span class="meta-value" title="{rec['video']}">{rec['video'][:24]}...</span>
            </div>
            <div class="meta-row">
              <span class="meta-label">Footage Time:</span>
              <span class="meta-value">{time_str}</span>
            </div>
          </div>
        </div>
        """
        html_cards.append(card)

    cards_html = "\n".join(html_cards)

    full_html = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>IBVAP Real Footage ANPR Review Sheet</title>
  <style>
    :root {{
      --bg: #090d16;
      --card-bg: #111827;
      --card-border: #1f2937;
      --text: #f9fafb;
      --text-muted: #9ca3af;
      --accent: #3b82f6;
    }}
    * {{
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }}
    body {{
      background-color: var(--bg);
      color: var(--text);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      padding: 32px 24px;
    }}
    .header {{
      max-width: 1400px;
      margin: 0 auto 32px auto;
      padding-bottom: 24px;
      border-bottom: 1px solid var(--card-border);
    }}
    .title {{
      font-size: 26px;
      font-weight: 700;
      letter-spacing: -0.02em;
      margin-bottom: 8px;
    }}
    .subtitle {{
      color: var(--text-muted);
      font-size: 14px;
      line-height: 1.5;
    }}
    .stats-bar {{
      display: flex;
      gap: 24px;
      margin-top: 16px;
    }}
    .stat-pill {{
      background: #1f2937;
      padding: 6px 14px;
      border-radius: 9999px;
      font-size: 13px;
      font-weight: 600;
    }}
    .grid {{
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(290px, 1fr));
      gap: 20px;
      max-width: 1400px;
      margin: 0 auto;
    }}
    .card {{
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 8px;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      transition: transform 0.15s ease, box-shadow 0.15s ease;
    }}
    .card:hover {{
      transform: translateY(-2px);
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.5);
    }}
    .card-header {{
      padding: 12px 14px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: rgba(255, 255, 255, 0.02);
      border-bottom: 1px solid rgba(255, 255, 255, 0.05);
    }}
    .crop-id {{
      font-size: 12px;
      font-weight: 600;
      color: var(--text-muted);
    }}
    .status-badge {{
      font-size: 11px;
      font-weight: 700;
      padding: 3px 8px;
      border-radius: 4px;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }}
    .badge-valid {{
      background: rgba(34, 197, 94, 0.15);
      color: #4ade80;
    }}
    .badge-low {{
      background: rgba(245, 158, 11, 0.15);
      color: #fbbf24;
    }}
    .badge-unreadable {{
      background: rgba(239, 68, 68, 0.15);
      color: #f87171;
    }}
    .crop-container {{
      background: #000;
      padding: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
      height: 120px;
      overflow: hidden;
    }}
    .crop-img {{
      max-width: 100%;
      max-height: 100%;
      object-fit: contain;
      image-rendering: auto;
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 4px;
      transition: transform 0.2s ease;
    }}
    .crop-img:hover {{
      transform: scale(1.6);
      z-index: 10;
    }}
    .card-body {{
      padding: 16px 14px;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }}
    .plate-text-display {{
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 20px;
      font-weight: 800;
      letter-spacing: 0.08em;
      text-align: center;
      background: rgba(0, 0, 0, 0.35);
      padding: 8px 12px;
      border-radius: 6px;
      border: 1px dashed rgba(255, 255, 255, 0.15);
    }}
    .conf-bar-container {{
      width: 100%;
      height: 4px;
      background: rgba(255, 255, 255, 0.1);
      border-radius: 2px;
      overflow: hidden;
    }}
    .conf-bar-fill {{
      height: 100%;
    }}
    .meta-row {{
      display: flex;
      justify-content: space-between;
      font-size: 12px;
    }}
    .meta-label {{
      color: var(--text-muted);
    }}
    .meta-value {{
      font-weight: 600;
      color: var(--text);
    }}
  </style>
</head>
<body>
  <div class="header">
    <h1 class="title">IBVAP Real Footage ANPR Review Sheet</h1>
    <p class="subtitle">
      Operator visual verification grid for real border video captures (<code>samples/whatsapp_video_2026_09_09_*.mp4</code>).<br>
      Inspect candidate plate crops, OCR model reads, confidence percentages, and format validation statuses at a glance.
    </p>
    <div class="stats-bar">
      <span class="stat-pill">Total Vehicle Crops: {len(plate_records)}</span>
      <span class="stat-pill">Generated: {time.strftime('%Y-%m-%d %H:%M:%S')}</span>
    </div>
  </div>

  <div class="grid">
    {cards_html}
  </div>
</body>
</html>
"""

    out_path = os.path.join(DOCS_DIR, "anpr_review.html")
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(full_html)

    print(f"\nANPR Review Sheet successfully generated at:")
    print(f"  {out_path}")
    print(f"=======================================================\n")
    return out_path


if __name__ == "__main__":
    run_real_footage_anpr_review()
