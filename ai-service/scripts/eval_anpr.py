"""
IBVAP ANPR Comprehensive Benchmark Evaluator
Evaluates RapidOCR + post-processing on the 220+ synthetic license plate dataset
(Clean, Blur, Noise, Perspective, Low-Light) and outputs detailed metrics:
- Exact Match %
- Character Error Rate (CER %)
- Format Validity %
- Category-wise Breakdown
- Inference Latency (ms)
"""

import os
import sys
import csv
import json
import time
import cv2
import numpy as np

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
AI_SERVICE_DIR = os.path.dirname(SCRIPT_DIR)
ROOT_DIR = os.path.dirname(AI_SERVICE_DIR)
SYNTHETIC_DIR = os.path.join(ROOT_DIR, "samples/synthetic_plates")
OUTPUT_JSON = os.path.join(ROOT_DIR, "samples/anpr_synthetic_benchmark.json")

if AI_SERVICE_DIR not in sys.path:
    sys.path.insert(0, AI_SERVICE_DIR)

from app.services.anpr import (
    preprocess_plate_crop,
    PlateValidator,
)


def levenshtein_distance(s1: str, s2: str) -> int:
    """Computes Levenshtein edit distance between two strings."""
    if len(s1) < len(s2):
        return levenshtein_distance(s2, s1)
    if len(s2) == 0:
        return len(s1)

    previous_row = range(len(s2) + 1)
    for i, c1 in enumerate(s1):
        current_row = [i + 1]
        for j, c2 in enumerate(s2):
            insertions = previous_row[j + 1] + 1
            deletions = current_row[j] + 1
            substitutions = previous_row[j] + (c1 != c2)
            current_row.append(min(insertions, deletions, substitutions))
        previous_row = current_row

    return previous_row[-1]


