import base64
import re
import cv2
import numpy as np
import time
import os
import urllib.request
import json
from typing import Optional, List, Dict, Tuple, Any
from collections import Counter
from app.models.schemas import ANPRResult, ImageANPRPlateItem, BoundingBox

# Standard Indian License Plate Format: State Code (2) + District/RTO (1-2) + Series (1-3) + Number (4)
# Example: DL01AB1234, MH12CD5678, KA04E9999, HR12AX8522, UP14BQ208
STANDARD_PLATE_REGEX = re.compile(r"^([A-Z]{2})([0-9]{1,2})([A-Z]{0,3})([0-9]{3,4})$")

# Bharat (BH) Series Format: Year (2) + BH (2) + Number (4) + Series (1-2)
# Example: 22BH1234AA
BHARAT_SERIES_REGEX = re.compile(r"^([0-9]{2})BH([0-9]{4})([A-Z]{1,2})$")

# Diplomatic / Consular Vehicles: e.g. 77CD1234, 12CC5678
DIPLOMATIC_PLATE_REGEX = re.compile(r"^([0-9]{1,3})(CD|CC|UN)([0-9]{1,4})$")

# Military / Defence Vehicles: e.g. 21B123456 or ^21B123456
MILITARY_PLATE_REGEX = re.compile(r"^\^?([0-9]{2})([A-Z])([0-9]{5,6})([A-Z]?)$")

# Complete official dictionary of all 36 Indian States and Union Territories (MoRTH standards)
INDIAN_STATES_MAP: Dict[str, Tuple[str, str]] = {
    "AN": ("Andaman and Nicobar Islands", "Port Blair RTO"),
    "AP": ("Andhra Pradesh", "Amaravati / Vijayawada RTO"),
    "AR": ("Arunachal Pradesh", "Itanagar RTO"),
    "AS": ("Assam", "Dispur / Guwahati RTO"),
    "BR": ("Bihar", "Patna RTO"),
    "CG": ("Chhattisgarh", "Raipur RTO"),
    "CH": ("Chandigarh", "Chandigarh State Transport"),
    "DD": ("Daman and Diu", "Daman RTO"),
    "DL": ("Delhi NCT", "Delhi Transport Department"),
    "DN": ("Dadra and Nagar Haveli", "Silvassa RTO"),
    "DNH": ("Dadra and Nagar Haveli and Daman and Diu", "Daman RTO"),
    "GA": ("Goa", "Panaji RTO"),
    "GJ": ("Gujarat", "Ahmedabad RTO"),
    "HP": ("Himachal Pradesh", "Shimla RTO"),
    "HR": ("Haryana", "Haryana Transport"),
    "JH": ("Jharkhand", "Ranchi RTO"),
    "JK": ("Jammu and Kashmir", "Srinagar / Jammu RTO"),
    "KA": ("Karnataka", "Bengaluru Transport Department"),
    "KL": ("Kerala", "Thiruvananthapuram RTO"),
    "LA": ("Ladakh", "Leh RTO"),
    "LD": ("Lakshadweep", "Kavaratti RTO"),
    "MH": ("Maharashtra", "Mumbai / Pune RTO"),
    "ML": ("Meghalaya", "Shillong RTO"),
    "MN": ("Manipur", "Imphal RTO"),
    "MP": ("Madhya Pradesh", "Bhopal RTO"),
    "MZ": ("Mizoram", "Aizawl RTO"),
    "NL": ("Nagaland", "Kohima RTO"),
    "OD": ("Odisha", "Bhubaneswar RTO"),
    "OR": ("Odisha (Pre-2012)", "Bhubaneswar RTO"),
    "PB": ("Punjab", "Chandigarh / Ludhiana RTO"),
    "PY": ("Puducherry", "Puducherry RTO"),
    "RJ": ("Rajasthan", "Jaipur RTO"),
    "SK": ("Sikkim", "Gangtok RTO"),
    "TN": ("Tamil Nadu", "Chennai Transport"),
    "TR": ("Tripura", "Agartala RTO"),
    "TS": ("Telangana", "Hyderabad Transport"),
    "TG": ("Telangana (Legacy)", "Hyderabad Transport"),
    "UA": ("Uttarakhand (Pre-2007)", "Dehradun RTO"),
    "UK": ("Uttarakhand", "Dehradun RTO"),
    "UP": ("Uttar Pradesh", "Lucknow Transport"),
    "WB": ("West Bengal", "Kolkata RTO"),
}

VALID_STATE_CODES = set(INDIAN_STATES_MAP.keys())

