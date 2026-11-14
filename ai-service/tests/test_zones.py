import pytest
from app.models.schemas import Point, VirtualZone, BoundingBox, TrackedEntity
from app.services.zones import (
    is_point_in_polygon,
    do_line_segments_intersect,
    matches_crossing_direction,
    ZoneBreachMonitor,
)


def test_point_in_convex_polygon():
    square = [
        Point(x=0.2, y=0.2),
        Point(x=0.8, y=0.2),
        Point(x=0.8, y=0.8),
        Point(x=0.2, y=0.8),
    ]

    assert is_point_in_polygon(Point(x=0.5, y=0.5), square) is True
    assert is_point_in_polygon(Point(x=0.1, y=0.5), square) is False
    assert is_point_in_polygon(Point(x=0.9, y=0.5), square) is False


def test_point_in_concave_l_shape():
    l_poly = [
        Point(x=0.1, y=0.1),
        Point(x=0.5, y=0.1),
        Point(x=0.5, y=0.3),
        Point(x=0.3, y=0.3),
        Point(x=0.3, y=0.5),
        Point(x=0.1, y=0.5),
    ]

    # Inside lower left leg
    assert is_point_in_polygon(Point(x=0.2, y=0.4), l_poly) is True
    # Inside upper right leg
    assert is_point_in_polygon(Point(x=0.4, y=0.2), l_poly) is True
    # Cutout notch
    assert is_point_in_polygon(Point(x=0.4, y=0.4), l_poly) is False


def test_line_segments_intersect():
    # Crossing X
    p1 = Point(x=0.2, y=0.2)
    p2 = Point(x=0.8, y=0.8)
    p3 = Point(x=0.2, y=0.8)
    p4 = Point(x=0.8, y=0.2)
    assert do_line_segments_intersect(p1, p2, p3, p4) is True

    # Parallel non-intersecting
    p5 = Point(x=0.1, y=0.2)
    p6 = Point(x=0.1, y=0.8)
    p7 = Point(x=0.5, y=0.2)
    p8 = Point(x=0.5, y=0.8)
    assert do_line_segments_intersect(p5, p6, p7, p8) is False


def test_directional_crossing():
    # Left to right
    p_prev = Point(x=0.3, y=0.5)
    p_curr = Point(x=0.6, y=0.5)
    line_start = Point(x=0.45, y=0.1)
    line_end = Point(x=0.45, y=0.9)

    assert matches_crossing_direction(p_prev, p_curr, line_start, line_end, "left_to_right") is True
    assert matches_crossing_direction(p_prev, p_curr, line_start, line_end, "right_to_left") is False


def test_zone_monitor_entry_and_dwell():
    monitor = ZoneBreachMonitor(cooldown_seconds=4.0, dwell_threshold_seconds=2.0)
    zone = VirtualZone(
        id="z1",
        cameraId="cam-01",
        name="Restricted Zone",
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

    track = TrackedEntity(
        id=101,
        class_name="person",
        confidence=90,
        bbox=BoundingBox(x=0.4, y=0.4, width=0.1, height=0.2),
    )

    # 1. Entry at t=1.0s
    events = monitor.update([track], current_time_sec=1.0)
    assert len(events) == 1
    assert events[0].eventType == "entry"

    # 2. Duplicate suppression at t=2.0s
    events_dup = monitor.update([track], current_time_sec=2.0)
    assert len(events_dup) == 0

    # 3. Loiter dwell event after 2.0s threshold (at t=3.5s)
    events_dwell = monitor.update([track], current_time_sec=5.5)
    assert any(e.eventType == "loiter" for e in events_dwell)
