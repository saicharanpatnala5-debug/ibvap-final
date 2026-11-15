"""
IBVAP Class Mapping & Fusion Unit Tests (Deliverable 6)
Tests:
1. Motorcycle + Rider fusion -> single 'two-wheeler' entity
2. Bicycle + Rider fusion -> single 'two-wheeler' entity
3. Isolated person -> 'pedestrian'
4. Frontal car (aspect ratio 1.05) -> retains 'car' (no fragile three-wheeler remapping)
5. Truck / Bus -> unified to 'truck/bus'
6. Overlapping vehicle duplicate suppression
"""

import pytest
from app.models.schemas import BoundingBox
from app.services.detector import SurveillanceDetector


@pytest.fixture
def detector():
    d = SurveillanceDetector()
    return d


def test_motorcycle_rider_fusion(detector):
    """Overlapping motorcycle and rider must fuse into a single two-wheeler entity."""
    raw_detections = [
        {
            "id": 10,
            "class": "motorcycle",
            "bbox": BoundingBox(x=0.40, y=0.50, width=0.10, height=0.15),
            "conf": 78,
            "appearance": None,
            "anpr": None,
        },
        {
            "id": 11,
            "class": "person",
            "bbox": BoundingBox(x=0.41, y=0.45, width=0.08, height=0.15),
            "conf": 84,
            "appearance": None,
            "anpr": None,
        },
    ]

    mapped = detector._map_indian_traffic_classes(raw_detections, frame_w=1280, frame_h=720)
    classes = [d["class"] for d in mapped]
    assert len(mapped) == 1, f"Expected 1 fused entity, got {len(mapped)}"
    assert classes[0] == "two-wheeler"
    # Combined bbox should span from min y (0.45) to max y (0.65)
    fused_box = mapped[0]["bbox"]
    assert fused_box.y == pytest.approx(0.45, abs=0.01)
    assert (fused_box.y + fused_box.height) == pytest.approx(0.65, abs=0.01)
    assert mapped[0]["conf"] == 84  # Takes maximum confidence


def test_bicycle_rider_fusion(detector):
    """Overlapping bicycle and person fuse into two-wheeler."""
    raw_detections = [
        {
            "id": 20,
            "class": "bicycle",
            "bbox": BoundingBox(x=0.10, y=0.60, width=0.08, height=0.12),
            "conf": 70,
            "appearance": None,
            "anpr": None,
        },
        {
            "id": 21,
            "class": "person",
            "bbox": BoundingBox(x=0.105, y=0.55, width=0.07, height=0.12),
            "conf": 75,
            "appearance": None,
            "anpr": None,
        },
    ]

    mapped = detector._map_indian_traffic_classes(raw_detections, frame_w=1280, frame_h=720)
    assert len(mapped) == 1
    assert mapped[0]["class"] == "two-wheeler"


def test_isolated_pedestrian_mapping(detector):
    """Person walking alone with no bike nearby becomes 'pedestrian'."""
    raw_detections = [
        {
            "id": 30,
            "class": "person",
            "bbox": BoundingBox(x=0.80, y=0.50, width=0.06, height=0.20),
            "conf": 88,
            "appearance": None,
            "anpr": None,
        }
    ]

    mapped = detector._map_indian_traffic_classes(raw_detections, frame_w=1280, frame_h=720)
    assert len(mapped) == 1
    assert mapped[0]["class"] == "pedestrian"


def test_car_retains_car_even_with_square_aspect(detector):
    """
    Cars seen head-on (aspect ratio ~1.0) must NOT be mislabeled as 'three-wheeler'.
    They must reliably retain 'car'.
    """
    # 1280x720: width 100px (0.078), height 100px (0.138) -> aspect ratio ~1.0
    raw_detections = [
        {
            "id": 40,
            "class": "car",
            "bbox": BoundingBox(x=0.30, y=0.40, width=0.078, height=0.138),
            "conf": 82,
            "appearance": None,
            "anpr": None,
        }
    ]

    mapped = detector._map_indian_traffic_classes(raw_detections, frame_w=1280, frame_h=720)
    assert len(mapped) == 1
    assert mapped[0]["class"] == "car"


def test_truck_and_bus_unification(detector):
    """Heavy commercial vehicles (truck, bus) are unified to 'truck/bus'."""
    raw_detections = [
        {
            "id": 50,
            "class": "truck",
            "bbox": BoundingBox(x=0.10, y=0.30, width=0.20, height=0.30),
            "conf": 85,
            "appearance": None,
            "anpr": None,
        },
        {
            "id": 51,
            "class": "bus",
            "bbox": BoundingBox(x=0.60, y=0.30, width=0.25, height=0.35),
            "conf": 89,
            "appearance": None,
            "anpr": None,
        },
    ]

    mapped = detector._map_indian_traffic_classes(raw_detections, frame_w=1280, frame_h=720)
    assert len(mapped) == 2
    assert mapped[0]["class"] == "truck/bus"
    assert mapped[1]["class"] == "truck/bus"


def test_duplicate_vehicle_suppression(detector):
    """Overlapping car and truck detections on the same vehicle are deduplicated."""
    raw_detections = [
        {
            "id": 60,
            "class": "car",
            "bbox": BoundingBox(x=0.30, y=0.40, width=0.20, height=0.20),
            "conf": 72,
        },
        {
            "id": 61,
            "class": "truck",
            "bbox": BoundingBox(x=0.31, y=0.405, width=0.19, height=0.19),
            "conf": 89,
        },
    ]

    filtered = detector._filter_duplicate_vehicles(raw_detections, iou_thresh=0.50)
    assert len(filtered) == 1
    # Higher confidence truck detection is preserved
    assert filtered[0]["id"] == 61
    assert filtered[0]["conf"] == 89
