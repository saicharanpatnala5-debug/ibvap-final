# IBVAP Tracking Tuning Guide

This document describes the multi-object tracking architecture, configuration parameters, and tuning profiles for various surveillance environments (crowded border crossings, high-speed vehicle checkpoints, and low-light / night conditions).

---

## 1. Tracking Architecture Overview

IBVAP employs a hybrid tracking pipeline:
1. **Ultralytics ByteTrack / BoT-SORT**: Deep-learning 2-stage association associating high-confidence detections first, then low-confidence detections against existing tracklets.
2. **Lifecycle State Machine (`TrackingManager`)**:
   - `tentative`: Initial track creation. Must achieve `MIN_HITS` consecutive detections before activation.
   - `confirmed`: Active operational track. Emitted to operator UI, Copilot context, and virtual zone monitors.
   - `lost`: Track missed in current frame. Kept alive in memory for up to `MAX_LOST_FRAMES`.
   - `removed`: Permanently deleted after exceeding maximum lost threshold.
3. **Stabilization & Kinematics**:
   - **Class Smoothing**: Rolling majority vote over the last 12 frames prevents rapid class flickering (e.g. `person` $\leftrightarrow$ `bicycle`).
   - **Adaptive EMA Box Smoothing**: Exponential moving average filters high-frequency bounding box jitter without causing drag lag.
   - **Footpoint Tracking**: Kinematics (speed and cardinal direction) are derived from the bottom-center ground contact point rather than unstable box centroids.
   - **Zone Debounce & Hysteresis**: Prevents alarm storming at zone boundaries.
   - **Appearance-Based Re-Linking**: Re-associates track IDs across prolonged occlusions using HSV color histograms and spatial proximity.

---

## 2. Configuration Parameters

| Parameter | Environment Variable | Default | Description |
| :--- | :--- | :--- | :--- |
| **Detector Confidence** | `CONF_THRESHOLD` | `0.15` | Low detector threshold allowing partially occluded or blurred targets to pass into ByteTrack's 2nd-stage association. |
| **Input Image Size** | `IMGSZ` | `640` | YOLO inference dimension. `640` for real-time speed; `960` for distant or tiny perimeter targets. |
| **Tracker Engine** | `TRACKER` | `bytetrack` | `bytetrack` (default) or `botsort` (for shaky / moving PTZ cameras). |
| **Tracker Config File** | `TRACKER_CONFIG` | `config/tracker.yaml` | YAML configuration defining cost matrix weights, match thresholds, and buffer limits. |
| **Min Hits Confirmation**| `MIN_HITS` | `3` | Number of consecutive frames required before a track is confirmed. Eliminates 1-frame ghost false positives. |
| **Max Lost Frames** | `MAX_LOST_FRAMES` | `60` | Number of frames (~2.0 seconds at 30 fps) to retain a lost track before deletion. |
| **Track Re-Linking** | `RELINK` | `true` | Enables appearance-guided Re-ID re-linking for temporarily lost tracks. |
| **Zone Debounce** | `debounce_frames` | `3` | Consecutive frames inside a zone required before firing an entry alert. |

---

## 3. Recommended Operational Tuning Profiles

### Profile A: Crowded Pedestrian Concourses & Border Checkpoints
*High density, frequent mutual occlusions, crossing paths.*
```bash
CONF_THRESHOLD=0.18
MIN_HITS=4
MAX_LOST_FRAMES=90       # 3.0 seconds buffer
TRACKER=bytetrack
RELINK=true
```
- **Rationale**: Slightly higher `MIN_HITS` prevents fleeting occlusions from spawning spurious tracklets. Extended `MAX_LOST_FRAMES` (90 frames) maintains track IDs when people walk behind each other in lines.

### Profile B: High-Speed Vehicle Highway / Checkpoint
*Fast movement, minimal occlusion, rapid frame-to-frame displacement.*
```bash
CONF_THRESHOLD=0.20
MIN_HITS=2              # Fast confirmation
MAX_LOST_FRAMES=30       # 1.0 second buffer
IMGSZ=640
RELINK=false
```
- **Rationale**: Fast vehicles leave the field of view quickly; `MIN_HITS=2` confirms approaching vehicles within ~66ms so ANPR and zone breaches trigger immediately.

### Profile C: Low-Light / Night Perimeter Video
*Low contrast, sensor grain, illumination flicker, dark clothing.*
```bash
CONF_THRESHOLD=0.10      # Very low threshold for faint shadows
ENABLE_LOW_LIGHT_CLAHE=true
LOW_LIGHT_LUMINANCE_THRESHOLD=60.0
MIN_HITS=3
MAX_LOST_FRAMES=75
IMGSZ=960                # Higher resolution captures subtle edge details
```
- **Rationale**: Low detector threshold (0.10) combined with CLAHE contrast enhancement extracts features from dark silhouettes that would otherwise be missed.
