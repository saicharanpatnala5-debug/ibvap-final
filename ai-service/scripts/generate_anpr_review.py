"""
IBVAP Real Footage ANPR Review Sheet Generator (Round 4)
Processes real video footage from samples/, extracts candidate crops from detected vehicles,
runs the FastALPREngine (yolo-v9-t-384 plate detector + cct-s-v2 OCR), and generates
a visual inspection grid in 'docs/anpr_review.html' displaying:
- Vehicle Track ID & Class
- Vehicle Crop Thumbnail
- Detected Plate Crop Thumbnail
- OCR Output & Confidence
- Format Validation Status
- Distance-gated status flag
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
    FastALPREngine,
    compute_crop_sharpness,
    bgr_to_base64_jpeg,
    PlateValidator,
)
from app.services.low_light import compute_frame_luminance, apply_clahe_enhancement


def run_real_footage_anpr_review():
    os.makedirs(DOCS_DIR, exist_ok=True)
    print(f"\n=======================================================")
    print(f"      IBVAP REAL FOOTAGE ANPR REVIEW GENERATOR (R4)    ")
    print(f"=======================================================")

    detector = SurveillanceDetector()
    engine = FastALPREngine.get_instance()

    video_files = [
        f for f in os.listdir(SAMPLES_DIR)
        if f.lower().endswith(('.mp4', '.avi', '.mov', '.mkv'))
    ]

    if not video_files:
        print(f"No video files found in {SAMPLES_DIR}")
        return

    # Track data per (video, track_id)
    # Store: best vehicle crop, best plate crop, reading result, sharpness
    records_by_track = {}
    total_vehicles_seen = 0

    for vid_name in sorted(video_files):
        vid_path = os.path.join(SAMPLES_DIR, vid_name)
        print(f"Scanning clip: {vid_name} ...")
        cap = cv2.VideoCapture(vid_path)
        if not cap.isOpened():
            continue

        fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
        frame_idx = 0
        detector.reset()

        while cap.isOpened():
            ret, frame = cap.read()
            if not ret or frame is None:
                break

            frame_idx += 1
            if frame_idx % 3 != 0:
                continue  # Sample at ~10 fps for thorough coverage

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
                if ent.class_name in ["car", "truck", "bus", "motorcycle", "two-wheeler", "three-wheeler"]:
                    bx = int(ent.bbox.x * w)
                    by = int(ent.bbox.y * h)
                    bw = int(ent.bbox.width * w)
                    bh = int(ent.bbox.height * h)

                    x1, y1 = max(0, bx), max(0, by)
                    x2, y2 = min(w, bx + bw), min(h, by + bh)
                    if (x2 - x1) < 25 or (y2 - y1) < 25:
                        continue

                    # Crop from original frame for maximum optical fidelity
                    veh_crop = frame[y1:y2, x1:x2]
                    sharpness = compute_crop_sharpness(veh_crop)

                    key = (vid_name, ent.id)
                    is_new = key not in records_by_track
                    if is_new:
                        total_vehicles_seen += 1

                    # Update if new or sharper/larger vehicle crop
                    if is_new or sharpness > records_by_track[key]["sharpness"]:
                        # Run FastALPR on crop
                        anpr_res = engine.process_vehicle_crop(veh_crop, min_veh_w=120, min_veh_h=80)
                        records_by_track[key] = {
                            "video": vid_name,
                            "track_id": ent.id,
                            "class": ent.class_name,
                            "timestamp_sec": t_sec,
                            "sharpness": sharpness,
                            "veh_w": bw,
                            "veh_h": bh,
                            "vehicle_crop_b64": anpr_res.vehicleCropDataUrl or bgr_to_base64_jpeg(veh_crop, 80),
                            "plate_crop_b64": anpr_res.plateCropDataUrl,
                            "plate_text": anpr_res.plateText or "None",
                            "confidence": anpr_res.confidence,
                            "status": anpr_res.validationStatus,
                            "format_type": anpr_res.formatType,
                            "is_valid": anpr_res.isValidFormat,
                            "is_distance_gated": anpr_res.isDistanceGated,
                        }

        cap.release()

    plate_records = list(records_by_track.values())
    total_tracked = len(plate_records)
    large_enough = sum(1 for r in plate_records if not r["is_distance_gated"])
    distance_gated = sum(1 for r in plate_records if r["is_distance_gated"])
    plates_detected = sum(1 for r in plate_records if r["plate_crop_b64"] is not None)
    valid_format = sum(1 for r in plate_records if r["is_valid"])

    print(f"\n================ REAL FOOTAGE ANPR AUDIT NUMBERS ================")
    print(f"Total vehicle tracks observed:       {total_tracked}")
    print(f"Eligible for ANPR (resolution check): {large_enough}")
    print(f"Distance gated (too small/far):      {distance_gated}")
    print(f"Plates localized by detector:        {plates_detected}")
    print(f"Valid Indian format plates read:     {valid_format}")
    print(f"=================================================================\n")

    # Generate HTML cards
    html_cards = []
    for idx, rec in enumerate(plate_records, 1):
        status = rec["status"]
        conf = rec["confidence"]
        is_gated = rec["is_distance_gated"]

        if rec["is_valid"]:
            badge_class = "badge-valid"
            badge_border = "#10b981"
            badge_text = "Valid Format"
        elif is_gated or rec["format_type"] == "distance_gated":
            badge_class = "badge-gated"
            badge_border = "#64748b"
            badge_text = "Plate not legible at this distance"
        elif rec["plate_crop_b64"]:
            badge_class = "badge-low"
            badge_border = "#f59e0b"
            badge_text = "Low confidence - needs review"
        else:
            badge_class = "badge-unreadable"
            badge_border = "#ef4444"
            badge_text = "Unreadable / Obscured"

        minutes = int(rec["timestamp_sec"] // 60)
        seconds = rec["timestamp_sec"] % 60
        time_str = f"{minutes:02d}:{seconds:04.1f}s"

        veh_img = f'<img class="crop-img" src="{rec["vehicle_crop_b64"]}" alt="Vehicle Track #{rec["track_id"]}" />' if rec["vehicle_crop_b64"] else '<div class="no-img">No Vehicle Crop</div>'

        if rec["plate_crop_b64"]:
            plate_img = f'<img class="plate-img" src="{rec["plate_crop_b64"]}" alt="Plate crop" />'
        else:
            plate_img = f'<div class="no-plate-box"><span>No plate detected in crop</span></div>'

        card = f"""
        <div class="card" style="border-top: 3px solid {badge_border};">
          <div class="card-header">
            <span class="crop-id">Track #{rec['track_id']} ({rec['class'].upper()})</span>
            <span class="status-badge {badge_class}">{badge_text}</span>
          </div>
          <div class="crops-split">
            <div class="crop-col">
              <span class="crop-caption">Vehicle Context ({rec['veh_w']}x{rec['veh_h']}px)</span>
              <div class="crop-container">{veh_img}</div>
            </div>
            <div class="crop-col">
              <span class="crop-caption">Optical Plate Crop</span>
              <div class="crop-container plate-container">{plate_img}</div>
            </div>
          </div>
          <div class="card-body">
            <div class="plate-text-display">{rec['plate_text']}</div>
            <div class="conf-bar-container">
              <div class="conf-bar-fill" style="width: {min(100, max(5, conf))}%; background-color: {badge_border};"></div>
            </div>
            <div class="meta-row">
              <span class="meta-label">OCR Confidence:</span>
              <span class="meta-value">{conf:.1f}%</span>
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
  <title>IBVAP Real Footage ANPR Review Sheet (Round 4)</title>
  <style>
    :root {{
      --bg: #0b0f19;
      --card-bg: #111827;
      --card-border: #1e293b;
      --text: #f8fafc;
      --text-muted: #94a3b8;
      --accent: #38bdf8;
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
      font-size: 24px;
      font-weight: 700;
      letter-spacing: -0.02em;
      margin-bottom: 8px;
      color: #38bdf8;
    }}
    .subtitle {{
      color: var(--text-muted);
      font-size: 14px;
      margin-bottom: 20px;
    }}
    .stats-bar {{
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 16px;
      margin-top: 16px;
    }}
    .stat-card {{
      background-color: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 8px;
      padding: 16px 20px;
    }}
    .stat-val {{
      font-size: 26px;
      font-weight: 700;
      color: var(--text);
    }}
    .stat-lbl {{
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--text-muted);
      margin-top: 4px;
    }}
    .grid {{
      max-width: 1400px;
      margin: 0 auto;
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
      gap: 20px;
    }}
    .card {{
      background-color: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 8px;
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }}
    .card-header {{
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px 16px;
      border-bottom: 1px solid var(--card-border);
      background-color: rgba(15, 23, 42, 0.4);
    }}
    .crop-id {{
      font-size: 13px;
      font-weight: 600;
      color: #cbd5e1;
    }}
    .status-badge {{
      font-size: 10px;
      font-weight: 600;
      padding: 3px 8px;
      border-radius: 4px;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }}
    .badge-valid {{
      background-color: rgba(16, 185, 129, 0.2);
      color: #34d399;
      border: 1px solid rgba(16, 185, 129, 0.4);
    }}
    .badge-gated {{
      background-color: rgba(100, 116, 139, 0.2);
      color: #94a3b8;
      border: 1px solid rgba(100, 116, 139, 0.4);
    }}
    .badge-low {{
      background-color: rgba(245, 158, 11, 0.2);
      color: #fbbf24;
      border: 1px solid rgba(245, 158, 11, 0.4);
    }}
    .badge-unreadable {{
      background-color: rgba(239, 68, 68, 0.2);
      color: #f87171;
      border: 1px solid rgba(239, 68, 68, 0.4);
    }}
    .crops-split {{
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
      padding: 12px;
      background-color: #0b1120;
      border-bottom: 1px solid var(--card-border);
    }}
    .crop-col {{
      display: flex;
      flex-direction: column;
      gap: 4px;
    }}
    .crop-caption {{
      font-size: 10px;
      color: #64748b;
      text-transform: uppercase;
      font-weight: 600;
    }}
    .crop-container {{
      height: 110px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #030712;
      border-radius: 4px;
      overflow: hidden;
      border: 1px solid #1e293b;
    }}
    .crop-img {{
      max-width: 100%;
      max-height: 100%;
      object-fit: contain;
    }}
    .plate-img {{
      max-width: 100%;
      max-height: 100%;
      object-fit: contain;
      image-rendering: pixelated;
    }}
    .no-plate-box {{
      font-size: 11px;
      color: #64748b;
      text-align: center;
      padding: 8px;
    }}
    .card-body {{
      padding: 14px 16px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }}
    .plate-text-display {{
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 20px;
      font-weight: 700;
      letter-spacing: 0.1em;
      color: #38bdf8;
      text-align: center;
      padding: 6px;
      background-color: rgba(56, 189, 248, 0.08);
      border-radius: 4px;
      border: 1px dashed rgba(56, 189, 248, 0.25);
    }}
    .conf-bar-container {{
      width: 100%;
      height: 4px;
      background-color: #1e293b;
      border-radius: 2px;
      overflow: hidden;
    }}
    .conf-bar-fill {{
      height: 100%;
      border-radius: 2px;
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
      color: #e2e8f0;
      font-family: ui-monospace, SFMono-Regular, monospace;
    }}
  </style>
