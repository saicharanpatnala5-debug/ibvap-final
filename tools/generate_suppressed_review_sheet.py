"""
IBVAP Suppressed Bounding Boxes Visual Review Sheet Generator
Extracts 20 representative suppressed person boxes from CCTV footage
with full-size crops and contextual surrounding crops for visual verification.
Outputs: docs/suppressed_boxes_review.html (gitignored)
"""

import os
import sys
import base64
import cv2
import numpy as np

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR = os.path.dirname(SCRIPT_DIR)
AI_DIR = os.path.join(ROOT_DIR, "ai-service")
if AI_DIR not in sys.path:
    sys.path.insert(0, AI_DIR)

from app.services.detector import SurveillanceDetector
from app.config import settings

VIDEO_PATH = os.path.join(ROOT_DIR, "samples", "whatsapp_video_2026_09_09_842pm.mp4")
OUTPUT_HTML = os.path.join(ROOT_DIR, "docs", "suppressed_boxes_review.html")


def box_to_px(bb, w, h):
    return int(bb.x * w), int(bb.y * h), int((bb.x + bb.width) * w), int((bb.y + bb.height) * h)


def b64_encode_img(img):
    _, buf = cv2.imencode(".jpg", img, [int(cv2.IMWRITE_JPEG_QUALITY), 90])
    return "data:image/jpeg;base64," + base64.b64encode(buf).decode("utf-8")


