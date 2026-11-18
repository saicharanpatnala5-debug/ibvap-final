#!/usr/bin/env python3
"""
IBVAP Step 1 - ANPR Track Diagnosis & Pipeline Inspector
Extracts all vehicle tracks from surveillance footage, measures native box dimensions,
evaluates multi-scale plate localization (native, 2x upscaled, lower region, tiles),
and generates a standalone gitignored HTML inspector.
"""

import os
import sys
import cv2
import json
import base64
import numpy as np
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT_DIR / "ai-service"))

from app.services.detector import SurveillanceDetector
from app.services.anpr import (
    FastALPREngine,
    PlateValidator,
    preprocess_plate_crop,
    bgr_to_base64_jpeg,
    compute_crop_sharpness,
)


def run_diagnosis():
    samples_dir = ROOT_DIR / "samples"
    docs_dir = ROOT_DIR / "docs"
    docs_dir.mkdir(parents=True, exist_ok=True)

    video_files = [
        samples_dir / "whatsapp_video_2026_09_09_533pm.mp4",
        samples_dir / "whatsapp_video_2026_09_09_842pm.mp4",
    ]

    engine = FastALPREngine.get_instance()
    detector = SurveillanceDetector()

    all_tracks_summary = []
    html_cards = []

    print("=" * 80)
    print("STEP 1: ANPR VEHICLE TRACK & RESOLUTION DIAGNOSIS")
    print("=" * 80)

    for vid_path in video_files:
        if not vid_path.exists():
            continue

        cap = cv2.VideoCapture(str(vid_path))
        vw = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        vh = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))

        print(f"\nVideo: {vid_path.name}")
        print(f"  Native Decoded Resolution: {vw} x {vh}")
        print(f"  FPS: {fps:.2f}, Total Frames: {total_frames}")

        tracks = {}
        detector.reset()
        frame_idx = 0

        while cap.isOpened():
            ret, frame = cap.read()
            if not ret or frame is None:
                break
            frame_idx += 1
            t_sec = frame_idx / fps

            # Run detection & tracking pass
            entities, _ = detector.process_frame(frame, timestamp_sec=t_sec)

            for ent in entities:
                cls = ent.class_name
                if cls in ["car", "truck", "bus", "truck/bus", "motorcycle", "two-wheeler", "three-wheeler", "auto-rickshaw"]:
                    box_w = int(ent.bbox.width * vw)
                    box_h = int(ent.bbox.height * vh)
                    bx = int(ent.bbox.x * vw)
                    by = int(ent.bbox.y * vh)

                    # Keep best frame per track by area x sharpness
                    ix1, iy1 = max(0, bx), max(0, by)
                    ix2, iy2 = min(vw, bx + box_w), min(vh, by + box_h)
                    if ix2 - ix1 < 10 or iy2 - iy1 < 10:
                        continue

                    # Direct crop from original native decoded frame (NOT display canvas)
                    crop = frame[iy1:iy2, ix1:ix2]
                    sharpness = compute_crop_sharpness(crop)
                    score = (box_w * box_h) * (1.0 + min(1.0, sharpness / 200.0))

                    if ent.id not in tracks or score > tracks[ent.id]["score"]:
                        tracks[ent.id] = {
                            "track_id": ent.id,
                            "class": cls,
                            "box_w": box_w,
                            "box_h": box_h,
                            "norm_w": ent.bbox.width,
                            "norm_h": ent.bbox.height,
                            "t_sec": t_sec,
                            "frame_idx": frame_idx,
                            "sharpness": sharpness,
                            "crop": crop.copy(),
                            "score": score,
                            "video": vid_path.name,
                            "vw": vw,
                            "vh": vh,
                        }

        cap.release()

        print(f"  Total Vehicle Tracks Found: {len(tracks)}")
        for tid in sorted(tracks.keys()):
            tr = tracks[tid]
            all_tracks_summary.append(tr)
            print(f"    Track #{tr['track_id']:<3} ({tr['class']:<13}) at {tr['t_sec']:>5.2f}s: "
                  f"Native Size = {tr['box_w']:>3}x{tr['box_h']:<3} px "
                  f"(Norm: {tr['norm_w']:.3f}x{tr['norm_h']:.3f}), Sharpness={tr['sharpness']:.1f}")

    # Now for each track, run multi-scale plate localization:
    # 1. Native crop
    # 2. 2x Upscaled crop (Cubic / Lanczos)
    # 3. Lower 50% vehicle region (typical plate location)
    # 4. Multi-scale tile
    print("\n" + "=" * 80)
    print("EVALUATING MULTI-SCALE PLATE LOCALIZATION ON ALL TRACKS")
    print("=" * 80)

    for tr in all_tracks_summary:
        crop = tr["crop"]
        ch, cw = crop.shape[:2]

        # 1. Native crop ALPR (min_veh_w=1, min_veh_h=1 to bypass gate)
        native_alpr_res = None
        native_detections = []
        if engine._alpr is not None:
            try:
                native_detections = engine._alpr.predict(crop)
            except Exception:
                pass

        # 2. 2x Upscaled crop (Cubic)
        crop_2x = cv2.resize(crop, (cw * 2, ch * 2), interpolation=cv2.INTER_CUBIC)
        upscaled_detections = []
        if engine._alpr is not None:
            try:
                upscaled_detections = engine._alpr.predict(crop_2x)
            except Exception:
                pass

        # 3. Lower 50% region
        lower_crop = crop[int(ch * 0.45):, :]
        lower_detections = []
        if engine._alpr is not None and lower_crop.size > 0:
            try:
                lower_crop_2x = cv2.resize(lower_crop, (lower_crop.shape[1] * 2, lower_crop.shape[0] * 2), interpolation=cv2.INTER_CUBIC)
                lower_detections = engine._alpr.predict(lower_crop_2x)
            except Exception:
                pass

        # Best candidate selection across scales
        all_candidates = []
        for det in native_detections:
            all_candidates.append({
                "scale": "Native",
                "text": det.ocr.text if det.ocr else "",
                "conf": float(np.mean(det.ocr.confidence) * 100.0) if det.ocr and det.ocr.confidence else float(det.detection.confidence) * 100.0,
                "det_conf": float(det.detection.confidence),
                "box": det.detection.bounding_box,
                "pw": int(det.detection.bounding_box.x2 - det.detection.bounding_box.x1),
                "ph": int(det.detection.bounding_box.y2 - det.detection.bounding_box.y1),
                "crop_source": crop,
            })
        for det in upscaled_detections:
            all_candidates.append({
                "scale": "2x-Upscaled",
                "text": det.ocr.text if det.ocr else "",
                "conf": float(np.mean(det.ocr.confidence) * 100.0) if det.ocr and det.ocr.confidence else float(det.detection.confidence) * 100.0,
                "det_conf": float(det.detection.confidence),
                "box": det.detection.bounding_box,
                "pw": int((det.detection.bounding_box.x2 - det.detection.bounding_box.x1) / 2.0),
                "ph": int((det.detection.bounding_box.y2 - det.detection.bounding_box.y1) / 2.0),
                "crop_source": crop_2x,
            })
        for det in lower_detections:
            all_candidates.append({
                "scale": "Lower-50%",
                "text": det.ocr.text if det.ocr else "",
                "conf": float(np.mean(det.ocr.confidence) * 100.0) if det.ocr and det.ocr.confidence else float(det.detection.confidence) * 100.0,
                "det_conf": float(det.detection.confidence),
                "box": det.detection.bounding_box,
                "pw": int((det.detection.bounding_box.x2 - det.detection.bounding_box.x1) / 2.0),
                "ph": int((det.detection.bounding_box.y2 - det.detection.bounding_box.y1) / 2.0),
                "crop_source": lower_crop,
            })

        best_cand = None
        if all_candidates:
            # Sort by ocr length & confidence
            best_cand = max(all_candidates, key=lambda c: (len(c["text"]) >= 4, c["conf"], c["det_conf"]))

        # Extract plate crop if candidate localized
        plate_crop_b64 = ""
        best_ocr_text = "UNLOCALIZED"
        best_conf = 0.0
        char_conf_str = "N/A"
        validation_status = "No plate localized"
        format_type = "invalid"

        if best_cand:
            best_ocr_text = best_cand["text"]
            best_conf = best_cand["conf"]
            bx = best_cand["box"]
            src_img = best_cand["crop_source"]
            x1, y1 = max(0, int(bx.x1)), max(0, int(bx.y1))
            x2, y2 = min(src_img.shape[1], int(bx.x2)), min(src_img.shape[0], int(bx.y2))
            if x2 > x1 and y2 > y1:
                p_crop = src_img[y1:y2, x1:x2]
                plate_crop_b64 = bgr_to_base64_jpeg(p_crop, quality=90)

            cleaned = PlateValidator.clean_text(best_ocr_text)
            corrected = PlateValidator.position_aware_correction(cleaned)
            is_val, f_type, v_stat = PlateValidator.validate(corrected)
            validation_status = v_stat
            format_type = f_type
            if is_val:
                best_ocr_text = corrected

        veh_b64 = bgr_to_base64_jpeg(crop, quality=80)

        tr["best_cand"] = best_cand
        tr["best_ocr_text"] = best_ocr_text
        tr["best_conf"] = best_conf
        tr["validation_status"] = validation_status
        tr["format_type"] = format_type
        tr["plate_crop_b64"] = plate_crop_b64
        tr["veh_b64"] = veh_b64
        tr["num_candidates"] = len(all_candidates)

        print(f"Track #{tr['track_id']:<3} [{tr['box_w']:>3}x{tr['box_h']:<3} px]: "
              f"Candidates={len(all_candidates):<2} | "
              f"Best Scale={best_cand['scale'] if best_cand else 'None':<11} | "
              f"OCR='{best_ocr_text}' ({best_conf:.1f}%) | Status={validation_status}")

    # Generate standalone gitignored HTML inspector
    inspector_html_path = docs_dir / "anpr_15tracks_inspector.html"
    generate_html_inspector(all_tracks_summary, inspector_html_path)
    print(f"\n[Inspector Generated] Saved to:\n  {inspector_html_path}")

    # Also save structured JSON for subsequent steps
    summary_json_path = ROOT_DIR / "samples" / "tracks_diagnosis_summary.json"
    with open(summary_json_path, "w", encoding="utf-8") as f:
        json_data = [
            {
                "track_id": tr["track_id"],
                "video": tr["video"],
                "class": tr["class"],
                "box_w": tr["box_w"],
                "box_h": tr["box_h"],
                "norm_w": round(tr["norm_w"], 4),
                "norm_h": round(tr["norm_h"], 4),
                "timestamp_sec": round(tr["t_sec"], 2),
                "sharpness": round(tr["sharpness"], 2),
                "best_scale": tr["best_cand"]["scale"] if tr["best_cand"] else "None",
                "best_ocr_text": tr["best_ocr_text"],
                "confidence": round(tr["best_conf"], 1),
                "status": tr["validation_status"],
                "format_type": tr["format_type"],
            }
            for tr in all_tracks_summary
        ]
        json.dump(json_data, f, indent=2)

    return all_tracks_summary


