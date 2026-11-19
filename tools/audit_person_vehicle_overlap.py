"""
IBVAP Person-on-Vehicle Overlap Audit & Visual Review Sheet Generator
Part 5.B: Audits overlapping person detections on cars/trucks across 20 representative frames.
Outputs: docs/person_vehicle_overlap_audit.html (gitignored)
"""

import os
import sys
import base64
import json
import cv2
import numpy as np

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR = os.path.dirname(SCRIPT_DIR)
AI_DIR = os.path.join(ROOT_DIR, "ai-service")
if AI_DIR not in sys.path:
    sys.path.insert(0, AI_DIR)

from app.services.detector import SurveillanceDetector

VIDEO_PATH = os.path.join(ROOT_DIR, "samples", "whatsapp_video_2026_09_09_842pm.mp4")
DOCS_DIR = os.path.join(ROOT_DIR, "docs")
os.makedirs(DOCS_DIR, exist_ok=True)
OUTPUT_HTML = os.path.join(DOCS_DIR, "person_vehicle_overlap_audit.html")


def box_to_px(bb, w, h):
    x1 = int(bb.x * w)
    y1 = int(bb.y * h)
    x2 = int((bb.x + bb.width) * w)
    y2 = int((bb.y + bb.height) * h)
    return x1, y1, x2, y2


def compute_overlap(b_person, b_veh, w, h):
    px1, py1, px2, py2 = box_to_px(b_person, w, h)
    vx1, vy1, vx2, vy2 = box_to_px(b_veh, w, h)

    ix1 = max(px1, vx1)
    iy1 = max(py1, vy1)
    ix2 = min(px2, vx2)
    iy2 = min(py2, vy2)

    iw = max(0, ix2 - ix1)
    ih = max(0, iy2 - iy1)
    inter_area = iw * ih

    p_area = max(1, (px2 - px1) * (py2 - py1))
    v_area = max(1, (vx2 - vx1) * (vy2 - vy1))
    union_area = p_area + v_area - inter_area

    iop = inter_area / float(p_area)
    iou = inter_area / float(max(1, union_area))

    # Footpoint check (bottom-center of person box)
    p_foot_x = (px1 + px2) // 2
    p_foot_y = py2
    foot_in_veh = (vx1 <= p_foot_x <= vx2) and (vy1 <= p_foot_y <= vy2)

    return {
        "inter_area": inter_area,
        "person_area": p_area,
        "veh_area": v_area,
        "iop": iop,
        "iou": iou,
        "foot_in_veh": foot_in_veh,
        "box_person": (px1, py1, px2, py2),
        "box_veh": (vx1, vy1, vx2, vy2),
    }