# Specific RTO District Name mapping for major RTO codes
KNOWN_RTO_NAMES: Dict[str, str] = {
    # Haryana (HR)
    "HR12": "Rohtak RTO (HR-12)",
    "HR26": "Gurugram North RTO (HR-26)",
    "HR34": "Mahendragarh RTO (HR-34)",
    "HR35": "Narnaul RTO (HR-35)",
    "HR38": "Faridabad Commercial RTO (HR-38)",
    "HR51": "Faridabad RTO (HR-51)",
    "HR01": "Ambala RTO (HR-01)",
    # Delhi (DL)
    "DL01": "Mall Road RTO (North Delhi)",
    "DL02": "IP Depot RTO (New Delhi)",
    "DL03": "Sheikh Sarai RTO (South Delhi)",
    "DL04": "Janakpuri RTO (West Delhi)",
    "DL05": "Loni Road RTO (North East Delhi)",
    "DL06": "Sarai Kale Khan RTO (Central Delhi)",
    "DL07": "Mayur Vihar RTO (East Delhi)",
    "DL08": "Wazirpur RTO (North West Delhi)",
    "DL09": "Palam RTO (South West Delhi)",
    "DL10": "Raja Garden RTO (West Delhi II)",
    "DL11": "Rohini RTO (North West Delhi II)",
    "DL12": "Vasant Vihar RTO (South West Delhi II)",
    # Karnataka (KA)
    "KA01": "Koramangala RTO (Bengaluru Central)",
    "KA02": "Rajajinagar RTO (Bengaluru West)",
    "KA03": "Indiranagar RTO (Bengaluru East)",
    "KA04": "Yeshwanthpur RTO (Bengaluru North)",
    "KA05": "Jayanagar RTO (Bengaluru South)",
    "KA19": "Mangaluru RTO (Dakshina Kannada)",
    # Maharashtra (MH)
    "MH01": "Mumbai Central RTO (Tardeo)",
    "MH02": "Mumbai West RTO (Andheri)",
    "MH03": "Mumbai East RTO (Wadala)",
    "MH04": "Thane RTO",
    "MH12": "Pune RTO",
    "MH14": "Pimpri-Chinchwad RTO",
    # Uttar Pradesh (UP)
    "UP14": "Ghaziabad RTO (UP-14)",
    "UP16": "Gautam Buddha Nagar / Noida RTO (UP-16)",
    "UP32": "Lucknow RTO (UP-32)",
    # Rajasthan (RJ)
    "RJ14": "Jaipur South RTO (RJ-14)",
    "RJ29": "Dausa RTO (RJ-29)",
    "RJ45": "Jaipur North RTO (RJ-45)",
    # Tamil Nadu (TN)
    "TN01": "Chennai Central RTO",
    "TN07": "Chennai South RTO",
    # Telangana (TS)
    "TS07": "Ranga Reddy RTO (Hyderabad)",
    "TS09": "Khairatabad RTO (Hyderabad Central)",
}

# OCR character ambiguity maps (strictly unambiguous optical mappings for candidate fallbacks)
DIGIT_TO_LETTER = {
    '0': 'O', '1': 'I', '2': 'Z',
    '5': 'S', '8': 'B'
}

LETTER_TO_DIGIT = {
    'O': '0', 'I': '1', 'Z': '2',
    'S': '5', 'B': '8'
}

AWIROS_SERVICE_URL = os.environ.get("AWIROS_SERVICE_URL", "http://127.0.0.1:8001")


def bgr_to_base64_jpeg(img_bgr: np.ndarray, quality: int = 85) -> str:
    """Encodes an image to a base64 Data URL JPEG string."""
    if img_bgr is None or img_bgr.size == 0:
        return ""
    success, buffer = cv2.imencode(".jpg", img_bgr, [int(cv2.IMWRITE_JPEG_QUALITY), quality])
    if not success:
        return ""
    return "data:image/jpeg;base64," + base64.b64encode(buffer).decode("utf-8")


def query_awiros_ocr(crop_bgr: np.ndarray, is_dual_row: Optional[bool] = None) -> Optional[dict]:
    """
    Calls Awiros Indian ANPR-OCR microservice on port 8001.
    Model: Awiros/anpr-ocr (PP-OCRv5 SVTR_HGNet specialist for 1-row and 2-row Indian plates).
    """
    if crop_bgr is None or crop_bgr.size == 0:
        return None
    try:
        _, buf = cv2.imencode(".jpg", crop_bgr, [int(cv2.IMWRITE_JPEG_QUALITY), 95])
        b64 = base64.b64encode(buf).decode("utf-8")
        payload = json.dumps({"image_base64": b64, "is_dual_row": is_dual_row}).encode("utf-8")
        req = urllib.request.Request(
            f"{AWIROS_SERVICE_URL}/ocr/read-plate",
            data=payload,
            headers={"Content-Type": "application/json"}
        )
        with urllib.request.urlopen(req, timeout=3.0) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            if data.get("status") == "ok":
                return data
    except Exception as err:
        pass
    return None


