import os
import re

html_path = "../docs/anpr_review.html"
if not os.path.exists(html_path):
    print("anpr_review.html not found")
    exit(0)

with open(html_path, "r", encoding="utf-8") as f:
    content = f.read()

# Extract all cards
cards = content.split('<div class="card"')
print(f"Total cards found: {len(cards) - 1}")

for idx, card in enumerate(cards[1:], 1):
    t_match = re.search(r"Track #(\d+)\s*\(([^)]+)\)", card)
    p_match = re.search(r'class="plate-text-display">([^<]+)<', card)
    s_match = re.search(r'class="status-badge[^"]*">([^<]+)<', card)
    c_match = re.search(r'OCR Confidence:</span>\s*<span class="meta-value">([^<]+)<', card)
    track_info = f"Track #{t_match.group(1)} ({t_match.group(2)})" if t_match else "Unknown"
    plate_text = p_match.group(1).strip() if p_match else "None"
    status_text = s_match.group(1).strip() if s_match else "Unknown"
    conf_text = c_match.group(1).strip() if c_match else "0%"
    has_plate_crop = "plate-img" in card
    if has_plate_crop or status_text != "Plate not legible at this distance":
        print(f"Card {idx:2d}: {track_info:<25} | Plate: {plate_text:<12} | Conf: {conf_text:<6} | Status: {status_text} | Crop: {has_plate_crop}")
