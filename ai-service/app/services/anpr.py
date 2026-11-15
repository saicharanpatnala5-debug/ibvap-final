import re
import cv2
import numpy as np
import time
from typing import Optional, List, Dict
from collections import Counter
from app.models.schemas import ANPRResult

# Standard Indian License Plate Format: State Code (2) + District/RTO (1-2) + Series (1-3) + Number (4)
# Example: DL01AB1234, MH12CD5678, KA04E9999
STANDARD_PLATE_REGEX = re.compile(r"^[A-Z]{2}[0-9]{1,2}[A-Z]{1,3}[0-9]{4}$")

# Bharat (BH) Series Format: Year (2) + BH (2) + Number (4) + Series (1-2)
# Example: 22BH1234AA
BHARAT_SERIES_REGEX = re.compile(r"^[0-9]{2}BH[0-9]{4}[A-Z]{1,2}$")

VALID_STATE_CODES = {
    "AN", "AP", "AR", "AS", "BR", "CG", "CH", "DD", "DL", "DN", "DNH", "GA",
    "GJ", "HP", "HR", "JH", "JK", "KA", "KL", "LA", "LD", "MH", "ML", "MN",
    "MP", "MZ", "NL", "OD", "PB", "PY", "RJ", "SK", "TN", "TR", "TS", "TG",
    "UK", "UP", "WB"
}

# OCR character ambiguity maps
DIGIT_TO_LETTER = {
    '0': 'O', '1': 'I', '2': 'Z', '3': 'E', '4': 'A',
    '5': 'S', '6': 'G', '8': 'B', '9': 'P'
}

LETTER_TO_DIGIT = {
    'O': '0', 'D': '0', 'Q': '0', 'I': '1', 'L': '1',
    'Z': '2', 'E': '3', 'A': '4', 'S': '5', 'G': '6',
    'T': '7', 'B': '8', 'P': '9'
}