class PlateValidator:
    """
    MoRTH Indian Registration Number Format Validator.
    Implements statutory format checking for:
    - Standard State Series: SS RR [AAA] NNNN
    - Bharat (BH) Series: YY BH NNNN XX
    - Diplomatic Plates: CC/CD/UN
    - Military / Defence Plates
    Does NOT mutate or invent characters to force a false match.
    """

    @staticmethod
    def clean_text(raw: str) -> str:
        """Strip all non-alphanumeric characters and uppercase."""
        return re.sub(r"[^A-Z0-9]", "", (raw or "").upper())

    @staticmethod
    def validate_indian_registration(text: str) -> Dict[str, Any]:
        """
        Validates text against statutory Indian vehicle plate formats without character hallucination.
        Returns detailed parsed components (state, RTO, series, number, layout).
        """
        clean = PlateValidator.clean_text(text)
        res = {
            "is_valid": False,
            "format_type": "invalid",
            "validation_status": "Unreadable / invalid format",
            "state_code": None,
            "state_name": None,
            "rto_code": None,
            "rto_office": None,
            "series": None,
            "plate_number": clean,
            "is_dual_row": False,
        }

        if not clean or len(clean) < 6 or len(clean) > 13:
            return res

        # 1. Bharat Series (BH) Check
        bh_match = BHARAT_SERIES_REGEX.match(clean)
        if bh_match:
            year_code, number_code, series_code = bh_match.groups()
            res["is_valid"] = True
            res["format_type"] = "bharat"
            res["validation_status"] = "Valid format"
            res["state_code"] = "BH"
            res["state_name"] = "Bharat (BH) All-India Registry"
            res["rto_code"] = year_code
            res["rto_office"] = f"MoRTH Pan-India (Procured 20{year_code})"
            res["series"] = f"BH-{series_code}"
            res["plate_number"] = clean
            return res

        # 2. Standard State MoRTH Format Check
        std_match = STANDARD_PLATE_REGEX.match(clean)
        if std_match:
            state_code, rto_digits, series_chars, num_digits = std_match.groups()
            if state_code in VALID_STATE_CODES:
                state_info = INDIAN_STATES_MAP.get(state_code, ("Indian State", "RTO"))
                state_name = state_info[0]
                rto_key = f"{state_code}{int(rto_digits):02d}" if rto_digits.isdigit() else f"{state_code}{rto_digits}"
                rto_office = KNOWN_RTO_NAMES.get(rto_key, f"{state_name} ({state_code}-{rto_digits})")

                res["is_valid"] = True
                res["format_type"] = "standard"
                res["validation_status"] = "Valid format"
                res["state_code"] = state_code
                res["state_name"] = state_name
                res["rto_code"] = rto_digits
                res["rto_office"] = rto_office
                res["series"] = series_chars
                res["plate_number"] = clean
                return res

        # 3. Diplomatic / Consular Vehicle Check
        dip_match = DIPLOMATIC_PLATE_REGEX.match(clean)
        if dip_match:
            mission_num, dip_type, seq_num = dip_match.groups()
            res["is_valid"] = True
            res["format_type"] = "diplomatic"
            res["validation_status"] = "Valid format"
            res["state_code"] = "CD"
            res["state_name"] = "Diplomatic Corps (Ministry of External Affairs)"
            res["rto_code"] = mission_num
            res["rto_office"] = f"Foreign Mission {mission_num} ({dip_type})"
            res["series"] = dip_type
            res["plate_number"] = clean
            return res

        # 4. Military / Defence Vehicle Check
        mil_match = MILITARY_PLATE_REGEX.match(clean)
        if mil_match:
            year_proc, base_class, seq_num, suffix = mil_match.groups()
            res["is_valid"] = True
            res["format_type"] = "military"
            res["validation_status"] = "Valid format"
            res["state_code"] = "DEF"
            res["state_name"] = "Indian Armed Forces (Ministry of Defence)"
            res["rto_code"] = year_proc
            res["rto_office"] = f"Defence Procurement 20{year_proc} (Base {base_class})"
            res["series"] = base_class
            res["plate_number"] = clean
            return res

        # If length is reasonable (4+ chars) but statutory format not satisfied:
        res["validation_status"] = "Uncertain / Needs Review"
        return res

    @staticmethod
    def position_aware_correction(candidate: str) -> str:
        """
        Conservative disambiguation for known optical confusions only when unambiguous.
        Never mutates characters to invent false registration numbers.
        """
        text = candidate.strip().upper()
        if len(text) < 8 or len(text) > 11:
            return text

        chars = list(text)

        # Check Bharat series candidate: e.g. 22BH1234AA
        if len(chars) >= 9 and "".join(chars[2:4]) in ["BH", "8H", "BI", "B1", "0H"]:
            chars[0] = LETTER_TO_DIGIT.get(chars[0], chars[0])
            chars[1] = LETTER_TO_DIGIT.get(chars[1], chars[1])
            chars[2] = 'B'
            chars[3] = 'H'
            for i in range(4, min(8, len(chars))):
                chars[i] = LETTER_TO_DIGIT.get(chars[i], chars[i])
            for i in range(8, len(chars)):
                chars[i] = DIGIT_TO_LETTER.get(chars[i], chars[i])
            corrected = "".join(chars)
            if BHARAT_SERIES_REGEX.match(corrected):
                return corrected

        # Standard Series Prefix: Pos 0 and 1 must be letters
        chars[0] = DIGIT_TO_LETTER.get(chars[0], chars[0])
        chars[1] = DIGIT_TO_LETTER.get(chars[1], chars[1])

        # Last 4 characters must be digits
        n = len(chars)
        for i in range(max(2, n - 4), n):
            chars[i] = LETTER_TO_DIGIT.get(chars[i], chars[i])

        if n == 10:
            chars[2] = LETTER_TO_DIGIT.get(chars[2], chars[2])
            chars[3] = LETTER_TO_DIGIT.get(chars[3], chars[3])
            chars[4] = DIGIT_TO_LETTER.get(chars[4], chars[4])
            chars[5] = DIGIT_TO_LETTER.get(chars[5], chars[5])
        elif n == 9:
            chars[2] = LETTER_TO_DIGIT.get(chars[2], chars[2])
            chars[4] = DIGIT_TO_LETTER.get(chars[4], chars[4])
        elif n == 11:
            chars[2] = LETTER_TO_DIGIT.get(chars[2], chars[2])
            chars[3] = LETTER_TO_DIGIT.get(chars[3], chars[3])
            chars[4] = DIGIT_TO_LETTER.get(chars[4], chars[4])
            chars[5] = DIGIT_TO_LETTER.get(chars[5], chars[5])
            chars[6] = DIGIT_TO_LETTER.get(chars[6], chars[6])

        return "".join(chars)

    @staticmethod
    def validate(cleaned: str) -> tuple[bool, str, str]:
        """Legacy helper returning (is_valid, format_type, status_string)."""
        res = PlateValidator.validate_indian_registration(cleaned)
        return res["is_valid"], res["format_type"], res["validation_status"]


