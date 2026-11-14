# IBVAP Polyglot Multi-Service Upgrade & Verification Report

**Date**: November 14, 2026  
**Target Repository**: `https://github.com/saicharanpatnala5-debug/ibvap-final.git`  
**Active Working Branch**: `polyglot-upgrade`  
**Production Branch**: `main`  
**Pre-Upgrade Tag**: `pre-polyglot-upgrade`  

---

## 1. Executive Summary

The Intelligent Border Video Analytics Platform (IBVAP) has been upgraded from a single monolithic frontend/Express stack into a **polyglot, multi-service architecture**. Every language executes a dedicated operational domain:
- **Python 3.11+ / 3.14 (`ai-service/`)**: Computer vision, Ultralytics YOLO26 detection, ByteTrack kinematics with EMA smoothing, CLAHE low-light enhancement, and RapidOCR ANPR.
- **Java 21 LTS (`core-service/`)**: Spring Boot 3 enterprise system of record, camera/zone registries, alert incident state machine with Server-Sent Events (SSE) push, immutable audit ledger, automated risk scoring engine, and reference vehicle database.
- **TypeScript (`gateway/` & `frontend/`)**: Express API gateway with transparent proxying, aggregated health checks, and Gemini copilot with local fallback reasoning. React 19 CCTV workstation with 3-tier detection fallback ladder.
- **JavaScript (`frontend/public/workers/`, `tools/`)**: In-browser ONNX Runtime Web worker, camera stream simulator, HTTP load benchmark tester, and cross-platform one-command launcher (`npm run dev:all`).

---

## 2. Phase-by-Phase Implementation Audit

| Phase | Description | Status | Evidence & File Paths |
| :--- | :--- | :---: | :--- |
| **Phase 0** | **Monorepo Restructure** | **DONE** | Root `package.json`, `gateway/`, `frontend/`, `ai-service/`, `core-service/`, `tools/`, `docs/`, `samples/` |
| **Phase 1** | **Python AI Service** | **DONE** | `ai-service/app/main.py`, `ai-service/app/services/detector.py`, `ai-service/app/services/low_light.py`, `ai-service/app/services/anpr.py` |
| **Phase 1B**| **Tracking Overhaul** | **DONE** | `ai-service/app/services/tracking_manager.py` (ByteTrack, `MIN_HITS=3`, EMA box smoothing, footpoint velocity, direction derivation) |
| **Phase 2** | **Java Core Service** | **DONE** | `core-service/pom.xml`, `core-service/src/main/java/com/ibvap/core/` (Controllers: Health, Camera, Zone, Alert, Audit, Vehicle, Risk, Event, Demo) |
| **Phase 3** | **API Gateway** | **DONE** | `gateway/server.ts` (Aggregated `/api/health`, `/api/core/*` proxy, `/api/vision/*` proxy, Gemini Copilot, rate limiter, helmet) |
| **Phase 4** | **Frontend Fallback Ladder**| **DONE** | `frontend/src/services/detectionEngine.ts` (`performLadderSurveillanceInference` supporting Tier 1 AI-Service $\rightarrow$ Tier 2 ONNX Worker $\rightarrow$ Tier 3 COCO-SSD) |
| **Phase 5** | **Worker & Dev Tools** | **DONE** | `frontend/public/workers/detector.worker.js`, `tools/camera-simulator.js`, `tools/load-test.js`, `tools/dev-all.js` |
| **Phase 6** | **DevOps & Packaging** | **DONE** | Root `docker-compose.yml`, `gateway/Dockerfile`, `ai-service/Dockerfile`, `core-service/Dockerfile`, `.env.example` across all services |
| **Phase 7** | **Integrity & Bug Sweep** | **DONE** | Clean empty state (0 cameras/alerts/plates on boot), dossier isolation on unreadable plates, responsive top nav (390–1920px), HUD pipeline badge |

---

## 3. Test Suites & Verification Evidence

### A. Java Spring Boot 3 Core Service (`mvn test`)
- **Framework**: JUnit 5 / Spring Boot Starter Test / Maven Surefire 3.2.5
- **Toolchain**: OpenJDK 21.0.6 LTS (Temurin)
- **Results**: **13 tests run, 0 failures, 0 errors, 0 skipped**
  - `AlertServiceTest`: 2/2 passed
  - `CameraServiceTest`: 3/3 passed
  - `RiskScoringServiceTest`: 3/3 passed
  - `VehicleRegistryServiceTest`: 4/4 passed
  - `IbvapCoreApplicationTests`: 1/1 passed

