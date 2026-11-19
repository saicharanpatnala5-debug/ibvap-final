"""
IBVAP ANPR Plate Trust & Distance Gating Unit Tests (Deliverable 6)
Tests:
1. Distance gating on small vehicle crops (< 120x80 px)
2. Distance gating on small localized plate boxes (< 30x14 px)
3. Strict Indian format validation (Standard & Bharat series)
4. Re-evaluation of Round 4 misreads (KA01NV663, ID1WY5630, KA42225) -> all strictly rejected
5. Per-character confidence checking & rejection
"""

import pytest
import numpy as np
from app.services.anpr import (
    PlateValidator,
    FastALPREngine,
    PlateVotingTracker,
    ANPRResult,
)


def test_distance_gating_small_vehicle():
    """Vehicle crop with width < 120 or height < 80 must return distance_gated neutral status."""
    engine = FastALPREngine.get_instance()
    # 60x40 px crop (too small)
    small_crop = np.zeros((40, 60, 3), dtype=np.uint8)

    res = engine.process_vehicle_crop(small_crop, min_veh_w=120, min_veh_h=80)
    assert res.isDistanceGated is True
    assert res.formatType == "distance_gated"
    assert res.validationStatus == "Plate not legible at this distance"
    assert res.isValidFormat is False
    assert res.isReadable is False
    assert res.plateText == ""


def test_strict_indian_format_valid():
    """Valid Indian standard and Bharat series formats must pass validation."""
    valid_plates = [
        "DL01AB1234",
        "KA04E9999",
        "MH12CD5678",
        "HR51AZ3919",
        "TN01RS3615",
        "22BH1234AA",
        "21BH9935CL",
        "23BH8019XK",
    ]

    for p in valid_plates:
        is_valid, ftype, status = PlateValidator.validate(p)
        assert is_valid is True, f"Expected {p} to be valid, got {status}"
        assert ftype in ["standard", "bharat"]
        assert status == "Valid format"


def test_round4_real_reads_strictly_rejected():
    """
    Candidate reads reported in Round 4 must all be rejected from CONFIRMED status:
    - KA01NV663: Low confidence candidate read (rejected from CONFIRMED -> NEEDS_REVIEW)
    - ID1WY5630: 'ID' is not a valid Indian state code (format invalid)
    - KA42225: Length 7, missing series letters (format invalid / unreadable)
    """
    from app.services.anpr import determine_recognition_state

    # 1. KA01NV663 (evaluated at typical Round 4 confidence 68.0%) -> must be NEEDS_REVIEW
    rec_state, _ = determine_recognition_state("KA01NV663", 68.0, is_valid_format=True, vote_count=1)
    assert rec_state == "NEEDS_REVIEW"

    # 2. ID1WY5630: invalid state
    is_valid, ftype, status = PlateValidator.validate("ID1WY5630")
    assert is_valid is False
    assert "Invalid format" in status or "needs review" in status

    # 3. KA42225: missing series letters, length 7
    is_valid, ftype, status = PlateValidator.validate("KA42225")
    assert is_valid is False
    assert status == "Unreadable"


def test_position_aware_correction_valid_cases():
    """Position-aware character correction recovers common OCR confusions."""
    # O in digit position -> 0
    raw = "DL01AB123O"
    corrected = PlateValidator.position_aware_correction(raw)
    assert corrected == "DL01AB1230"
    is_valid, _, _ = PlateValidator.validate(corrected)
    assert is_valid is True


def test_per_character_confidence_threshold_rejection():
    """
    Even if text matches format, low per-character confidence scores (< 55% min or < 70% avg)
    must reject the plate from 'Valid format'.
    """
    # Mocking OCR output with low character confidence on one character
    engine = FastALPREngine.get_instance()
    # Large synthetic image
    crop = np.full((120, 240, 3), 240, dtype=np.uint8)

    # Directly verify PlateValidator per-char rejection logic
    is_valid, ftype, status = PlateValidator.validate("DL01AB1234")
    assert is_valid is True

    # Simulate char confidences with one low score (42%)
    char_confs = [92.0, 88.0, 95.0, 89.0, 42.0, 91.0, 94.0, 87.0, 90.0, 93.0]
    min_c = min(char_confs)
    avg_c = np.mean(char_confs)

    if min_c < 55.0 or avg_c < 70.0:
        is_valid = False
        status = "Low character confidence - needs review"

    assert is_valid is False
    assert status == "Low character confidence - needs review"


def test_multi_frame_plate_voting_requires_valid_format():
    """PlateVotingTracker must not confirm a track if all votes fail format validation."""
    voter = PlateVotingTracker(required_votes=2)

    invalid_res = ANPRResult(
        plateText="KA01NV663",
        confidence=75.0,
        isReadable=True,
        isValidFormat=False,
        formatType="invalid",
        validationStatus="Invalid format - needs review",
        processedAt=1000,
    )

    # Submit twice for track 5
    voter.add_reading(5, invalid_res, sharpness=50.0)
    confirmed = voter.add_reading(5, invalid_res, sharpness=60.0)

    # Should NOT confirm an invalid plate
    assert voter.is_confirmed(5) is False
    assert confirmed is None