def locate_plate_contour_fallback(vehicle_crop_bgr: np.ndarray) -> np.ndarray:
    """
    Fallback plate localizer: searches for rectangular license plate contours
    in the lower half of the vehicle bounding box (aspect ratio 1.5 to 5.5).
    Supports both single-row (wide) and dual-row (square/tall) plates.
    """
    if vehicle_crop_bgr is None or vehicle_crop_bgr.size == 0:
        return vehicle_crop_bgr

    vh, vw = vehicle_crop_bgr.shape[:2]
    y_start = int(vh * 0.40)
    lower_crop = vehicle_crop_bgr[y_start:, :]
    lh, lw = lower_crop.shape[:2]

    if lh < 15 or lw < 30:
        return vehicle_crop_bgr

    gray = cv2.cvtColor(lower_crop, cv2.COLOR_BGR2GRAY)
    blurred = cv2.bilateralFilter(gray, 9, 75, 75)
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
        # Accept both single-row (2.0 to 5.5) and dual-row (1.2 to 2.1) plates
        if 1.2 <= aspect_ratio <= 5.5 and (0.005 * total_area) <= area <= (0.35 * total_area):
            cx = x + w / 2.0
            center_penalty = abs(cx - (lw / 2.0)) / (lw / 2.0)
            score = (area / total_area) * (1.0 - 0.4 * center_penalty)
            if score > max_score:
                max_score = score
                pad_x = int(w * 0.10)
                pad_y = int(h * 0.12)
                px1 = max(0, x - pad_x)
                py1 = max(0, y - pad_y)
                px2 = min(lw, x + w + pad_x)
                py2 = min(lh, y + h + pad_y)
                best_candidate = lower_crop[py1:py2, px1:px2]

    if best_candidate is not None and best_candidate.size > 0:
        return best_candidate

    def_y1 = int(vh * 0.55)
    def_y2 = int(vh * 0.98)
    def_x1 = int(vw * 0.10)
    def_x2 = int(vw * 0.90)
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

    h, w = plate_crop_bgr.shape[:2]
    scale = 3.0 if w < 200 else (2.0 if w < 400 else 1.0)
    target_w = int(w * scale)
    target_h = int(h * scale)
    resized = cv2.resize(plate_crop_bgr, (target_w, target_h), interpolation=cv2.INTER_CUBIC)

    pad_v = max(4, int(target_h * 0.08))
    pad_h = max(6, int(target_w * 0.08))
    padded = cv2.copyMakeBorder(resized, pad_v, pad_v, pad_h, pad_h, cv2.BORDER_REPLICATE)

    lab = cv2.cvtColor(padded, cv2.COLOR_BGR2LAB)
    l_channel, a_channel, b_channel = cv2.split(lab)
    clahe = cv2.createCLAHE(clipLimit=2.5, tileGridSize=(8, 8))
    cl = clahe.apply(l_channel)
    enhanced_lab = cv2.merge((cl, a_channel, b_channel))
    enhanced_bgr = cv2.cvtColor(enhanced_lab, cv2.COLOR_LAB2BGR)

    gaussian = cv2.GaussianBlur(enhanced_bgr, (0, 0), 2.0)
    unsharp = cv2.addWeighted(enhanced_bgr, 1.5, gaussian, -0.5, 0)

    gray = cv2.cvtColor(unsharp, cv2.COLOR_BGR2GRAY)
    deskewed_gray = deskew_plate(gray)
    return cv2.cvtColor(deskewed_gray, cv2.COLOR_GRAY2BGR)


def crop_license_plate_region(vehicle_crop_bgr: np.ndarray) -> np.ndarray:
    """Public helper extracting the license plate region using multi-scale search."""
    engine = FastALPREngine.get_instance()
    res = engine.process_vehicle_crop(vehicle_crop_bgr)
    if res.plateCropDataUrl:
        clean = res.plateCropDataUrl.split(",")[-1]
        decoded = base64.b64decode(clean)
        arr = np.frombuffer(decoded, np.uint8)
        img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
        if img is not None and img.size > 0:
            return img
    return locate_plate_contour_fallback(vehicle_crop_bgr)


def compute_crop_sharpness(img: np.ndarray) -> float:
    """Computes Laplacian variance as a sharpness / focus metric."""
    if img is None or img.size == 0:
        return 0.0
    if len(img.shape) == 3:
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    else:
        gray = img
    return float(cv2.Laplacian(gray, cv2.CV_64F).var())


