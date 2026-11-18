import numpy as np
import pytest
from app.services.weapon_detector import WeaponDetector
from app.models.schemas import BoundingBox, TrackedEntity, VirtualZone, Point


@pytest.fixture
def clean_detector():
    detector = WeaponDetector()
    detector.reset()
    detector.enabled = True
    return detector


def test_feature_flag_off_returns_empty():
    """
    Ensures that when the feature flag is disabled (default),
    the weapon detector returns an empty list without processing.
    """
    detector = WeaponDetector()
    detector.enabled = False
    dummy_frame = np.zeros((480, 640, 3), dtype=np.uint8)
    
    # Inject synthetic detection
    detector.inject_synthetic_detection_for_test({
        "subclass": "firearm",
        "conf": 0.85,
        "norm_bbox": BoundingBox(x=0.4, y=0.4, width=0.1, height=0.1),
        "crop": np.zeros((40, 40, 3), dtype=np.uint8),
    })
    
    res = detector.process_frame(dummy_frame, entities=[], timestamp_sec=1.0)
    assert res == [], "Weapon detector must return empty list when disabled"


def test_consecutive_frame_temporal_hysteresis(clean_detector):
    """
    Validates the 5-consecutive-frame requirement:
    Frames 1-4 must not confirm; frame 5 must confirm.
    """
    dummy_frame = np.zeros((480, 640, 3), dtype=np.uint8)
    bbox = BoundingBox(x=0.4, y=0.4, width=0.1, height=0.1)

    for frame_idx in range(1, 6):
        clean_detector.inject_synthetic_detection_for_test({
            "subclass": "firearm",
            "conf": 0.85,
            "norm_bbox": bbox,
            "crop": np.zeros((40, 40, 3), dtype=np.uint8),
        })
        results = clean_detector.process_frame(dummy_frame, entities=[], timestamp_sec=float(frame_idx))
        assert len(results) == 1, f"Frame {frame_idx} should produce 1 candidate"
        cand = results[0]

        if frame_idx < 5:
            assert cand.isConsecutiveConfirmed is False, (
                f"Frame {frame_idx} should not be confirmed (< 5 frames)"
            )
            assert cand.consecutiveHits == frame_idx
        else:
            assert cand.isConsecutiveConfirmed is True, (
                f"Frame {frame_idx} must be confirmed (>= 5 frames)"
            )
            assert cand.consecutiveHits == 5


def test_nearest_person_linking_and_no_demographic_or_role_bias(clean_detector):
    """
    Validates that a weapon candidate links to the nearest person track ID (#10)
    by proximity, uses purely objective labeling, and NEVER labels the person as
    'armed', 'attacker', 'hostile', or 'threat'.
    """
    dummy_frame = np.zeros((480, 640, 3), dtype=np.uint8)
    # Weapon at centroid (0.45, 0.45)
    clean_detector.inject_synthetic_detection_for_test({
        "subclass": "firearm",
        "conf": 0.88,
        "norm_bbox": BoundingBox(x=0.42, y=0.42, width=0.06, height=0.06),
        "crop": np.zeros((30, 30, 3), dtype=np.uint8),
    })

    # Person #10 nearby at centroid (0.44, 0.48), Person #20 far away at (0.80, 0.80)
    person_10 = TrackedEntity(
        id=10,
        class_name="person",
        confidence=90,
        bbox=BoundingBox(x=0.40, y=0.35, width=0.08, height=0.25),
    )
    person_20 = TrackedEntity(
        id=20,
        class_name="person",
        confidence=92,
        bbox=BoundingBox(x=0.75, y=0.70, width=0.10, height=0.20),
    )

    results = clean_detector.process_frame(dummy_frame, entities=[person_10, person_20], timestamp_sec=1.0)
    assert len(results) == 1
    cand = results[0]

    # Linking
    assert cand.nearestPersonTrackId == 10, "Should link to nearest person (#10)"
    assert "candidate near person #10" in cand.label.lower()

    # Bias and terminology audit checks
    label_lower = cand.label.lower()
    forbidden_terms = ["armed", "attacker", "hostile", "gunman", "threat", "terrorist", "suspect"]
    for term in forbidden_terms:
        assert term not in label_lower, f"Forbidden biased term '{term}' found in label: {cand.label}"

    # Verify person track class is uncorrupted
    assert person_10.class_name == "person"
    assert person_20.class_name == "person"


