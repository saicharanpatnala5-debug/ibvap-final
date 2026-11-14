import pytest
from app.models.schemas import BoundingBox, Point, VirtualZone
from app.services.tracking_manager import TrackingManager, TrackRecord
from app.services.zones import ZoneBreachMonitor


def test_ghost_track_suppression():
    """
    Verifies that a 1-frame or 2-frame ghost detection is NEVER emitted as an active entity.
    Requires min_hits=3 consecutive detections.
    """
    manager = TrackingManager(min_hits=3, max_lost_frames=30)

    # Frame 1: noise ghost detection appears
    raw_frame_1 = [{
        "id": 999,
        "class": "person",
        "bbox": BoundingBox(x=0.5, y=0.5, width=0.1, height=0.2),
        "conf": 65,
    }]
    entities_1 = manager.update_tracks(raw_frame_1, timestamp=1.0, frame_width=640, frame_height=360)
    assert len(entities_1) == 0  # Tentative, not emitted!

    # Frame 2: noise ghost vanishes
    entities_2 = manager.update_tracks([], timestamp=1.033, frame_width=640, frame_height=360)
    assert len(entities_2) == 0

    # Ensure ghost was discarded and not retained
    assert 999 not in manager.tracks
    assert 999 not in manager.lost_pool


def test_track_confirmation_after_min_hits():
    manager = TrackingManager(min_hits=3)

    raw_det = {
        "id": 101,
        "class": "car",
        "bbox": BoundingBox(x=0.2, y=0.3, width=0.15, height=0.1),
        "conf": 80,
    }

    # Hit 1 (tentative)
    assert len(manager.update_tracks([raw_det], 1.0, 640, 360)) == 0
    # Hit 2 (tentative)
    assert len(manager.update_tracks([raw_det], 1.033, 640, 360)) == 0
    # Hit 3 (confirmed!)
    confirmed = manager.update_tracks([raw_det], 1.066, 640, 360)
    assert len(confirmed) == 1
    assert confirmed[0].id == 101
    assert confirmed[0].state == "confirmed"
    assert confirmed[0].hits == 3


def test_occlusion_gap_id_retention():
    """
    Verifies that a track retains its ID across a 1.0-second occlusion gap (30 missing frames).
    """
    manager = TrackingManager(min_hits=3, max_lost_frames=60, enable_relink=True)

    # Confirm track over 3 frames
    for i in range(3):
        t = 1.0 + i * 0.033
        manager.update_tracks([{
            "id": 202,
            "class": "person",
            "bbox": BoundingBox(x=0.3, y=0.4, width=0.1, height=0.2),
            "conf": 85,
        }], t, 640, 360)

    # 1.0s Occlusion Gap (30 frames of silence)
    for i in range(30):
        t = 1.1 + i * 0.033
        manager.update_tracks([], t, 640, 360)

    assert 202 in manager.lost_pool

    # Re-detection after occlusion
    re_detected = manager.update_tracks([{
        "id": 202,
        "class": "person",
        "bbox": BoundingBox(x=0.35, y=0.4, width=0.1, height=0.2),
        "conf": 82,
    }], 2.2, 640, 360)

    assert len(re_detected) == 1
    assert re_detected[0].id == 202
    assert re_detected[0].state == "confirmed"


def test_box_jitter_smoothing():
    """
    Verifies that EMA smoothing reduces bounding box coordinate variance compared to jittery inputs.
    """
    record = TrackRecord(
        track_id=303,
        initial_class="car",
        initial_box=BoundingBox(x=0.5, y=0.5, width=0.2, height=0.1),
        confidence=80,
        timestamp=1.0,
    )

    # Feed jittery alternating inputs
    jitter_inputs = [0.52, 0.48, 0.53, 0.47, 0.52, 0.48, 0.51, 0.49]
    smoothed_outputs = []

    for idx, jitter_x in enumerate(jitter_inputs):
        box = BoundingBox(x=jitter_x, y=0.5, width=0.2, height=0.1)
        record.update(box, "car", 80, 1.0 + idx * 0.033, 640, 360, min_hits=1)
        smoothed_outputs.append(record.smoothed_box.x)

    import statistics
    variance_raw = statistics.variance(jitter_inputs)
    variance_smoothed = statistics.variance(smoothed_outputs)

    assert variance_smoothed < variance_raw


def test_class_majority_voting():
    record = TrackRecord(
        track_id=404,
        initial_class="person",
        initial_box=BoundingBox(x=0.1, y=0.1, width=0.1, height=0.2),
        confidence=85,
        timestamp=1.0,
    )

    # Feed 7 "person" and 2 noisy "bicycle" misclassifications
    classes = ["person", "person", "person", "bicycle", "person", "bicycle", "person"]
    for idx, cls in enumerate(classes):
        box = BoundingBox(x=0.1, y=0.1, width=0.1, height=0.2)
        record.update(box, cls, 80, 1.0 + idx * 0.033, 640, 360, min_hits=1)

    # Mode remains "person" despite classification noise
    assert record.current_class == "person"


def test_zone_debounce_edge_jitter():
    """
    Verifies that a target standing right at a zone boundary does not spam entry/exit events.
    """
    monitor = ZoneBreachMonitor(cooldown_seconds=10.0, debounce_frames=3)
    zone = VirtualZone(
        id="z-test",
        cameraId="cam-1",
        name="Border Gate",
        type="polygon",
        points=[
            Point(x=0.2, y=0.2),
            Point(x=0.8, y=0.2),
            Point(x=0.8, y=0.8),
            Point(x=0.2, y=0.8),
        ],
        enabled=True,
    )
    monitor.set_zones([zone])

    track_inside = {"id": 505, "class": "person", "bbox": BoundingBox(x=0.3, y=0.3, width=0.1, height=0.1)}
    track_outside = {"id": 505, "class": "person", "bbox": BoundingBox(x=0.1, y=0.1, width=0.1, height=0.1)}

    # Frame 1: inside (debounce count 1 - no event yet)
    e1 = monitor.update([track_inside], 1.0)
    assert len(e1) == 0

    # Frame 2: inside (debounce count 2 - no event yet)
    e2 = monitor.update([track_inside], 1.033)
    assert len(e2) == 0

    # Frame 3: inside (debounce count 3 - ENTRY EVENT FIRED!)
    e3 = monitor.update([track_inside], 1.066)
    assert len(e3) == 1
    assert e3[0].eventType == "entry"

    # Frame 4: 1-frame jitter outside (debounce outside count 1 - does NOT exit)
    e4 = monitor.update([track_outside], 1.100)
    assert len(e4) == 0
    assert monitor.track_states[(505, "z-test")]["inside"] is True