def generate_html_inspector(tracks: list, output_path: Path):
    rows_html = []
    for tr in tracks:
        cand = tr.get("best_cand")
        scale_label = cand["scale"] if cand else "None"
        plate_box_px = f"{cand['pw']}x{cand['ph']} px" if cand else "Unlocalized"
        plate_img = f"<img src='{tr['plate_crop_b64']}' class='plate-thumb' />" if tr['plate_crop_b64'] else "<span class='no-plate'>No localized plate</span>"
        status_badge_class = "badge-valid" if tr["format_type"] in ["standard", "bharat"] else "badge-review" if tr["best_ocr_text"] not in ["UNLOCALIZED", ""] else "badge-dist"

        row = f"""
        <div class="track-card">
          <div class="card-header">
            <span class="track-title">Track #{tr['track_id']} &bull; {tr['class']}</span>
            <span class="badge {status_badge_class}">{tr['validation_status']}</span>
          </div>
          <div class="card-body">
            <div class="crop-col">
              <span class="col-label">Native Decoded Vehicle Crop ({tr['box_w']} &times; {tr['box_h']} px)</span>
              <img src="{tr['veh_b64']}" class="veh-thumb" />
              <span class="meta-sub">Video: {tr['video']} &bull; Time: {tr['t_sec']:.2f}s &bull; Sharpness: {tr['sharpness']:.1f}</span>
            </div>
            <div class="plate-col">
              <span class="col-label">Localized Plate Crop ({plate_box_px} &bull; Best Scale: {scale_label})</span>
              <div class="plate-box-container">
                {plate_img}
              </div>
              <div class="ocr-display">
                <span class="ocr-text">{tr['best_ocr_text']}</span>
                <span class="ocr-conf">{tr['best_conf']:.1f}% OCR Confidence</span>
              </div>
              <span class="meta-sub">Multi-scale candidates found: {tr['num_candidates']} (Native, 2x Upscaled, Lower 50%)</span>
            </div>
          </div>
        </div>
        """
        rows_html.append(row)

    html_content = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>ANPR 15-Track Pipeline Inspector - Grounded Diagnosis</title>
  <style>
    body {{
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, monospace, sans-serif;
      background: #090d16;
      color: #e2e8f0;
      padding: 28px;
      margin: 0;
    }}
    h1 {{ color: #fbbf24; margin-bottom: 4px; font-size: 22px; }}
    .subtitle {{ color: #94a3b8; font-size: 13px; margin-bottom: 24px; }}
    .track-card {{
      background: #111827;
      border: 1px solid #1f2937;
      border-radius: 10px;
      margin-bottom: 18px;
      overflow: hidden;
    }}
    .card-header {{
      background: #1a2234;
      padding: 10px 18px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 1px solid #1f2937;
    }}
    .track-title {{ font-weight: 700; font-size: 15px; color: #f3f4f6; }}
    .badge {{
      padding: 3px 8px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
    }}
    .badge-valid {{ background: #064e3b; color: #34d399; border: 1px solid #059669; }}
    .badge-review {{ background: #78350f; color: #fde68a; border: 1px solid #d97706; }}
    .badge-dist {{ background: #1e293b; color: #94a3b8; border: 1px solid #475569; }}
    .card-body {{
      display: flex;
      gap: 24px;
      padding: 16px 18px;
      align-items: flex-start;
    }}
    .crop-col, .plate-col {{
      display: flex;
      flex-direction: column;
      gap: 8px;
    }}
    .crop-col {{ width: 340px; flex-shrink: 0; }}
    .plate-col {{ flex: 1; }}
    .col-label {{ font-size: 11px; font-weight: 600; text-transform: uppercase; color: #94a3b8; letter-spacing: 0.5px; }}
    .veh-thumb {{
      width: 100%;
      height: 180px;
      object-fit: cover;
      border-radius: 6px;
      border: 1px solid #374151;
      background: #000;
    }}
    .plate-box-container {{
      height: 70px;
      background: #030712;
      border: 1px solid #374151;
      border-radius: 6px;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 6px;
    }}
    .plate-thumb {{ max-height: 100%; max-width: 100%; object-fit: contain; }}
    .no-plate {{ font-size: 12px; color: #64748b; font-style: italic; }}
    .ocr-display {{
      display: flex;
      align-items: center;
      gap: 12px;
      margin-top: 6px;
    }}
    .ocr-text {{
      font-family: "Courier New", Courier, monospace;
      font-size: 17px;
      font-weight: 800;
      background: #f8fafc;
      color: #0f172a;
      padding: 4px 12px;
      border-radius: 4px;
      letter-spacing: 2px;
      border: 2px solid #334155;
    }}
    .ocr-conf {{ font-size: 12px; color: #fbbf24; font-family: monospace; font-weight: 600; }}
    .meta-sub {{ font-size: 11px; color: #64748b; }}
  </style>
</head>
<body>
  <h1>ANPR 15-Track Grounded Pipeline Inspector</h1>
  <div class="subtitle">
    Inspection of all vehicle tracks &bull; Demonstrates root cause of 0% OCR &bull; Compares Native vs. 2x Upscaled vs. Lower 50% Localization
  </div>
  {''.join(rows_html)}
</body>
</html>
"""
    with open(output_path, "w", encoding="utf-8") as f:
        f.write(html_content)


if __name__ == "__main__":
    run_diagnosis()