class PlateValidator:
    @staticmethod
    def clean_text(raw: str) -> str:
        """Strip all non-alphanumeric characters and uppercase."""
        return re.sub(r"[^A-Z0-9]", "", raw.upper())

    @staticmethod
    def position_aware_correction(candidate: str) -> str:
        """
        Applies position-aware OCR ambiguity resolution for Indian vehicle plates.
        Handles standard format (SS DD LLL NNNN) and Bharat series (YY BH NNNN LL).
        """
        text = candidate.strip().upper()
        if len(text) < 8 or len(text) > 11:
            return text

        chars = list(text)

        # Check Bharat series candidate: e.g. 22BH1234AA
        if len(chars) >= 9 and "".join(chars[2:4]) in ["BH", "8H", "BI", "B1", "0H"]:
            # Pos 0-1: Digits (Year)
            chars[0] = LETTER_TO_DIGIT.get(chars[0], chars[0])
            chars[1] = LETTER_TO_DIGIT.get(chars[1], chars[1])
            # Pos 2-3: 'BH'
            chars[2] = 'B'
            chars[3] = 'H'
            # Pos 4-7: 4 Digits
            for i in range(4, min(8, len(chars))):
                chars[i] = LETTER_TO_DIGIT.get(chars[i], chars[i])
            # Pos 8+: Letters
            for i in range(8, len(chars)):
                chars[i] = DIGIT_TO_LETTER.get(chars[i], chars[i])
            corrected = "".join(chars)
            if BHARAT_SERIES_REGEX.match(corrected):
                return corrected

        # Standard Series: State (2 letters) + RTO (1-2 digits) + Series (1-3 letters) + Number (4 digits)
        # 1. State Prefix: Pos 0 and 1 must be letters
        chars[0] = DIGIT_TO_LETTER.get(chars[0], chars[0])
        chars[1] = DIGIT_TO_LETTER.get(chars[1], chars[1])

        # If prefix isn't a known state, attempt single-character nearest correction
        prefix = "".join(chars[:2])
        if prefix not in VALID_STATE_CODES:
            for valid_code in VALID_STATE_CODES:
                if len(valid_code) == 2 and (valid_code[0] == prefix[0] or valid_code[1] == prefix[1]):
                    # Common substitution: e.g. '0L' -> 'DL', '8R' -> 'BR', '1K' -> 'JK'
                    if (prefix[0] in '0DO' and valid_code[0] == 'D') or \
                       (prefix[0] in '8B' and valid_code[0] == 'B') or \
                       (prefix[0] in '1I' and valid_code[0] in ['J', 'I']):
                        chars[0] = valid_code[0]
                        chars[1] = valid_code[1]
                        break

        # 2. Last 4 characters must be digits (Vehicle Number)
        n = len(chars)
        for i in range(max(2, n - 4), n):
            chars[i] = LETTER_TO_DIGIT.get(chars[i], chars[i])

        # 3. Middle section: RTO digits (usually 2) then Series letters (1-3)
        # Example: DL 01 AB 1234 (len 10) -> chars[2:4] are digits, chars[4:6] are letters
        if n == 10:
            chars[2] = LETTER_TO_DIGIT.get(chars[2], chars[2])
            chars[3] = LETTER_TO_DIGIT.get(chars[3], chars[3])
            chars[4] = DIGIT_TO_LETTER.get(chars[4], chars[4])
            chars[5] = DIGIT_TO_LETTER.get(chars[5], chars[5])
        elif n == 9:
            chars[2] = LETTER_TO_DIGIT.get(chars[2], chars[2])
            chars[3] = LETTER_TO_DIGIT.get(chars[3], chars[3])
            chars[4] = DIGIT_TO_LETTER.get(chars[4], chars[4])

        return "".join(chars)

    @staticmethod
    def validate(cleaned: str) -> tuple[bool, str, str]:
        """Returns (is_valid, format_type, status_string)."""
        if not cleaned or len(cleaned) < 8 or len(cleaned) > 11:
            return False, "invalid", "Unreadable"

        # Check Bharat (BH) series
        if BHARAT_SERIES_REGEX.match(cleaned):
            return True, "bharat", "Valid format"

        # Check Standard State series
        if STANDARD_PLATE_REGEX.match(cleaned):
            state_code = cleaned[:2]
            if state_code in VALID_STATE_CODES:
                return True, "standard", "Valid format"
            return False, "invalid", "Low confidence - needs review"

        return False, "invalid", "Low confidence - needs review"


