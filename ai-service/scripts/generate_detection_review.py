"""
IBVAP Real Footage Detection Quality Review Generator (Round 4)
Samples 40 frames across the two real clips (20 day, 20 night),
runs object detection with Indian traffic classification & two-wheeler fusion,
draws bounding boxes and metadata, and generates a visual audit grid in 'docs/detection_review.html'.
"""

import os
import sys
import base64
import random
import cv2
import numpy as np
from collections import Counter

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
AI_SERVICE_DIR = os.path.dirname(SCRIPT_DIR)
ROOT_DIR = os.path.dirname(AI_SERVICE_DIR)
SAMPLES_DIR = os.path.join(ROOT_DIR, "samples")
DOCS_DIR = os.path.join(ROOT_DIR, "docs")

if AI_SERVICE_DIR not in sys.path:
    sys.path.insert(0, AI_SERVICE_DIR)

from app.services.detector import SurveillanceDetector
from app.services.low_light import compute_frame_luminance, apply_clahe_enhancement


CLASS_COLORS = {
    "pedestrian": (255, 180, 50),     # Sky Blue (BGR: 50, 180, 255)
    "two-wheeler": (230, 80, 180),    # Violet / Pink
    "three-wheeler": (30, 215, 255),  # Yellow/Gold
    "car": (80, 220, 80),             # Emerald Green
    "truck/bus": (50, 130, 255),      # Orange
    "backpack": (160, 160, 160),      # Grey
    "handbag": (160, 160, 160),
    "suitcase": (160, 160, 160),
}


def draw_detection_overlay(img_bgr: np.ndarray, entities: list) -> np.ndarray:
    annotated = img_bgr.copy()
    h, w = annotated.shape[:2]

    for ent in entities:
        cls_name = ent.class_name
        color = CLASS_COLORS.get(cls_name, (200, 200, 200))
        bx = int(ent.bbox.x * w)
        by = int(ent.bbox.y * h)
        bw = int(ent.bbox.width * w)
        bh = int(ent.bbox.height * h)

        x1, y1 = max(0, bx), max(0, by)
        x2, y2 = min(w, bx + bw), min(h, by + bh)

        # Draw bounding box
        cv2.rectangle(annotated, (x1, y1), (x2, y2), color, 2)

        # Label tag
        tag = f"#{ent.id} {cls_name.upper()} {ent.confidence}%"
        if ent.anpr and ent.anpr.plateText:
            tag += f" [{ent.anpr.plateText}]"

        font_scale = 0.50
        thickness = 1
        (tw, th), baseline = cv2.getTextSize(tag, cv2.FONT_HERSHEY_SIMPLEX, font_scale, thickness)

        ty1 = max(0, y1 - th - 6)
        ty2 = y1
        tx1 = x1
        tx2 = min(w, x1 + tw + 8)

        cv2.rectangle(annotated, (tx1, ty1), (tx2, ty2), color, -1)
        cv2.putText(
            annotated,
            tag,
            (tx1 + 4, ty2 - 4),
            cv2.FONT_HERSHEY_SIMPLEX,
            font_scale,
            (10, 15, 25),
            thickness,
            cv2.LINE_AA,
        )

    return annotated


def frame_to_base64(img_bgr: np.ndarray, quality: int = 85) -> str:
    success, buffer = cv2.imencode(".jpg", img_bgr, [int(cv2.IMWRITE_JPEG_QUALITY), quality])
    if not success:
        return ""
    b64 = base64.b64encode(buffer).decode("utf-8")
    return f"data:image/jpeg;base64,{b64}"