### B. Python AI-Service (`pytest`)
- **Framework**: Pytest 9.2.0 / AnyIO
- **Toolchain**: Python 3.14.2 / Virtual Environment
- **Results**: **18 passed in 1.00s**
  - `test_anpr.py`: 4/4 passed
  - `test_tracking.py`: 3/3 passed
  - `test_tracking_overhaul.py`: 6/6 passed
  - `test_zones.py`: 5/5 passed

### C. Frontend Unit & Regression Tests (`vitest`)
- **Framework**: Vitest 5.1.0
- **Results**: **17 passed in 1.11s**
  - `anprRegistry.test.ts`: 11/11 passed
  - `pointInPolygon.test.ts`: 6/6 passed

### D. Gateway Unit & Security Tests (`vitest`)
- **Framework**: Vitest 5.1.0
- **Results**: **11 passed in 6.54s**
  - `fallback.test.ts`: 5/5 passed
  - `validation.test.ts`: 6/6 passed

### E. Playwright End-to-End Smoke Tests (`playwright test`)
- **Framework**: Playwright 1.65.1 (Chromium)
- **Results**: **4 passed in 5.7s**
  - Test A: Clean Empty State (0 cameras, 0 alerts, 0 plates, zero counters on boot) — **PASSED**
  - Test B: Responsive Top Navigation ("+ Add Camera" unclipped at 390, 1280, 1440, 1552, 1920px) — **PASSED**
  - Test C: Registry Integrity (Unreadable plate isolates dossier; manual operator correction) — **PASSED**
  - Test D: Accessibility Controls (High Contrast & Reduced Motion toggles) — **PASSED**

---

## 4. Benchmark Measurements

### A. HTTP Service Load Benchmark (`tools/load-test.js`)
Tested against Gateway aggregated `/api/health` under concurrent load:
- **Total Requests**: 30
- **Successful Responses (2xx)**: 30 (100%)
- **Failures / Errors**: 0 (0.00%)
- **Throughput**: **189.9 requests / sec**
- **Average Latency**: **21.1 ms**
- **Latency p50**: 16 ms
- **Latency p95**: 47 ms
- **Latency p99**: 77 ms

### B. Synthetic ANPR Benchmark (SYNTHETIC — 220 Variations)
Benchmarked via `ai-service/scripts/eval_anpr.py` across 220 synthetically generated Indian license plate crops with varied optical distortions (clean, Gaussian blur, sensor noise, perspective shear, and low-light degradation):
- **Dataset**: 220 images (`samples/synthetic_plates/`, ground-truth labels in `labels.csv`)
- **RapidOCR Engine**: `rapidocr_onnxruntime` + `PlateValidator` position-aware correction
- **Overall Exact Match**: **96.82%** (213 / 220 exact string matches)
- **Character Error Rate (CER)**: **0.32%** (7 character errors across 2,194 total characters)
- **Format Compliance**: **98.18%** (216 / 220 matching valid standard or BH series format)
- **Average Latency**: **905.9 ms** per plate (CPU)

#### Distortion Category Breakdown (SYNTHETIC)
| Category | Samples | Exact Match | CER | Valid Format | Description |
| :--- | :---: | :---: | :---: | :---: | :--- |
| **Clean** | 44 | **97.73%** | 0.23% | 100.0% | Sharp, high-contrast daylight plates |
| **Blur** | 44 | **86.36%** | 1.38% | 90.91% | Gaussian motion/defocus blur |
| **Noise** | 44 | **100.0%** | 0.00% | 100.0% | High-ISO sensor grain & salt-and-pepper noise |
| **Perspective** | 44 | **100.0%** | 0.00% | 100.0% | Angled cameras with $\pm 10^\circ$ trapezoidal tilt |
| **Low-Light** | 44 | **100.0%** | 0.00% | 100.0% | Dark night conditions ($L < 60$) with CLAHE enhancement |

---

## 5. Real-World Footage Evaluation (REAL DATA)

Evaluated on two real surveillance video clips in `samples/` captured from an active border checkpoint (`whatsapp_video_2026_09_09_533pm.mp4` and `whatsapp_video_2026_09_09_842pm.mp4`).

### A. Real Footage Detection Evaluation (`eval_detection.py`)
Tested with YOLO26s on CPU (150 frames per clip):

| Video Clip | Condition | Frames Processed | Total Detections | Detections / Frame | Track IDs | Latency (ms) | FPS |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| `whatsapp_video_2026_09_09_533pm.mp4` | Daytime Checkpoint | 150 | 2,660 | 17.73 | 65 | 228.7 ms | 4.37 |
| `whatsapp_video_2026_09_09_842pm.mp4` | Night Perimeter | 150 | 2,423 | 16.15 | 65 | 8,258.3 ms* | 0.12* |

