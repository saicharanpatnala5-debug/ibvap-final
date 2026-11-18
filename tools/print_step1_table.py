import json

with open("samples/tracks_diagnosis_summary.json") as f:
    tracks = json.load(f)

# Sort by box area descending
major = sorted(tracks, key=lambda x: (x["box_w"] * x["box_h"]), reverse=True)[:15]

print(f"{'Track ID':<10} | {'Class':<14} | {'Native Box (px)':<16} | {'Norm Bbox':<16} | {'Time':<7} | {'Localized':<11} | {'Scale':<12} | {'OCR Best-Guess':<15} | {'Conf':<6}")
print("-" * 115)
for t in major:
    loc = "YES" if t["best_scale"] != "None" else "NO"
    print(f"Track #{t['track_id']:<4} | {t['class']:<14} | {t['box_w']:>4} x {t['box_h']:<4} px | {t['norm_w']:.3f} x {t['norm_h']:.3f} | {t['timestamp_sec']:>5.1f}s | {loc:<11} | {t['best_scale']:<12} | {t['best_ocr_text']:<15} | {t['confidence']:.1f}%")