def run_overlap_audit():
    print(f"[Overlap Audit] Opening video: {VIDEO_PATH}")
    cap = cv2.VideoCapture(VIDEO_PATH)
    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 534)
    w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH) or 1280)
    h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT) or 720)

    detector = SurveillanceDetector()
    detector.reset()

    # 20 evenly distributed representative frames across the 17.8s clip
    sample_frame_indices = [
        15, 30, 45, 60, 90, 120, 135, 150, 180, 210,
        240, 270, 300, 330, 360, 390, 420, 450, 480, 510
    ]

    frame_audit_records = []
    total_persons_detected = 0
    total_vehicles_detected = 0
    total_overlaps_detected = 0
    in_cabin_persons_count = 0

    for f_idx in sample_frame_indices:
        cap.set(cv2.CAP_PROP_POS_FRAMES, f_idx)
        ret, frame = cap.read()
        if not ret or frame is None:
            continue

        video_time = f_idx / fps
        entities, _ = detector.process_frame(frame, video_time)

        persons = [e for e in entities if "pedestrian" in (e.class_name or "").lower() or "person" in (e.class_name or "").lower()]
        vehicles = [e for e in entities if any(k in (e.class_name or "").lower() for k in ["car", "truck", "bus"])]

        total_persons_detected += len(persons)
        total_vehicles_detected += len(vehicles)

        overlaps = []
        annotated_frame = frame.copy()

        # Draw vehicles in Cyan
        for v in vehicles:
            vx1, vy1, vx2, vy2 = box_to_px(v.bbox, w, h)
            cv2.rectangle(annotated_frame, (vx1, vy1), (vx2, vy2), (255, 200, 0), 2)
            cv2.putText(annotated_frame, f"Veh #{v.id} ({v.class_name})", (vx1 + 4, vy1 + 18), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 200, 0), 2)

        # Draw persons and test overlap with vehicles
        for p in persons:
            px1, py1, px2, py2 = box_to_px(p.bbox, w, h)
            is_overlapping = False
            max_iop = 0.0
            overlapping_veh_id = None
            is_in_cabin = False

            for v in vehicles:
                ov = compute_overlap(p.bbox, v.bbox, w, h)
                if ov["iop"] > 0.15:
                    is_overlapping = True
                    total_overlaps_detected += 1
                    if ov["iop"] > max_iop:
                        max_iop = ov["iop"]
                        overlapping_veh_id = v.id
                        # If > 60% of person box is inside vehicle and footpoint is inside vehicle hull
                        if ov["iop"] > 0.60 or (ov["foot_in_veh"] and ov["iop"] > 0.40):
                            is_in_cabin = True

            if is_in_cabin:
                in_cabin_persons_count += 1
                color = (0, 0, 255) # Red/Magenta for in-cabin/spurious person box
                label = f"Ped #{p.id} [IN-CABIN OVERLAP {max_iop*100:.0f}% with Veh #{overlapping_veh_id}]"
            elif is_overlapping:
                color = (0, 165, 255) # Orange for proximity overlap
                label = f"Ped #{p.id} [Near Veh #{overlapping_veh_id} {max_iop*100:.0f}%]"
            else:
                color = (0, 255, 0) # Green for clean pedestrian
                label = f"Ped #{p.id} (Ground)"

            cv2.rectangle(annotated_frame, (px1, py1), (px2, py2), color, 2)
            cv2.putText(annotated_frame, label, (px1 + 2, max(14, py1 - 6)), cv2.FONT_HERSHEY_SIMPLEX, 0.45, color, 1)

            if is_overlapping:
                overlaps.append({
                    "person_id": p.id,
                    "veh_id": overlapping_veh_id,
                    "iop": round(max_iop * 100, 1),
                    "is_in_cabin": is_in_cabin,
                })

        # Encode thumbnail
        thumb = cv2.resize(annotated_frame, (640, 360))
        _, buf = cv2.imencode(".jpg", thumb, [int(cv2.IMWRITE_JPEG_QUALITY), 80])
        b64_img = "data:image/jpeg;base64," + base64.b64encode(buf).decode("utf-8")

        frame_audit_records.append({
            "frame_idx": f_idx,
            "timestamp": f"{video_time:.2f}s",
            "persons_count": len(persons),
            "vehicles_count": len(vehicles),
            "overlaps": overlaps,
            "has_in_cabin": any(o["is_in_cabin"] for o in overlaps),
            "img_b64": b64_img,
        })

    cap.release()

    # Generate HTML report
    html_content = f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>IBVAP - Person on Vehicle Overlap Audit (20-Frame Acceptance Sheet)</title>
    <style>
        body {{ font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, monospace; background: #0b0f19; color: #f1f5f9; margin: 0; padding: 24px; }}
        h1 {{ color: #f59e0b; margin-bottom: 4px; }}
        .header {{ margin-bottom: 24px; border-bottom: 1px solid #1e293b; padding-bottom: 16px; }}
        .stats-grid {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; margin-bottom: 24px; }}
        .stat-card {{ background: #131b2e; border: 1px solid #1e293b; border-radius: 8px; padding: 16px; }}
        .stat-value {{ font-size: 24px; font-weight: bold; color: #38bdf8; font-mono; }}
        .stat-label {{ font-size: 12px; color: #94a3b8; text-transform: uppercase; margin-top: 4px; }}
        .frames-container {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(600px, 1fr)); gap: 24px; }}
        .frame-card {{ background: #131b2e; border: 1px solid #1e293b; border-radius: 12px; overflow: hidden; }}
        .frame-header {{ padding: 12px 16px; background: #1a243b; display: flex; justify-content: space-between; align-items: center; }}
        .frame-img {{ width: 100%; display: block; }}
        .frame-body {{ padding: 16px; font-size: 13px; }}
        .badge {{ padding: 3px 8px; border-radius: 4px; font-weight: 600; font-size: 11px; }}
        .badge-clean {{ background: #064e3b; color: #34d399; }}
        .badge-overlap {{ background: #78350f; color: #fbbf24; }}
        .badge-incabin {{ background: #7f1d1d; color: #f87171; }}
        table {{ width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 12px; }}
        th, td {{ padding: 6px 10px; text-align: left; border-bottom: 1px solid #1e293b; }}
        th {{ color: #94a3b8; }}
    </style>
</head>
<body>
    <div class="header">
        <h1>IBVAP Person-on-Vehicle Overlap Audit</h1>
        <p style="color: #94a3b8; margin: 0;">20-Frame Continuous Acceptance Verification on actual CCTV footage (samples/whatsapp_video_2026_09_09_842pm.mp4)</p>
    </div>

    <div class="stats-grid">
        <div class="stat-card">
            <div class="stat-value">{len(sample_frame_indices)}</div>
            <div class="stat-label">Sampled Frames</div>
        </div>
        <div class="stat-card">
            <div class="stat-value">{total_vehicles_detected}</div>
            <div class="stat-label">Total Vehicles Present</div>
        </div>
        <div class="stat-card">
            <div class="stat-value">{total_persons_detected}</div>
            <div class="stat-label">Total Pedestrians Present</div>
        </div>
        <div class="stat-card">
            <div class="stat-value">{total_overlaps_detected}</div>
            <div class="stat-label">Proximity Overlaps (IoP &gt; 15%)</div>
        </div>
        <div class="stat-card">
            <div class="stat-value" style="color: {'#ef4444' if in_cabin_persons_count > 0 else '#10b981'};">{in_cabin_persons_count}</div>
            <div class="stat-label">In-Cabin / Spurious Boxes (IoP &gt; 60%)</div>
        </div>
    </div>

    <div class="frames-container">
"""

    for rec in frame_audit_records:
        badge = '<span class="badge badge-clean">No Overlaps</span>'
        if rec["has_in_cabin"]:
            badge = '<span class="badge badge-incabin">In-Cabin Overlap Detected</span>'
        elif len(rec["overlaps"]) > 0:
            badge = '<span class="badge badge-overlap">Proximity Overlap</span>'

        rows = ""
        for o in rec["overlaps"]:
            status_txt = "In-Cabin Passenger" if o["is_in_cabin"] else "Roadway Proximity"
            rows += f"<tr><td>Ped #{o['person_id']}</td><td>Veh #{o['veh_id']}</td><td>{o['iop']}%</td><td>{status_txt}</td></tr>"

        table_html = f"""
        <table>
            <thead><tr><th>Person ID</th><th>Vehicle ID</th><th>Person Area Overlap</th><th>Category</th></tr></thead>
            <tbody>{rows}</tbody>
        </table>
        """ if rec["overlaps"] else "<p style='color: #64748b; margin: 4px 0;'>No person-vehicle overlap in this frame.</p>"

        html_content += f"""
        <div class="frame-card">
            <div class="frame-header">
                <strong>Frame #{rec['frame_idx']} (t = {rec['timestamp']})</strong>
                {badge}
            </div>
            <img class="frame-img" src="{rec['img_b64']}" alt="Frame {rec['frame_idx']}" />
            <div class="frame-body">
                <div>Vehicles: <strong>{rec['vehicles_count']}</strong> | Pedestrians: <strong>{rec['persons_count']}</strong></div>
                {table_html}
            </div>
        </div>
        """

    html_content += """
    </div>
</body>
</html>
"""

    with open(OUTPUT_HTML, "w", encoding="utf-8") as f:
        f.write(html_content)

    print(f"\n[Audit Complete] Generated 20-frame review sheet: {OUTPUT_HTML}")
    print(f"Stats: {len(sample_frame_indices)} frames audited, {total_vehicles_detected} vehicles, {total_persons_detected} persons, {total_overlaps_detected} proximity overlaps, {in_cabin_persons_count} in-cabin overlaps.")


if __name__ == "__main__":
    run_overlap_audit()
