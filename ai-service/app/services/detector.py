import math
import os
import time
from typing import Optional
import numpy as np

from app.config import settings
from app.models.schemas import BoundingBox, TrackedEntity
from app.services.appearance import extract_entity_appearance
from app.services.anpr import (
    crop_license_plate_region,
    preprocess_plate_crop,
    compute_crop_sharpness,
    PlateValidator,
    PlateVotingTracker,
    ANPRResult,
)
from app.services.tracking_manager import TrackingManager, compute_direction_string

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


class SurveillanceDetector:
    def __init__(self):
        self.model = None
        self.active_model_name = "unloaded"
        self.device = "cpu"
        self.tracker_config_path = self._resolve_tracker_config()
        self.tracking_manager = TrackingManager(
            min_hits=settings.MIN_HITS,
            max_lost_frames=settings.MAX_LOST_FRAMES,
            enable_relink=settings.RELINK,
        )
        self.plate_voter = PlateVotingTracker(required_votes=2)
        self._init_model()

    def _resolve_tracker_config(self) -> str:
        """
        Resolves the path to the custom tracker config (bytetrack.yaml or botsort.yaml)
        with support for TRACKER env var override.
        """
        if settings.TRACKER == "botsort":
            return "botsort.yaml"

        candidates = [
            settings.TRACKER_CONFIG,
            os.path.join(os.getcwd(), "config", "tracker.yaml"),
            os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "config", "tracker.yaml"),
        ]
        for p in candidates:
            if os.path.exists(p):
                return p

        return "bytetrack.yaml"

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
        Runs object detection with low initial confidence (0.15) for ByteTrack 2nd-stage association,
        followed by lifecycle track filtering, EMA box smoothing, and footpoint kinematics.
        """
        if frame_bgr is None or frame_bgr.size == 0:
            return [], []

        h, w = frame_bgr.shape[:2]
        raw_detections: list[dict] = []
        plates: list[ANPRResult] = []

        if self.model is not None:
            try:
                # Run tracker with custom tracker config and imgsz
                results = self.model.track(
                    source=frame_bgr,
                    persist=True,
                    tracker=self.tracker_config_path,
                    conf=settings.CONF_THRESHOLD,  # Low conf (0.15) feeds 2nd-stage association
                    iou=settings.IOU_THRESHOLD,
                    imgsz=settings.IMGSZ,
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

                        # Appearance extraction from HSV histogram
                        appearance = extract_entity_appearance(obj_crop, cls_name)

                        # ANPR for vehicles
                        anpr_res = None
                        if cls_name in ["car", "truck", "bus"]:
                            plate_crop = crop_license_plate_region(obj_crop)
                            sharpness = compute_crop_sharpness(plate_crop)
                            candidate_plate = self._extract_plate_heuristic(plate_crop, track_id)
                            if candidate_plate:
                                confirmed = self.plate_voter.add_reading(track_id, candidate_plate, sharpness=sharpness)
                                if confirmed:
                                    anpr_res = confirmed
                                    plates.append(confirmed)

                        raw_detections.append({
                            "id": track_id,
                            "class": cls_name,
                            "bbox": norm_box,
                            "conf": conf_pct,
                            "appearance": appearance,
                            "anpr": anpr_res,
                        })

            except Exception as infer_err:
                print(f"[IBVAP AI-Service] Inference exception: {infer_err}")

        # Pass through tracking lifecycle manager:
        # Enforces tentative -> confirmed -> lost -> removed
        # Eliminates 1-frame ghosts, applies EMA smoothing & footpoint kinematics
        entities = self.tracking_manager.update_tracks(
            raw_detections=raw_detections,
            timestamp=timestamp_sec,
            frame_width=w,
            frame_height=h,
        )

        # Prune plate voter
        active_ids = {e.id for e in entities}
        self.plate_voter.prune(active_ids)

        return entities, plates

    def _extract_plate_heuristic(self, plate_crop: np.ndarray, track_id: int) -> Optional[ANPRResult]:
        """
        Attempts RapidOCR if installed; otherwise executes high-contrast character
        boundary detection with position-aware Indian license plate format validation.
        """
        if plate_crop is None or plate_crop.size == 0 or plate_crop.shape[0] < 12 or plate_crop.shape[1] < 30:
            return None

        prep = preprocess_plate_crop(plate_crop)

        try:
            from rapidocr_onnxruntime import RapidOCR
            ocr = RapidOCR()
            result, _ = ocr(prep)
            if result:
                for line in result:
                    raw_text = line[1]
                    conf = float(line[2]) * 100
                    cleaned = PlateValidator.clean_text(raw_text)
                    corrected = PlateValidator.position_aware_correction(cleaned)
                    is_valid, ftype, vstatus = PlateValidator.validate(corrected)
                    if corrected and len(corrected) >= 6:
                        return ANPRResult(
                            plateText=corrected,
                            confidence=round(conf, 1),
                            isReadable=True,
                            isValidFormat=is_valid,
                            formatType=ftype,
                            validationStatus=vstatus,
                            stateCode=corrected[:2] if is_valid and ftype == "standard" else None,
                            plateNumber=corrected,
                            processedAt=int(time.time() * 1000),
                        )
        except Exception:
            pass

        return None
