import os
import cv2
import pytest
import numpy as np

from app.services.detector import SurveillanceDetector
from app.services.classifier import VehicleCropClassifier
from app.services.anpr import FastALPREngine, preprocess_plate_crop, PlateValidator


VIDEO_PATH = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "samples", "whatsapp_video_2026_09_09_842pm.mp4"))


@pytest.fixture(scope="module")
def video_cap():
    if not os.path.exists(VIDEO_PATH):
        pytest.skip(f"Golden case video sample not found at: {VIDEO_PATH}")
    cap = cv2.VideoCapture(VIDEO_PATH)
    yield cap
    cap.release()


def test_golden_case_1_plate_reading(video_cap):
    """
    GOLDEN CASE 1:
    Readable license plate on vehicle passing at t=3.8s - 4.5s (frames 120-128).
    Ground Truth: KA01NN4498 / KA01MW4498.
    Must produce valid Indian statutory plate format and readable text, NOT 'UNREADABLE'.
    """
    fps = video_cap.get(cv2.CAP_PROP_FPS) or 30.0
    engine = FastALPREngine.get_instance()
    
    found_valid = False
    best_candidate_text = ""
    best_conf = 0.0

    for f_idx in range(120, 130):
        video_cap.set(cv2.CAP_PROP_POS_FRAMES, f_idx)
        ret, frame = video_cap.read()
        assert ret, f"Failed to read frame {f_idx}"

        # Car bounding box in frame 120-128: approx [650:1280, 390:720]
        veh_crop = frame[380:730, 640:1280]
        res = engine.process_vehicle_crop(veh_crop)

        if res.isReadable and res.plateText:
            best_candidate_text = res.plateText
            best_conf = res.confidence
            if res.isValidFormat:
                found_valid = True
                break

    print(f"\n[Golden Case 1 Result] Plate: '{best_candidate_text}', Valid: {found_valid}, Conf: {best_conf}%")
    assert len(best_candidate_text) >= 6, f"Expected readable plate, got empty or too short: '{best_candidate_text}'"
    assert "KA" in best_candidate_text, f"Expected Karnataka state prefix 'KA', got '{best_candidate_text}'"
    assert "4498" in best_candidate_text or "4449" in best_candidate_text, f"Expected registration digits '4449'/'4498', got '{best_candidate_text}'"
    assert found_valid, f"Expected format validation to pass for plate '{best_candidate_text}'"


def test_golden_case_2_auto_rickshaw_classification(video_cap):
    """
    GOLDEN CASE 2:
    Tuk-tuk / Auto-rickshaw traveling along road at t=5.0s - 16.0s (e.g. t=10.0s, frame 300).
    COCO YOLO models misclassify this vehicle as 'bus' or 'truck'.
    The zero-shot second-stage crop classifier must re-classify it as 'auto-rickshaw' (confidence >= 80%).
    """
    fps = video_cap.get(cv2.CAP_PROP_FPS) or 30.0
    video_cap.set(cv2.CAP_PROP_POS_FRAMES, 300) # t = 10.0s
    ret, frame = video_cap.read()
    assert ret, "Failed to read frame 300"

    # Auto-rickshaw crop at t=10.0s is in the range [465:662, 139:340]
    tuktuk_crop = frame[465:662, 139:340]
    classifier = VehicleCropClassifier.get_instance()
    assert classifier.is_ready, "VehicleCropClassifier failed to initialize"

    clf_res = classifier.classify_crop(tuktuk_crop)
    assert clf_res is not None, "Failed to classify tuk-tuk crop"

    label, conf = clf_res
    print(f"\n[Golden Case 2 Result] Class: '{label}', Confidence: {conf*100:.2f}%")
    assert label == "auto-rickshaw", f"Expected 'auto-rickshaw', but classifier returned '{label}'"
    assert conf >= 0.80, f"Expected confidence >= 80%, got {conf*100:.2f}%"
    assert label not in ["bus", "truck"], f"Tuk-tuk must NEVER be classified as bus or truck"


def test_golden_case_3_fast_vehicle_tracking(video_cap):
    """
    GOLDEN CASE 3:
    Fast-moving vehicle transiting roadway between t=14.3s and 15.4s (31 consecutive frames).
    Velocity > 120 px/s.
    Tracker must maintain a single continuous track ID across its visible transit without fragmentation.
    """
    fps = video_cap.get(cv2.CAP_PROP_FPS) or 30.0
    detector = SurveillanceDetector()
    detector.reset()

    start_frame = int(14.3 * fps)
    end_frame = int(15.4 * fps)

    video_cap.set(cv2.CAP_PROP_POS_FRAMES, start_frame)
    
    # Track the fast vehicle ID across frames
    observed_records = []
    
    for f_idx in range(start_frame, end_frame + 1):
        ret, frame = video_cap.read()
        if not ret:
            break
        ts = f_idx / fps
        entities, _ = detector.process_frame(frame, ts)
        
        for ent in entities:
            bx = ent.bbox
            # Fast vehicle traveling eastbound in center corridor (velocity > 120 px/s)
            if 0.30 <= bx.x <= 0.50 and bx.y > 0.50 and ent.velocity > 120 and "East" in ent.direction:
                observed_records.append((f_idx, ent.id, ent.velocity, ent.direction))

    print(f"\n[Golden Case 3 Result] Captured {len(observed_records)} fast vehicle frames.")
    assert len(observed_records) >= 15, f"Expected at least 15 frames of fast vehicle tracking, got {len(observed_records)}"
    
    unique_ids = {rec[1] for rec in observed_records}
    print(f"Unique IDs observed for fast vehicle across transit: {unique_ids}")
    
    # Assert single continuous track ID across transit: 100% continuity, zero ID switching
    assert len(unique_ids) == 1, f"Expected exactly 1 continuous track ID, but ID fragmented across: {unique_ids}"
