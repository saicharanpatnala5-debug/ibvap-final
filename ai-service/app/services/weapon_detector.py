"""
IBVAP Weapon Detection (Beta) Engine
Object-Centric Detection & Temporal Verification

Policies:
- Strictly object-centric (firearm, bladed_weapon, blunt_object).
- Zero demographic bias; zero role-based labeling.
- Outputs 'possible_weapon' linked to nearest person track only by proximity.
- Label: 'weapon candidate near person #ID'. NEVER 'armed' or 'hostile'.
- Consecutive frame verification (default: 5 frames) to suppress transient optical noise.
- Friendly-forces authorized zone and time window suppression.
"""

import base64
import os
import time
from typing import Optional, List, Dict, Tuple
import cv2
import numpy as np

from app.config import settings
from app.models.schemas import BoundingBox, TrackedEntity, PossibleWeaponEntity


WEAPON_CLASSES = {
    0: "firearm",
    1: "bladed_weapon",
    2: "blunt_object"
}


def bgr_to_base64_jpeg(img_bgr: np.ndarray, quality: int = 80) -> str:
    if img_bgr is None or img_bgr.size == 0:
        return ""
    success, buffer = cv2.imencode(".jpg", img_bgr, [int(cv2.IMWRITE_JPEG_QUALITY), quality])
    if not success:
        return ""
    return "data:image/jpeg;base64," + base64.b64encode(buffer).decode("utf-8")


class WeaponTracklet:
    def __init__(self, track_id: str, subclass: str, bbox: BoundingBox, conf: float, timestamp: float):
        self.track_id = track_id
        self.subclass = subclass
        self.bbox = bbox
        self.conf = conf
        self.last_seen = timestamp
        self.consecutive_hits = 1
        self.nearest_person_id: Optional[int] = None
        self.crop_data_url: Optional[str] = None
        self.is_suppressed = False
        self.suppression_reason: Optional[str] = None
        self.is_confirmed = False