def run_synthetic_anpr_benchmark():
    print(f"\n=======================================================")
    print(f"   IBVAP 220-SAMPLE SYNTHETIC ANPR BENCHMARK EVALUATOR  ")
    print(f"=======================================================")

    labels_csv = os.path.join(SYNTHETIC_DIR, "labels.csv")
    if not os.path.exists(labels_csv):
        print(f"Synthetic dataset not found at {SYNTHETIC_DIR}. Generating now...")
        from generate_synthetic_plates import generate_benchmark_dataset
        generate_benchmark_dataset(target_count=220)

    # Load records from labels.csv
    records = []
    with open(labels_csv, "r", newline="") as f:
        reader = csv.DictReader(f)
        for row in reader:
            records.append(row)

    print(f"Loaded {len(records)} SYNTHETIC plate benchmark samples.\n")

    # Initialize RapidOCR engine
    ocr = None
    try:
        from rapidocr_onnxruntime import RapidOCR
        ocr = RapidOCR()
        print("RapidOCR engine: LOADED (rapidocr_onnxruntime)")
    except Exception as e:
        print(f"Error loading RapidOCR: {e}")
        return

    # Category trackers: category -> { "total": n, "exact": n, "valid": n, "total_ed": n, "total_chars": n, "latencies": [] }
    cat_stats = {}
    total_samples = len(records)
    overall_exact = 0
    overall_valid = 0
    overall_ed = 0
    overall_chars = 0
    all_latencies = []

    print(f"Running OCR evaluation across all 220 samples...")

    for idx, rec in enumerate(records, 1):
        cat = rec["category"]
        gt = rec["ground_truth"].upper().replace(" ", "").replace("-", "")
        img_path = os.path.join(SYNTHETIC_DIR, rec["filename"])

        if cat not in cat_stats:
            cat_stats[cat] = {
                "total": 0,
                "exact": 0,
                "valid": 0,
                "total_ed": 0,
                "total_chars": 0,
                "latencies": [],
            }

        img = cv2.imread(img_path)
        if img is None:
            continue

        t0 = time.perf_counter()
        prep = preprocess_plate_crop(img)

        raw_pred = ""
        try:
            ocr_out, _ = ocr(prep)
            if ocr_out:
                raw_pred = "".join([line[1] for line in ocr_out])
        except Exception:
            pass

        cleaned = PlateValidator.clean_text(raw_pred)
        corrected = PlateValidator.position_aware_correction(cleaned)
        is_valid, ftype, vstatus = PlateValidator.validate(corrected)

        elapsed_ms = (time.perf_counter() - t0) * 1000
        all_latencies.append(elapsed_ms)

        ed = levenshtein_distance(gt, corrected)
        is_exact = (gt == corrected)

        cat_stats[cat]["total"] += 1
        cat_stats[cat]["latencies"].append(elapsed_ms)
        cat_stats[cat]["total_chars"] += len(gt)
        cat_stats[cat]["total_ed"] += ed
        if is_exact:
            cat_stats[cat]["exact"] += 1
            overall_exact += 1
        if is_valid:
            cat_stats[cat]["valid"] += 1
            overall_valid += 1

        overall_ed += ed
        overall_chars += len(gt)

    overall_exact_pct = (overall_exact / total_samples) * 100.0 if total_samples else 0.0
    overall_cer_pct = (overall_ed / overall_chars) * 100.0 if overall_chars else 0.0
    overall_valid_pct = (overall_valid / total_samples) * 100.0 if total_samples else 0.0
    avg_latency = float(np.mean(all_latencies)) if all_latencies else 0.0

    print("\n" + "=" * 80)
    print(f"{'Category':<16} | {'Samples':<8} | {'Exact Match %':<15} | {'CER %':<10} | {'Format Valid %':<16} | {'Latency':<8}")
    print("-" * 80)

    category_results = {}
    for cat, s in sorted(cat_stats.items()):
        cat_exact_pct = (s["exact"] / s["total"]) * 100.0 if s["total"] else 0.0
        cat_cer_pct = (s["total_ed"] / s["total_chars"]) * 100.0 if s["total_chars"] else 0.0
        cat_valid_pct = (s["valid"] / s["total"]) * 100.0 if s["total"] else 0.0
        cat_lat = float(np.mean(s["latencies"])) if s["latencies"] else 0.0

        category_results[cat] = {
            "samples": s["total"],
            "exact_matches": s["exact"],
            "exact_match_pct": round(cat_exact_pct, 2),
            "cer_pct": round(cat_cer_pct, 2),
            "format_valid_pct": round(cat_valid_pct, 2),
            "avg_latency_ms": round(cat_lat, 2),
        }

        print(
            f"{cat.upper():<16} | {s['total']:<8} | {cat_exact_pct:>13.2f}% | "
            f"{cat_cer_pct:>8.2f}% | {cat_valid_pct:>14.2f}% | {cat_lat:>6.1f}ms"
        )

    print("=" * 80)
    print(
        f"{'OVERALL SYNTHETIC':<16} | {total_samples:<8} | {overall_exact_pct:>13.2f}% | "
        f"{overall_cer_pct:>8.2f}% | {overall_valid_pct:>14.2f}% | {avg_latency:>6.1f}ms"
    )
    print("=" * 80 + "\n")

    summary_payload = {
        "dataset": "synthetic_plates_220",
        "is_synthetic": True,
        "timestamp": int(time.time()),
        "total_samples": total_samples,
        "overall_exact_match_pct": round(overall_exact_pct, 2),
        "overall_cer_pct": round(overall_cer_pct, 2),
        "overall_format_valid_pct": round(overall_valid_pct, 2),
        "avg_latency_ms": round(avg_latency, 2),
        "category_breakdown": category_results,
    }

    with open(OUTPUT_JSON, "w") as f:
        json.dump(summary_payload, f, indent=2)

    print(f"Results saved to: {OUTPUT_JSON}\n")
    return summary_payload


if __name__ == "__main__":
    run_synthetic_anpr_benchmark()