def test_friendly_forces_zone_suppression(clean_detector):
    """
    Validates that weapon candidates inside an authorized security/guard post
    zone are automatically suppressed and marked with an audit reason.
    """
    dummy_frame = np.zeros((480, 640, 3), dtype=np.uint8)
    
    # Candidate inside [0.1, 0.1] to [0.3, 0.3]
    clean_detector.inject_synthetic_detection_for_test({
        "subclass": "firearm",
        "conf": 0.90,
        "norm_bbox": BoundingBox(x=0.15, y=0.15, width=0.05, height=0.05),
        "crop": np.zeros((30, 30, 3), dtype=np.uint8),
    })

    guard_zone = VirtualZone(
        id="zone-guard-1",
        cameraId="cam-1",
        name="Main Security Guard Post (Authorized)",
        type="polygon",
        points=[
            Point(x=0.10, y=0.10),
            Point(x=0.30, y=0.10),
            Point(x=0.30, y=0.30),
            Point(x=0.10, y=0.30),
        ],
    )

    results = clean_detector.process_frame(
        dummy_frame,
        entities=[],
        timestamp_sec=1.0,
        zones=[guard_zone],
    )
    assert len(results) == 1
    cand = results[0]
    assert cand.isFriendlyZoneSuppressed is True
    assert cand.suppressionReason is not None
    assert "Authorized security post" in cand.suppressionReason


def test_friendly_forces_time_window_suppression(clean_detector):
    """
    Validates that detections occurring during authorized operational patrol
    time windows are suppressed, and unsuppressed outside that window.
    """
    dummy_frame = np.zeros((480, 640, 3), dtype=np.uint8)
    clean_detector.set_friendly_time_windows([(10.0, 20.0)])  # Authorized window: 10s to 20s

    # Case A: Inside window (t = 15.0s)
    clean_detector.inject_synthetic_detection_for_test({
        "subclass": "firearm",
        "conf": 0.90,
        "norm_bbox": BoundingBox(x=0.5, y=0.5, width=0.05, height=0.05),
        "crop": np.zeros((30, 30, 3), dtype=np.uint8),
    })
    res_inside = clean_detector.process_frame(dummy_frame, entities=[], timestamp_sec=15.0)
    assert len(res_inside) == 1
    assert res_inside[0].isFriendlyZoneSuppressed is True
    assert "Authorized patrol time window" in res_inside[0].suppressionReason

    # Reset tracks
    clean_detector.reset()

    # Case B: Outside window (t = 25.0s)
    clean_detector.inject_synthetic_detection_for_test({
        "subclass": "firearm",
        "conf": 0.90,
        "norm_bbox": BoundingBox(x=0.5, y=0.5, width=0.05, height=0.05),
        "crop": np.zeros((30, 30, 3), dtype=np.uint8),
    })
    res_outside = clean_detector.process_frame(dummy_frame, entities=[], timestamp_sec=25.0)
    assert len(res_outside) == 1
    assert res_outside[0].isFriendlyZoneSuppressed is False
    assert res_outside[0].suppressionReason is None


def test_unassociated_weapon_candidate(clean_detector):
    """
    Validates that a weapon candidate far from any person track is cleanly
    labeled as unassociated with nearestPersonTrackId=None.
    """
    dummy_frame = np.zeros((480, 640, 3), dtype=np.uint8)
    clean_detector.inject_synthetic_detection_for_test({
        "subclass": "blunt_object",
        "conf": 0.78,
        "norm_bbox": BoundingBox(x=0.1, y=0.1, width=0.05, height=0.05),
        "crop": np.zeros((30, 30, 3), dtype=np.uint8),
    })

    # Person far away at (0.8, 0.8)
    person = TrackedEntity(
        id=99,
        class_name="person",
        confidence=85,
        bbox=BoundingBox(x=0.8, y=0.8, width=0.1, height=0.15),
    )

    results = clean_detector.process_frame(dummy_frame, entities=[person], timestamp_sec=1.0)
    assert len(results) == 1
    cand = results[0]
    assert cand.nearestPersonTrackId is None
    assert "unassociated" in cand.label.lower()
