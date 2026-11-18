import base64
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

# OCR character ambiguity maps (strictly unambiguous optical mappings)
DIGIT_TO_LETTER = {
    '0': 'O', '1': 'I', '2': 'Z',
    '5': 'S', '8': 'B'
}

LETTER_TO_DIGIT = {
    'O': '0', 'I': '1', 'Z': '2',
    'S': '5', 'B': '8'
}


def bgr_to_base64_jpeg(img_bgr: np.ndarray, quality: int = 85) -> str:
    """Encodes an image to a base64 Data URL JPEG string."""
    if img_bgr is None or img_bgr.size == 0:
        return ""
    success, buffer = cv2.imencode(".jpg", img_bgr, [int(cv2.IMWRITE_JPEG_QUALITY), quality])
    if not success:
        return ""
    return "data:image/jpeg;base64," + base64.b64encode(buffer).decode("utf-8")


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

        # 3. Middle section: RTO digits then Series letters
        if n == 10:
            # SS DD LL NNNN: unambiguous slots
            chars[2] = LETTER_TO_DIGIT.get(chars[2], chars[2])
            chars[3] = LETTER_TO_DIGIT.get(chars[3], chars[3])
            chars[4] = DIGIT_TO_LETTER.get(chars[4], chars[4])
            chars[5] = DIGIT_TO_LETTER.get(chars[5], chars[5])
        elif n == 9:
            # SS D LL NNNN (e.g. DL1CA1234) or SS DD L NNNN (e.g. KA01M4449)
            # Slot 2 is ALWAYS RTO digit
            chars[2] = LETTER_TO_DIGIT.get(chars[2], chars[2])
            # Slot 4 is ALWAYS Series letter
            chars[4] = DIGIT_TO_LETTER.get(chars[4], chars[4])
            # Slot 3 is ambiguous: only swap if unambiguous based on adjacent character
            # If slot 3 is already a digit, it is SS DD L NNNN format; do not swap to letter.
            # If slot 3 is already a letter, it is SS D LL NNNN format; do not swap to digit.
        elif n == 11:
            # SS DD LLL NNNN
            chars[2] = LETTER_TO_DIGIT.get(chars[2], chars[2])
            chars[3] = LETTER_TO_DIGIT.get(chars[3], chars[3])
            chars[4] = DIGIT_TO_LETTER.get(chars[4], chars[4])
            chars[5] = DIGIT_TO_LETTER.get(chars[5], chars[5])
            chars[6] = DIGIT_TO_LETTER.get(chars[6], chars[6])

        return "".join(chars)

    @staticmethod
    def validate(cleaned: str) -> tuple[bool, str, str]:
        """
        Validates license plate against Indian statutory formats:
        1. Bharat (BH) Series: YY BH NNNN LL (e.g. 22BH1234AA)
        2. Standard State Series: SS DD LLL NNNN (e.g. DL01AB1234, KA04E9999)
        Returns (is_valid, format_type, status_string).
        """
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
            return False, "invalid", "Invalid format - needs review"

        return False, "invalid", "Invalid format - needs review"