class FastALPREngine:
    """
    Combined Indian ANPR Engine:
    - Plate Localization: Multi-scale YOLOv9 Plate Detector (Native, 2x, Lower 50%, Tiles)
    - Plate OCR: Awiros Indian ANPR-OCR Specialist Model (PP-OCRv5 SVTR_HGNet, 98.4% Acc)
    - Fallback: Local Fast-ALPR ONNX (cct-s-v2) + RapidOCR
    - Layout: Support for Single-Row and Dual-Row Indian license plates
    - Format Validation: Position-aware MoRTH validation, 36 State/UT and RTO resolution
    """
    _instance: Optional["FastALPREngine"] = None

    @classmethod
    def get_instance(cls) -> "FastALPREngine":
        if cls._instance is None:
            cls._instance = FastALPREngine()
        return cls._instance

    def __init__(self):
        self._alpr = None
        self._rapid_ocr = None
        self._load_models()

    def _load_models(self):
        try:
            from fast_alpr import ALPR
            self._alpr = ALPR(
                detector_model="yolo-v9-t-384-license-plate-end2end",
                ocr_model="cct-s-v2-global-model",
            )
            print("[FastALPREngine] fast-alpr ONNX models loaded successfully.")
        except Exception as e:
            print(f"[FastALPREngine] Warning: fast-alpr could not be loaded ({e}).")
            self._alpr = None

    def process_vehicle_crop(
        self,
        vehicle_crop_bgr: np.ndarray,
        min_veh_w: int = 100,
        min_veh_h: int = 60,
        vehicle_class: Optional[str] = None,
    ) -> ANPRResult:
        """
        Executes end-to-end multi-scale plate localization and recognition on vehicle crop.
        No vehicle-size pre-gate: every vehicle undergoes multi-scale plate detection.
        Plate OCR is powered by Awiros Indian ANPR-OCR specialist model (1-row & 2-row).
        """
        now_ms = int(time.time() * 1000)
        if vehicle_crop_bgr is None or vehicle_crop_bgr.size == 0:
            return ANPRResult(
                plateText="",
                confidence=0.0,
                isReadable=False,
                isValidFormat=False,
                formatType="invalid",
                validationStatus="No crop available",
                isDistanceGated=False,
                processedAt=now_ms,
                ocrModel="Awiros ANPR-OCR",
                vehicleClass=vehicle_class,
            )

        vh, vw = vehicle_crop_bgr.shape[:2]
        veh_crop_b64 = bgr_to_base64_jpeg(vehicle_crop_bgr, quality=80)

        # Microscopic fragment check (<30x15 px)
        if vw < 30 or vh < 15:
            return ANPRResult(
                plateText="",
                confidence=0.0,
                isReadable=False,
                isValidFormat=False,
                formatType="distance_gated",
                validationStatus="Plate not legible at this distance",
                isDistanceGated=True,
                vehicleCropDataUrl=veh_crop_b64,
                cropDataUrl=veh_crop_b64,
                processedAt=now_ms,
                ocrModel="Awiros ANPR-OCR",
                vehicleClass=vehicle_class,
            )

        best_cand = None
        best_cand_score = -1.0

        if self._alpr is not None:
            try:
                # Build multi-scale search candidates:
                scales = []
                # 1. Native crop
                scales.append(("native", vehicle_crop_bgr))

                # 2. 2x Cubic Upscaled crop
                scales.append(("upscaled_2x", cv2.resize(vehicle_crop_bgr, (vw * 2, vh * 2), interpolation=cv2.INTER_CUBIC)))

                # 3. Lower 50% vehicle region (most likely location for plates)
                y_lower = int(vh * 0.40)
                lower_crop = vehicle_crop_bgr[y_lower:, :]
                if lower_crop.shape[0] >= 15 and lower_crop.shape[1] >= 30:
                    if lower_crop.shape[0] < 120:
                        lower_crop_up = cv2.resize(lower_crop, (lower_crop.shape[1] * 2, lower_crop.shape[0] * 2), interpolation=cv2.INTER_CUBIC)
                        scales.append(("lower_50", lower_crop_up))
                    else:
                        scales.append(("lower_50", lower_crop))

                # 4. Wide vehicle tile splits (if vehicle is wide)
                if vw > 250:
                    tile_l = vehicle_crop_bgr[int(vh * 0.4):, :int(vw * 0.6)]
                    tile_r = vehicle_crop_bgr[int(vh * 0.4):, int(vw * 0.4):]
                    if tile_l.size > 0:
                        scales.append(("tile_left", tile_l))
                    if tile_r.size > 0:
                        scales.append(("tile_right", tile_r))

                # Run detector across candidates and find best plate bounding box
                for scale_name, scale_img in scales:
                    results = self._alpr.predict(scale_img)
                    if results and len(results) > 0:
                        for det in results:
                            det_conf = float(det.detection.confidence)
                            bx = det.detection.bounding_box
                            dx1, dy1, dx2, dy2 = int(bx.x1), int(bx.y1), int(bx.x2), int(bx.y2)
                            pw = dx2 - dx1
                            ph = dy2 - dy1
                            if pw < 15 or ph < 6:
                                continue
                            ar = float(pw) / float(max(1, ph))
                            # Accept both single-row (2.0 to 5.5) and dual-row (1.2 to 2.1) aspect ratios
                            is_good_ar = (1.2 <= ar <= 5.8)
                            score = det_conf * (1.2 if is_good_ar else 0.7) * (1.0 if pw >= 30 and ph >= 10 else 0.75)
                            if score > best_cand_score:
                                best_cand_score = score
                                best_cand = {
                                    "det": det,
                                    "scale_name": scale_name,
                                    "img": scale_img,
                                    "box": (dx1, dy1, dx2, dy2),
                                    "pw": pw,
                                    "ph": ph,
                                }
            except Exception as err:
                print(f"[FastALPREngine] Multi-scale prediction error: {err}")

        # If no plate localized by neural detector, attempt contour-based localization fallback
        if best_cand is None:
            contour_crop = locate_plate_contour_fallback(vehicle_crop_bgr)
            if contour_crop is not None and contour_crop.size > 0 and contour_crop.shape[0] >= 12 and contour_crop.shape[1] >= 25:
                best_cand = {
                    "det": None,
                    "scale_name": "contour_fallback",
                    "img": contour_crop,
                    "box": (0, 0, contour_crop.shape[1], contour_crop.shape[0]),
                    "pw": contour_crop.shape[1],
                    "ph": contour_crop.shape[0],
                }

        if best_cand is not None:
            # Plate detected and localized!
            scale_img = best_cand["img"]
            x1, y1, x2, y2 = best_cand["box"]
            pw, ph = best_cand["pw"], best_cand["ph"]
            sim_h, sim_w = scale_img.shape[:2]

            # Extract tight plate crop with 8% H / 10% V padding
            pad_x = max(2, int(pw * 0.08))
            pad_y = max(2, int(ph * 0.10))
            px1 = max(0, x1 - pad_x)
            py1 = max(0, y1 - pad_y)
            px2 = min(sim_w, x2 + pad_x)
            py2 = min(sim_h, y2 + pad_y)
            tight_plate = scale_img[py1:py2, px1:px2]
            plate_b64 = bgr_to_base64_jpeg(tight_plate, quality=90)

            # Determine layout: Dual-row (square/tall, AR < 2.1) vs Single-row (wide rectangular, AR >= 2.1)
            aspect_ratio = float(pw) / float(max(1, ph))
            is_dual_row = (aspect_ratio < 2.1)

            # Preprocess plate crop (CLAHE, unsharp mask, deskew)
            prep = preprocess_plate_crop(tight_plate)

            # -------------------------------------------------------------
            # Stage B: Awiros Indian ANPR-OCR Specialist Model (Primary Engine)
            # -------------------------------------------------------------
            awiros_res = query_awiros_ocr(tight_plate, is_dual_row=is_dual_row)
            if awiros_res is None or not awiros_res.get("text"):
                # Retry Awiros on preprocessed crop if native crop failed
                awiros_res = query_awiros_ocr(prep, is_dual_row=is_dual_row)

            chosen_text = ""
            chosen_conf = 0.0
            chosen_char_confs = None
            ocr_engine_used = "Awiros ANPR-OCR (PP-OCRv5)"

            if awiros_res and awiros_res.get("text"):
                chosen_text = awiros_res["text"]
                chosen_conf = float(awiros_res.get("confidence", 0.0))
                chosen_char_confs = awiros_res.get("char_confidences")
                is_dual_row = bool(awiros_res.get("is_dual_row", is_dual_row))

            # If Awiros is unavailable or empty, fall back to Fast-ALPR ONNX / RapidOCR
            if not chosen_text:
                best_det = best_cand.get("det")
                fast_raw = best_det.ocr.text if (best_det and best_det.ocr) else ""
                fast_conf = (
                    float(np.mean(best_det.ocr.confidence) * 100.0)
                    if (best_det and best_det.ocr and best_det.ocr.confidence)
                    else 0.0
                )
                fast_cleaned = PlateValidator.clean_text(fast_raw)

                rapid_raw = ""
                rapid_conf = 0.0
                try:
                    if self._rapid_ocr is None:
                        from rapidocr_onnxruntime import RapidOCR
                        self._rapid_ocr = RapidOCR()
                    ocr_out, _ = self._rapid_ocr(prep)
                    if ocr_out and len(ocr_out) > 0:
                        rapid_raw = ocr_out[0][1]
                        rapid_conf = float(ocr_out[0][2]) * 100.0
                except Exception:
                    pass
                rapid_cleaned = PlateValidator.clean_text(rapid_raw)

                if len(rapid_cleaned) >= len(fast_cleaned):
                    chosen_text = rapid_cleaned
                    chosen_conf = rapid_conf
                    ocr_engine_used = "RapidOCR (Fallback)"
                else:
                    chosen_text = fast_cleaned
                    chosen_conf = fast_conf
                    ocr_engine_used = "FastALPR (Fallback)"

                if chosen_text:
                    chosen_char_confs = [round(chosen_conf, 1)] * len(chosen_text)

            # -------------------------------------------------------------
            # Stage C: Indian Registration Format Validation
            # -------------------------------------------------------------
            valid_info = PlateValidator.validate_indian_registration(chosen_text)
            is_valid = valid_info["is_valid"] and (chosen_conf >= 55.0)
            is_readable = bool(chosen_text and len(chosen_text) >= 4)

            if is_valid:
                vstatus = "Valid format"
            elif is_readable:
                vstatus = "Uncertain / Needs Review"
            else:
                vstatus = "Unreadable"

            return ANPRResult(
                plateText=chosen_text if is_readable else "",
                confidence=round(chosen_conf, 1),
                isReadable=is_readable,
                isValidFormat=is_valid,
                formatType=valid_info["format_type"] if is_valid else "invalid",
                validationStatus=vstatus,
                stateCode=valid_info.get("state_code"),
                rtoCode=valid_info.get("rto_code"),
                series=valid_info.get("series"),
                plateNumber=chosen_text if is_readable else "",
                cropDataUrl=plate_b64,
                plateCropDataUrl=plate_b64,
                vehicleCropDataUrl=veh_crop_b64,
                charConfidences=chosen_char_confs if is_readable else None,
                scaleUsed=best_cand["scale_name"],
                attempts=1,
                isDistanceGated=False,
                processedAt=now_ms,
                isDualRow=is_dual_row,
                stateName=valid_info.get("state_name"),
                rtoOffice=valid_info.get("rto_office"),
                ocrModel=ocr_engine_used,
                vehicleClass=vehicle_class,
            )

        # Fallback: No plate localized at any scale.
        # "Distant" becomes an outcome ONLY when no plate is localized AND vehicle is genuinely small.
        is_small_vehicle = (vw < min_veh_w or vh < min_veh_h or (vw * vh) < 6000)
        return ANPRResult(
            plateText="",
            confidence=0.0,
            isReadable=False,
            isValidFormat=False,
            formatType="distance_gated" if is_small_vehicle else "invalid",
            validationStatus="Plate not legible at this distance" if is_small_vehicle else "Plate not detected / obscured",
            isDistanceGated=is_small_vehicle,
            vehicleCropDataUrl=veh_crop_b64,
            cropDataUrl=veh_crop_b64,
            attempts=1,
            processedAt=now_ms,
            ocrModel="Awiros ANPR-OCR",
            vehicleClass=vehicle_class,
        )


