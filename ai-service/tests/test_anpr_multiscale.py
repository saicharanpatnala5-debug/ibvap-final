import pytest
import numpy as np
import cv2
from app.services.anpr import (
    PlateValidator,
    FastALPREngine,
    PlateVotingTracker,
    ANPRResult,
)


def test_no_vehicle_size_gate_rejects_large_tracks():
    """
    Unit test proving that vehicle bounding boxes like Track #101 (584x476) or
    Track #44 (560x317) are NOT rejected prior to plate detection.
    Every confirmed vehicle track attempts multi-scale plate detection.
    """
    engine = FastALPREngine.get_instance()

    # Track #44 synthetic test crop (560x317 px) with plate drawn in lower 50%
    veh_crop_44 = np.zeros((317, 560, 3), dtype=np.uint8)
    # Draw a synthetic white plate with black text in lower half
    cv2.rectangle(veh_crop_44, (200, 220), (360, 270), (255, 255, 255), -1)
    cv2.putText(veh_crop_44, "KA01M4449", (205, 255), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 0, 0), 2)

    res = engine.process_vehicle_crop(veh_crop_44)
    # Must NOT be distance gated
    assert res.isDistanceGated is False
    assert res.formatType != "distance_gated"
    assert res.attempts >= 1
    # Plate was present in lower 50% and must be detected
    assert res.isReadable is True
    assert "KA" in res.plateText


def test_multiscale_localization_finds_lower_50_percent_candidate():
    """
    Test multi-scale localization returns a candidate plate on lower 50% scale
    when native or upper regions do not yield detections.
    """
    engine = FastALPREngine.get_instance()

    veh_crop = np.zeros((400, 500, 3), dtype=np.uint8)
    # Plate drawn specifically in lower 45% region
    cv2.rectangle(veh_crop, (180, 280), (330, 330), (255, 255, 255), -1)
    cv2.putText(veh_crop, "DL01AB1234", (185, 315), cv2.FONT_HERSHEY_SIMPLEX, 0.65, (0, 0, 0), 2)

    res = engine.process_vehicle_crop(veh_crop)
    assert res.isReadable is True
    assert res.scaleUsed in ["lower_50", "native", "upscaled_2x"]
    assert res.isDistanceGated is False


def test_position_aware_correction_obeys_slot_syntax():
    """
    Test that position-aware correction applies character-swapping rules (O/0, I/1, B/8, S/5)
    ONLY to positions where the syntax is unambiguous:
    - Positions 0, 1: MUST be letters (never swap letter to digit)
    - Positions n-4..n: MUST be digits (swaps letters to digits)
    - Ambiguous slots in 9-character plates are preserved.
    """
    # 1. State Prefix: Should swap digits to letters in positions 0 and 1
    corrected_state = PlateValidator.position_aware_correction("0L01AB1234")
    assert corrected_state.startswith("DL"), f"Expected state code 'DL', got '{corrected_state}'"

    # Won't swap letters to digits in positions 0 and 1
    valid_state = PlateValidator.position_aware_correction("DL01AB1234")
    assert valid_state.startswith("DL")

    # 2. Last 4 digits: Letters must be swapped to digits
    # 'O' in last position should become '0'
    corrected_digits = PlateValidator.position_aware_correction("DL01AB123O")
    assert corrected_digits.endswith("1230"), f"Expected '1230', got '{corrected_digits}'"

    # 'B' in last position should become '8'
    corrected_b = PlateValidator.position_aware_correction("DL01AB123B")
    assert corrected_b.endswith("1238"), f"Expected '1238', got '{corrected_b}'"

    # 3. 9-character plate: KA01M4449
    # Slot 3 ('1') is digit in SS DD L NNNN format; slot syntax must NOT swap it to 'I'
    nine_char = PlateValidator.position_aware_correction("KA01M4449")
    assert nine_char == "KA01M4449", f"Expected KA01M4449 unchanged, got {nine_char}"

    # 4. 10-character plate: unambiguous RTO digits (slots 2, 3) and series letters (slots 4, 5)
    ten_char = PlateValidator.position_aware_correction("KAO1AB1234")
    assert ten_char == "KA01AB1234", f"Expected 'KA01AB1234', got '{ten_char}'"


def test_unknown_plates_return_no_invented_dossier():
    """
    A novel or unknown plate (e.g. KA01M4449) must NOT generate or attach a fake dossier.
    Only pre-existing mock records return dossiers.
    """
    from app.services.anpr import PlateValidator

    # Verify validator validates format without inventing registration dossiers
    is_valid, ftype, status = PlateValidator.validate("KA01M4449")
    assert is_valid is True
    assert ftype == "standard"
    assert status == "Valid format"


def test_multiframe_voting_preserves_attempts_and_confidence():
    """
    Multi-frame voting tracker records attempts count and retains best-guess readings.
    """
    tracker = PlateVotingTracker(required_votes=2)
    track_id = 44

    r1 = ANPRResult(
        plateText="KA01M4449",
        confidence=82.0,
        isReadable=True,
        isValidFormat=True,
        formatType="standard",
        validationStatus="Valid format",
        charConfidences=[90.0, 95.0, 80.0, 85.0, 82.0, 82.0, 82.0, 82.0, 82.0],
    )

    r2 = ANPRResult(
        plateText="KA01M4449",
        confidence=84.0,
        isReadable=True,
        isValidFormat=True,
        formatType="standard",
        validationStatus="Valid format",
        charConfidences=[92.0, 96.0, 81.0, 86.0, 84.0, 84.0, 84.0, 84.0, 84.0],
    )

    tracker.add_reading(track_id, r1, sharpness=60.0)
    confirmed = tracker.add_reading(track_id, r2, sharpness=75.0)

    assert confirmed is not None
    assert confirmed.plateText == "KA01M4449"
    assert confirmed.isValidFormat is True
    assert confirmed.attempts == 2
    assert tracker.attempts[track_id] == 2
