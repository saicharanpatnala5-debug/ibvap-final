import cv2
import numpy as np
from app.models.schemas import EntityAppearance

COLOR_HEX_MAP = {
    "Black": "#18181B",
    "Dark": "#27272A",
    "White": "#F4F4F5",
    "Silver": "#D4D4D8",
    "Grey": "#71717A",
    "Red": "#EF4444",
    "Orange": "#F97316",
    "Yellow": "#EAB308",
    "Green": "#22C55E",
    "Cyan": "#06B6D4",
    "Blue": "#3B82F6",
    "Navy Blue": "#1E3A8A",
    "Purple": "#A855F7",
    "Brown": "#78350F",
}


def extract_entity_appearance(crop_bgr: np.ndarray, object_class: str) -> EntityAppearance:
    """
    Computes dominant appearance color and description from an HSV histogram of the cropped entity.
    For 'person': samples upper body (chest/torso clothing).
    For vehicles: samples body panel region, excluding tires and windows.
    """
    if crop_bgr is None or crop_bgr.size == 0 or crop_bgr.shape[0] < 4 or crop_bgr.shape[1] < 4:
        return EntityAppearance(
            primaryColor="Unknown",
            colorHex="#71717A",
            clothingDescription="Unknown clothing",
            vehicleTypeDescription=f"Unknown {object_class}",
        )

    h, w = crop_bgr.shape[:2]

    # Target region selection based on class
    if object_class == "person":
        # Upper body (torso): y from 15% to 55%
        y1, y2 = int(h * 0.15), int(h * 0.55)
        x1, x2 = int(w * 0.15), int(w * 0.85)
    else:
        # Vehicles: central body (exclude glass/roof and tires)
        y1, y2 = int(h * 0.25), int(h * 0.80)
        x1, x2 = int(w * 0.10), int(w * 0.90)

    target_crop = crop_bgr[y1:y2, x1:x2] if y2 > y1 and x2 > x1 else crop_bgr

    # Convert to HSV
    hsv = cv2.cvtColor(target_crop, cv2.COLOR_BGR2HSV)
    h_chan, s_chan, v_chan = cv2.split(hsv)

    mean_s = np.mean(s_chan)
    mean_v = np.mean(v_chan)

    # 1. Grayscale / Achromatic classification based on Saturation and Value
    if mean_v < 48:
        primary = "Black"
    elif mean_s < 38 and mean_v > 190:
        primary = "White"
    elif mean_s < 45 and mean_v >= 140:
        primary = "Silver"
    elif mean_s < 45:
        primary = "Grey"
    else:
        # 2. Chromatic hue classification
        # Histogram across 8 color bins
        hist, _ = np.histogram(h_chan, bins=8, range=(0, 180))
        dominant_bin = int(np.argmax(hist))

        # Hue ranges in OpenCV (0-179):
        # 0: 0-22 (Red/Orange)
        # 1: 22-45 (Orange/Yellow)
        # 2: 45-67 (Green)
        # 3: 67-90 (Cyan/Green)
        # 4: 90-112 (Cyan/Blue)
        # 5: 112-135 (Blue)
        # 6: 135-157 (Purple/Violet)
        # 7: 157-180 (Pink/Red)
        bin_names = [
            "Red",
            "Yellow",
            "Green",
            "Cyan",
            "Blue",
            "Blue",
            "Purple",
            "Red",
        ]
        primary = bin_names[dominant_bin]
        if primary == "Blue" and mean_v < 90:
            primary = "Navy Blue"

    color_hex = COLOR_HEX_MAP.get(primary, "#3B82F6")

    # Generate human-readable descriptions matching UI format
    if object_class == "person":
        clothing_desc = f"{primary} top / clothing"
        vehicle_desc = None
    else:
        clothing_desc = None
        vehicle_desc = f"{primary} {object_class}"

    # Normalized 8-bin histogram for feature matching / Re-ID
    hist_norm, _ = np.histogram(h_chan, bins=8, range=(0, 180), density=True)
    color_hist = [float(round(v, 4)) for v in hist_norm.tolist()]

    return EntityAppearance(
        primaryColor=primary,
        colorHex=color_hex,
        clothingDescription=clothing_desc,
        vehicleTypeDescription=vehicle_desc,
        colorHist=color_hist,
    )