*\*Note: High per-frame latency on 8:42pm clip on CPU occurs because multi-vehicle OCR scans run across 16 vehicles per frame without hardware GPU acceleration.*

### B. Real Footage Tracking Kinematics (`eval_tracking.py`)
Evaluated across 150 frames per clip using tuned ByteTrack + `TrackingManager` (`MIN_HITS=3`, EMA smoothing, footpoint kinematics, and HSV appearance Re-ID):

| Video Clip | Duration | Unique IDs | Avg Lifetime | Ghosts (<1s) % | Fragmentations | ID Changes / min | Throughput |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| `whatsapp_video_2026_09_09_533pm.mp4` | 12.0s | 65 | 1.53s | 52.3% | 26 | 129.64 | 4.4 FPS |
| `whatsapp_video_2026_09_09_842pm.mp4` | 17.9s | 65 | 1.27s | 60.0% | 47 | 157.84 | 0.4 FPS |
| **Combined / Average** | **30.0s** | **130** | **1.40s** | **56.2%** | **73** | **146.49** | **2.4 FPS** |

*Analysis*: The tracking overhaul eliminated false single-frame phantom alerts (`MIN_HITS=3`) and stabilized bounding boxes. In real bumper-to-bumper traffic, short track lifetimes and fragmentations occur primarily when vehicles queue behind large trucks or exit the narrow camera frustum.

### C. Real Footage ANPR Review Sheet (`docs/anpr_review.html`)
- Standalone, self-contained visual inspection grid generated at `docs/anpr_review.html` (54 KB).
- Extracts **18 unique candidate vehicle plate crops** across the real footage clips.
- Displays high-resolution base64 crops, the raw text read by OCR, confidence score, status badge (`Valid format`, `Low confidence - needs review`, or `Unreadable`), footage timestamp, and vehicle track ID.
- Enables visual inspection in under 2 minutes without self-labeling bias.

---

## 6. Gateway End-to-End Health Verification

```json
{
  "status": "ok",
  "gateway": "online",
  "hasGeminiKey": false,
  "model": "gemini-2.5-flash",
  "services": {
    "gateway": {
      "status": "online",
      "port": 3000
    },
    "aiService": {
      "url": "http://localhost:8000",
      "status": "ok",
      "service": "ai-service",
      "device": "auto",
      "yolo_model": "yolo26s.pt",
      "active_sources_count": 0
    },
    "coreService": {
      "url": "http://localhost:8080",
      "service": "core-service",
      "status": "ok",
      "javaVersion": "21.0.6",
      "version": "0.1.0",
      "timestamp": "2026-11-14T17:45:17.617329Z"
    }
  },
  "timestamp": 1794678317623
}
```

---

## 7. One-Command System Runner

The platform can be started with a single command from the project root:
```bash
npm run dev:all
```
This script (`tools/dev-all.js`):
1. Verifies that Node.js, Python (venv), and Java 21 LTS are present.
2. Spawns `ai-service` on port 8000.
3. Spawns `core-service` on port 8080.
4. Spawns `gateway` and serves the React 19 UI on port 3000.
5. Captures and aggregates stdout/stderr streams with colored service prefixes.
6. Catches `SIGINT` (Ctrl+C) and terminates all child processes cleanly without orphaned background tasks.

---

## 8. Known Limitations & Production Constraints

1. **Optical Resolution & Distance Thresholds**:
   - License plate recognition requires at least ~80x25 pixels of unblurred plate resolution. Distant vehicles in wide-angle CCTV feeds lack sufficient pixel density for character segmentation without optical telephoto zoom or dedicated LPR cameras.
2. **CPU Execution vs GPU Throughput**:
   - On CPU, full-frame YOLO26s object detection executes at ~4.4 FPS (228ms). When 10+ vehicles are detected simultaneously and each vehicle undergoes RapidOCR text extraction, latency compounds up to ~8s per frame on unaccelerated CPU cores. In production border installations, NVIDIA TensorRT / CUDA GPU acceleration is required for 30 FPS multi-stream processing.
3. **Occlusions Beyond Maximum Buffer Window**:
   - Tracks occluded for longer than `MAX_LOST_FRAMES=60` (~2.0 seconds at 30 fps) transition to `removed`. While appearance Re-ID (`RELINK=true`) re-associates tracks if the target reappears near its last predicted coordinates with matching HSV color histograms, extreme long-duration occlusions (e.g. stopping behind a barrier for 30 seconds) will assign a new track ID.
4. **Nighttime Motion Blur & Exposure**:
   - In low-light environments, CCTV cameras with low shutter speeds produce significant motion blur. While CLAHE adaptive histogram equalization recovers dark contrast, severe character smear cannot be completely recovered without physical optical strobe illuminators.

