import time
from typing import Optional
from app.models.schemas import Point, VirtualZone, ZoneEvent


def is_point_in_polygon(pt: Point, poly: list[Point]) -> bool:
    """
    Ray-casting algorithm to determine if a normalized 2D point is inside a polygon.
    Handles arbitrary non-convex polygons.
    """
    if len(poly) < 3:
        return False

    inside = False
    n = len(poly)
    x, y = pt.x, pt.y

    j = n - 1
    for i in range(n):
        xi, yi = poly[i].x, poly[i].y
        xj, yj = poly[j].x, poly[j].y

        intersect = ((yi > y) != (yj > y)) and (x < (xj - xi) * (y - yi) / (yj - yi + 1e-12) + xi)
        if intersect:
            inside = not inside
        j = i

    return inside


def ccw(a: Point, b: Point, c: Point) -> bool:
    return (c.y - a.y) * (b.x - a.x) > (b.y - a.y) * (c.x - a.x)


def do_line_segments_intersect(p1: Point, p2: Point, p3: Point, p4: Point) -> bool:
    """
    Returns True if line segment (p1, p2) intersects with line segment (p3, p4).
    """
    return (ccw(p1, p3, p4) != ccw(p2, p3, p4)) and (ccw(p1, p2, p3) != ccw(p1, p2, p4))


def matches_crossing_direction(
    p_prev: Point,
    p_curr: Point,
    line_start: Point,
    line_end: Point,
    direction: Optional[str],
) -> bool:
    if not direction or direction == "any":
        return True

    dx = p_curr.x - p_prev.x
    dy = p_curr.y - p_prev.y

    if direction == "left_to_right":
        return dx > 0.005
    if direction == "right_to_left":
        return dx < -0.005
    if direction == "inbound":
        # Crosses toward bottom of screen
        return dy > 0.005
    if direction == "outbound":
        # Crosses toward top of screen
        return dy < -0.005

    return True


class ZoneBreachMonitor:
    def __init__(self, cooldown_seconds: float = 6.0, dwell_threshold_seconds: float = 5.0):
        self.zones: list[VirtualZone] = []
        self.cooldown_seconds = cooldown_seconds
        self.dwell_threshold_seconds = dwell_threshold_seconds
        # Key: (track_id, zone_id) -> state dict
        self.track_states: dict[tuple[int, str], dict] = {}

    def set_zones(self, zones: list[VirtualZone]):
        self.zones = [z for z in zones if z.enabled]

    def update(
        self,
        tracks: list,  # list of TrackedEntity or dicts with id, class_name, centroid, trajectory
        current_time_sec: float,
    ) -> list[ZoneEvent]:
        events: list[ZoneEvent] = []
        active_track_ids = set()

        for track in tracks:
            t_id = track.id if hasattr(track, "id") else track["id"]
            t_class = track.class_name if hasattr(track, "class_name") else track.get("class", "unknown")
            bbox = track.bbox if hasattr(track, "bbox") else track["bbox"]
            active_track_ids.add(t_id)

            # Centroid
            cx = bbox.x + bbox.width / 2.0
            cy = bbox.y + bbox.height / 2.0
            curr_pt = Point(x=cx, y=cy)

            # Previous centroid
            prev_pt = Point(x=cx - getattr(track, "velocity", 0.0) * 0.02, y=cy)

            for zone in self.zones:
                if zone.alertOnClasses and t_class not in zone.alertOnClasses:
                    continue

                state_key = (t_id, zone.id)
                state = self.track_states.get(
                    state_key,
                    {"inside": False, "first_entered": 0.0, "last_alert": -9999.0, "loiter_alerted": False},
                )

                if zone.type == "polygon":
                    is_inside = is_point_in_polygon(curr_pt, zone.points)

                    if is_inside and not state["inside"]:
                        # Entry event!
                        state["inside"] = True
                        state["first_entered"] = current_time_sec

                        if current_time_sec - state["last_alert"] > self.cooldown_seconds:
                            state["last_alert"] = current_time_sec
                            events.append(
                                ZoneEvent(
                                    id=f"evt-{t_id}-{zone.id}-{int(current_time_sec*1000)}",
                                    zoneId=zone.id,
                                    zoneName=zone.name,
                                    eventType="entry",
                                    objectId=t_id,
                                    objectClass=t_class,
                                    timestamp=int(current_time_sec * 1000),
                                    riskScore=75 if t_class in ["person", "truck"] else 60,
                                    details=f"Intrusion detected into restricted sector '{zone.name}' by {t_class} (ID #{t_id})",
                                )
                            )

                    elif is_inside and state["inside"]:
                        # Check loitering dwell time
                        dwell_time = current_time_sec - state["first_entered"]
                        if (
                            dwell_time >= self.dwell_threshold_seconds
                            and not state["loiter_alerted"]
                            and current_time_sec - state["last_alert"] > self.cooldown_seconds
                        ):
                            state["loiter_alerted"] = True
                            state["last_alert"] = current_time_sec
                            events.append(
                                ZoneEvent(
                                    id=f"evt-loiter-{t_id}-{zone.id}-{int(current_time_sec*1000)}",
                                    zoneId=zone.id,
                                    zoneName=zone.name,
                                    eventType="loiter",
                                    objectId=t_id,
                                    objectClass=t_class,
                                    timestamp=int(current_time_sec * 1000),
                                    riskScore=85,
                                    details=f"Prolonged stationary loitering ({int(dwell_time)}s) in sector '{zone.name}' by {t_class} (ID #{t_id})",
                                )
                            )

                    elif not is_inside and state["inside"]:
                        # Exit event
                        state["inside"] = False
                        state["loiter_alerted"] = False

                elif zone.type == "line" and len(zone.points) >= 2:
                    p1 = zone.points[0]
                    p2 = zone.points[1]
                    if do_line_segments_intersect(prev_pt, curr_pt, p1, p2):
                        if matches_crossing_direction(prev_pt, curr_pt, p1, p2, zone.direction):
                            if current_time_sec - state["last_alert"] > self.cooldown_seconds:
                                state["last_alert"] = current_time_sec
                                events.append(
                                    ZoneEvent(
                                        id=f"evt-line-{t_id}-{zone.id}-{int(current_time_sec*1000)}",
                                        zoneId=zone.id,
                                        zoneName=zone.name,
                                        eventType="breach",
                                        objectId=t_id,
                                        objectClass=t_class,
                                        timestamp=int(current_time_sec * 1000),
                                        riskScore=80,
                                        details=f"Virtual fence perimeter line '{zone.name}' breached by {t_class} (ID #{t_id})",
                                    )
                                )

                self.track_states[state_key] = state

        # Prune stale tracks
        stale_keys = [k for k in self.track_states.keys() if k[0] not in active_track_ids]
        for k in stale_keys:
            del self.track_states[k]

        return events