def detect_image_plates(img_bgr: np.ndarray, detector=None) -> List[ImageANPRPlateItem]:
    """
    Analyzes an entire uploaded static image:
    1. Detects all vehicles (cars, motorcycles, auto-rickshaws, buses, trucks).
    2. Runs multi-scale license plate detection for every vehicle.
    3. Recognizes license plate text via Awiros Indian ANPR-OCR specialist model.
    4. Validates Indian statutory registration format and parses State/RTO.
    5. Returns list of ImageANPRPlateItem evidence items.
    """
    if detector is None:
        from app.services.detector import SurveillanceDetector
        detector = SurveillanceDetector()
    engine = FastALPREngine.get_instance()

    h, w = img_bgr.shape[:2]
    # Detect all entities
    entities, _ = detector.process_frame(img_bgr, timestamp_sec=0.0)
    plates_found: List[ImageANPRPlateItem] = []

    veh_classes = {"car", "truck/bus", "two-wheeler", "three-wheeler", "auto-rickshaw", "truck", "bus", "motorcycle", "van"}

    for ent in entities:
        if ent.class_name in veh_classes:
            bx = max(0, int(ent.bbox.x * w))
            by = max(0, int(ent.bbox.y * h))
            bw = min(w - bx, int(ent.bbox.width * w))
            bh = min(h - by, int(ent.bbox.height * h))

            if bw < 25 or bh < 15:
                continue

            veh_crop = img_bgr[by:by + bh, bx:bx + bw]
            if veh_crop.size == 0:
                continue

            anpr_res = engine.process_vehicle_crop(veh_crop, vehicle_class=ent.class_name)
            if anpr_res.plateText or anpr_res.isValidFormat or anpr_res.isReadable:
                item = ImageANPRPlateItem(
                    plateText=anpr_res.plateText or "UNREADABLE",
                    confidence=anpr_res.confidence,
                    isReadable=anpr_res.isReadable,
                    isValidFormat=anpr_res.isValidFormat,
                    formatType=anpr_res.formatType or "invalid",
                    validationStatus=anpr_res.validationStatus or "Uncertain / Needs Review",
                    stateCode=anpr_res.stateCode,
                    stateName=anpr_res.stateName,
                    rtoCode=anpr_res.rtoCode,
                    rtoOffice=anpr_res.rtoOffice,
                    isDualRow=anpr_res.isDualRow,
                    vehicleClass=ent.class_name,
                    ocrModel=anpr_res.ocrModel or "Awiros ANPR-OCR",
                    charConfidences=anpr_res.charConfidences,
                    plateCropDataUrl=anpr_res.plateCropDataUrl or anpr_res.cropDataUrl,
                    vehicleCropDataUrl=anpr_res.vehicleCropDataUrl,
                    bbox=ent.bbox,
                )
                plates_found.append(item)

    # If no plates found via vehicle detector, run plate detector directly across the full image
    if len(plates_found) == 0:
        anpr_res = engine.process_vehicle_crop(img_bgr, vehicle_class="vehicle")
        if anpr_res.plateText or anpr_res.isValidFormat or anpr_res.isReadable:
            plates_found.append(ImageANPRPlateItem(
                plateText=anpr_res.plateText or "UNREADABLE",
                confidence=anpr_res.confidence,
                isReadable=anpr_res.isReadable,
                isValidFormat=anpr_res.isValidFormat,
                formatType=anpr_res.formatType or "invalid",
                validationStatus=anpr_res.validationStatus or "Uncertain / Needs Review",
                stateCode=anpr_res.stateCode,
                stateName=anpr_res.stateName,
                rtoCode=anpr_res.rtoCode,
                rtoOffice=anpr_res.rtoOffice,
                isDualRow=anpr_res.isDualRow,
                vehicleClass="Vehicle",
                ocrModel=anpr_res.ocrModel or "Awiros ANPR-OCR",
                charConfidences=anpr_res.charConfidences,
                plateCropDataUrl=anpr_res.plateCropDataUrl or anpr_res.cropDataUrl,
                vehicleCropDataUrl=anpr_res.vehicleCropDataUrl,
                bbox=BoundingBox(x=0.0, y=0.0, width=1.0, height=1.0),
            ))

    return plates_found


