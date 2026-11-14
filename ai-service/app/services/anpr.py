import re
import cv2
import numpy as np
from typing import Optional
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

# RapidOCR / EasyOCR evaluation rationale:
# RapidOCR (rapidocr_onnxruntime) is selected as the primary OCR engine because it runs directly
# on ONNX Runtime CPU with compact ~15MB weights, avoids heavy PyTorch/Torchvision CPU compilation
# overhead, executes 3-5x faster per crop on standard multi-core CPUs, and handles high-contrast
# embossed plate fonts with high accuracy.


class PlateValidator:
    @staticmethod
    def clean_text(raw: str) -> str:
        # Strip all whitespace and non-alphanumeric characters, force uppercase
        return re.sub(r"[^A-Z0-9]", "", raw.upper())

    @staticmethod
    def validate(cleaned: str) -> tuple[bool, str, str]:
        """
        Returns (is_valid, format_type, status_string)
        """
        if not cleaned or len(cleaned) < 8 or len(cleaned) > 11:
            return False, "invalid", "Unreadable / invalid format"

        # Check Bharat (BH) series
        if BHARAT_SERIES_REGEX.match(cleaned):
            return True, "bharat", "Valid Bharat (BH) Series"

        # Check Standard State series
        if STANDARD_PLATE_REGEX.match(cleaned):
            state_code = cleaned[:2]
            if state_code in VALID_STATE_CODES:
                return True, "standard", f"Valid Indian format ({state_code})"
            return False, "invalid", f"Invalid state prefix ({state_code})"

        return False, "invalid", "Unreadable / invalid format"


class PlateVotingTracker:
    """
    Maintains a rolling candidate pool per tracked vehicle ID.
    Enforces multi-frame voting (requiring >= 2 votes or a high-confidence valid format)
    to prevent single-frame optical OCR artifacts from corrupting records.
    """
    def __init__(self, required_votes: int = 2):
        self.required_votes = required_votes
        # Key: track_id -> dict of candidate -> count & highest confidence
        self.candidates: dict[int, dict[str, dict]] = {}
        self.confirmed_plates: dict[int, ANPRResult] = {}

    def add_reading(self, track_id: int, reading: ANPRResult) -> Optional[ANPRResult]:
        if not reading or not reading.plateText:
            return self.confirmed_plates.get(track_id)

        # If already confirmed with valid format, retain it unless significantly higher confidence
        if track_id in self.confirmed_plates:
            existing = self.confirmed_plates[track_id]
            if existing.isValidFormat and not reading.isValidFormat:
                return existing

        track_pool = self.candidates.setdefault(track_id, {})
        plate = reading.plateText

        if plate not in track_pool:
            track_pool[plate] = {"count": 1, "highest_conf": reading.confidence, "result": reading}
        else:
            track_pool[plate]["count"] += 1
            if reading.confidence > track_pool[plate]["highest_conf"]:
                track_pool[plate]["highest_conf"] = reading.confidence
                track_pool[plate]["result"] = reading

        entry = track_pool[plate]
        # Commit condition: meets vote threshold OR valid format with high confidence (>= 85%)
        if entry["count"] >= self.required_votes or (reading.isValidFormat and reading.confidence >= 85.0):
            self.confirmed_plates[track_id] = entry["result"]
            return entry["result"]

        return self.confirmed_plates.get(track_id)

    def get_confirmed(self, track_id: int) -> Optional[ANPRResult]:
        return self.confirmed_plates.get(track_id)

    def prune(self, active_track_ids: set[int]):
        stale = [t for t in self.candidates.keys() if t not in active_track_ids]
        for t in stale:
            self.candidates.pop(t, None)
            self.confirmed_plates.pop(t, None)


def crop_license_plate_region(vehicle_crop_bgr: np.ndarray) -> np.ndarray:
    """
    Crops the lower 35% of the vehicle bounding box where the front/rear license plate
    is positioned on sedans, SUVs, trucks, and vans.
    """
    if vehicle_crop_bgr is None or vehicle_crop_bgr.size == 0:
        return vehicle_crop_bgr

    h, w = vehicle_crop_bgr.shape[:2]
    # Lower 35% horizontally centered (15% to 85% width)
    y1 = int(h * 0.65)
    y2 = int(h * 0.98)
    x1 = int(w * 0.15)
    x2 = int(w * 0.85)

    if y2 > y1 and x2 > x1:
        return vehicle_crop_bgr[y1:y2, x1:x2]
    return vehicle_crop_bgr


def preprocess_plate_crop(plate_crop_bgr: np.ndarray) -> np.ndarray:
    """
    Preprocesses cropped plate region:
    1. 2.5x Bilinear upscale
    2. Grayscale conversion
    3. Gaussian blur to remove digital sensor noise
    4. Otsu's adaptive thresholding for clear character separation
    """
    if plate_crop_bgr is None or plate_crop_bgr.size == 0:
        return plate_crop_bgr

    # 1. Upscale
    h, w = plate_crop_bgr.shape[:2]
    scale = 2.5
    resized = cv2.resize(
        plate_crop_bgr,
        (int(w * scale), int(h * scale)),
        interpolation=cv2.INTER_CUBIC,
    )

    # 2. Grayscale
    gray = cv2.cvtColor(resized, cv2.COLOR_BGR2GRAY)

    # 3. Bilateral filter (smooths surfaces while preserving character edges)
    filtered = cv2.bilateralFilter(gray, 9, 75, 75)

    # 4. Otsu thresholding
    _, thresh = cv2.threshold(filtered, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    return thresh