</head>
<body>
  <div class="header">
    <div class="title">IBVAP Real Footage ANPR Review Sheet</div>
    <div class="subtitle">FastALPR (yolo-v9-t-384 plate detector + cct-s-v2 OCR) visual audit across all vehicle tracks in samples/. Generated autonomously.</div>
    <div class="stats-bar">
      <div class="stat-card">
        <div class="stat-val">{total_tracked}</div>
        <div class="stat-lbl">Vehicles Tracked</div>
      </div>
      <div class="stat-card">
        <div class="stat-val">{large_enough}</div>
        <div class="stat-lbl">Eligible (Resolution OK)</div>
      </div>
      <div class="stat-card">
        <div class="stat-val">{distance_gated}</div>
        <div class="stat-lbl">Distance Gated</div>
      </div>
      <div class="stat-card">
        <div class="stat-val">{plates_detected}</div>
        <div class="stat-lbl">Plates Localized</div>
      </div>
      <div class="stat-card">
        <div class="stat-val" style="color: #34d399;">{valid_format}</div>
        <div class="stat-lbl">Valid Indian Plates</div>
      </div>
    </div>
  </div>

  <div class="grid">
    {cards_html}
  </div>
</body>
</html>"""

    out_file = os.path.join(DOCS_DIR, "anpr_review.html")
    with open(out_file, "w", encoding="utf-8") as f:
        f.write(full_html)

    print(f"ANPR Review Sheet successfully saved to: {out_file}\n")


if __name__ == "__main__":
    run_real_footage_anpr_review()
