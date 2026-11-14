"""
IBVAP Synthetic License Plate Generator & Benchmark Dataset Builder
Generates 220+ varied synthetic vehicle license plates across 5 difficulty categories:
1. Clean (nominal conditions)
2. Blur (Gaussian & motion blur)
3. Noise (Gaussian & salt-and-pepper sensor noise)
4. Perspective (Affine tilt & spatial perspective distortion)
5. Low-Light (Simulated night, heavy shadow & low contrast)

All outputs are clearly labelled SYNTHETIC in filenames and metadata.
"""

import os
import sys
import csv
import random
import cv2
import numpy as np

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
AI_SERVICE_DIR = os.path.dirname(SCRIPT_DIR)
OUTPUT_DIR = os.path.normpath(os.path.join(AI_SERVICE_DIR, "../samples/synthetic_plates"))

STATES = ["DL", "MH", "KA", "HR", "TN", "UP", "GJ", "WB", "RJ", "AP", "TS", "PB", "KL", "MP", "CH"]
SERIES = ["A", "B", "AB", "CD", "DK", "AZ", "BC", "XY", "GH", "KL", "MN", "PQ", "RS", "EV"]

def generate_random_plate_text() -> str:
    r = random.random()
    if r < 0.15:
        # Bharat Series: 22 BH 1234 AA
        year = random.choice(["21", "22", "23", "24"])
        num = f"{random.randint(1000, 9999)}"
        letters = "".join(random.choices("ABCDEFGHJKLMNPQRSTUVWXYZ", k=2))
        return f"{year}BH{num}{letters}"
    else:
        # Standard: DL 01 AB 1234
        st = random.choice(STATES)
        dist = f"{random.randint(1, 35):02d}"
        s = random.choice(SERIES)
        num = f"{random.randint(1000, 9999)}"
        return f"{st}{dist}{s}{num}"