def locate_plate_contour_fallback(vehicle_crop_bgr: np.ndarray) -> np.ndarray:
    """
    Fallback plate localizer: searches for rectangular license plate contours
    in the lower half of the vehicle bounding box (aspect ratio 2.0 to 5.5).
    """
    if vehicle_crop_bgr is None or vehicle_crop_bgr.size == 0:
        return vehicle_crop_bgr

    vh, vw = vehicle_crop_bgr.shape[:2]
    y_start = int(vh * 0.45)
    lower_crop = vehicle_crop_bgr[y_start:, :]
    lh, lw = lower_crop.shape[:2]

    if lh < 20 or lw < 40:
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
        if 2.0 <= aspect_ratio <= 5.5 and (0.005 * total_area) <= area <= (0.25 * total_area):
            cx = x + w / 2.0
            center_penalty = abs(cx - (lw / 2.0)) / (lw / 2.0)
            score = (area / total_area) * (1.0 - 0.4 * center_penalty)
            if score > max_score:
                max_score = score
                pad_x = int(w * 0.12)
                pad_y = int(h * 0.15)
                px1 = max(0, x - pad_x)
                py1 = max(0, y - pad_y)
                px2 = min(lw, x + w + pad_x)
                py2 = min(lh, y + h + pad_y)
                best_candidate = lower_crop[py1:py2, px1:px2]

    if best_candidate is not None and best_candidate.size > 0:
        return best_candidate

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

    h, w = plate_crop_bgr.shape[:2]
    scale = 3.0
    resized = cv2.resize(
        plate_crop_bgr,
        (int(w * scale), int(h * scale)),
        interpolation=cv2.INTER_CUBIC,
    )
    padded = cv2.copyMakeBorder(resized, 12, 12, 12, 12, cv2.BORDER_REPLICATE)
    gray = cv2.cvtColor(padded, cv2.COLOR_BGR2GRAY)
    clahe = cv2.createCLAHE(clipLimit=2.5, tileGridSize=(8, 8))
    enhanced = clahe.apply(gray)
    blurred = cv2.GaussianBlur(enhanced, (0, 0), sigmaX=1.5)
    sharpened = cv2.addWeighted(enhanced, 1.4, blurred, -0.4, 0)
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


class FastALPREngine:
    """
    Singleton ALPR engine combining:
    - Plate Detector: yolo-v9-t-384-license-plate-end2end (ONNX)
    - Plate OCR: cct-s-v2-global-model (ONNX)
    - Distance gating: neutral status for small/distant targets
    - Fallback: RapidOCR + contour localization
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
    ) -> ANPRResult:
        """
        Executes end-to-end multi-scale plate localization and recognition on vehicle crop.
        No vehicle-size pre-gate: every vehicle undergoes multi-scale plate detection.
        "Distant Target" is an outcome ONLY when no plate is localized at any scale
        AND the vehicle is physically smaller than the measured resolution threshold (min_veh_w, min_veh_h).
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
            )

        vh, vw = vehicle_crop_bgr.shape[:2]
        veh_crop_b64 = bgr_to_base64_jpeg(vehicle_crop_bgr, quality=80)

        # Microscopic fragment check (<30x15 px):
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
                y_lower = int(vh * 0.45)
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
                            is_good_ar = (2.0 <= ar <= 5.8)
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

            # Preprocess plate crop (3x upscaling, CLAHE, unsharp mask, deskew)
            prep = preprocess_plate_crop(tight_plate)

            best_det = best_cand["det"]
            # 1. Fast-ALPR OCR
            fast_raw = best_det.ocr.text if best_det.ocr else ""
            fast_conf = (
                float(np.mean(best_det.ocr.confidence) * 100.0)
                if best_det.ocr and best_det.ocr.confidence
                else float(best_det.detection.confidence) * 100.0
            )
            fast_char_confs = (
                [round(float(c) * 100.0, 1) for c in best_det.ocr.confidence]
                if best_det.ocr and best_det.ocr.confidence
                else []
            )
            fast_cleaned = PlateValidator.clean_text(fast_raw)
            fast_corr = PlateValidator.position_aware_correction(fast_cleaned)
            fast_valid, fast_type, fast_status = PlateValidator.validate(fast_corr)

            # 2. RapidOCR on enhanced preprocessed crop
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
            rapid_corr = PlateValidator.position_aware_correction(rapid_cleaned)
            rapid_valid, rapid_type, rapid_status = PlateValidator.validate(rapid_corr)

            # 3. Decision & Fusion
            chosen_char_confs = fast_char_confs
            if rapid_valid and not fast_valid:
                chosen_text = rapid_corr
                chosen_conf = rapid_conf
                is_valid = True
                ftype = rapid_type
                vstatus = "Valid format"
                chosen_char_confs = [round(rapid_conf, 1)] * len(rapid_corr)
            elif fast_valid and not rapid_valid:
                chosen_text = fast_corr
                chosen_conf = fast_conf
                is_valid = True
                ftype = fast_type
                vstatus = "Valid format"
            elif fast_valid and rapid_valid:
                if rapid_conf >= fast_conf:
                    chosen_text = rapid_corr
                    chosen_conf = rapid_conf
                    ftype = rapid_type
                    chosen_char_confs = [round(rapid_conf, 1)] * len(rapid_corr)
                else:
                    chosen_text = fast_corr
                    chosen_conf = fast_conf
                    ftype = fast_type
                is_valid = True
                vstatus = "Valid format"
            else:
                # Neither passed strict format: retain best-guess text for human review
                if len(rapid_corr) >= len(fast_corr) and len(rapid_corr) >= 4:
                    chosen_text = rapid_corr
                    chosen_conf = rapid_conf
                    chosen_char_confs = [round(rapid_conf, 1)] * len(rapid_corr)
                elif len(fast_corr) >= 4:
                    chosen_text = fast_corr
                    chosen_conf = fast_conf
                else:
                    chosen_text = rapid_corr or fast_corr
                    chosen_conf = max(rapid_conf, fast_conf)

                is_valid = False
                ftype = "invalid"
                if chosen_text and len(chosen_text) >= 4:
                    vstatus = "Needs review"
                else:
                    vstatus = "Unreadable"

            is_readable = bool(chosen_text and len(chosen_text) >= 4)

            return ANPRResult(
                plateText=chosen_text if is_readable else "",
                confidence=round(chosen_conf, 1),
                isReadable=is_readable,
                isValidFormat=is_valid,
                formatType=ftype,
                validationStatus=vstatus,
                stateCode=chosen_text[:2] if is_valid and ftype == "standard" else None,
                plateNumber=chosen_text if is_readable else "",
                cropDataUrl=plate_b64,
                plateCropDataUrl=plate_b64,
                vehicleCropDataUrl=veh_crop_b64,
                charConfidences=chosen_char_confs if is_readable else None,
                scaleUsed=best_cand["scale_name"],
                attempts=1,
                isDistanceGated=False,
                processedAt=now_ms,
            )

        # Fallback: No plate localized at any scale.
        # "Distant" becomes an outcome ONLY when no plate is localized AND vehicle is small.
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
        )


