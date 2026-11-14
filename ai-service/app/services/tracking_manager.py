from collections import Counter
import math
import time
from typing import Optional, Literal
import numpy as np

from app.models.schemas import BoundingBox, Point, TrackedEntity, EntityAppearance, ANPRResult


def compute_direction_string(dx_px: float, dy_px: float, velocity: float) -> str:
    """
    Computes cardinal or intercardinal direction vector from displacement deltas.
    """
    if velocity < 3.0:
        return "Stationary"

    # Screen coordinates: +x is East (right), +y is South (down)
    angle_deg = math.degrees(math.atan2(dy_px, dx_px))  # -180 to 180

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


class TrackRecord:
    def __init__(self, track_id: int, initial_class: str, initial_box: BoundingBox, confidence: int, timestamp: float):
        self.id = track_id
        self.state: Literal["tentative", "confirmed", "lost", "removed"] = "tentative"
        self.hits = 1
        self.age = 1
        self.lost_frames = 0
        self.last_seen_time = timestamp

        # Class smoothing: majority vote over rolling window
        self.class_history: list[str] = [initial_class]

        # Box smoothing: Exponential Moving Average (EMA)
        self.smoothed_box = BoundingBox(
            x=initial_box.x,
            y=initial_box.y,
            width=initial_box.width,
            height=initial_box.height,
        )

        # Confidence smoothing
        self.conf_history: list[int] = [confidence]

        # Footpoint & Kinematics (bottom-center of bounding box)
        fx = initial_box.x + initial_box.width / 2.0
        fy = initial_box.y + initial_box.height
        self.footpoint_history: list[tuple[float, float, float]] = [(fx, fy, timestamp)]

        self.velocity = 0.0
        self.direction = "Stationary"
        self.appearance: Optional[EntityAppearance] = None
        self.anpr: Optional[ANPRResult] = None
        self.appearance_hist: Optional[list[float]] = None

    @property
    def current_class(self) -> str:
        # Majority voting over last 12 detections
        recent = self.class_history[-12:]
        counts = Counter(recent)
        return counts.most_common(1)[0][0]

    @property
    def smoothed_confidence(self) -> int:
        recent = self.conf_history[-8:]
        return int(round(sum(recent) / len(recent)))

    @property
    def current_footpoint(self) -> Point:
        return Point(
            x=self.smoothed_box.x + self.smoothed_box.width / 2.0,
            y=self.smoothed_box.y + self.smoothed_box.height,
        )

    def update(
        self,
        new_box: BoundingBox,
        detected_class: str,
        confidence: int,
        timestamp: float,
        frame_width: int,
        frame_height: int,
        min_hits: int = 3,
    ):
        self.age += 1
        self.hits += 1
        self.lost_frames = 0
        self.last_seen_time = timestamp

        # Lifecycle state progression: tentative -> confirmed
        if self.state == "tentative" and self.hits >= min_hits:
            self.state = "confirmed"
        elif self.state == "lost":
            self.state = "confirmed"

        self.class_history.append(detected_class)
        if len(self.class_history) > 24:
            self.class_history.pop(0)

        self.conf_history.append(confidence)
        if len(self.conf_history) > 16:
            self.conf_history.pop(0)

        # Adaptive EMA box smoothing:
        # Lower alpha (0.40) when stationary to eliminate jitter;
        # Higher alpha (0.75) when moving rapidly to avoid trailing lag.
        alpha = 0.70 if self.velocity > 15.0 else 0.40
        self.smoothed_box.x = alpha * new_box.x + (1.0 - alpha) * self.smoothed_box.x
        self.smoothed_box.y = alpha * new_box.y + (1.0 - alpha) * self.smoothed_box.y
        self.smoothed_box.width = alpha * new_box.width + (1.0 - alpha) * self.smoothed_box.width
        self.smoothed_box.height = alpha * new_box.height + (1.0 - alpha) * self.smoothed_box.height

        # Footpoint calculation from smoothed box
        curr_fx = self.smoothed_box.x + self.smoothed_box.width / 2.0
        curr_fy = self.smoothed_box.y + self.smoothed_box.height
        self.footpoint_history.append((curr_fx, curr_fy, timestamp))
        if len(self.footpoint_history) > 16:
            self.footpoint_history.pop(0)

        # Compute velocity and cardinal direction from sliding window
        self._compute_kinematics(frame_width, frame_height)

    def _compute_kinematics(self, frame_width: int, frame_height: int):
        if len(self.footpoint_history) < 2:
            self.velocity = 0.0
            self.direction = "Stationary"
            return

        oldest = self.footpoint_history[0]
        latest = self.footpoint_history[-1]
        dt = latest[2] - oldest[2]

        if dt <= 0.04:
            return

        dx_px = (latest[0] - oldest[0]) * frame_width
        dy_px = (latest[1] - oldest[1]) * frame_height
        dist_px = math.hypot(dx_px, dy_px)

        # Distance threshold: below 8 pixels of net displacement, report Stationary
        if dist_px < 8.0:
            self.velocity = 0.0
            self.direction = "Stationary"
            return

        v = float(dist_px / dt)
        # Apply smoothing to velocity
        self.velocity = round(0.5 * v + 0.5 * self.velocity, 1)
        self.direction = compute_direction_string(dx_px, dy_px, self.velocity)

    def mark_lost(self, max_lost_frames: int = 60):
        self.age += 1
        self.lost_frames += 1
        if self.state == "tentative":
            # Discard tentative tracks immediately if lost before min_hits confirmation
            self.state = "removed"
        elif self.state == "confirmed":
            self.state = "lost"

        if self.lost_frames > max_lost_frames:
            self.state = "removed"


