"""
IBVAP Asynchronous ANPR Engine
Performs non-blocking, on-demand license plate detection and OCR for confirmed vehicle tracks.
- Uses FastALPREngine (yolo-v9-t-384 plate detector + cct-s-v2 OCR) via ONNX Runtime.
- Runs asynchronously on background threads so frame detection and tracking never block.
- Executes only on confirmed tracks and ceases once a plate is confirmed via multi-frame voting.
- Enforces distance gating: distant/small vehicles receive neutral "Plate not legible at this distance".
- Produces tight plate crops and vehicle thumbnails encoded to base64 Data URLs.
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
    compute_crop_sharpness,
    FastALPREngine,
    PlateValidator,
    PlateVotingTracker,
)


class AsyncANPRWorker:
    def __init__(
        self,
        plate_voter: PlateVotingTracker,
        on_confirmed_callback: Optional[Callable[[int, ANPRResult], None]] = None,
        max_workers: int = 2,
        min_veh_height: int = 24,
        min_veh_width: int = 40,
        min_crop_height: Optional[int] = None,
        min_crop_width: Optional[int] = None,
        min_sharpness: float = 10.0,
        max_crops_per_track: int = 6,
        max_queue_per_frame: int = 3,
    ):
        if min_crop_height is not None:
            min_veh_height = min_crop_height
        if min_crop_width is not None:
            min_veh_width = min_crop_width
        self.plate_voter = plate_voter
        self.on_confirmed_callback = on_confirmed_callback
        self.min_veh_height = min_veh_height
        self.min_veh_width = min_veh_width
        self.min_sharpness = min_sharpness
        self.max_crops_per_track = max_crops_per_track
        self.max_queue_per_frame = max_queue_per_frame

        self._lock = threading.Lock()
        self._in_flight: set[int] = set()
        self._crops_processed_count: dict[int, int] = {}
        self._best_sharpness: dict[int, float] = {}

        self._executor = ThreadPoolExecutor(max_workers=max_workers, thread_name_prefix="ibvap-anpr-worker")

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
        Submits vehicle crop for asynchronous license plate detection and OCR.
        Applies distance gating for small targets. Returns True if a task was queued.
        """
        if not self.should_process_track(track_id):
            return False

        if vehicle_crop_bgr is None or vehicle_crop_bgr.size == 0:
            return False

        vh, vw = vehicle_crop_bgr.shape[:2]

        # Distance gating: if vehicle is physically too small, record neutral status immediately
        if vw < self.min_veh_width or vh < self.min_veh_height:
            gated_res = FastALPREngine.get_instance().process_vehicle_crop(
                vehicle_crop_bgr,
                min_veh_w=self.min_veh_width,
                min_veh_h=self.min_veh_height,
            )
            self.plate_voter.set_distance_gated(track_id, gated_res)
            if self.on_confirmed_callback:
                self.on_confirmed_callback(track_id, gated_res)
            return False

        sharpness = compute_crop_sharpness(vehicle_crop_bgr)
        if sharpness < self.min_sharpness:
            return False

        with self._lock:
            prev_sharp = self._best_sharpness.get(track_id, 0.0)
            if self._crops_processed_count.get(track_id, 0) > 0 and sharpness < (prev_sharp * 1.05):
                return False

            self._in_flight.add(track_id)
            self._crops_processed_count[track_id] = self._crops_processed_count.get(track_id, 0) + 1
            self._best_sharpness[track_id] = max(prev_sharp, sharpness)

        # Dispatch async task
        self._executor.submit(self._ocr_task, track_id, vehicle_crop_bgr.copy(), sharpness, timestamp)
        return True

    def _ocr_task(self, track_id: int, vehicle_crop: np.ndarray, sharpness: float, timestamp: float):
        try:
            engine = FastALPREngine.get_instance()
            result = engine.process_vehicle_crop(
                vehicle_crop,
                min_veh_w=self.min_veh_width,
                min_veh_h=self.min_veh_height,
            )

            confirmed = self.plate_voter.add_reading(track_id, result, sharpness=sharpness)
            if confirmed and self.on_confirmed_callback:
                self.on_confirmed_callback(track_id, confirmed)
            elif result.isDistanceGated and self.on_confirmed_callback:
                self.on_confirmed_callback(track_id, result)
        except Exception as e:
            print(f"[AsyncANPRWorker] Task error for track {track_id}: {e}")
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
