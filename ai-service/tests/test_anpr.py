import pytest
from app.models.schemas import ANPRResult
from app.services.anpr import (
    PlateValidator,
    PlateVotingTracker,
    STANDARD_PLATE_REGEX,
    BHARAT_SERIES_REGEX,
)


def test_standard_indian_plate_formats():
    valid_plates = [
        "DL01AB1234",
        "MH12CD5678",
        "KA04E9999",
        "TN09AZ1111",
        "UP32AA4444",
        "HR26DQ5555",
    ]

    for p in valid_plates:
        cleaned = PlateValidator.clean_text(p)
        assert bool(STANDARD_PLATE_REGEX.match(cleaned)) is True
        is_val, ftype, _ = PlateValidator.validate(cleaned)
        assert is_val is True
        assert ftype == "standard"


def test_bharat_series_plate_format():
    valid_bh = [
        "22BH1234AA",
        "21BH9999Z",
        "23BH0001B",
    ]

    for p in valid_bh:
        cleaned = PlateValidator.clean_text(p)
        assert bool(BHARAT_SERIES_REGEX.match(cleaned)) is True
        is_val, ftype, _ = PlateValidator.validate(cleaned)
        assert is_val is True
        assert ftype == "bharat"


def test_invalid_plate_formats():
    invalid_plates = [
        "ZZ99AA1234",  # Invalid state
        "ABC1234",     # Too short
        "12345678",    # Numbers only
        "DL01AB12345", # Too long
    ]

    for p in invalid_plates:
        cleaned = PlateValidator.clean_text(p)
        is_val, ftype, _ = PlateValidator.validate(cleaned)
        assert is_val is False


def test_multi_frame_plate_voting():
    voter = PlateVotingTracker(required_votes=2)
    track_id = 501

    # First vote (noise/glitch)
    r1 = ANPRResult(
        plateText="DL01AB1234",
        confidence=72.0,
        isReadable=True,
        isValidFormat=True,
        formatType="standard",
    )
    res1 = voter.add_reading(track_id, r1)
    # Not yet committed (< 85% conf and only 1 vote)
    assert res1 is None

    # Second vote (same plate confirmed)
    r2 = ANPRResult(
        plateText="DL01AB1234",
        confidence=78.0,
        isReadable=True,
        isValidFormat=True,
        formatType="standard",
    )
    res2 = voter.add_reading(track_id, r2)
    # Now committed via 2-vote threshold!
    assert res2 is not None
    assert res2.plateText == "DL01AB1234"
