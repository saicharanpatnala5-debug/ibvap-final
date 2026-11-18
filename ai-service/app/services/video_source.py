import asyncio
import queue
import threading
import time
from typing import Optional
import cv2
import numpy as np
from fastapi import WebSocket

from app.config import settings
from app.models.schemas import FrameStreamPayload, VirtualZone, ZoneEvent
from app.services.detector import SurveillanceDetector
from app.services.low_light import compute_frame_luminance, apply_clahe_enhancement
from app.services.zones import ZoneBreachMonitor


class ActiveVideoSource:
    def __init__(
        self,
        source_id: str,
        source_type: str,
        source_url: str,
        loop: bool = True,
        zones: Optional[list[VirtualZone]] = None,
    ):
        self.source_id = source_id
        self.source_type = source_type
        self.source_url = source_url
        self.loop = loop

        self.running = False
        self.thread: Optional[threading.Thread] = None
        self.detector = SurveillanceDetector()
        self.zone_monitor = ZoneBreachMonitor(debounce_frames=3)
        if zones:
            self.zone_monitor.set_zones(zones)

        # Real-time bounded frame queue (maxsize 2 drops oldest to avoid buffering lag)
        self.frame_queue: queue.Queue = queue.Queue(maxsize=2)

        # Shared latest state (protected by lock)
        self.lock = threading.Lock()
        self.latest_frame_bgr: Optional[np.ndarray] = None
        self.latest_frame_jpeg: Optional[bytes] = None
        self.latest_payload: Optional[FrameStreamPayload] = None
        self.fps: float = 30.0
        self.width: int = 1280
        self.height: int = 720
        self.total_frames: int = 0
        self.status: str = "connecting"

        # Connected WebSocket clients for this source
        self.subscribers: set[WebSocket] = set()

    def start(self):
        self.running = True
        self.thread = threading.Thread(target=self._capture_and_process_loop, daemon=True)
        self.thread.start()

    def stop(self):
        self.running = False
        if self.thread and self.thread.is_alive():
            self.thread.join(timeout=2.0)
        self.status = "stopped"

    def update_zones(self, zones: list[VirtualZone]):
        self.zone_monitor.set_zones(zones)

    def _open_capture(self) -> Optional[cv2.VideoCapture]:
        # Handle webcam index
        if self.source_type == "webcam":
            try:
                idx = int(self.source_url)
            except ValueError:
                idx = 0
            cap = cv2.VideoCapture(idx)
        else:
            cap = cv2.VideoCapture(self.source_url)

        if cap.isOpened():
            self.fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
            if self.fps <= 0 or self.fps > 120:
                self.fps = 30.0
            self.width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH) or 1280)
            self.height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT) or 720)
            return cap
        return None

    def _capture_and_process_loop(self):
        frame_idx = 0
        reconnect_attempts = 0

        while self.running:
            cap = self._open_capture()
            if not cap:
                self.status = "error"
                reconnect_attempts += 1
                if self.source_type == "rtsp":
                    time.sleep(min(10.0, 1.5 * reconnect_attempts))
                    continue
                else:
                    # Synthetic black frame fallback if file not found
                    break

            self.status = "active"
            reconnect_attempts = 0
            frame_delay = 1.0 / max(1.0, min(self.fps, 60.0))

            while self.running and cap.isOpened():
                start_t = time.time()
                ret, frame = cap.read()

                if not ret or frame is None:
                    if self.loop and self.source_type == "file":
                        cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                        continue
                    else:
                        break

                frame_idx += 1
                now_sec = time.time()

                # Low-light luminance evaluation
                avg_lum = compute_frame_luminance(frame)
                is_night = avg_lum < settings.LOW_LIGHT_LUMINANCE_THRESHOLD

                # Auto CLAHE enhancement if night mode active & enabled
                processed_frame = frame
                if is_night and settings.ENABLE_LOW_LIGHT_CLAHE:
                    processed_frame = apply_clahe_enhancement(frame)

                # Neural detection & ByteTrack tracking
                entities, plates = self.detector.process_frame(processed_frame, now_sec)

                # Zone breach and virtual fence crossing checks
                zone_events = self.zone_monitor.update(entities, now_sec)

                # Construct payload
                payload = FrameStreamPayload(
                    frame_index=frame_idx,
                    timestamp=int(now_sec * 1000),
                    width=frame.shape[1],
                    height=frame.shape[0],
                    is_night_mode=is_night,
                    average_luminance=round(avg_lum, 1),
                    entities=entities,
                    zone_events=zone_events,
                    plates=plates,
                    weapons=getattr(self.detector, 'latest_weapons', []),
                )

                # Encode frame to JPEG
                _, jpeg_buf = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 80])
                jpeg_bytes = jpeg_buf.tobytes()

                # Update latest state under lock
                with self.lock:
                    self.latest_frame_bgr = frame
                    self.latest_frame_jpeg = jpeg_bytes
                    self.latest_payload = payload
                    self.total_frames = frame_idx

                # Broadcast to connected WebSocket subscribers asynchronously
                self._broadcast_payload(payload)

                # Maintain realistic video playback pacing for files
                elapsed = time.time() - start_t
                sleep_time = frame_delay - elapsed
                if sleep_time > 0:
                    time.sleep(sleep_time)

            cap.release()

    def _broadcast_payload(self, payload: FrameStreamPayload):
        if not self.subscribers:
            return

        json_str = payload.model_dump_json(by_alias=True)
        dead_sockets = set()

        for ws in list(self.subscribers):
            try:
                # Use threadsafe event loop call if loop is running
                asyncio.run_coroutine_threadsafe(ws.send_text(json_str), asyncio.get_event_loop())
            except Exception:
                dead_sockets.add(ws)

        for dead in dead_sockets:
            self.subscribers.discard(dead)

    def get_latest_jpeg(self) -> Optional[bytes]:
        with self.lock:
            return self.latest_frame_jpeg

    def get_latest_state(self) -> Optional[FrameStreamPayload]:
        with self.lock:
            return self.latest_payload


class VideoSourceManager:
    def __init__(self):
        self.sources: dict[str, ActiveVideoSource] = {}

    def add_source(
        self,
        source_id: str,
        source_type: str,
        source_url: str,
        loop: bool = True,
        zones: Optional[list[VirtualZone]] = None,
    ) -> ActiveVideoSource:
        # If source already exists, stop and replace it
        if source_id in self.sources:
            self.sources[source_id].stop()

        source = ActiveVideoSource(
            source_id=source_id,
            source_type=source_type,
            source_url=source_url,
            loop=loop,
            zones=zones,
        )
        source.start()
        self.sources[source_id] = source
        return source

    def get_source(self, source_id: str) -> Optional[ActiveVideoSource]:
        return self.sources.get(source_id)

    def remove_source(self, source_id: str) -> bool:
        source = self.sources.pop(source_id, None)
        if source:
            source.stop()
            return True
        return False

    def list_sources(self) -> list[dict]:
        return [
            {
                "source_id": s.source_id,
                "source_type": s.source_type,
                "source_url": s.source_url,
                "status": s.status,
                "fps": round(s.fps, 1),
                "width": s.width,
                "height": s.height,
                "total_frames": s.total_frames,
            }
            for s in self.sources.values()
        ]

    def shutdown_all(self):
        for s in self.sources.values():
            s.stop()
        self.sources.clear()