def locate_plate_contour_fallback(vehicle_crop_bgr: np.ndarray) -> np.ndarray:
    """
    Fallback plate localizer: searches for rectangular license plate contours
    in the lower half of the vehicle bounding box (aspect ratio 2.0 to 5.5).
    """
    if vehicle_crop_bgr is None or vehicle_crop_bgr.size == 0:
        return vehicle_crop_bgr

    vh, vw = vehicle_crop_bgr.shape[:2]
    # Restrict search to lower 55% of the vehicle
    y_start = int(vh * 0.45)
    lower_crop = vehicle_crop_bgr[y_start:, :]
    lh, lw = lower_crop.shape[:2]

    if lh < 20 or lw < 40:
        return vehicle_crop_bgr

    gray = cv2.cvtColor(lower_crop, cv2.COLOR_BGR2GRAY)
    blurred = cv2.bilateralFilter(gray, 9, 75, 75)

    # Morphological gradient to emphasize high-contrast plate boundary edges
    rect_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (17, 3))
    morph = cv2.morphologyEx(blurred, cv2.MORPH_CLOSE, rect_kernel)
    edges = cv2.Canny(morph, 60, 180)

    contours, _ = cv2.findContours(edges, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    best_candidate = None
    max_score = -1.0

    total_area = float(vh * vw)

    for cnt in contours:
        x, y, w, h = cv2.boundingRect(cnt)
        if h <= 0 or w <= 0:
            continue

        aspect_ratio = float(w) / float(h)
        area = float(w * h)

        # License plate aspect ratio is typically 2.0 to 5.5
        if 2.0 <= aspect_ratio <= 5.5 and (0.005 * total_area) <= area <= (0.25 * total_area):
            # Rectangularity score
            extent = area / float(cv2.contourArea(cnt) + 1e-5)
            # Center proximity bonus (plates are generally horizontally centered on vehicles)
            cx = x + w / 2.0
            center_penalty = abs(cx - (lw / 2.0)) / (lw / 2.0)
            score = (area / total_area) * (1.0 - 0.4 * center_penalty)

            if score > max_score:
                max_score = score
                # Add 12% padding around plate
                pad_x = int(w * 0.12)
                pad_y = int(h * 0.15)
                px1 = max(0, x - pad_x)
                py1 = max(0, y - pad_y)
                px2 = min(lw, x + w + pad_x)
                py2 = min(lh, y + h + pad_y)
                best_candidate = lower_crop[py1:py2, px1:px2]

    if best_candidate is not None and best_candidate.size > 0:
        return best_candidate

    # Default heuristic: lower 35% horizontally centered
    def_y1 = int(vh * 0.65)
    def_y2 = int(vh * 0.98)
    def_x1 = int(vw * 0.15)
    def_x2 = int(vw * 0.85)
    if def_y2 > def_y1 and def_x2 > def_x1:
        return vehicle_crop_bgr[def_y1:def_y2, def_x1:def_x2]
    return vehicle_crop_bgr


def deskew_plate(gray_crop: np.ndarray) -> np.ndarray:
    """Deskew plate image if rotation angle is between -25 and +25 degrees."""
    try:
        coords = np.column_stack(np.where(gray_crop < 128))
        if len(coords) < 50:
            return gray_crop
        angle = cv2.minAreaRect(coords)[-1]
        if angle < -45:
            angle = -(90 + angle)
        else:
            angle = -angle

        if 1.0 <= abs(angle) <= 25.0:
            h, w = gray_crop.shape[:2]
            center = (w // 2, h // 2)
            M = cv2.getRotationMatrix2D(center, angle, 1.0)
            return cv2.warpAffine(gray_crop, M, (w, h), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE)
    except Exception:
        pass
    return gray_crop


def preprocess_plate_crop(plate_crop_bgr: np.ndarray) -> np.ndarray:
    """
    Enhanced plate preprocessor:
    1. 3x Cubic Upscaling
    2. Border padding for edge characters
    3. CLAHE luminance normalization
    4. Unsharp masking for character sharpness
    5. Deskewing
    """
    if plate_crop_bgr is None or plate_crop_bgr.size == 0:
        return plate_crop_bgr

    # 1. 3.0x Cubic Upscale
    h, w = plate_crop_bgr.shape[:2]
    scale = 3.0
    resized = cv2.resize(
        plate_crop_bgr,
        (int(w * scale), int(h * scale)),
        interpolation=cv2.INTER_CUBIC,
    )

    # 2. Add border padding so edge characters are not clipped
    padded = cv2.copyMakeBorder(resized, 12, 12, 12, 12, cv2.BORDER_REPLICATE)

    # 3. Grayscale conversion & CLAHE
    gray = cv2.cvtColor(padded, cv2.COLOR_BGR2GRAY)
    clahe = cv2.createCLAHE(clipLimit=2.5, tileGridSize=(8, 8))
    enhanced = clahe.apply(gray)

    # 4. Mild Unsharp Mask to sharpen stroke edges
    blurred = cv2.GaussianBlur(enhanced, (0, 0), sigmaX=1.5)
    sharpened = cv2.addWeighted(enhanced, 1.4, blurred, -0.4, 0)

    # 5. Deskew
    deskewed = deskew_plate(sharpened)

    return deskewed


def compute_crop_sharpness(img: np.ndarray) -> float:
    """Computes focus sharpness metric using Laplacian variance."""
    if img is None or img.size == 0:
        return 0.0
    if len(img.shape) == 3:
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    else:
        gray = img
    return float(cv2.Laplacian(gray, cv2.CV_64F).var())


class PlateVotingTracker:
    """
    Multi-frame ANPR accumulator with:
    - Top-K sharpness crop selection (Laplacian variance)
    - Character-level frequency voting across sequential video frames
    - Position-aware Indian & Bharat format validation
    """
    def __init__(self, required_votes: int = 2, max_crops_kept: int = 5):
        self.required_votes = required_votes
        self.max_crops_kept = max_crops_kept
        # track_id -> list of (raw_text, conf, sharpness, timestamp)
        self.readings_history: Dict[int, List[dict]] = {}
        self.confirmed_plates: Dict[int, ANPRResult] = {}

    def add_reading(self, track_id: int, reading: ANPRResult, sharpness: float = 50.0) -> Optional[ANPRResult]:
        if not reading or not reading.plateText:
            return self.confirmed_plates.get(track_id)

        history = self.readings_history.setdefault(track_id, [])
        history.append({
            "text": reading.plateText,
            "conf": reading.confidence,
            "sharpness": sharpness,
            "result": reading,
            "ts": time.time(),
        })

        # Keep top K readings by sharpness
        if len(history) > self.max_crops_kept * 2:
            history.sort(key=lambda x: x["sharpness"], reverse=True)
            self.readings_history[track_id] = history[:self.max_crops_kept]

        # Multi-frame character-level voting across candidate strings of consistent length
        candidates = [h["text"] for h in self.readings_history[track_id]]
        if not candidates:
            return self.confirmed_plates.get(track_id)

        # Group by length to vote on character positions
        len_counts = Counter(len(c) for c in candidates)
        dominant_len, len_freq = len_counts.most_common(1)[0]

        filtered_candidates = [c for c in candidates if len(c) == dominant_len]
        if len(filtered_candidates) >= self.required_votes:
            # Character position frequency voting
            voted_chars = []
            for col in range(dominant_len):
                col_chars = [c[col] for c in filtered_candidates]
                most_common_char = Counter(col_chars).most_common(1)[0][0]
                voted_chars.append(most_common_char)
            consensus_raw = "".join(voted_chars)

            # Apply position-aware correction
            corrected = PlateValidator.position_aware_correction(consensus_raw)
            is_valid, ftype, vstatus = PlateValidator.validate(corrected)

            best_conf = max(h["conf"] for h in self.readings_history[track_id])

            final_result = ANPRResult(
                plateText=corrected,
                confidence=round(best_conf, 1),
                isReadable=True,
                isValidFormat=is_valid,
                formatType=ftype,
                validationStatus=vstatus,
                stateCode=corrected[:2] if is_valid and ftype == "standard" else None,
                plateNumber=corrected,
                processedAt=int(time.time() * 1000),
            )
            self.confirmed_plates[track_id] = final_result
            return final_result

        # Immediate confirmation for high-confidence already-valid plate
        if reading.isValidFormat and reading.confidence >= 85.0:
            self.confirmed_plates[track_id] = reading
            return reading

        return self.confirmed_plates.get(track_id)

    def is_confirmed(self, track_id: int) -> bool:
        """Checks if a plate has already reached multi-frame confirmation for this track."""
        return track_id in self.confirmed_plates

    def get_confirmed(self, track_id: int) -> Optional[ANPRResult]:
        return self.confirmed_plates.get(track_id)

    def reset(self):
        """Resets all tracking histories and confirmed plates between video streams."""
        self.readings_history.clear()
        self.confirmed_plates.clear()

    def prune(self, active_track_ids: set[int]):
        stale = [t for t in self.readings_history.keys() if t not in active_track_ids]
        for t in stale:
            self.readings_history.pop(t, None)
            self.confirmed_plates.pop(t, None)


# Backward compatibility aliases
crop_license_plate_region = locate_plate_contour_fallback
