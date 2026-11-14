import cv2
import numpy as np


def compute_frame_luminance(frame_bgr: np.ndarray) -> float:
    """
    Computes average frame luminance using standard Rec. 709 coefficients.
    Downsamples frame for sub-millisecond evaluation.
    """
    if frame_bgr is None or frame_bgr.size == 0:
        return 128.0

    # Downsample for speed
    small = cv2.resize(frame_bgr, (160, 90), interpolation=cv2.INTER_NEAREST)
    # Rec 709: Y = 0.2126*R + 0.7152*G + 0.0722*B (OpenCV uses BGR)
    b, g, r = cv2.split(small)
    lum = 0.2126 * r.astype(np.float32) + 0.7152 * g.astype(np.float32) + 0.0722 * b.astype(np.float32)
    return float(np.mean(lum))


def apply_clahe_enhancement(
    frame_bgr: np.ndarray,
    clip_limit: float = 2.5,
    tile_grid_size: tuple[int, int] = (8, 8),
    gamma: float = 1.35,
) -> np.ndarray:
    """
    Applies CLAHE in LAB color space (L channel only) + Gamma correction
    to boost contrast and detail in low-light surveillance frames without
    distorting color histograms.
    """
    if frame_bgr is None or frame_bgr.size == 0:
        return frame_bgr

    # 1. Convert to LAB color space
    lab = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2LAB)
    l_channel, a_channel, b_channel = cv2.split(lab)

    # 2. Apply Contrast Limited Adaptive Histogram Equalization to L-channel
    clahe = cv2.createCLAHE(clipLimit=clip_limit, tileGridSize=tile_grid_size)
    l_enhanced = clahe.apply(l_channel)

    # 3. Gamma correction on enhanced L-channel
    if gamma > 1.0:
        inv_gamma = 1.0 / gamma
        table = np.array([((i / 255.0) ** inv_gamma) * 255 for i in range(256)]).astype("uint8")
        l_enhanced = cv2.LUT(l_enhanced, table)

    # 4. Merge back and convert to BGR
    merged_lab = cv2.merge([l_enhanced, a_channel, b_channel])
    enhanced_bgr = cv2.cvtColor(merged_lab, cv2.COLOR_LAB2BGR)
    return enhanced_bgr
