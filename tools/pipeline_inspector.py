import os
import sys
import json
import base64
import cv2
import numpy as np

# Ensure ai-service modules are on path
AI_SERVICE_DIR = os.path.join(os.path.dirname(__file__), "..", "ai-service")
sys.path.insert(0, AI_SERVICE_DIR)

from ultralytics import YOLO
from fast_alpr import ALPR
from rapidocr_onnxruntime import RapidOCR
from app.services.anpr import (
    preprocess_plate_crop,
    STANDARD_PLATE_REGEX,
    BHARAT_SERIES_REGEX,
    VALID_STATE_CODES,
    LETTER_TO_DIGIT,
    DIGIT_TO_LETTER,
    PlateValidator,
)

def mat_to_base64_jpeg(img_bgr, quality=85):
    if img_bgr is None or img_bgr.size == 0:
        return ""
    success, enc = cv2.imencode(".jpg", img_bgr, [cv2.IMWRITE_JPEG_QUALITY, quality])
    if not success:
        return ""
    return "data:image/jpeg;base64," + base64.b64encode(enc).decode("ascii")

def run_inspector(clip_path, ranges, output_html_path="docs/pipeline_inspector.html"):
    print(f"[Pipeline Inspector] Analyzing clip: {clip_path}")
    print(f"[Pipeline Inspector] Target ranges: {ranges}")

    # Load models
    print("[Pipeline Inspector] Loading YOLO...")
    yolo_model = YOLO("yolo26s.pt")

    print("[Pipeline Inspector] Loading Fast-ALPR...")
    fast_alpr = ALPR(
        detector_model="yolo-v9-t-384-license-plate-end2end",
        ocr_model="cct-s-v2-global-model"
    )

    print("[Pipeline Inspector] Loading RapidOCR...")
    rapid_ocr = RapidOCR()

    cap = cv2.VideoCapture(clip_path)
    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))

    all_stage_data = []

    for label, t_start, t_end in ranges:
        print(f"\n--- Processing Range: {label} ({t_start}s - {t_end}s) ---")
        start_frame = int(t_start * fps)
        end_frame = min(total_frames - 1, int(t_end * fps))

        range_records = []

        for f_idx in range(start_frame, end_frame + 1, 2):  # Every 2nd frame (15 fps)
            cap.set(cv2.CAP_PROP_POS_FRAMES, f_idx)
            ret, frame = cap.read()
            if not ret:
                break

            t_sec = round(f_idx / fps, 2)
            fh, fw = frame.shape[:2]

            # 1. Raw Detections
            yolo_res = yolo_model(frame, verbose=False)[0]
            detections = []
            if yolo_res.boxes is not None:
                for b in yolo_res.boxes:
                    cls_id = int(b.cls[0].item())
                    cls_name = yolo_model.names.get(cls_id, "unknown")
                    conf = float(b.conf[0].item())
                    xyxy = [int(v) for v in b.xyxy[0].tolist()]
                    detections.append({
                        "class": cls_name,
                        "conf": round(conf, 3),
                        "box": xyxy,
                        "w": xyxy[2] - xyxy[0],
                        "h": xyxy[3] - xyxy[1]
                    })

            # Filter vehicle detections for crops
            veh_detections = [
                d for d in detections
                if d["class"] in ["car", "bus", "truck", "motorcycle", "bicycle"] and d["conf"] >= 0.35
            ]

            frame_crops_info = []

            for vd in veh_detections:
                vx1, vy1, vx2, vy2 = vd["box"]
                vx1, vy1 = max(0, vx1), max(0, vy1)
                vx2, vy2 = min(fw, vx2), min(fh, vy2)
                if vx2 <= vx1 or vy2 <= vy1:
                    continue

                veh_crop = frame[vy1:vy2, vx1:vx2]
                vh, vw = veh_crop.shape[:2]

                # Distance Gate Check on Vehicle
                veh_distance_gated = (vw < 120 or vh < 80)
                veh_gate_reason = f"Vehicle crop too small ({vw}x{vh} < 120x80)" if veh_distance_gated else "PASSED (Vehicle >= 120x80)"

                # Run Plate Detection on Vehicle Crop
                alpr_results = fast_alpr.predict(veh_crop)

                plate_entries = []
                if alpr_results:
                    for pres in alpr_results:
                        p_bb = pres.detection.bounding_box
                        px1, py1, px2, py2 = int(p_bb.x1), int(p_bb.y1), int(p_bb.x2), int(p_bb.y2)
                        px1, py1 = max(0, px1), max(0, py1)
                        px2, py2 = min(vw, px2), min(vh, py2)
                        pw, ph = px2 - px1, py2 - py1

                        raw_plate_crop = veh_crop[py1:py2, px1:px2] if (pw > 2 and ph > 2) else None
                        prep_crop = preprocess_plate_crop(raw_plate_crop) if raw_plate_crop is not None else None

                        # Plate Distance Gate Check
                        plate_gated = (pw < 35 or ph < 12)
                        plate_gate_reason = f"Plate bbox too small ({pw}x{ph} < 35x12)" if plate_gated else "PASSED (Plate >= 35x12)"

                        # Fast-ALPR OCR
                        fast_text = pres.ocr.text if pres.ocr else ""
                        fast_conf_list = [round(float(c), 3) for c in pres.ocr.confidence] if (pres.ocr and pres.ocr.confidence) else []
                        fast_avg_conf = round(sum(fast_conf_list) / len(fast_conf_list), 3) if fast_conf_list else 0.0

                        # RapidOCR on raw and preprocessed plate
                        rapid_raw_res, _ = rapid_ocr(raw_plate_crop) if raw_plate_crop is not None else (None, None)
                        rapid_prep_res, _ = rapid_ocr(prep_crop) if prep_crop is not None else (None, None)

                        rapid_raw_candidates = [
                            {"text": r[1], "conf": round(float(r[2]), 3)} for r in (rapid_raw_res or [])
                        ]
                        rapid_prep_candidates = [
                            {"text": r[1], "conf": round(float(r[2]), 3)} for r in (rapid_prep_res or [])
                        ]

                        # Check Indian License Plate Validation
                        clean_fast = PlateValidator.position_aware_correction(PlateValidator.clean_text(fast_text)) if fast_text else ""
                        fast_is_valid = bool(STANDARD_PLATE_REGEX.match(clean_fast) or BHARAT_SERIES_REGEX.match(clean_fast))

                        best_rapid_text = rapid_prep_candidates[0]["text"] if rapid_prep_candidates else (rapid_raw_candidates[0]["text"] if rapid_raw_candidates else "")
                        clean_rapid = PlateValidator.position_aware_correction(PlateValidator.clean_text(best_rapid_text)) if best_rapid_text else ""
                        rapid_is_valid = bool(STANDARD_PLATE_REGEX.match(clean_rapid) or BHARAT_SERIES_REGEX.match(clean_rapid))

                        # Determine Rejection / Acceptance Reason
                        rejection_reasons = []
                        if veh_distance_gated:
                            rejection_reasons.append(f"VehDistanceGate: {vw}x{vh} < 120x80")
                        if plate_gated:
                            rejection_reasons.append(f"PlateSizeGate: {pw}x{ph} < 35x12")
                        if not fast_is_valid and not rapid_is_valid:
                            rejection_reasons.append(f"FormatRegexMismatch: '{clean_fast}' & '{clean_rapid}' do not match SS DD LL NNNN")
                        if fast_avg_conf < 0.60 and (not rapid_prep_candidates or rapid_prep_candidates[0]["conf"] < 0.60):
                            rejection_reasons.append(f"LowConfidence: fast={fast_avg_conf}, rapid={rapid_prep_candidates[0]['conf'] if rapid_prep_candidates else 0.0}")

                        status = "REJECTED" if rejection_reasons else "ACCEPTED"

                        plate_entries.append({
                            "detector_conf": round(float(pres.detection.confidence), 3),
                            "box": [px1, py1, px2, py2],
                            "w": pw,
                            "h": ph,
                            "plate_gate_reason": plate_gate_reason,
                            "raw_plate_b64": mat_to_base64_jpeg(raw_plate_crop, 90),
                            "prep_plate_b64": mat_to_base64_jpeg(prep_crop, 90),
                            "fast_alpr": {
                                "text": fast_text,
                                "clean": clean_fast,
                                "avg_conf": fast_avg_conf,
                                "char_confs": fast_conf_list,
                                "is_valid": fast_is_valid,
                            },
                            "rapid_ocr_raw": rapid_raw_candidates,
                            "rapid_ocr_prep": rapid_prep_candidates,
                            "status": status,
                            "rejection_reasons": rejection_reasons
                        })

                frame_crops_info.append({
                    "vehicle_class": vd["class"],
                    "vehicle_conf": vd["conf"],
                    "vehicle_box": vd["box"],
                    "vehicle_w": vw,
                    "vehicle_h": vh,
                    "veh_gate_reason": veh_gate_reason,
                    "veh_b64": mat_to_base64_jpeg(veh_crop, 80),
                    "plates": plate_entries
                })

            range_records.append({
                "frame_idx": f_idx,
                "timestamp_sec": t_sec,
                "raw_detections": detections,
                "vehicle_crops": frame_crops_info
            })

        all_stage_data.append({
            "label": label,
            "start_sec": t_start,
            "end_sec": t_end,
            "frames": range_records
        })

    cap.release()

    # Generate HTML report
    os.makedirs(os.path.dirname(output_html_path), exist_ok=True)
    html_content = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>IBVAP Surveillance Pipeline Inspector - Round 8 Deep Diagnosis</title>
  <style>
    body {{
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background: #09090b;
      color: #f4f4f5;
      margin: 0;
      padding: 24px;
    }}
    h1, h2, h3 {{ color: #fafafa; }}
    .badge {{
      display: inline-block;
      padding: 3px 8px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 600;
      font-family: monospace;
    }}
    .badge-pass {{ background: #052e16; color: #4ade80; border: 1px solid #166534; }}
    .badge-reject {{ background: #450a0a; color: #f87171; border: 1px solid #991b1b; }}
    .badge-neutral {{ background: #27272a; color: #a1a1aa; border: 1px solid #3f3f46; }}
    .badge-amber {{ background: #451a03; color: #fbbf24; border: 1px solid #b45309; }}
    .container {{ max-width: 1500px; margin: 0 auto; }}
    .range-card {{
      background: #18181b;
      border: 1px solid #27272a;
      border-radius: 8px;
      margin-bottom: 24px;
      padding: 20px;
    }}
    .frame-card {{
      background: #121214;
      border: 1px solid #27272a;
      border-radius: 6px;
      margin-bottom: 16px;
      padding: 16px;
    }}
    .crop-row {{
      display: flex;
      flex-wrap: wrap;
      gap: 16px;
      align-items: flex-start;
      margin-top: 12px;
      border-top: 1px solid #27272a;
      padding-top: 12px;
    }}
    .crop-thumb {{
      border: 1px solid #3f3f46;
      border-radius: 4px;
      max-width: 180px;
      max-height: 140px;
      object-fit: contain;
      background: #000;
    }}
    .plate-thumb {{
      border: 1px solid #3f3f46;
      border-radius: 4px;
      max-width: 160px;
      max-height: 60px;
      object-fit: contain;
      background: #000;
    }}
    table {{
      width: 100%;
      border-collapse: collapse;
      font-size: 12px;
      margin-top: 8px;
    }}
    th, td {{
      padding: 6px 10px;
      border: 1px solid #27272a;
      text-align: left;
    }}
    th {{ background: #27272a; color: #e4e4e7; }}
  </style>
</head>
<body>
<div class="container">
  <h1>IBVAP Surveillance Pipeline Inspector</h1>
  <p style="color: #a1a1aa; font-size: 13px;">
    Diagnosis report capturing raw YOLO detections, tracking states, vehicle crops, plate-detector bounding boxes,
    raw vs. preprocessed plate crops, OCR per-character confidences, and the exact rejection / gating reason.
  </p>
  <div style="margin-bottom: 16px;">
    <span class="badge badge-neutral">Pipeline Schema: v8.0.0</span>
    <span class="badge badge-amber">Dataset: samples/whatsapp_video_2026_09_09_842pm.mp4</span>
  </div>
"""

    for group in all_stage_data:
        html_content += f"""
  <div class="range-card">
    <h2>{group['label']} ({group['start_sec']}s &ndash; {group['end_sec']}s)</h2>
"""
        for fr in group["frames"]:
            html_content += f"""
    <div class="frame-card">
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <span style="font-weight: bold; font-family: monospace; color: #fbbf24;">
          Frame #{fr['frame_idx']} @ {fr['timestamp_sec']}s
        </span>
        <span style="font-size: 12px; color: #71717a;">
          {len(fr['raw_detections'])} raw detections, {len(fr['vehicle_crops'])} vehicle crops
        </span>
      </div>
"""
            for vc in fr["vehicle_crops"]:
                veh_img = f'<img class="crop-thumb" src="{vc["veh_b64"]}" alt="Vehicle">' if vc["veh_b64"] else '<div style="color: #71717a;">No crop</div>'
                html_content += f"""
      <div class="crop-row">
        <div>
          {veh_img}
          <div style="font-size: 11px; margin-top: 4px; font-weight: bold; color: #38bdf8;">
            {vc['vehicle_class']} ({int(vc['vehicle_conf'] * 100)}%)
          </div>
          <div style="font-size: 10px; color: #a1a1aa;">
            Size: {vc['vehicle_w']}x{vc['vehicle_h']}px
          </div>
          <div style="margin-top: 4px;">
            <span class="badge {'badge-pass' if 'PASSED' in vc['veh_gate_reason'] else 'badge-reject'}">
              {vc['veh_gate_reason']}
            </span>
          </div>
        </div>

        <div style="flex: 1; min-width: 400px;">
"""
                if not vc["plates"]:
                    html_content += """
          <p style="color: #71717a; font-size: 12px; font-style: italic;">
            Plate Detector: 0 plates located on this crop
          </p>
"""
                else:
                    html_content += """
          <table>
            <thead>
              <tr>
                <th>Plate BBox</th>
                <th>Raw Crop</th>
                <th>Enhanced</th>
                <th>Fast-ALPR OCR</th>
                <th>RapidOCR</th>
                <th>Rejection Reason</th>
              </tr>
            </thead>
            <tbody>
"""
                    for pl in vc["plates"]:
                        raw_img = f'<img class="plate-thumb" src="{pl["raw_plate_b64"]}">' if pl["raw_plate_b64"] else 'N/A'
                        prep_img = f'<img class="plate-thumb" src="{pl["prep_plate_b64"]}">' if pl["prep_plate_b64"] else 'N/A'
                        reasons_str = "<br>".join(pl["rejection_reasons"]) if pl["rejection_reasons"] else "<span class='badge badge-pass'>VALID</span>"
                        rapid_candidates_str = ", ".join(f"<b>{c['text']}</b> ({c['conf']})" for c in pl["rapid_ocr_prep"]) if pl["rapid_ocr_prep"] else "none"

                        html_content += f"""
              <tr>
                <td>
                  {pl['w']}x{pl['h']}px<br>
                  <span style="font-size: 10px; color: #a1a1aa;">conf: {int(pl['detector_conf']*100)}%</span>
                </td>
                <td>{raw_img}</td>
                <td>{prep_img}</td>
                <td>
                  <b>{pl['fast_alpr']['clean'] or pl['fast_alpr']['text'] or 'none'}</b><br>
                  <span style="font-size: 10px; color: #a1a1aa;">conf: {int(pl['fast_alpr']['avg_conf']*100)}%</span>
                </td>
                <td>{rapid_candidates_str}</td>
                <td>
                  <span class="badge {'badge-pass' if pl['status'] == 'ACCEPTED' else 'badge-reject'}">{pl['status']}</span><br>
                  <span style="font-size: 10px; color: #f87171;">{reasons_str}</span>
                </td>
              </tr>
"""
                    html_content += """
            </tbody>
          </table>
"""
                html_content += """
        </div>
      </div>
"""
            html_content += """
    </div>
"""
        html_content += """
  </div>
"""

    html_content += """
</div>
</body>
</html>
"""

    with open(output_html_path, "w", encoding="utf-8") as f:
        f.write(html_content)

    print(f"\n[Pipeline Inspector] Generated gitignored HTML report at: {output_html_path}")
    print(f"[Pipeline Inspector] Report file size: {os.path.getsize(output_html_path)} bytes")

if __name__ == "__main__":
    clip = os.path.join(os.path.dirname(__file__), "..", "samples", "whatsapp_video_2026_09_09_842pm.mp4")
    target_ranges = [
        ("Golden Case 1: Readable Car Plate (KA01NN4498)", 3.8, 4.4),
        ("Golden Case 2: Tuk-Tuk / Auto-Rickshaw (Detected as Bus/Truck)", 9.5, 10.5),
        ("Golden Case 3: Fast-moving Vehicle (Track #193 / #196)", 13.0, 14.0),
    ]
    run_inspector(clip, target_ranges)
