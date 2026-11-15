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
from app.services.anpr_async import AsyncANPRWorker
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
            track_buffer_sec=float(settings.MAX_LOST_FRAMES) / 30.0,
            adaptive_min_hits=settings.ADAPTIVE_MIN_HITS,
        )
        self.plate_voter = PlateVotingTracker(required_votes=2)
        self.async_anpr = AsyncANPRWorker(
            plate_voter=self.plate_voter,
            on_confirmed_callback=self._on_plate_confirmed,
            max_workers=2,
            min_crop_height=18,
            min_crop_width=50,
            min_sharpness=20.0,
            max_crops_per_track=4,
            max_queue_per_frame=2,
        )
        self._ocr = None
        self.target_class_ids: list[int] = []
        self._init_model()

    def _on_plate_confirmed(self, track_id: int, plate: ANPRResult):
        """Callback from async ANPR worker to update active track record immediately."""
        if track_id in self.tracking_manager.tracks:
            self.tracking_manager.tracks[track_id].anpr = plate

    def reset(self):
        """Cleans detector tracking manager, plate voter, and async ANPR queues between video streams."""
        self.tracking_manager.reset()
        self.plate_voter.reset()
        self.async_anpr.reset()
        if self.model is not None and hasattr(self.model, "predictor") and self.model.predictor is not None:
            if hasattr(self.model.predictor, "trackers"):
                self.model.predictor.trackers.clear()

    def set_model(self, model_name: str, imgsz: int = None):
        """Switches model weight (e.g. yolo26n.pt vs yolo26s.pt) and input dimension."""
        from ultralytics import YOLO
        print(f"[IBVAP AI-Service] Switching model to: {model_name} on {self.device}")
        self.model = YOLO(model_name)
        self.active_model_name = model_name
        if hasattr(self.model, "names") and self.model.names:
            self.target_class_ids = [k for k, v in self.model.names.items() if v in ALLOWED_CLASSES]
        if imgsz is not None:
            settings.IMGSZ = imgsz
        self.reset()

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

        if self.model and hasattr(self.model, "names") and self.model.names:
            self.target_class_ids = [k for k, v in self.model.names.items() if v in ALLOWED_CLASSES]

    def _filter_duplicate_vehicles(self, detections: list[dict], iou_thresh: float = 0.50) -> list[dict]:
        """
        Suppresses duplicate boxes across overlapping vehicle classes (e.g. car vs truck).
        Keeps the detection with highest confidence.
        """
        veh_classes = {"car", "truck", "bus", "motorcycle"}
        vehicles = [d for d in detections if d["class"] in veh_classes]
        non_vehicles = [d for d in detections if d["class"] not in veh_classes]
        if len(vehicles) <= 1:
            return detections

        vehicles.sort(key=lambda x: x["conf"], reverse=True)
        kept_vehicles = []
        for v in vehicles:
            b1 = v["bbox"]
            suppress = False
            for kv in kept_vehicles:
                b2 = kv["bbox"]
                xA = max(b1.x, b2.x)
                yA = max(b1.y, b2.y)
                xB = min(b1.x + b1.width, b2.x + b2.width)
                yB = min(b1.y + b1.height, b2.y + b2.height)
                inter = max(0.0, xB - xA) * max(0.0, yB - yA)
                union = (b1.width * b1.height) + (b2.width * b2.height) - inter
                if union > 0 and (inter / union) > iou_thresh:
                    suppress = True
                    break
            if not suppress:
                kept_vehicles.append(v)

        return non_vehicles + kept_vehicles

    def process_frame(
        self,
        frame_bgr: np.ndarray,
        timestamp_sec: float,
    ) -> tuple[list[TrackedEntity], list[ANPRResult]]:
        """
        Runs object detection with ByteTrack 2nd-stage association,
        followed by lifecycle track filtering, EMA box smoothing, and footpoint kinematics.
        """
        if frame_bgr is None or frame_bgr.size == 0:
            return [], []

        h, w = frame_bgr.shape[:2]
        raw_detections: list[dict] = []
        plates: list[ANPRResult] = []
        veh_crops_to_queue: dict[int, np.ndarray] = {}

        if self.model is not None:
            try:
                track_kwargs = {
                    "source": frame_bgr,
                    "persist": True,
                    "tracker": self.tracker_config_path,
                    "conf": settings.CONF_THRESHOLD,
                    "iou": settings.IOU_THRESHOLD,
                    "imgsz": settings.IMGSZ,
                    "device": self.device,
                    "verbose": False,
                    "agnostic_nms": True,
                }
                if self.target_class_ids:
                    track_kwargs["classes"] = self.target_class_ids

                results = self.model.track(**track_kwargs)

                if results and len(results) > 0 and results[0].boxes is not None:
                    boxes = results[0].boxes
                    for box in boxes:
                        cls_id = int(box.cls[0].item())
                        cls_name = self.model.names.get(cls_id, "unknown")
                        if cls_name not in ALLOWED_CLASSES:
                            continue

                        raw_conf = float(box.conf[0].item())
                        # Class-specific confidence thresholds to suppress transient noise
                        if cls_name in ["backpack", "handbag", "suitcase"] and raw_conf < 0.48:
                            continue
                        if cls_name in ["person", "bicycle"] and raw_conf < 0.38:
                            continue

                        # Coordinates in pixels
                        xyxy = box.xyxy[0].cpu().numpy()
                        x1, y1, x2, y2 = xyxy
                        conf_pct = int(round(raw_conf * 100))
                        track_id = int(box.id[0].item()) if box.id is not None else int(time.time() * 1000) % 9999

                        # Normalized bounding box (0 to 1)
                        norm_w = min(1.0, float((x2 - x1) / w))
                        norm_h = min(1.0, float((y2 - y1) / h))
                        norm_x = max(0.0, float(x1 / w))
                        norm_y = max(0.0, float(y1 / h))
                        norm_y_center = norm_y + norm_h * 0.5
                        norm_area = norm_w * norm_h

                        # Filter far background horizon clutter
                        if norm_y_center < settings.IGNORE_TOP_Y:
                            continue

                        # Filter tiny noise specks
                        if (
                            norm_w < settings.MIN_BOX_WIDTH
                            or norm_h < settings.MIN_BOX_HEIGHT
                            or norm_area < settings.MIN_BOX_AREA
                        ):
                            continue

                        norm_box = BoundingBox(
                            x=norm_x,
                            y=norm_y,
                            width=norm_w,
                            height=norm_h,
                        )

                        # Crop object for appearance and vehicle ANPR
                        ix1, iy1, ix2, iy2 = max(0, int(x1)), max(0, int(y1)), min(w, int(x2)), min(h, int(y2))
                        obj_crop = frame_bgr[iy1:iy2, ix1:ix2]

                        # Appearance extraction from HSV histogram
                        appearance = extract_entity_appearance(obj_crop, cls_name)

                        # Store candidate crop for confirmed vehicles
                        if cls_name in ["car", "truck", "bus"]:
                            veh_crops_to_queue[track_id] = obj_crop

                        # Attach previously confirmed plate reading if available
                        anpr_res = self.plate_voter.get_confirmed(track_id)

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

        # Suppress duplicate overlapping vehicle detections before tracking manager
        raw_detections = self._filter_duplicate_vehicles(raw_detections, settings.VEHICLE_NMS_IOU)

        # Pass through tracking lifecycle manager:
        # Enforces tentative -> confirmed -> lost -> removed
        # Eliminates 1-frame ghosts, applies EMA smoothing & footpoint kinematics
        entities = self.tracking_manager.update_tracks(
            raw_detections=raw_detections,
            timestamp=timestamp_sec,
            frame_width=w,
            frame_height=h,
        )

        # Trigger ON-DEMAND ASYNC ANPR ONLY FOR CONFIRMED VEHICLES
        # Ceases immediately once a plate is confirmed via multi-frame voting
        queued_count = 0
        for ent in entities:
            if ent.class_name in ["car", "truck", "bus"]:
                confirmed = self.plate_voter.get_confirmed(ent.id)
                if confirmed:
                    ent.anpr = confirmed
                    plates.append(confirmed)
                elif ent.id in veh_crops_to_queue and queued_count < self.async_anpr.max_queue_per_frame:
                    submitted = self.async_anpr.submit_vehicle_crop(
                        track_id=ent.id,
                        vehicle_crop_bgr=veh_crops_to_queue[ent.id],
                        timestamp=timestamp_sec,
                    )
                    if submitted:
                        queued_count += 1

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
            if self._ocr is None:
                from rapidocr_onnxruntime import RapidOCR
                self._ocr = RapidOCR()
            result, _ = self._ocr(prep)
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