class WeaponDetector:
    _instance = None

    @classmethod
    def get_instance(cls):
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    def __init__(self):
        self.enabled = settings.WEAPON_DETECTION
        self.model_path = settings.WEAPON_MODEL_PATH
        self.conf_threshold = settings.WEAPON_CONF_THRESHOLD
        self.min_consecutive_frames = settings.WEAPON_MIN_CONSECUTIVE_FRAMES
        self.min_pixel_size = settings.WEAPON_MIN_PIXEL_SIZE
        self.model = None
        self.is_loaded = False
        self.active_tracks: Dict[str, WeaponTracklet] = {}
        self.synthetic_test_candidates: List[dict] = []

        # Friendly forces configuration (authorized security sectors & hours)
        self.friendly_zone_keywords = [
            "guard", "security", "sentry", "police", "authorized", "military", "friendly"
        ]
        self.friendly_time_windows: List[Tuple[float, float]] = [] # Video seconds or time of day

        self._init_model()

    def set_enabled(self, enabled: bool):
        self.enabled = enabled
        if enabled and not self.is_loaded:
            self._init_model()

    def set_friendly_time_windows(self, windows: List[Tuple[float, float]]):
        self.friendly_time_windows = windows

    def _init_model(self):
        """Attempts to load trained weapons.pt or weapons.onnx if present."""
        if not self.enabled:
            return

        candidate_paths = [
            self.model_path,
            os.path.join(os.getcwd(), "models", "weapons.pt"),
            os.path.join(os.getcwd(), "models", "weapons.onnx"),
            os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "models", "weapons.pt"),
            os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "models", "weapons.onnx"),
        ]

        for p in candidate_paths:
            if os.path.exists(p):
                try:
                    from ultralytics import YOLO
                    print(f"[IBVAP Weapon Detector] Loading weapon model weights from: {p}")
                    self.model = YOLO(p)
                    self.is_loaded = True
                    return
                except Exception as e:
                    print(f"[IBVAP Weapon Detector] Warning: Could not load {p}: {e}")

        # Safe stub mode if weights haven't been trained/placed yet
        self.is_loaded = False
        print("[IBVAP Weapon Detector] Notice: No models/weapons.pt found. Operating in stub verification mode.")

    def reset(self):
        self.active_tracks.clear()
        self.synthetic_test_candidates.clear()

    def inject_synthetic_detection_for_test(self, candidate: dict):
        """Helper for deterministic automated unit testing of temporal rules and alerts."""
        self.synthetic_test_candidates.append(candidate)

    def _is_friendly_authorized_zone(self, cx: float, cy: float, zones: list) -> Tuple[bool, Optional[str]]:
        """Checks if coordinate falls inside an authorized security/friendly zone."""
        if not zones:
            return False, None

        for z in zones:
            z_name = getattr(z, "name", "") or (z.get("name") if isinstance(z, dict) else "")
            z_name_lower = z_name.lower()
            if any(kw in z_name_lower for kw in self.friendly_zone_keywords):
                # Check point in polygon
                pts = getattr(z, "points", []) or (z.get("points") if isinstance(z, dict) else [])
                if len(pts) >= 3:
                    poly_pts = [(p.x if hasattr(p, "x") else p["x"], p.y if hasattr(p, "y") else p["y"]) for p in pts]
                    # Simple ray-casting point in polygon
                    inside = False
                    n = len(poly_pts)
                    p1x, p1y = poly_pts[0]
                    for i in range(n + 1):
                        p2x, p2y = poly_pts[i % n]
                        if cy > min(p1y, p2y):
                            if cy <= max(p1y, p2y):
                                if cx <= max(p1x, p2x):
                                    if p1y != p2y:
                                        xinters = (cy - p1y) * (p2x - p1x) / (p2y - p1y) + p1x
                                    if p1x == p2x or cx <= xinters:
                                        inside = not inside
                        p1x, p1y = p2x, p2y
                    if inside:
                        return True, f"Authorized security post / zone: '{z_name}'"

        return False, None

    def _is_friendly_authorized_time(self, current_time_sec: float) -> Tuple[bool, Optional[str]]:
        """Checks if timestamp falls inside an authorized operational time window."""
        for start_t, end_t in self.friendly_time_windows:
            if start_t <= current_time_sec <= end_t:
                return True, f"Authorized patrol time window ({start_t:.1f}s - {end_t:.1f}s)"
        return False, None

    def _find_nearest_person(
        self,
        weapon_box: BoundingBox,
        entities: List[TrackedEntity],
        max_dist: float = 0.20
    ) -> Optional[int]:
        """Finds nearest person track ID by Euclidean centroid proximity."""
        wcx = weapon_box.x + weapon_box.width * 0.5
        wcy = weapon_box.y + weapon_box.height * 0.5

        nearest_id = None
        min_d = max_dist

        for ent in entities:
            cls = (ent.class_name or "").lower()
            if cls in ["person", "pedestrian"]:
                pcx = ent.bbox.x + ent.bbox.width * 0.5
                pcy = ent.bbox.y + ent.bbox.height * 0.5
                dist = np.hypot(wcx - pcx, wcy - pcy)
                if dist < min_d:
                    min_d = dist
                    nearest_id = ent.id

        return nearest_id

    def process_frame(
        self,
        frame_bgr: np.ndarray,
        entities: List[TrackedEntity],
        timestamp_sec: float,
        zones: Optional[list] = None
    ) -> List[PossibleWeaponEntity]:
        """
        Runs multi-scale weapon detection (full-frame and person crops).
        Tracks temporal consistency across consecutive frames and applies friendly-forces filters.
        """
        if not self.enabled:
            return []

        h, w = frame_bgr.shape[:2]
        raw_candidates: List[dict] = []

        # 1. Check for injected synthetic detections (for unit testing)
        if self.synthetic_test_candidates:
            for cand in self.synthetic_test_candidates:
                raw_candidates.append(cand)
            self.synthetic_test_candidates.clear()

        # 2. Run real YOLO model inference if loaded
        elif self.model is not None and self.is_loaded:
            try:
                # Stage A: Full frame inference
                res_full = self.model.predict(
                    source=frame_bgr,
                    conf=self.conf_threshold,
                    imgsz=640,
                    verbose=False
                )
                if res_full and len(res_full) > 0 and res_full[0].boxes is not None:
                    for box in res_full[0].boxes:
                        cid = int(box.cls[0].item())
                        cname = WEAPON_CLASSES.get(cid, "firearm")
                        cconf = float(box.conf[0].item())
                        xyxy = box.xyxy[0].cpu().numpy()
                        x1, y1, x2, y2 = xyxy
                        bw, bh = x2 - x1, y2 - y1

                        if bw >= self.min_pixel_size and bh >= self.min_pixel_size:
                            raw_candidates.append({
                                "subclass": cname,
                                "conf": cconf,
                                "norm_bbox": BoundingBox(
                                    x=max(0.0, float(x1 / w)),
                                    y=max(0.0, float(y1 / h)),
                                    width=min(1.0, float(bw / w)),
                                    height=min(1.0, float(bh / h))
                                ),
                                "crop": frame_bgr[max(0, int(y1)):min(h, int(y2)), max(0, int(x1)):min(w, int(x2))]
                            })

                # Stage B: Upscaled Person-Region Inference for small handheld objects
                for ent in entities:
                    if (ent.class_name or "").lower() in ["person", "pedestrian"]:
                        px1 = int(max(0, ent.bbox.x * w))
                        py1 = int(max(0, ent.bbox.y * h))
                        px2 = int(min(w, (ent.bbox.x + ent.bbox.width) * w))
                        py2 = int(min(h, (ent.bbox.y + ent.bbox.height) * h))

                        pw, ph = px2 - px1, py2 - py1
                        if pw >= 60 and ph >= 120:
                            person_crop = frame_bgr[py1:py2, px1:px2]
                            if person_crop.size > 0:
                                res_crop = self.model.predict(
                                    source=person_crop,
                                    conf=self.conf_threshold * 0.95,
                                    imgsz=384,
                                    verbose=False
                                )
                                if res_crop and len(res_crop) > 0 and res_crop[0].boxes is not None:
                                    for cbox in res_crop[0].boxes:
                                        cid = int(cbox.cls[0].item())
                                        cname = WEAPON_CLASSES.get(cid, "firearm")
                                        cconf = float(cbox.conf[0].item())
                                        cx1, cy1, cx2, cy2 = cbox.xyxy[0].cpu().numpy()
                                        cbw, cbh = cx2 - cx1, cy2 - cy1

                                        if cbw >= 20 and cbh >= 20:
                                            # Project back to full frame coordinates
                                            gx1, gy1 = px1 + cx1, py1 + cy1
                                            gx2, gy2 = px1 + cx2, py1 + cy2
                                            raw_candidates.append({
                                                "subclass": cname,
                                                "conf": cconf,
                                                "norm_bbox": BoundingBox(
                                                    x=max(0.0, float(gx1 / w)),
                                                    y=max(0.0, float(gy1 / h)),
                                                    width=min(1.0, float((gx2 - gx1) / w)),
                                                    height=min(1.0, float((gy2 - gy1) / h))
                                                ),
                                                "crop": person_crop[max(0, int(cy1)):min(ph, int(cy2)), max(0, int(cx1)):min(pw, int(cx2))]
                                            })
            except Exception as e:
                print(f"[IBVAP Weapon Detector] Inference error: {e}")

        # 3. Temporal Tracking & Association across consecutive frames
        updated_track_ids = set()
        matched_candidates = set()

        for cand_idx, cand in enumerate(raw_candidates):
            cbox = cand["norm_bbox"]
            ccx = cbox.x + cbox.width * 0.5
            ccy = cbox.y + cbox.height * 0.5

            matched_track_id = None
            min_dist = 0.08

            for tid, tracklet in self.active_tracks.items():
                if tid in updated_track_ids:
                    continue
                tcx = tracklet.bbox.x + tracklet.bbox.width * 0.5
                tcy = tracklet.bbox.y + tracklet.bbox.height * 0.5
                dist = np.hypot(ccx - tcx, ccy - tcy)
                if dist < min_dist:
                    min_dist = dist
                    matched_track_id = tid

            if matched_track_id is not None:
                updated_track_ids.add(matched_track_id)
                matched_candidates.add(cand_idx)
                trk = self.active_tracks[matched_track_id]
                trk.consecutive_hits += 1
                trk.last_seen = timestamp_sec
                trk.conf = 0.7 * trk.conf + 0.3 * cand["conf"]
                trk.bbox = cbox
                if "crop" in cand and cand["crop"] is not None and cand["crop"].size > 0:
                    trk.crop_data_url = bgr_to_base64_jpeg(cand["crop"], 80)
            else:
                # New candidate tracklet
                new_tid = f"wpn-{int(timestamp_sec * 1000)}-{len(self.active_tracks) + 1}"
                new_trk = WeaponTracklet(
                    track_id=new_tid,
                    subclass=cand["subclass"],
                    bbox=cbox,
                    conf=cand["conf"],
                    timestamp=timestamp_sec
                )
                if "crop" in cand and cand["crop"] is not None and cand["crop"].size > 0:
                    new_trk.crop_data_url = bgr_to_base64_jpeg(cand["crop"], 80)
                self.active_tracks[new_tid] = new_trk
                updated_track_ids.add(new_tid)

        # Decay inactive tracks older than 1.5s
        to_del = [tid for tid, trk in self.active_tracks.items() if (timestamp_sec - trk.last_seen) > 1.5]
        for tid in to_del:
            del self.active_tracks[tid]

        # 4. Filter confirmed detections (consecutive hits >= threshold) & apply friendly-forces logic
        results: List[PossibleWeaponEntity] = []

        for tid, trk in self.active_tracks.items():
            is_confirmed = trk.consecutive_hits >= self.min_consecutive_frames
            trk.is_confirmed = is_confirmed

            # Link to nearest person track
            nearest_person_id = self._find_nearest_person(trk.bbox, entities)
            trk.nearest_person_id = nearest_person_id

            label = (
                f"weapon candidate near person #{nearest_person_id}"
                if nearest_person_id is not None
                else "weapon candidate (unassociated)"
            )

            # Friendly forces evaluation
            tcx = trk.bbox.x + trk.bbox.width * 0.5
            tcy = trk.bbox.y + trk.bbox.height * 0.5
            zone_suppressed, zone_reason = self._is_friendly_authorized_zone(tcx, tcy, zones or [])
            time_suppressed, time_reason = self._is_friendly_authorized_time(timestamp_sec)

            is_suppressed = zone_suppressed or time_suppressed
            suppression_reason = zone_reason or time_reason

            trk.is_suppressed = is_suppressed
            trk.suppression_reason = suppression_reason

            results.append(PossibleWeaponEntity(
                id=trk.track_id,
                subclass=trk.subclass,
                confidence=round(trk.conf, 2),
                bbox=trk.bbox,
                nearestPersonTrackId=nearest_person_id,
                label=label,
                cropDataUrl=trk.crop_data_url,
                isConsecutiveConfirmed=is_confirmed,
                consecutiveHits=trk.consecutive_hits,
                isFriendlyZoneSuppressed=is_suppressed,
                suppressionReason=suppression_reason,
                verificationStatus="Needs operator verification",
                detectedAt=trk.last_seen
            ))

        return results