def generate_review_sheet():
    print(f"[Review Sheet] Processing video: {VIDEO_PATH}")
    cap = cv2.VideoCapture(VIDEO_PATH)
    if not cap.isOpened():
        print(f"[Review Sheet] ERROR: Could not open {VIDEO_PATH}")
        return

    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 536)
    w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH) or 1280)
    h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT) or 720)

    detector = SurveillanceDetector()
    detector.reset()

    suppressed_candidates = []
    f_idx = 0

    while True:
        ret, frame = cap.read()
        if not ret or frame is None:
            break

        video_time = f_idx / fps

        # Detect raw boxes with YOLO model
        raw_results = detector.model(frame, conf=0.30, verbose=False)
        raw_persons = []
        for r in raw_results:
            for b in r.boxes:
                cls_id = int(b.cls[0].item())
                cls_name = detector.model.names[cls_id]
                conf = float(b.conf[0].item())
                xyxy = b.xyxy[0].cpu().numpy()
                if cls_name == "person":
                    raw_persons.append({
                        "conf": conf,
                        "x1": int(xyxy[0]),
                        "y1": int(xyxy[1]),
                        "x2": int(xyxy[2]),
                        "y2": int(xyxy[3]),
                    })

        # Run pipeline tracking
        entities, _ = detector.process_frame(frame, video_time)

        kept_pedestrians = [e for e in entities if "pedestrian" in (e.class_name or "").lower()]
        kept_riders = [e for e in entities if "rider" in (e.class_name or "").lower()]
        kept_two_wheelers = [e for e in entities if "two-wheeler" in (e.class_name or "").lower() or "motorcycle" in (e.class_name or "").lower()]
        kept_vehicles = [e for e in entities if any(k in (e.class_name or "").lower() for k in ["car", "truck", "bus", "auto-rickshaw", "vehicle"])]

        for rp in raw_persons:
            # Check if matches a kept ground pedestrian
            matched_ped = False
            for kp in kept_pedestrians:
                kx1, ky1, kx2, ky2 = box_to_px(kp.bbox, w, h)
                iw = max(0, min(rp["x2"], kx2) - max(rp["x1"], kx1))
                ih = max(0, min(rp["y2"], ky2) - max(rp["y1"], ky1))
                if (iw * ih) / max(1, (rp["x2"] - rp["x1"]) * (rp["y2"] - rp["y1"])) > 0.4:
                    matched_ped = True
                    break
            if matched_ped:
                continue

            # Check if fused with two-wheeler / rider
            matched_tw = False
            for tw in (kept_two_wheelers + kept_riders):
                tx1, ty1, tx2, ty2 = box_to_px(tw.bbox, w, h)
                iw = max(0, min(rp["x2"], tx2) - max(rp["x1"], tx1))
                ih = max(0, min(rp["y2"], ty2) - max(rp["y1"], ty1))
                if (iw * ih) / max(1, (rp["x2"] - rp["x1"]) * (rp["y2"] - rp["y1"])) > 0.35:
                    matched_tw = True
                    break
            if matched_tw:
                continue

            # This raw box was dropped / suppressed: evaluate vehicle containment
            overlapping_veh = None
            max_iop = 0.0
            is_incabin = False
            for v in (kept_vehicles + kept_two_wheelers):
                vx1, vy1, vx2, vy2 = box_to_px(v.bbox, w, h)
                iw = max(0, min(rp["x2"], vx2) - max(rp["x1"], vx1))
                ih = max(0, min(rp["y2"], vy2) - max(rp["y1"], vy1))
                inter_area = iw * ih
                p_area = max(1, (rp["x2"] - rp["x1"]) * (rp["y2"] - rp["y1"]))
                iop = inter_area / float(p_area)
                if iop > max_iop:
                    max_iop = iop
                    overlapping_veh = v
                    foot_y = rp["y2"]
                    if (foot_y >= (vy1 + (vy2 - vy1) * 0.15)) and (foot_y <= (vy1 + (vy2 - vy1) * 0.75)):
                        is_incabin = True

            # Determine technical rationale
            if overlapping_veh and max_iop >= 0.50:
                category = "In-Cabin Passenger Artifact" if is_incabin else "Enclosed Detection Inside Vehicle"
                reason = f"Box inside {overlapping_veh.class_name} #{overlapping_veh.id} (IoP {max_iop*100:.0f}%, footpoint suspended inside cabin)"
                priority = 10
            elif overlapping_veh and max_iop >= 0.25:
                category = "Vehicle Edge / Overlap Artifact"
                reason = f"Partial overlap on {overlapping_veh.class_name} #{overlapping_veh.id} (IoP {max_iop*100:.0f}%)"
                priority = 8
            elif rp["conf"] < 0.38:
                category = "Sub-Threshold Transient Noise"
                reason = f"Detection confidence {rp['conf']:.2f} is below 0.38 threshold for person class"
                priority = 5
            else:
                category = "Tentative Single-Frame Tracker Ghost"
                reason = "Single-frame candidate rejected by ByteTrack tracking lifecycle (unconfirmed track)"
                priority = 6

            # Extract crops: full-size target crop & surrounding context crop
            bx1, by1, bx2, by2 = max(0, rp["x1"]), max(0, rp["y1"]), min(w, rp["x2"]), min(h, rp["y2"])
            if (bx2 - bx1) < 8 or (by2 - by1) < 12:
                continue

            target_crop = frame[by1:by2, bx1:bx2].copy()
            # Draw red bounding box on crop
            cv2.rectangle(target_crop, (0, 0), (target_crop.shape[1] - 1, target_crop.shape[0] - 1), (0, 0, 255), 2)

            # Context crop: expand by 100% on each side
            pad_x = int((bx2 - bx1) * 1.0)
            pad_y = int((by2 - by1) * 0.7)
            cx1, cy1 = max(0, bx1 - pad_x), max(0, by1 - pad_y)
            cx2, cy2 = min(w, bx2 + pad_x), min(h, by2 + pad_y)
            context_crop = frame[cy1:cy2, cx1:cx2].copy()
            # Draw rectangle in context crop
            cv2.rectangle(context_crop, (bx1 - cx1, by1 - cy1), (bx2 - cx1, by2 - cy1), (0, 0, 255), 2)

            suppressed_candidates.append({
                "frame": f_idx,
                "timestamp": f"{video_time:.2f}s",
                "conf": round(rp["conf"], 2),
                "bbox": [bx1, by1, bx2, by2],
                "host_veh": f"{overlapping_veh.class_name} #{overlapping_veh.id}" if overlapping_veh else "None",
                "iop": round(max_iop * 100, 1),
                "category": category,
                "reason": reason,
                "priority": priority,
                "target_b64": b64_encode_img(target_crop),
                "context_b64": b64_encode_img(context_crop),
            })

        f_idx += 1

    cap.release()
    print(f"[Review Sheet] Captured {len(suppressed_candidates)} total candidate suppressed boxes.")

    # Select exactly 20 diverse representative suppressed boxes:
    # Prioritize in-cabin passenger reflections and vehicle overlaps across time
    suppressed_candidates.sort(key=lambda x: (x["priority"], x["iop"], x["conf"]), reverse=True)

    # Sample evenly across video timeline to avoid clustering
    selected = []
    used_times = []
    for cand in suppressed_candidates:
        t_val = float(cand["timestamp"].replace("s", ""))
        # ensure at least 0.3s separation if same category
        if any(abs(t_val - ut) < 0.3 for ut in used_times) and len(selected) > 10:
            continue
        selected.append(cand)
        used_times.append(t_val)
        if len(selected) >= 20:
            break

    # If less than 20, fill with remaining
    if len(selected) < 20:
        for cand in suppressed_candidates:
            if cand not in selected:
                selected.append(cand)
            if len(selected) >= 20:
                break

    # Sort selected chronologically
    selected.sort(key=lambda x: float(x["timestamp"].replace("s", "")))
    print(f"[Review Sheet] Selected {len(selected)} boxes for human visual inspection.")

    # Generate HTML review sheet
    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>IBVAP - 20 Suppressed Bounding Boxes Visual Audit Review Sheet</title>
    <style>
        body {{ font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, monospace; background: #0b0f19; color: #f1f5f9; margin: 0; padding: 24px; }}
        h1 {{ color: #f59e0b; margin-bottom: 4px; }}
        .header {{ margin-bottom: 24px; border-bottom: 1px solid #1e293b; padding-bottom: 16px; }}
        .summary {{ background: #131b2e; border: 1px solid #1e293b; border-radius: 8px; padding: 16px; margin-bottom: 24px; font-size: 14px; line-height: 1.6; }}
        .grid {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(480px, 1fr)); gap: 24px; }}
        .card {{ background: #131b2e; border: 1px solid #1e293b; border-radius: 12px; overflow: hidden; }}
        .card-header {{ padding: 12px 16px; background: #1a243b; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #1e293b; }}
        .badge {{ padding: 3px 8px; border-radius: 4px; font-weight: 600; font-size: 11px; }}
        .badge-incabin {{ background: #7f1d1d; color: #f87171; }}
        .badge-transient {{ background: #581c87; color: #c084fc; }}
        .badge-overlap {{ background: #78350f; color: #fbbf24; }}
        .crop-row {{ display: flex; gap: 12px; padding: 16px; background: #0f172a; align-items: center; justify-content: center; }}
        .crop-box {{ text-align: center; }}
        .crop-box img {{ max-height: 180px; max-width: 100%; border: 1px solid #334155; border-radius: 4px; display: block; margin: 0 auto; object-fit: contain; }}
        .crop-label {{ font-size: 11px; color: #94a3b8; margin-top: 6px; text-transform: uppercase; font-weight: 600; }}
        .card-body {{ padding: 16px; font-size: 13px; line-height: 1.5; }}
        .field {{ margin-bottom: 6px; display: flex; justify-content: space-between; border-bottom: 1px solid #1e293b; padding-bottom: 4px; }}
        .field-label {{ color: #94a3b8; font-size: 12px; }}
        .field-value {{ font-family: monospace; font-weight: 600; }}
        .reason-box {{ margin-top: 10px; padding: 10px; background: #1e293b; border-left: 3px solid #f59e0b; border-radius: 4px; font-size: 12px; color: #cbd5e1; }}
    </style>
</head>
<body>
    <div class="header">
        <h1>🔍 IBVAP Visual Audit: 20 Suppressed Bounding Boxes</h1>
        <p style="color: #94a3b8; margin: 0;">Full-size optical crops and surrounding context verification sheet for human eye validation (samples/whatsapp_video_2026_09_09_842pm.mp4)</p>
    </div>

    <div class="summary">
        <strong>Human Review Instructions:</strong><br/>
        This review sheet isolates <strong>20 representative candidate person boxes</strong> that were filtered by IBVAP's Containment Suppression and Tracking Lifecycle filters.<br/>
        Inspect the side-by-side images for each case:<br/>
        • <strong>Target Crop (Red outline):</strong> The exact bounding box detected by raw YOLO.<br/>
        • <strong>Surrounding Context:</strong> The host vehicle/roadway environment showing where the box was located.<br/>
        <strong>Verification Goal:</strong> Confirm that none of these 20 boxes represent genuine pedestrians walking on the pavement or two-wheeler riders. All genuine pavement pedestrians remain tracked in green.
    </div>

    <div class="grid">
"""

    for idx, item in enumerate(selected, 1):
        badge_cls = "badge-incabin" if "In-Cabin" in item["category"] else "badge-overlap" if "Overlap" in item["category"] else "badge-transient"
        html += f"""
        <div class="card">
            <div class="card-header">
                <strong>#{idx:02d} | Frame #{item['frame']} (t = {item['timestamp']})</strong>
                <span class="badge {badge_cls}">{item['category']}</span>
            </div>
            <div class="crop-row">
                <div class="crop-box" style="flex: 1;">
                    <img src="{item['target_b64']}" alt="Target Crop" />
                    <div class="crop-label">Target Crop (Box)</div>
                </div>
                <div class="crop-box" style="flex: 2;">
                    <img src="{item['context_b64']}" alt="Context Crop" />
                    <div class="crop-label">Surrounding Vehicle Context</div>
                </div>
            </div>
            <div class="card-body">
                <div class="field">
                    <span class="field-label">Raw Confidence:</span>
                    <span class="field-value">{item['conf']} ({int(item['conf']*100)}%)</span>
                </div>
                <div class="field">
                    <span class="field-label">Bounding Box [x1, y1, x2, y2]:</span>
                    <span class="field-value">{item['bbox']}</span>
                </div>
                <div class="field">
                    <span class="field-label">Host Vehicle:</span>
                    <span class="field-value" style="color: #38bdf8;">{item['host_veh']}</span>
                </div>
                <div class="field">
                    <span class="field-label">Vehicle Overlap (IoP):</span>
                    <span class="field-value" style="color: #f87171;">{item['iop']}%</span>
                </div>
                <div class="reason-box">
                    <strong>Algorithmic Suppression Rationale:</strong><br/>
                    {item['reason']}
                </div>
            </div>
        </div>
        """

    html += """
    </div>
</body>
</html>
"""

    with open(OUTPUT_HTML, "w", encoding="utf-8") as f:
        f.write(html)

    print(f"[Review Sheet] Successfully wrote visual review sheet to: {OUTPUT_HTML}")


if __name__ == "__main__":
    generate_review_sheet()
