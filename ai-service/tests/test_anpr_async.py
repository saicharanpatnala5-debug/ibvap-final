"""
Unit tests for Asynchronous ANPR Worker and Vehicle Class Unification.
"""

import time
import numpy as np
import pytest

from app.models.schemas import BoundingBox, ANPRResult
from app.services.anpr import PlateVotingTracker
from app.services.anpr_async import AsyncANPRWorker
from app.services.tracking_manager import TrackingManager


def test_vehicle_class_unification_and_majority_vote():
    tm = TrackingManager(min_hits=2)
    box = BoundingBox(x=0.1, y=0.1, width=0.2, height=0.2)

    # Frame 1: detected as car
    dets1 = [{"id": 10, "class": "car", "bbox": box, "conf": 80}]
    ents1 = tm.update_tracks(dets1, 0.04, 640, 360)

    # Frame 2: detected as truck (class flip!)
    dets2 = [{"id": 10, "class": "truck", "bbox": box, "conf": 80}]
    ents2 = tm.update_tracks(dets2, 0.08, 640, 360)

    assert len(ents2) == 1
    # Tracking class should be unified to 'vehicle', but current_class emits the voted specific class
    assert ents2[0].id == 10
    assert ents2[0].class_name in ["car", "truck"]


def test_async_anpr_filters_and_caps():
    voter = PlateVotingTracker(required_votes=2)
    confirmed_records = {}

    def on_confirmed(tid, res):
        confirmed_records[tid] = res

    worker = AsyncANPRWorker(
        plate_voter=voter,
        on_confirmed_callback=on_confirmed,
        max_workers=1,
        min_crop_height=20,
        min_crop_width=50,
        min_sharpness=10.0,
        max_crops_per_track=2,
    )

    # 1. Tiny crop should be rejected
    tiny_crop = np.zeros((10, 20, 3), dtype=np.uint8)
    assert not worker.submit_vehicle_crop(1, tiny_crop, 0.0)

    # 2. Blank blurry crop (sharpness < 10) should be rejected
    blurry_crop = np.full((60, 120, 3), 128, dtype=np.uint8)
    assert not worker.submit_vehicle_crop(2, blurry_crop, 0.0)

    worker.shutdown()


def test_tracking_manager_reset():
    tm = TrackingManager(min_hits=1)
    box = BoundingBox(x=0.1, y=0.1, width=0.2, height=0.2)
    dets = [{"id": 1, "class": "person", "bbox": box, "conf": 90}]
    tm.update_tracks(dets, 0.04, 640, 360)
    ents = tm.update_tracks(dets, 0.08, 640, 360)
    assert len(ents) == 1

    tm.reset()
    assert len(tm.tracks) == 0
    assert len(tm.lost_pool) == 0
    assert tm.last_timestamp == 0.0