def render_base_plate(text: str, width: int = 240, height: int = 60) -> np.ndarray:
    """Renders a clean standard license plate with white background, blue IND strip, and black text."""
    img = np.full((height, width, 3), 245, dtype=np.uint8)

    # Blue IND bar on the left
    bar_w = 24
    cv2.rectangle(img, (0, 0), (bar_w, height), (160, 80, 0), -1)  # BGR navy blue
    # Yellow/gold circle on the bar (chakra symbol proxy)
    cv2.circle(img, (bar_w // 2, height // 2), 6, (0, 215, 255), 1)

    # Outer border
    cv2.rectangle(img, (1, 1), (width - 2, height - 2), (20, 20, 20), 2)

    # Format text for visual readability: e.g. "DL 01 AB 1234"
    disp_text = text
    if len(text) >= 9 and not text.startswith(("21", "22", "23", "24")):
        disp_text = f"{text[:2]} {text[2:4]} {text[4:-4]} {text[-4:]}"
    elif text.startswith(("21", "22", "23", "24")) and len(text) >= 10:
        disp_text = f"{text[:2]} BH {text[4:8]} {text[8:]}"

    # Calculate text placement
    font = cv2.FONT_HERSHEY_DUPLEX
    scale = 0.72
    thickness = 2
    (tw, th), baseline = cv2.getTextSize(disp_text, font, scale, thickness)

    # If text exceeds available width, scale down slightly
    available_w = width - bar_w - 12
    if tw > available_w:
        scale = scale * (available_w / tw)
        (tw, th), baseline = cv2.getTextSize(disp_text, font, scale, thickness)

    tx = bar_w + (available_w - tw) // 2
    ty = (height + th) // 2

    # Draw crisp black characters
    cv2.putText(img, disp_text, (tx, ty), font, scale, (15, 15, 15), thickness, cv2.LINE_AA)
    return img


def apply_blur(img: np.ndarray) -> np.ndarray:
    """Applies either Gaussian blur or directional motion blur."""
    mode = random.choice(["gaussian", "motion"])
    if mode == "gaussian":
        ksize = random.choice([3, 5])
        return cv2.GaussianBlur(img, (ksize, ksize), 0)
    else:
        # Motion blur kernel
        size = random.choice([5, 7])
        kernel = np.zeros((size, size))
        kernel[int((size - 1) / 2), :] = np.ones(size)
        kernel = kernel / size
        return cv2.filter2D(img, -1, kernel)


def apply_noise(img: np.ndarray) -> np.ndarray:
    """Applies Gaussian sensor noise or salt-and-pepper artifacts."""
    noisy = img.astype(np.float32)
    # Gaussian noise
    sigma = random.uniform(15.0, 30.0)
    gauss = np.random.normal(0, sigma, img.shape)
    noisy = np.clip(noisy + gauss, 0, 255).astype(np.uint8)

    # Occasional salt-and-pepper speckles
    if random.random() < 0.5:
        num_salt = random.randint(30, 80)
        for _ in range(num_salt):
            y = random.randint(0, img.shape[0] - 1)
            x = random.randint(0, img.shape[1] - 1)
            noisy[y, x] = random.choice([0, 255])
    return noisy


def apply_perspective(img: np.ndarray) -> np.ndarray:
    """Applies perspective tilt and affine geometric distortion."""
    h, w = img.shape[:2]
    # Source points
    pts1 = np.float32([[0, 0], [w, 0], [0, h], [w, h]])

    # Random perspective displacement
    dx1 = random.uniform(5, 20)
    dy1 = random.uniform(2, 10)
    dx2 = random.uniform(5, 20)
    dy2 = random.uniform(2, 10)

    direction = random.choice(["left_skew", "right_skew", "tilt_up", "tilt_down"])
    if direction == "left_skew":
        pts2 = np.float32([[dx1, dy1], [w - 5, 0], [0, h - dy2], [w - dx2, h]])
    elif direction == "right_skew":
        pts2 = np.float32([[5, 0], [w - dx1, dy1], [dx2, h], [w, h - dy2]])
    elif direction == "tilt_up":
        pts2 = np.float32([[dx1, dy1], [w - dx1, dy1], [0, h], [w, h]])
    else:
        pts2 = np.float32([[0, 0], [w, 0], [dx1, h - dy1], [w - dx1, h - dy1]])

    matrix = cv2.getPerspectiveTransform(pts1, pts2)
    warped = cv2.warpPerspective(img, matrix, (w, h), borderMode=cv2.BORDER_REPLICATE)
    return warped


def apply_low_light(img: np.ndarray) -> np.ndarray:
    """Simulates extreme low-light nighttime illumination and shadows."""
    # Darken significantly: luminance scaling
    factor = random.uniform(0.28, 0.45)
    darkened = (img.astype(np.float32) * factor).astype(np.uint8)

    # Add non-uniform shadow gradient
    h, w = img.shape[:2]
    gradient = np.linspace(1.2, 0.6, w).reshape(1, w, 1)
    darkened = np.clip(darkened.astype(np.float32) * gradient, 0, 255).astype(np.uint8)

    # Add slight nighttime sensor noise
    noise = np.random.normal(0, 8.0, img.shape)
    darkened = np.clip(darkened.astype(np.float32) + noise, 0, 255).astype(np.uint8)
    return darkened


def generate_benchmark_dataset(target_count: int = 220):
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    random.seed(42)
    np.random.seed(42)

    categories = ["clean", "blur", "noise", "perspective", "low_light"]
    samples_per_cat = target_count // len(categories)

    dataset_records = []
    generated_plates = set()
    sample_idx = 1

    print(f"\n=======================================================")
    print(f"   IBVAP SYNTHETIC LICENSE PLATE BENCHMARK GENERATOR   ")
    print(f"=======================================================")
    print(f"Target count: {target_count} samples across {len(categories)} categories")

    for cat in categories:
        count_for_cat = samples_per_cat
        print(f"Generating {count_for_cat} samples for category: [{cat.upper()}] ...")

        for _ in range(count_for_cat):
            # Unique plate string
            while True:
                plate = generate_random_plate_text()
                if plate not in generated_plates:
                    generated_plates.add(plate)
                    break

            base_img = render_base_plate(plate)

            if cat == "clean":
                final_img = base_img
            elif cat == "blur":
                final_img = apply_blur(base_img)
            elif cat == "noise":
                final_img = apply_noise(base_img)
            elif cat == "perspective":
                final_img = apply_perspective(base_img)
            elif cat == "low_light":
                final_img = apply_low_light(base_img)
            else:
                final_img = base_img

            filename = f"SYNTHETIC_{sample_idx:03d}_{cat}_{plate}.png"
            filepath = os.path.join(OUTPUT_DIR, filename)
            cv2.imwrite(filepath, final_img)

            dataset_records.append({
                "filename": filename,
                "ground_truth": plate,
                "category": cat,
                "is_synthetic": True,
            })
            sample_idx += 1

    # Save manifest labels.csv
    labels_csv_path = os.path.join(OUTPUT_DIR, "labels.csv")
    with open(labels_csv_path, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=["filename", "ground_truth", "category", "is_synthetic"])
        writer.writeheader()
        writer.writerows(dataset_records)

    print(f"\nSuccessfully generated {len(dataset_records)} SYNTHETIC plate samples.")
    print(f"Dataset directory: {OUTPUT_DIR}")
    print(f"Manifest labels:   {labels_csv_path}")
    print(f"=======================================================\n")
    return labels_csv_path


if __name__ == "__main__":
    generate_benchmark_dataset(target_count=220)