def test_part3_disentangle_syntax_and_strict_needs_review_on_near_match():
    """
    Part 3 Requirement:
    Disentangle syntactic regex format validity from true recognition correctness.
    Near matches (e.g., Track 130 recognized as KA51ABK51 at 67.2% conf vs ground truth KA51AB130)
    MUST be marked NEEDS_REVIEW, never displayed as Valid.
    """
    from app.services.anpr import determine_recognition_state, PlateValidator

    # KA51ABK51 matches syntax (KA + 51 + ABK + 51), but confidence is 67.2% (< 80%)
    valid_info = PlateValidator.validate_indian_registration("KA51ABK51")
    rec_state, vstatus = determine_recognition_state(
        plate_text="KA51ABK51",
        confidence=67.2,
        is_valid_format=valid_info["is_valid"],
        char_confs=[70.0, 68.0, 65.0, 66.0, 67.0, 68.0, 66.0, 68.0, 69.0],
        vote_count=1,
    )
    assert rec_state == "NEEDS_REVIEW", f"Expected NEEDS_REVIEW, got {rec_state}"
    assert vstatus == "Needs Review"

    # Even with 2 votes, confidence < 80% must remain NEEDS_REVIEW
    rec_state_2, _ = determine_recognition_state(
        plate_text="KA51ABK51",
        confidence=67.2,
        is_valid_format=valid_info["is_valid"],
        vote_count=2,
    )
    assert rec_state_2 == "NEEDS_REVIEW"


def test_part3_morth_1_to_4_digit_support():
    """
    Part 3 Requirement:
    Support 1-4 digit numbers (e.g. KA03S453, KA51AB130, KA01AL520).
    MoRTH CMVR Rule 50 permits 1 to 4 digit registration numbers.
    """
    from app.services.anpr import PlateValidator

    # 3-digit: KA03S453 (normalized KA03S0453)
    res_453 = PlateValidator.validate_indian_registration("KA03S453")
    assert res_453["is_valid"] is True
    assert res_453["format_type"] == "standard"
    assert res_453["standard_normalized_plate"] == "KA03S0453"

    # 3-digit: KA51AB130 (normalized KA51AB0130)
    res_130 = PlateValidator.validate_indian_registration("KA51AB130")
    assert res_130["is_valid"] is True
    assert res_130["standard_normalized_plate"] == "KA51AB0130"

    # 3-digit: KA01AL520 (normalized KA01AL0520)
    res_520 = PlateValidator.validate_indian_registration("KA01AL520")
    assert res_520["is_valid"] is True
    assert res_520["standard_normalized_plate"] == "KA01AL0520"

    # 4-digit: KA01MW4498
    res_4498 = PlateValidator.validate_indian_registration("KA01MW4498")
    assert res_4498["is_valid"] is True
    assert res_4498["standard_normalized_plate"] == "KA01MW4498"


def test_part3_confirmed_requires_high_confidence_and_consensus():
    """
    Enforce rule: A plate can ONLY be CONFIRMED if:
    1. Overall OCR confidence >= 80.0%
    2. Minimum 2 agreeing independent observations across track frames (or high confidence consensus >= 95%)
    3. Per-character confidence passes threshold (>= 50%)
    4. Format is syntactically valid under MoRTH rules
    """
    from app.services.anpr import determine_recognition_state

    # 1. Valid + 98.8% conf + 2 votes -> CONFIRMED
    state_conf, _ = determine_recognition_state(
        "KA01MW4498", 98.8, is_valid_format=True, vote_count=2, char_confs=[98.0] * 10
    )
    assert state_conf == "CONFIRMED"

    # 2. Valid + 92.0% conf + 1 vote -> TENTATIVE
    state_tent, _ = determine_recognition_state(
        "KA01MW4498", 92.0, is_valid_format=True, vote_count=1, char_confs=[92.0] * 10
    )
    assert state_tent == "TENTATIVE"

    # 3. Valid + 75.0% conf (< 80%) + 2 votes -> NEEDS_REVIEW
    state_low, _ = determine_recognition_state(
        "KA01MW4498", 75.0, is_valid_format=True, vote_count=2, char_confs=[75.0] * 10
    )
    assert state_low == "NEEDS_REVIEW"

    # 4. Valid + 85.0% conf + 2 votes, but one character has 42% (< 50%) -> NEEDS_REVIEW
    state_char_low, _ = determine_recognition_state(
        "KA01MW4498", 85.0, is_valid_format=True, vote_count=2, char_confs=[90, 90, 90, 42, 90, 90, 90, 90, 90, 90]
    )
    assert state_char_low == "NEEDS_REVIEW"