def run_detection_review():
    os.makedirs(DOCS_DIR, exist_ok=True)
    print(f"\n=======================================================")
    print(f"    IBVAP REAL FOOTAGE DETECTION REVIEW GENERATOR     ")
    print(f"=======================================================")

    detector = SurveillanceDetector()

    video_files = [
        f for f in sorted(os.listdir(SAMPLES_DIR))
        if f.lower().endswith(('.mp4', '.avi', '.mov', '.mkv'))
    ]

    if not video_files:
        print(f"No video files found in {SAMPLES_DIR}")
        return

    random.seed(42)  # Deterministic 40 sample frames across runs
    samples_per_video = max(1, 40 // len(video_files))

    review_cards = []
    class_counter = Counter()
    total_detections = 0

    for vid_name in video_files:
        vid_path = os.path.join(SAMPLES_DIR, vid_name)
        cap = cv2.VideoCapture(vid_path)
        if not cap.isOpened():
            continue

        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        fps = cap.get(cv2.CAP_PROP_FPS) or 30.0

        # Sample 20 frames spaced evenly across the clip
        step = max(1, total_frames // (samples_per_video + 2))
        target_indices = [step * (i + 1) for i in range(samples_per_video)]
        target_indices = [idx for idx in target_indices if idx < total_frames]

        print(f"Processing '{vid_name}' ({total_frames} frames, {fps:.1f} fps) - sampling {len(target_indices)} frames...")

        detector.reset()
        current_frame = 0

        while cap.isOpened() and target_indices:
            ret, frame = cap.read()
            if not ret or frame is None:
                break
            current_frame += 1

            if current_frame in target_indices:
                t_sec = current_frame / fps
                lum = compute_frame_luminance(frame)
                proc_frame = apply_clahe_enhancement(frame) if ("842" in vid_name or lum < 60) else frame

                entities, _ = detector.process_frame(proc_frame, timestamp_sec=t_sec)

                annotated = draw_detection_overlay(frame, entities)
                img_b64 = frame_to_base64(annotated, quality=82)

                frame_classes = [e.class_name for e in entities]
                for c in frame_classes:
                    class_counter[c] += 1
                total_detections += len(entities)

                minutes = int(t_sec // 60)
                seconds = t_sec % 60
                time_str = f"{minutes:02d}:{seconds:04.1f}s"

                review_cards.append({
                    "video": vid_name,
                    "frame_idx": current_frame,
                    "timestamp_str": time_str,
                    "entities_count": len(entities),
                    "classes": Counter(frame_classes),
                    "image_b64": img_b64,
                })

                target_indices.remove(current_frame)

        cap.release()

    print(f"\n================ DETECTION AUDIT METRICS ================")
    print(f"Total Sampled Frames: {len(review_cards)}")
    print(f"Total Detections:     {total_detections}")
    print(f"Average Detections/Frame: {total_detections / max(1, len(review_cards)):.2f}")
    print(f"Class Breakdown:")
    for cls, cnt in class_counter.most_common():
        print(f"  {cls:<16}: {cnt}")
    print(f"=========================================================\n")

    # Generate HTML cards
    cards_html = []
    for idx, c in enumerate(review_cards, 1):
        class_pills = " ".join([
            f'<span class="cls-pill">{cls}: {cnt}</span>'
            for cls, cnt in c["classes"].items()
        ]) or '<span class="cls-pill no-det">No detections</span>'

        card = f"""
        <div class="card">
          <div class="card-header">
            <span class="card-title">Frame #{c['frame_idx']} ({c['timestamp_str']})</span>
            <span class="card-badge">{c['entities_count']} targets</span>
          </div>
          <div class="img-container">
            <img class="review-img" src="{c['image_b64']}" alt="Frame {c['frame_idx']}" />
          </div>
          <div class="card-footer">
            <div class="footer-meta">
              <span class="source-label">{c['video']}</span>
            </div>
            <div class="pills-container">
              {class_pills}
            </div>
          </div>
        </div>
        """
        cards_html.append(card)

    stats_html = "".join([
        f'<div class="stat-box"><span class="stat-num">{cnt}</span><span class="stat-name">{cls.upper()}</span></div>'
        for cls, cnt in class_counter.most_common()
    ])

    full_html = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>IBVAP Real Footage Detection Quality Review Sheet</title>
  <style>
    :root {{
      --bg: #0b0f19;
      --card-bg: #111827;
      --card-border: #1e293b;
      --text: #f8fafc;
      --text-muted: #94a3b8;
      --accent: #38bdf8;
    }}
    * {{ box-sizing: border-box; margin: 0; padding: 0; }}
    body {{
      background-color: var(--bg);
      color: var(--text);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      padding: 32px 24px;
    }}
    .header {{
      max-width: 1440px;
      margin: 0 auto 32px auto;
      padding-bottom: 24px;
      border-bottom: 1px solid var(--card-border);
    }}
    .title {{ font-size: 24px; font-weight: 700; color: var(--accent); margin-bottom: 8px; }}
    .subtitle {{ color: var(--text-muted); font-size: 14px; margin-bottom: 20px; }}
    .stats-bar {{
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
      gap: 12px;
    }}
    .stat-box {{
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 6px;
      padding: 12px 16px;
      display: flex;
      flex-direction: column;
    }}
    .stat-num {{ font-size: 24px; font-weight: 700; color: #38bdf8; font-family: ui-monospace, monospace; }}
    .stat-name {{ font-size: 11px; color: var(--text-muted); text-transform: uppercase; margin-top: 4px; }}
    .grid {{
      max-width: 1440px;
      margin: 0 auto;
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(460px, 1fr));
      gap: 24px;
    }}
    .card {{
      background: var(--card-bg);
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
      padding: 10px 14px;
      background: rgba(15, 23, 42, 0.5);
      border-bottom: 1px solid var(--card-border);
    }}
    .card-title {{ font-size: 13px; font-weight: 600; color: #e2e8f0; }}
    .card-badge {{
      font-size: 11px;
      font-weight: 600;
      padding: 2px 8px;
      background: rgba(56, 189, 248, 0.15);
      color: #38bdf8;
      border: 1px solid rgba(56, 189, 248, 0.3);
      border-radius: 4px;
    }}
    .img-container {{
      width: 100%;
      height: 270px;
      background: #030712;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
    }}
    .review-img {{
      width: 100%;
      height: 100%;
      object-fit: contain;
    }}
    .card-footer {{
      padding: 12px 14px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }}
    .footer-meta {{
      display: flex;
      justify-content: space-between;
      font-size: 11px;
      color: var(--text-muted);
    }}
    .pills-container {{
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }}
    .cls-pill {{
      font-size: 10px;
      font-weight: 600;
      padding: 2px 7px;
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 4px;
      text-transform: uppercase;
      font-family: ui-monospace, monospace;
      color: #94a3b8;
    }}
    .cls-pill.no-det {{
      color: #64748b;
      border-style: dashed;
    }}
  </style>
</head>
<body>
  <div class="header">
    <div class="title">IBVAP Real Footage Detection Quality Review Sheet</div>
    <div class="subtitle">40 sample frames across day and night footage with Indian traffic classification, two-wheeler rider fusion, and three-wheeler heuristics.</div>
    <div class="stats-bar">
      <div class="stat-box">
        <span class="stat-num">{len(review_cards)}</span>
        <span class="stat-name">Frames Sampled</span>
      </div>
      <div class="stat-box">
        <span class="stat-num">{total_detections}</span>
        <span class="stat-name">Total Detections</span>
      </div>
      {stats_html}
    </div>
  </div>

  <div class="grid">
    {"".join(cards_html)}
  </div>
</body>
</html>"""

    out_file = os.path.join(DOCS_DIR, "detection_review.html")
    with open(out_file, "w", encoding="utf-8") as f:
        f.write(full_html)

    print(f"Detection Review Sheet successfully saved to: {out_file}\n")


if __name__ == "__main__":
    run_detection_review()