class PlateVotingTracker:
    """
    Multi-frame ANPR accumulator with:
    - Top-K sharpness crop selection (Laplacian variance)
    - Character-level frequency voting across sequential video frames
    - Position-aware Indian & Bharat format validation
    - Preserves tight optical plate crop and vehicle thumbnails
    """
    def __init__(self, required_votes: int = 2, max_crops_kept: int = 5):
        self.required_votes = required_votes
        self.max_crops_kept = max_crops_kept
        self.readings_history: Dict[int, List[dict]] = {}
        self.confirmed_plates: Dict[int, ANPRResult] = {}
        self.best_guess_plates: Dict[int, ANPRResult] = {}
        self.gated_statuses: Dict[int, ANPRResult] = {}
        self.attempts: Dict[int, int] = {}

    def set_distance_gated(self, track_id: int, result: ANPRResult):
        """Records neutral distance-gated status for distant tracks."""
        self.attempts[track_id] = self.attempts.get(track_id, 0) + 1
        if result:
            result.attempts = self.attempts[track_id]
        self.gated_statuses[track_id] = result

    def add_reading(self, track_id: int, reading: ANPRResult, sharpness: float = 50.0) -> Optional[ANPRResult]:
        self.attempts[track_id] = self.attempts.get(track_id, 0) + 1
        if not reading:
            return self.get_confirmed(track_id)

        reading.attempts = self.attempts[track_id]

        # If reading is distance gated, store status
        if reading.isDistanceGated or reading.formatType == "distance_gated":
            self.gated_statuses[track_id] = reading
            return reading

        if not reading.plateText:
            return self.get_confirmed(track_id)

        # Retain best-guess reading with highest sharpness/confidence for fallback display
        if track_id not in self.best_guess_plates:
            self.best_guess_plates[track_id] = reading
        else:
            curr_bg = self.best_guess_plates[track_id]
            # Prioritize valid format, then higher confidence
            if reading.isValidFormat and not curr_bg.isValidFormat:
                self.best_guess_plates[track_id] = reading
            elif reading.isValidFormat == curr_bg.isValidFormat and reading.confidence > curr_bg.confidence:
                self.best_guess_plates[track_id] = reading

        history = self.readings_history.setdefault(track_id, [])
        history.append({
            "text": reading.plateText,
            "conf": reading.confidence,
            "sharpness": sharpness,
            "result": reading,
            "ts": time.time(),
        })

        if len(history) > self.max_crops_kept * 2:
            history.sort(key=lambda x: x["sharpness"], reverse=True)
            self.readings_history[track_id] = history[:self.max_crops_kept]

        candidates = [h["text"] for h in self.readings_history[track_id]]
        if not candidates:
            return self.get_confirmed(track_id)

        len_counts = Counter(len(c) for c in candidates)
        dominant_len, len_freq = len_counts.most_common(1)[0]
        filtered = [c for c in candidates if len(c) == dominant_len]

        best_entry = max(self.readings_history[track_id], key=lambda x: x["conf"])
        best_plate_crop = best_entry["result"].plateCropDataUrl or best_entry["result"].cropDataUrl
        best_veh_crop = best_entry["result"].vehicleCropDataUrl

        if len(filtered) >= self.required_votes:
            voted_chars = []
            fused_confidences = []
            for col in range(dominant_len):
                col_entries = []
                for h in self.readings_history[track_id]:
                    t = h["text"]
                    if len(t) == dominant_len:
                        c_conf = h["conf"]
                        if h["result"].charConfidences and len(h["result"].charConfidences) == dominant_len:
                            c_conf = h["result"].charConfidences[col]
                        col_entries.append((t[col], c_conf))
                # Multi-frame character fusion: highest confidence character across frames
                best_char, best_cconf = max(col_entries, key=lambda x: x[1])
                voted_chars.append(best_char)
                fused_confidences.append(round(best_cconf, 1))

            consensus_raw = "".join(voted_chars)

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
                cropDataUrl=best_plate_crop,
                plateCropDataUrl=best_plate_crop,
                vehicleCropDataUrl=best_veh_crop,
                charConfidences=fused_confidences,
                attempts=self.attempts.get(track_id, 1),
                isDistanceGated=False,
                processedAt=int(time.time() * 1000),
            )
            if is_valid:
                self.confirmed_plates[track_id] = final_result
                return final_result
            else:
                self.best_guess_plates[track_id] = final_result

        # Immediate confirmation for high-confidence already-valid plate
        if reading.isValidFormat and reading.confidence >= 80.0:
            self.confirmed_plates[track_id] = reading
            return reading

        return self.confirmed_plates.get(track_id)

    def is_confirmed(self, track_id: int) -> bool:
        """Checks if plate has reached confirmation or is distance-gated."""
        return (track_id in self.confirmed_plates) or (track_id in self.gated_statuses)

    def get_confirmed(self, track_id: int) -> Optional[ANPRResult]:
        if track_id in self.confirmed_plates:
            return self.confirmed_plates[track_id]
        return self.gated_statuses.get(track_id)

    def get_best_guess(self, track_id: int) -> Optional[ANPRResult]:
        if track_id in self.confirmed_plates:
            return self.confirmed_plates[track_id]
        if track_id in self.best_guess_plates:
            return self.best_guess_plates[track_id]
        return self.gated_statuses.get(track_id)

    def reset(self):
        self.readings_history.clear()
        self.confirmed_plates.clear()
        self.best_guess_plates.clear()
        self.gated_statuses.clear()
        self.attempts.clear()

    def prune(self, active_track_ids: set[int]):
        stale = [t for t in list(self.readings_history.keys()) if t not in active_track_ids]
        for t in stale:
            self.readings_history.pop(t, None)
            self.confirmed_plates.pop(t, None)
            self.best_guess_plates.pop(t, None)
            self.gated_statuses.pop(t, None)
            self.attempts.pop(t, None)


# Backward compatibility alias
crop_license_plate_region = locate_plate_contour_fallback
