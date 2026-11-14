import numpy as np
import pytest
from app.services.detector import compute_direction_string
from app.services.appearance import extract_entity_appearance
from app.services.low_light import compute_frame_luminance, apply_clahe_enhancement


def test_direction_computation():
    assert compute_direction_string(0.0, 0.0, 1.0) == "Stationary"
    assert compute_direction_string(10.0, 0.0, 15.0) == "Eastbound"
    assert compute_direction_string(-10.0, 0.0, 15.0) == "Westbound"
    assert compute_direction_string(0.0, 10.0, 15.0) == "Southbound (Inbound)"
    assert compute_direction_string(0.0, -10.0, 15.0) == "Northbound (Outbound)"
    assert compute_direction_string(10.0, 10.0, 15.0) == "South-East"


def test_appearance_extraction_blue():
    # Synthetic blue patch (BGR format: High B, Low R/G)
    patch = np.zeros((64, 64, 3), dtype=np.uint8)
    patch[:, :] = (220, 40, 20)  # Intense blue in BGR

    app = extract_entity_appearance(patch, "car")
    assert "Blue" in app.primaryColor
    assert app.vehicleTypeDescription is not None
    assert "car" in app.vehicleTypeDescription.lower()


def test_low_light_enhancement():
    # Dark frame with mean luminance ~15
    dark_frame = np.ones((120, 160, 3), dtype=np.uint8) * 15
    initial_lum = compute_frame_luminance(dark_frame)
    assert initial_lum < 30.0

    enhanced = apply_clahe_enhancement(dark_frame, gamma=1.5)
    enhanced_lum = compute_frame_luminance(enhanced)
    # CLAHE + gamma increases dynamic range / brightness in dark frames
    assert enhanced_lum >= initial_lum
    assert enhanced.shape == dark_frame.shape
