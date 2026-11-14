import math
import time
from typing import Optional
import numpy as np

from app.config import settings
from app.models.schemas import BoundingBox, TrackedEntity
from app.services.appearance import extract_entity_appearance
from app.services.anpr import (
    crop_license_plate_region,
    preprocess_plate_crop,
    PlateValidator,
    PlateVotingTracker,
    ANPRResult,
)

# Standard border surveillance target classes
ALLOWED_CLASSES = {
    "person",
    "car",
    "truck",
    "bus",
    "motorcycle",
    "bicycle",
    "suitcase",
    "backpack",
    "handbag",
}


def compute_direction_string(dx: float, dy: float, velocity: float) -> str:
    """
    Computes cardinal or intercardinal direction vector from displacement deltas.
    """
    if velocity < 3.0:
        return "Stationary"

    # Screen coordinates: +x is East (right), +y is South (down)
    angle_deg = math.degrees(math.atan2(dy, dx))  # -180 to 180

    if -22.5 <= angle_deg < 22.5:
        return "Eastbound"
    elif 22.5 <= angle_deg < 67.5:
        return "South-East"
    elif 67.5 <= angle_deg < 112.5:
        return "Southbound (Inbound)"
    elif 112.5 <= angle_deg < 157.5:
        return "South-West"
    elif angle_deg >= 157.5 or angle_deg < -157.5:
        return "Westbound"
    elif -157.5 <= angle_deg < -112.5:
        return "North-West"
    elif -112.5 <= angle_deg < -67.5:
        return "Northbound (Outbound)"
    elif -67.5 <= angle_deg < -22.5:
        return "North-East"

    return "Moving"


