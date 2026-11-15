"""
IBVAP Asynchronous ANPR Engine
Performs non-blocking, on-demand RapidOCR license plate recognition for confirmed vehicle tracks.
- Runs OCR asynchronously on background threads so frame detection and tracking never block.
- Executes only on confirmed tracks and ceases once a plate is confirmed via multi-frame voting.
- Enforces minimum crop dimensions and sharpness thresholds.
- Caps OCR submissions per frame to prevent CPU saturation.
"""

import time
import threading
from concurrent.futures import ThreadPoolExecutor
from typing import Optional, Callable
import numpy as np
import cv2

from app.models.schemas import ANPRResult
from app.services.anpr import (
    crop_license_plate_region,
    compute_crop_sharpness,
    preprocess_plate_crop,
    PlateValidator,
    PlateVotingTracker,
)


class AsyncANPRWorker:
    def __init__(
        self,
        plate_voter: PlateVotingTracker,
        on_confirmed_callback: Optional[Callable[[int, ANPRResult], None]] = None,
        max_workers: int = 2,
        min_crop_height: int = 18,
        min_crop_width: int = 50,
        min_sharpness: float = 20.0,
        max_crops_per_track: int = 4,
        max_queue_per_frame: int = 2,
    ):
        self.plate_voter = plate_voter
        self.on_confirmed_callback = on_confirmed_callback
        self.min_crop_height = min_crop_height
        self.min_crop_width = min_crop_width
        self.min_sharpness = min_sharpness
        self.max_crops_per_track = max_crops_per_track
        self.max_queue_per_frame = max_queue_per_frame

        self._lock = threading.Lock()
        self._in_flight: set[int] = set()
        self._crops_processed_count: dict[int, int] = {}
        self._best_sharpness: dict[int, float] = {}

        self._ocr = None
        self._executor = ThreadPoolExecutor(max_workers=max_workers, thread_name_prefix="ibvap-anpr-worker")

    def _get_ocr(self):
        if self._ocr is None:
            try:
                from rapidocr_onnxruntime import RapidOCR
                self._ocr = RapidOCR()
            except Exception as e:
                print(f"[AsyncANPRWorker] RapidOCR init warning: {e}")
                self._ocr = False
        return self._ocr if self._ocr is not False else None

    def should_process_track(self, track_id: int) -> bool:
        """Quick check to avoid unnecessary cropping for already-confirmed tracks."""
        if self.plate_voter.is_confirmed(track_id):
            return False
        with self._lock:
            if track_id in self._in_flight:
                return False
            if self._crops_processed_count.get(track_id, 0) >= self.max_crops_per_track:
                return False
        return True

    def submit_vehicle_crop(
        self,
        track_id: int,
        vehicle_crop_bgr: np.ndarray,
        timestamp: float,
    ) -> bool:
        """
        Attempts to crop plate region and submits for async OCR if valid.
        Returns True if a task was queued.
        """
        if not self.should_process_track(track_id):
            return False

        if vehicle_crop_bgr is None or vehicle_crop_bgr.size == 0:
            return False

        vh, vw = vehicle_crop_bgr.shape[:2]
        if vh < 30 or vw < 50:
            return False

        plate_crop = crop_license_plate_region(vehicle_crop_bgr)
        if plate_crop is None or plate_crop.size == 0:
            return False

        ph, pw = plate_crop.shape[:2]
        if ph < self.min_crop_height or pw < self.min_crop_width:
            return False

        sharpness = compute_crop_sharpness(plate_crop)
        if sharpness < self.min_sharpness:
            return False

        with self._lock:
            # Check if this crop is better than previously evaluated crops for this track
            prev_sharp = self._best_sharpness.get(track_id, 0.0)
            if self._crops_processed_count.get(track_id, 0) > 0 and sharpness < (prev_sharp * 1.1):
                return False

            self._in_flight.add(track_id)
            self._crops_processed_count[track_id] = self._crops_processed_count.get(track_id, 0) + 1
            self._best_sharpness[track_id] = max(prev_sharp, sharpness)

        # Dispatch async OCR task
        self._executor.submit(self._ocr_task, track_id, plate_crop.copy(), sharpness, timestamp)
        return True

    def _ocr_task(self, track_id: int, plate_crop: np.ndarray, sharpness: float, timestamp: float):
        try:
            ocr_engine = self._get_ocr()
            if ocr_engine is None:
                return

            prep = preprocess_plate_crop(plate_crop)
            result, _ = ocr_engine(prep)
            if result:
                for line in result:
                    raw_text = line[1]
                    conf = float(line[2]) * 100.0
                    cleaned = PlateValidator.clean_text(raw_text)
                    corrected = PlateValidator.position_aware_correction(cleaned)
                    is_valid, ftype, vstatus = PlateValidator.validate(corrected)

                    if corrected and len(corrected) >= 6:
                        candidate = ANPRResult(
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
                        confirmed = self.plate_voter.add_reading(track_id, candidate, sharpness=sharpness)
                        if confirmed and self.on_confirmed_callback:
                            self.on_confirmed_callback(track_id, confirmed)
                        break
        except Exception:
            pass
        finally:
            with self._lock:
                self._in_flight.discard(track_id)

    def flush(self, timeout: float = 3.0):
        """Wait for in-flight tasks to complete."""
        t0 = time.time()
        while time.time() - t0 < timeout:
            with self._lock:
                if not self._in_flight:
                    break
            time.sleep(0.02)

    def reset(self):
        """Resets in-flight sets and crop counts for a new video stream."""
        with self._lock:
            self._in_flight.clear()
            self._crops_processed_count.clear()
            self._best_sharpness.clear()
        self.plate_voter.reset()

    def shutdown(self):
        self._executor.shutdown(wait=False)