class PlateVotingTracker:
    """
    Multi-frame ANPR accumulator:
    - Top-K sharpness crop selection (Laplacian variance)
    - Character-level frequency voting across sequential video frames
    - Position-aware Indian & Bharat format validation
    - Preserves tight optical plate crop and vehicle thumbnails
    """
    def __init__(self, required_votes: int = 2, max_crops_kept: int = 5):
        self.required_votes = required_votes
        self.max_crops_kept = max_crops_kept
        self.readings_history: Dict[int, List[dict]] = {}
        self.best_sharp_crops: Dict[int, dict] = {}
        self.confirmed_plates: Dict[int, ANPRResult] = {}
        self.best_guess_plates: Dict[int, ANPRResult] = {}
        self.vote_attempts: Dict[int, int] = {}

    def set_distance_gated(self, track_id: int, result: ANPRResult):
        """Records neutral distance-gated status without false voting."""
        if track_id not in self.confirmed_plates:
            self.best_guess_plates[track_id] = result

    def add_reading(
        self,
        track_id: int,
        reading: ANPRResult,
        crop_bgr: Optional[np.ndarray] = None,
        timestamp: float = 0.0,
    ) -> Optional[ANPRResult]:
        """
        Incorporates a single-frame ANPR observation into the multi-frame voter.
        Returns confirmed consensus ANPRResult once required_votes is achieved.
        """
        self.vote_attempts[track_id] = self.vote_attempts.get(track_id, 0) + 1

        if reading.isDistanceGated or reading.formatType == "distance_gated":
            if track_id not in self.confirmed_plates:
                self.best_guess_plates[track_id] = reading
            return self.confirmed_plates.get(track_id)

        clean_text = reading.plateText.upper().replace(" ", "").strip()
        if not clean_text:
            return self.confirmed_plates.get(track_id)

        # Track sharpest crop
        if crop_bgr is not None and crop_bgr.size > 0:
            sharpness = compute_crop_sharpness(crop_bgr)
            curr = self.best_sharp_crops.get(track_id)
            if curr is None or sharpness > curr["sharpness"]:
                self.best_sharp_crops[track_id] = {
                    "crop": crop_bgr.copy(),
                    "sharpness": sharpness,
                    "plate_crop_b64": reading.plateCropDataUrl,
                    "veh_crop_b64": reading.vehicleCropDataUrl,
                }

        if track_id not in self.readings_history:
            self.readings_history[track_id] = []

        self.readings_history[track_id].append({
            "text": clean_text,
            "conf": reading.confidence,
            "is_valid": reading.isValidFormat,
            "format_type": reading.formatType,
            "char_confs": reading.charConfidences,
            "is_dual_row": reading.isDualRow,
            "state_name": reading.stateName,
            "rto_office": reading.rtoOffice,
            "timestamp": timestamp,
        })

        # Multi-frame character voting
        history = self.readings_history[track_id]
        lengths = [len(r["text"]) for r in history if len(r["text"]) >= 4]
        if not lengths:
            return None

        consensus_len = Counter(lengths).most_common(1)[0][0]
        consensus_chars = []
        avg_char_confs = []

        for idx in range(consensus_len):
            char_votes = [r["text"][idx] for r in history if len(r["text"]) == consensus_len]
            if char_votes:
                top_char, vote_count = Counter(char_votes).most_common(1)[0]
                consensus_chars.append(top_char)
                matching_confs = [
                    r["conf"] for r in history if len(r["text"]) == consensus_len and r["text"][idx] == top_char
                ]
                avg_char_confs.append(round(float(np.mean(matching_confs)), 1) if matching_confs else 85.0)

        voted_text = "".join(consensus_chars)
        valid_info = PlateValidator.validate_indian_registration(voted_text)
        total_votes = len([r for r in history if r["text"] == voted_text])
        mean_conf = float(np.mean([r["conf"] for r in history if r["text"] == voted_text]))

        sharp_info = self.best_sharp_crops.get(track_id, {})
        plate_b64 = sharp_info.get("plate_crop_b64") or reading.plateCropDataUrl
        veh_b64 = sharp_info.get("veh_crop_b64") or reading.vehicleCropDataUrl

        is_confirmed = (total_votes >= self.required_votes) and (valid_info["is_valid"] or len(history) >= 4)
        vstatus = "Valid format" if valid_info["is_valid"] else "Uncertain / Needs Review"

        consensus_result = ANPRResult(
            plateText=voted_text,
            confidence=round(mean_conf, 1),
            isReadable=True,
            isValidFormat=valid_info["is_valid"],
            formatType=valid_info["format_type"] if valid_info["is_valid"] else "invalid",
            validationStatus=vstatus,
            stateCode=valid_info.get("state_code"),
            rtoCode=valid_info.get("rto_code"),
            series=valid_info.get("series"),
            plateNumber=voted_text,
            cropDataUrl=plate_b64,
            plateCropDataUrl=plate_b64,
            vehicleCropDataUrl=veh_b64,
            charConfidences=avg_char_confs,
            scaleUsed=reading.scaleUsed,
            attempts=self.vote_attempts.get(track_id, 1),
            isDistanceGated=False,
            processedAt=int(time.time() * 1000),
            isDualRow=reading.isDualRow,
            stateName=valid_info.get("state_name"),
            rtoOffice=valid_info.get("rto_office"),
            ocrModel="Awiros ANPR-OCR",
            vehicleClass=reading.vehicleClass,
        )

        self.best_guess_plates[track_id] = consensus_result
        if is_confirmed:
            self.confirmed_plates[track_id] = consensus_result
            return consensus_result

        return None

    def get_confirmed(self, track_id: int) -> Optional[ANPRResult]:
        return self.confirmed_plates.get(track_id)

    def get_best_guess(self, track_id: int) -> Optional[ANPRResult]:
        return self.best_guess_plates.get(track_id)

    def prune(self, active_track_ids: set[int]):
        for tid in list(self.readings_history.keys()):
            if tid not in active_track_ids:
                pass
