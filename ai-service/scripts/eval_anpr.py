"""
IBVAP ANPR Evaluation Benchmark
Measures Exact Match %, Character Error Rate (CER %), and Format Validity %
across Indian and Bharat series vehicle license plates.
"""

import os
import sys
import json
import time
import cv2
import numpy as np

# Ensure ai-service root is on sys.path
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
AI_SERVICE_DIR = os.path.dirname(SCRIPT_DIR)
if AI_SERVICE_DIR not in sys.path:
    sys.path.insert(0, AI_SERVICE_DIR)

from app.services.anpr import (
    preprocess_plate_crop,
    PlateValidator,
    ANPRResult,
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


def generate_benchmark_plate_crops(output_dir: str) -> list[dict]:
    """Generates synthetic high-contrast Indian license plate crops for evaluation."""
    os.makedirs(output_dir, exist_ok=True)

    benchmark_samples = [
        {"plate": "DL01AB1234", "type": "standard", "state": "DL"},
        {"plate": "MH12CD5678", "type": "standard", "state": "MH"},
        {"plate": "KA04E9999", "type": "standard", "state": "KA"},
        {"plate": "UP16BC9999", "type": "standard", "state": "UP"},
        {"plate": "HR26DK8821", "type": "standard", "state": "HR"},
        {"plate": "22BH1234AA", "type": "bharat", "state": "BH"},
        {"plate": "TN09AZ4321", "type": "standard", "state": "TN"},
        {"plate": "GJ01XY5555", "type": "standard", "state": "GJ"},
    ]

    generated = []
    for item in benchmark_samples:
        text = item["plate"]
        filename = f"{text}.png"
        filepath = os.path.join(output_dir, filename)

        # Generate a standard Indian HSRP plate image: white background, black bold text, blue IND strip on left
        img_w, img_h = 320, 80
        img = np.ones((img_h, img_w, 3), dtype=np.uint8) * 248  # Off-white

        # Outer border
        cv2.rectangle(img, (2, 2), (img_w - 3, img_h - 3), (30, 30, 30), 2)
        # Blue IND band on left
        cv2.rectangle(img, (4, 4), (32, img_h - 4), (180, 80, 0), -1)  # Blue in BGR
        cv2.putText(img, "IND", (6, 45), cv2.FONT_HERSHEY_SIMPLEX, 0.35, (255, 255, 255), 1, cv2.LINE_AA)

        # Main license text
        font = cv2.FONT_HERSHEY_SIMPLEX
        font_scale = 1.15
        thickness = 3
        # Center text horizontally
        text_size = cv2.getTextSize(text, font, font_scale, thickness)[0]
        tx = max(42, int((img_w - text_size[0] + 30) / 2))
        ty = int((img_h + text_size[1]) / 2) - 2

        cv2.putText(img, text, (tx, ty), font, font_scale, (15, 15, 15), thickness, cv2.LINE_AA)

        # Mild realistic sensor noise
        noise = np.random.normal(0, 4, img.shape).astype(np.uint8)
        img = cv2.add(img, noise)

        cv2.imwrite(filepath, img)
        generated.append({
            "path": filepath,
            "filename": filename,
            "ground_truth": text,
            "type": item["type"],
        })

    return generated


def run_anpr_evaluation(samples_dir: str = os.path.normpath(os.path.join(AI_SERVICE_DIR, "../samples/plates"))):
    print(f"\n=======================================================")
    print(f"      IBVAP ANPR ACCURACY BENCHMARK EVALUATOR          ")
    print(f"=======================================================")

    if not os.path.exists(samples_dir) or len(os.listdir(samples_dir)) == 0:
        print(f"Directory '{samples_dir}' empty or not found. Synthesizing realistic benchmark plates...")
        samples = generate_benchmark_plate_crops(samples_dir)
    else:
        # Load existing images
        samples = []
        for fname in os.listdir(samples_dir):
            if fname.lower().endswith(('.png', '.jpg', '.jpeg')):
                # Extract ground truth from filename without extension
                gt = os.path.splitext(fname)[0].upper().replace(" ", "").replace("-", "")
                samples.append({
                    "path": os.path.join(samples_dir, fname),
                    "filename": fname,
                    "ground_truth": gt,
                })

    print(f"Total benchmark test samples: {len(samples)}\n")

    # Initialize RapidOCR engine
    ocr = None
    try:
        from rapidocr_onnxruntime import RapidOCR
        ocr = RapidOCR()
        print("RapidOCR engine: LOADED (rapidocr_onnxruntime)")
    except Exception as e:
        print(f"Warning: RapidOCR could not be loaded ({e}). Evaluation will test preprocessing pipeline.")

    results = []
    total_gt_chars = 0
    total_edit_distance = 0
    exact_matches = 0
    valid_format_matches = 0
    latencies = []

    for item in samples:
        t0 = time.perf_counter()
        img = cv2.imread(item["path"])
        if img is None:
            continue

        prep = preprocess_plate_crop(img)

        raw_pred = ""
        conf = 0.0

        if ocr is not None:
            try:
                ocr_out, _ = ocr(prep)
                if ocr_out:
                    # Collect text across lines
                    all_text = "".join([line[1] for line in ocr_out])
                    raw_pred = all_text
                    conf = max([float(line[2]) * 100 for line in ocr_out])
            except Exception as ocr_err:
                print(f"OCR error on {item['filename']}: {ocr_err}")

        # Post-processing: clean and apply position-aware correction
        cleaned = PlateValidator.clean_text(raw_pred)
        corrected = PlateValidator.position_aware_correction(cleaned)
        is_valid, ftype, vstatus = PlateValidator.validate(corrected)

        elapsed_ms = (time.perf_counter() - t0) * 1000
        latencies.append(elapsed_ms)

        gt = item["ground_truth"]
        ed = levenshtein_distance(gt, corrected)
        is_exact = (gt == corrected)

        if is_exact:
            exact_matches += 1
        if is_valid:
            valid_format_matches += 1

        total_gt_chars += len(gt)
        total_edit_distance += ed

        results.append({
            "filename": item["filename"],
            "ground_truth": gt,
            "raw_ocr": raw_pred,
            "corrected": corrected,
            "is_exact_match": is_exact,
            "edit_distance": ed,
            "is_valid_format": is_valid,
            "format_type": ftype,
            "confidence": round(conf, 1),
            "latency_ms": round(elapsed_ms, 2),
        })

    num_samples = len(results)
    exact_match_pct = (exact_matches / num_samples * 100) if num_samples > 0 else 0.0
    cer_pct = (total_edit_distance / total_gt_chars * 100) if total_gt_chars > 0 else 0.0
    valid_format_pct = (valid_format_matches / num_samples * 100) if num_samples > 0 else 0.0
    avg_latency = float(np.mean(latencies)) if latencies else 0.0

    print("-" * 78)
    print(f"{'IMAGE':<16} | {'GROUND TRUTH':<12} | {'PREDICTED':<12} | {'MATCH':<5} | {'CER':<4} | {'LATENCY':<8}")
    print("-" * 78)
    for r in results:
        status_str = "PASS" if r["is_exact_match"] else "FAIL"
        print(f"{r['filename'][:16]:<16} | {r['ground_truth']:<12} | {r['corrected']:<12} | {status_str:<5} | {r['edit_distance']:<4} | {r['latency_ms']:.1f}ms")
    print("-" * 78)

    summary = {
        "total_samples": num_samples,
        "exact_matches": exact_matches,
        "exact_match_pct": round(exact_match_pct, 2),
        "total_gt_characters": total_gt_chars,
        "total_character_errors": total_edit_distance,
        "character_error_rate_pct": round(cer_pct, 2),
        "valid_format_pct": round(valid_format_pct, 2),
        "avg_latency_ms": round(avg_latency, 2),
        "results": results,
    }

    print("\nBENCHMARK RESULTS SUMMARY:")
    print(f"  Exact Match Accuracy:      {exact_match_pct:.2f}% ({exact_matches}/{num_samples})")
    print(f"  Character Error Rate (CER): {cer_pct:.2f}% ({total_edit_distance}/{total_gt_chars} errors)")
    print(f"  Valid Format Compliance:   {valid_format_pct:.2f}%")
    print(f"  Average Processing Time:   {avg_latency:.2f} ms per plate")
    print(f"=======================================================\n")

    output_json_path = os.path.join(AI_SERVICE_DIR, "../samples/anpr_eval_results.json")
    with open(output_json_path, "w") as f:
        json.dump(summary, f, indent=2)
    print(f"Evaluation report saved to: {output_json_path}")

    return summary


if __name__ == "__main__":
    run_anpr_evaluation()