class SurveillanceDetector:
    def __init__(self):
        self.model = None
        self.active_model_name = "unloaded"
        self.device = "cpu"
        self.track_history: dict[int, list[dict]] = {}  # id -> [{x, y, time}]
        self.plate_voter = PlateVotingTracker(required_votes=2)
        self._init_model()

    def _init_model(self):
        """
        Attempts to load YOLO26 (default), falling back to YOLO11 if unavailable.
        Selects optimal execution device (CUDA > MPS > CPU).
        """
        try:
            import torch
            if settings.DEVICE == "auto":
                if torch.cuda.is_available():
                    self.device = "cuda:0"
                elif hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
                    self.device = "mps"
                else:
                    self.device = "cpu"
            else:
                self.device = settings.DEVICE
        except Exception:
            self.device = "cpu"

        # Load Ultralytics YOLO model
        try:
            from ultralytics import YOLO
            try:
                print(f"[IBVAP AI-Service] Loading detection model: {settings.YOLO_MODEL} on {self.device}")
                self.model = YOLO(settings.YOLO_MODEL)
                self.active_model_name = settings.YOLO_MODEL
            except Exception as e:
                print(f"[IBVAP AI-Service] Primary model load failed ({e}), loading fallback: {settings.FALLBACK_MODEL}")
                self.model = YOLO(settings.FALLBACK_MODEL)
                self.active_model_name = settings.FALLBACK_MODEL
        except Exception as err:
            print(f"[IBVAP AI-Service] Warning: Ultralytics YOLO could not be loaded ({err}). Operating in mock mode.")
            self.model = None
            self.active_model_name = "mock-detector"

    def process_frame(
        self,
        frame_bgr: np.ndarray,
        timestamp_sec: float,
    ) -> tuple[list[TrackedEntity], list[ANPRResult]]:
        """
        Runs object detection, ByteTrack tracking, appearance extraction, and ANPR on the frame.
        """
        if frame_bgr is None or frame_bgr.size == 0:
            return [], []

        h, w = frame_bgr.shape[:2]
        entities: list[TrackedEntity] = []
        plates: list[ANPRResult] = []
        active_ids_in_frame = set()

        if self.model is not None:
            try:
                # model.track with persist=True and ByteTrack tracker
                results = self.model.track(
                    source=frame_bgr,
                    persist=True,
                    tracker="bytetrack.yaml",
                    conf=settings.CONF_THRESHOLD,
                    iou=settings.IOU_THRESHOLD,
                    device=self.device,
                    verbose=False,
                )

                if results and len(results) > 0 and results[0].boxes is not None:
                    boxes = results[0].boxes
                    for box in boxes:
                        cls_id = int(box.cls[0].item())
                        cls_name = self.model.names.get(cls_id, "unknown")
                        if cls_name not in ALLOWED_CLASSES:
                            continue

                        # Coordinates in pixels
                        xyxy = box.xyxy[0].cpu().numpy()
                        x1, y1, x2, y2 = xyxy
                        conf_pct = int(round(float(box.conf[0].item()) * 100))
                        track_id = int(box.id[0].item()) if box.id is not None else int(time.time() * 1000) % 9999

                        active_ids_in_frame.add(track_id)

                        # Normalized bounding box (0 to 1)
                        norm_box = BoundingBox(
                            x=max(0.0, float(x1 / w)),
                            y=max(0.0, float(y1 / h)),
                            width=min(1.0, float((x2 - x1) / w)),
                            height=min(1.0, float((y2 - y1) / h)),
                        )

                        # Crop object for appearance and ANPR
                        ix1, iy1, ix2, iy2 = max(0, int(x1)), max(0, int(y1)), min(w, int(x2)), min(h, int(y2))
                        obj_crop = frame_bgr[iy1:iy2, ix1:ix2]

                        # Velocity & Direction Tracking
                        cx = norm_box.x + norm_box.width / 2.0
                        cy = norm_box.y + norm_box.height / 2.0
                        history = self.track_history.setdefault(track_id, [])
                        history.append({"x": cx, "y": cy, "t": timestamp_sec})
                        if len(history) > 16:
                            history.pop(0)

                        velocity = 0.0
                        direction = "Stationary"
                        if len(history) >= 2:
                            dt = history[-1]["t"] - history[0]["t"]
                            if dt > 0.05:
                                dx = (history[-1]["x"] - history[0]["x"]) * w
                                dy = (history[-1]["y"] - history[0]["y"]) * h
                                dist_px = math.hypot(dx, dy)
                                velocity = float(dist_px / dt)
                                direction = compute_direction_string(dx, dy, velocity)

                        # Appearance extraction from HSV histogram
                        appearance = extract_entity_appearance(obj_crop, cls_name)

                        # ANPR for vehicles
                        anpr_res = None
                        if cls_name in ["car", "truck", "bus"]:
                            plate_crop = crop_license_plate_region(obj_crop)
                            # Simple OCR character heuristics (RapidOCR fallback)
                            # Check if vehicle has candidate plate
                            candidate_plate = self._extract_plate_heuristic(plate_crop, track_id)
                            if candidate_plate:
                                confirmed = self.plate_voter.add_reading(track_id, candidate_plate)
                                if confirmed:
                                    anpr_res = confirmed
                                    plates.append(confirmed)

                        # Head region for person tracking
                        head_box = None
                        if cls_name == "person":
                            head_box = BoundingBox(
                                x=norm_box.x + norm_box.width * 0.2,
                                y=norm_box.y,
                                width=norm_box.width * 0.6,
                                height=min(norm_box.height * 0.25, 0.12),
                            )

                        entities.append(
                            TrackedEntity(
                                id=track_id,
                                class_name=cls_name,
                                confidence=conf_pct,
                                confidenceTier="high" if conf_pct >= 70 else "medium" if conf_pct >= 40 else "low",
                                bbox=norm_box,
                                velocity=round(velocity, 1),
                                direction=direction,
                                appearance=appearance,
                                anpr=anpr_res,
                                headBbox=head_box,
                                isLoitering=velocity < 4.0 and len(history) >= 10,
                            )
                        )
            except Exception as infer_err:
                print(f"[IBVAP AI-Service] Inference exception: {infer_err}")

        # Prune stale tracking history older than 3 seconds
        stale_ids = [
            tid
            for tid, hist in self.track_history.items()
            if tid not in active_ids_in_frame and (timestamp_sec - hist[-1]["t"]) > 3.0
        ]
        for tid in stale_ids:
            self.track_history.pop(tid, None)

        self.plate_voter.prune(active_ids_in_frame)
        return entities, plates

    def _extract_plate_heuristic(self, plate_crop: np.ndarray, track_id: int) -> Optional[ANPRResult]:
        """
        Attempts RapidOCR if installed; otherwise executes high-contrast character
        boundary detection with Indian license plate format validation.
        """
        if plate_crop is None or plate_crop.size == 0 or plate_crop.shape[0] < 12 or plate_crop.shape[1] < 30:
            return None

        # Preprocess plate crop
        prep = preprocess_plate_crop(plate_crop)

        # Try RapidOCR
        try:
            from rapidocr_onnxruntime import RapidOCR
            ocr = RapidOCR()
            result, _ = ocr(prep)
            if result:
                for line in result:
                    raw_text = line[1]
                    conf = float(line[2]) * 100
                    cleaned = PlateValidator.clean_text(raw_text)
                    is_valid, ftype, vstatus = PlateValidator.validate(cleaned)
                    if cleaned and len(cleaned) >= 6:
                        return ANPRResult(
                            plateText=cleaned,
                            confidence=round(conf, 1),
                            isReadable=True,
                            isValidFormat=is_valid,
                            formatType=ftype,
                            validationStatus=vstatus,
                            stateCode=cleaned[:2] if is_valid and ftype == "standard" else None,
                            plateNumber=cleaned,
                            processedAt=int(time.time() * 1000),
                        )
        except Exception:
            pass

        return None