class TrackingManager:
    """
    Robust multi-object track lifecycle manager.
    Enforces tentative -> confirmed -> lost -> removed state machine.
    Suppresses 1-frame ghost tracks (min_hits=3).
    Performs EMA box smoothing, class majority voting, and footpoint kinematics.
    Provides optional Re-ID re-linking for lost tracks.
    """
    def __init__(
        self,
        min_hits: int = 3,
        max_lost_frames: int = 60,
        enable_relink: bool = True,
    ):
        self.min_hits = min_hits
        self.max_lost_frames = max_lost_frames
        self.enable_relink = enable_relink

        # Active tracks: track_id -> TrackRecord
        self.tracks: dict[int, TrackRecord] = {}
        # Lost tracks pool retained for re-linking: track_id -> TrackRecord
        self.lost_pool: dict[int, TrackRecord] = {}

    def update_tracks(
        self,
        raw_detections: list[dict],
        timestamp: float,
        frame_width: int,
        frame_height: int,
    ) -> list[TrackedEntity]:
        """
        raw_detections: list of dicts with:
        {'id': track_id, 'class': cls_name, 'bbox': norm_box, 'conf': conf_pct, 'appearance': app, 'crop': ...}
        """
        matched_track_ids = set()
        active_entities: list[TrackedEntity] = []

        for det in raw_detections:
            tid = det["id"]
            cls_name = det["class"]
            box = det["bbox"]
            conf = det["conf"]

            if tid in self.tracks:
                # Update existing active track
                record = self.tracks[tid]
                record.update(
                    new_box=box,
                    detected_class=cls_name,
                    confidence=conf,
                    timestamp=timestamp,
                    frame_width=frame_width,
                    frame_height=frame_height,
                    min_hits=self.min_hits,
                )
                if det.get("appearance"):
                    record.appearance = det["appearance"]
                    if hasattr(det["appearance"], "colorHist") and det["appearance"].colorHist:
                        record.appearance_hist = det["appearance"].colorHist
                if det.get("anpr"):
                    record.anpr = det["anpr"]

                matched_track_ids.add(tid)
            elif tid in self.lost_pool:
                # Tracker resurrected the same ID after occlusion
                record = self.lost_pool.pop(tid)
                record.update(
                    new_box=box,
                    detected_class=cls_name,
                    confidence=conf,
                    timestamp=timestamp,
                    frame_width=frame_width,
                    frame_height=frame_height,
                    min_hits=self.min_hits,
                )
                if det.get("appearance"):
                    record.appearance = det["appearance"]
                    if hasattr(det["appearance"], "colorHist") and det["appearance"].colorHist:
                        record.appearance_hist = det["appearance"].colorHist
                if det.get("anpr"):
                    record.anpr = det["anpr"]

                self.tracks[tid] = record
                matched_track_ids.add(tid)
            else:
                # Check if this new track can be re-linked to a recently lost track
                relinked_id = None
                if self.enable_relink and self.lost_pool:
                    relinked_id = self._attempt_relink(det, timestamp)

                if relinked_id is not None and relinked_id in self.lost_pool:
                    # Resurrect old stable ID!
                    record = self.lost_pool.pop(relinked_id)
                    record.id = relinked_id
                    record.update(
                        new_box=box,
                        detected_class=cls_name,
                        confidence=conf,
                        timestamp=timestamp,
                        frame_width=frame_width,
                        frame_height=frame_height,
                        min_hits=self.min_hits,
                    )
                    self.tracks[relinked_id] = record
                    matched_track_ids.add(relinked_id)
                else:
                    # New tentative track
                    record = TrackRecord(tid, cls_name, box, conf, timestamp)
                    if det.get("appearance"):
                        record.appearance = det["appearance"]
                        if hasattr(det["appearance"], "colorHist") and det["appearance"].colorHist:
                            record.appearance_hist = det["appearance"].colorHist
                    self.tracks[tid] = record
                    matched_track_ids.add(tid)

        # Mark unmatched tracks as lost or removed
        unmatched_ids = [tid for tid in self.tracks.keys() if tid not in matched_track_ids]
        for uid in unmatched_ids:
            record = self.tracks[uid]
            record.mark_lost(self.max_lost_frames)

            if record.state == "removed":
                self.tracks.pop(uid, None)
                self.lost_pool.pop(uid, None)
            elif record.state == "lost":
                # Move to lost pool for re-linking
                self.lost_pool[uid] = record
                self.tracks.pop(uid, None)

        # Prune old tracks from lost pool
        stale_lost = [
            lid
            for lid, rec in self.lost_pool.items()
            if (timestamp - rec.last_seen_time) > (self.max_lost_frames / 30.0)
        ]
        for lid in stale_lost:
            self.lost_pool.pop(lid, None)

        # EMIT ONLY CONFIRMED TRACKS!
        # This completely filters out 1-frame or 2-frame ghost track flickers.
        for tid, record in self.tracks.items():
            if record.state == "confirmed":
                conf_val = record.smoothed_confidence
                head_b = None
                if record.current_class == "person":
                    head_b = BoundingBox(
                        x=record.smoothed_box.x + record.smoothed_box.width * 0.2,
                        y=record.smoothed_box.y,
                        width=record.smoothed_box.width * 0.6,
                        height=min(record.smoothed_box.height * 0.25, 0.12),
                    )

                active_entities.append(
                    TrackedEntity(
                        id=record.id,
                        class_name=record.current_class,
                        confidence=conf_val,
                        confidenceTier="high" if conf_val >= 70 else "medium" if conf_val >= 40 else "low",
                        bbox=record.smoothed_box,
                        state=record.state,
                        age=record.age,
                        hits=record.hits,
                        velocity=record.velocity,
                        speed=f"{int(round(record.velocity))} px/s",
                        direction=record.direction,
                        appearance=record.appearance,
                        anpr=record.anpr,
                        headBbox=head_b,
                        footpoint=record.current_footpoint,
                        isLoitering=record.velocity < 5.0 and record.hits >= 30,
                    )
                )

        return active_entities

    def _attempt_relink(self, det: dict, timestamp: float) -> Optional[int]:
        """
        Attempts to re-link an incoming detection to a recently lost track
        based on spatial proximity, same class family, and color histogram correlation.
        """
        new_box = det["bbox"]
        new_foot_x = new_box.x + new_box.width / 2.0
        new_foot_y = new_box.y + new_box.height
        new_class = det["class"]
        new_hist = getattr(det.get("appearance"), "colorHist", None)

        best_id = None
        best_score = 0.0

        for lost_id, lost_rec in self.lost_pool.items():
            # Check elapsed time
            dt = timestamp - lost_rec.last_seen_time
            if dt > 2.5:
                continue

            # Check class compatibility
            if lost_rec.current_class != new_class:
                continue

            # Check footpoint spatial distance
            last_foot = lost_rec.current_footpoint
            dist = math.hypot(new_foot_x - last_foot.x, new_foot_y - last_foot.y)

            # Plausible travel distance within dt (normalized)
            max_dist = min(0.25, 0.08 + dt * 0.08)
            if dist > max_dist:
                continue

            spatial_score = 1.0 - (dist / max_dist)

            # Appearance similarity
            app_score = 0.5
            if new_hist and lost_rec.appearance_hist and len(new_hist) == len(lost_rec.appearance_hist):
                # Cosine / dot correlation between normalized histograms
                dot = sum(a * b for a, b in zip(new_hist, lost_rec.appearance_hist))
                app_score = max(0.0, min(1.0, dot))

            total_score = spatial_score * 0.55 + app_score * 0.45
            if total_score > 0.65 and total_score > best_score:
                best_score = total_score
                best_id = lost_id

        return best_id
