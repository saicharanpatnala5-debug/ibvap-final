# IBVAP: Intelligent Border Video Analytics Platform

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![React](https://img.shields.io/badge/React-19-blue?logo=react)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-blue?logo=typescript)](https://www.typescriptlang.org/)
[![Java](https://img.shields.io/badge/Java-21%20LTS-orange?logo=openjdk)](https://adoptium.net/)
[![Spring Boot](https://img.shields.io/badge/Spring%20Boot-3.3.5-brightgreen?logo=springboot)](https://spring.io/projects/spring-boot)
[![Python](https://img.shields.io/badge/Python-3.11%20%7C%203.14-yellow?logo=python)](https://python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115-teal?logo=fastapi)](https://fastapi.tiangolo.com/)
[![YOLO](https://img.shields.io/badge/YOLO-YOLO26%20%2F%20v11-red)](https://github.com/ultralytics/ultralytics)

IBVAP is an enterprise-grade polyglot multi-service surveillance platform engineered for tactical border security, perimeter defense, virtual-zone intrusion monitoring, automatic number plate recognition (ANPR), and AI-driven forensic copilot reasoning.

---

## 🏛️ Target Multi-Service Architecture

Each programming language in IBVAP executes a dedicated operational domain:

```mermaid
flowchart TD
    subgraph Client["Operator Client (frontend/)"]
        UI["React 19 Dashboard & Canvas HUD"]
        Worker["Browser YOLO Worker (detector.worker.js)"]
        CocoFallback["In-Browser COCO-SSD (MobileNet)"]
    end

    subgraph GatewayLayer["API Gateway & Reverse Proxy (gateway/)"]
        GW["Express 4 Gateway (Port 3000)"]
        AggHealth["Aggregated Health Monitor (/api/health)"]
        GeminiHost["Gemini Multimodal Copilot Engine"]
        ProxyCore["Core Service Transparent Proxy (/api/core/*)"]
        ProxyVision["AI Vision Transparent Proxy (/api/vision/*)"]
    end

    subgraph VisionService["Vision Analytics Service (ai-service/)"]
        FastAPI["FastAPI + Uvicorn (Port 8000)"]
        YOLO["Ultralytics YOLO26 Object Detection"]
        ByteTrack["ByteTrack Multi-Object Kinematics & Re-ID"]
        LowLight["CLAHE Adaptive Night Enhancement"]
        ANPR["RapidOCR License Plate Engine"]
    end

    subgraph CoreService["System of Record (core-service/)"]
        SpringBoot["Spring Boot 3 + Java 21 LTS (Port 8080)"]
        CamRepo["Camera & Sensor Registry"]
        ZoneRepo["Virtual Boundary Zones"]
        AlertEngine["Alert Incident State Machine & SSE Stream"]
        AuditLedger["Immutable Audit Trail Ledger"]
        RiskScore["Real-Time Threat & Risk Scoring Engine"]
        VehicleDb["National / RTO Vehicle Registry Database"]
    end

    subgraph ExternalServices["External Cloud Services"]
        Gemini["Google Gemini 2.5 Flash Multimodal API"]
    end

    UI -->|Static Assets & API Requests| GW
    GW --> AggHealth
    GW --> GeminiHost
    GeminiHost -.->|Online API Call| Gemini
    GW --> ProxyCore --> SpringBoot
    GW --> ProxyVision --> FastAPI

    UI -.->|Rung 1: Primary Vision| ProxyVision
    UI -.->|Rung 2: Onnxruntime Web| Worker
    UI -.->|Rung 3: Offline MobileNet| CocoFallback
```

### Language & Service Responsibilities
1. **Python 3.11+ (`ai-service/`)**: FastAPI + Uvicorn + Ultralytics YOLO26 + OpenCV. All computer vision processing: object detection, ByteTrack kinematics (`min_hits=3`, EMA box smoothing, footpoint velocity), CLAHE low-light enhancement, virtual zone breaches, and RapidOCR ANPR.
2. **Java 21 LTS (`core-service/`)**: Spring Boot 3 + Maven. System of record: auth sessions, cameras, virtual zones, alert lifecycle (Open $\rightarrow$ Acknowledged $\rightarrow$ Resolved), immutable audit logging, risk scoring engine (0–100), simulated vehicle registry, and Server-Sent Events (SSE) alert push.
3. **TypeScript (`gateway/` & `frontend/`)**:
   - `gateway/`: Express reverse proxy, aggregates `/api/health` across all services, transparently forwards `/api/core/*` and `/api/vision/*`, hosts the Gemini multimodal copilot with grounded fallback reasoning.
   - `frontend/`: React 19 + Tailwind CCTV operator workstation with HUD overlay, multi-camera grid, and responsive layout (390px to 1920px).
4. **JavaScript (Plain .js)**:
   - `frontend/public/workers/detector.worker.js`: In-browser fallback detector powered by ONNX Runtime Web.
   - `tools/camera-simulator.js`: Synthetic border camera telemetry & incident generator.
   - `tools/load-test.js`: High-concurrency HTTP benchmark & latency percentile tester.
   - `tools/dev-all.js`: Cross-platform single-command orchestrator.

---

## ⚡ Detection Fallback Ladder

The frontend implements a strict, graceful 3-tier detection ladder that guarantees zero UI crashes under any failure scenario:

| Tier | Engine | Execution Environment | Latency | Condition |
| :--- | :--- | :--- | :--- | :--- |
| **Tier 1** | **Python AI-Service (YOLO26)** | Server-side / GPU / CPU via Gateway | 20–50 ms | Default high-accuracy pipeline |
| **Tier 2** | **Browser YOLO (ONNX)** | Background Web Worker (`ort-web`) | 60–90 ms | Selected when AI-Service is offline |
| **Tier 3** | **Browser COCO-SSD** | In-Browser MobileNet (TensorFlow.js) | 70–100 ms | Last resort offline fallback |

---

## 🚦 Clean Empty State & Data Integrity Guarantees

- **No Hardcoded Mock Data on Boot**: On initial load with no footage uploaded, the platform initializes with **0 cameras, 0 alerts, 0 logged plates, and 0 tracked entities**. Nav badges are hidden when counts are zero.
- **Safe Demo Mode**: To explore features without connecting real hardware, an explicit **"Load Demo Data"** button seeds demo feeds, zones, and alerts with explicit `[Demo]` labels. A single click on **"Clear Demo Data"** restores the pristine empty state.
- **Dossier Isolation**: License plates flagged as `UNREADABLE` or with low OCR confidence (<60%) **never** attach to vehicle dossiers, fabricated owners, or verified badges. Operators can manually correct misreads via an audit-logged dialog.

---

## 🛠️ Toolchain Prerequisites & Installation

Check system requirements before starting:
- **Node.js**: `v20+` or `v22+` (`node -v`)
- **Python**: `3.11+` (`python --version`) with virtual environment support
- **Java**: `Java 21 LTS` (`java -version`, Temurin JDK 21 recommended)
- **Maven**: Maven 3.9+ or use the included Maven wrapper (`./mvnw` / `.\mvnw.cmd`)

---

## 🚀 One-Command Launch

### Method 1: All-in-One CLI Runner (Recommended)
From the repository root:
```bash
npm run dev:all
```
This automatically verifies toolchains, initializes the Python venv, starts Core-Service (8080), AI-Service (8000), and Gateway/Frontend (3000), and wires unified Ctrl+C teardown.

### Method 2: Docker Compose
```bash
docker compose up --build
```

### Method 3: Running Services Individually
```bash
# Terminal 1 - Java Core Service
cd core-service
./mvnw spring-boot:run

# Terminal 2 - Python AI Service
cd ai-service
.\.venv\Scripts\uvicorn app.main:app --host 0.0.0.0 --port 8000

# Terminal 3 - Express Gateway & Frontend
npm run dev
```

---

## 🧪 Testing & Verification

### Unit & Integration Tests
```bash
# Frontend Unit Tests (Vitest: 17/17 passed)
npm --workspace=frontend run test

# Gateway Tests (Vitest: 11/11 passed)
npm --workspace=gateway run test

# Python AI-Service Tests (Pytest: 21/21 passed)
cd ai-service && pytest

# Java Core-Service Tests (Maven Surefire: 13/13 passed)
cd core-service && ./mvnw test

# End-to-End Smoke & Walkthrough Tests (Playwright: 5/5 passed)
npx playwright test
```

### Accuracy, MOT & Kinematics Benchmarks
```bash
# MOT Metrics Benchmark on Synthetic Crossing Paths (MOTA 98.7%, IDF1 99.3%, 0 ID Switches)
python ai-service/scripts/eval_mot_metrics.py

# Model & Resolution Matrix Benchmark (yolo26n vs yolo26s @ 640/960)
python ai-service/scripts/benchmark_models_imgsz.py

# Render Debug Trail Videos with Trajectories & Kinematics (gitignored)
python ai-service/scripts/render_debug_trail_video.py

# ANPR RapidOCR Accuracy Benchmark (Synthetic 220 Plates: 96.8% Exact Match)
python ai-service/scripts/eval_anpr.py

# ByteTrack Multi-Object Tracking & Kinematics Evaluator (Full Video Multirun)
python ai-service/scripts/eval_tracking.py --runs 3
```

### HTTP Service Load Testing
```bash
node tools/load-test.js --requests 50 --concurrency 10
```

---

## 📊 Benchmark Summary: Real Footage vs. Synthetic

### A. Real-Footage Checkpoint Evaluation (Full Clips, 3 Runs Median FPS)
Evaluated across real border surveillance cameras with asynchronous on-demand OCR:

| Video Clip | Condition | Median FPS | All IDs | All Ghost % | Interior IDs | Interior Ghost % | Interior Frags | Interior ID Changes / min |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| `whatsapp_533pm.mp4` (Day) | **Round 3 Optimized** | **9.50 FPS** | **65** | **23.1%** | **15** | **26.7%** | **6** | **29.92 ID/min (-77.8%)** |
| | Baseline | 4.65 FPS | 161 | 49.1% | 47 | 68.1% | 27 | 134.63 ID/min |
| `whatsapp_842pm.mp4` (Night) | **Round 3 Optimized** | **6.05 FPS** | **93** | **48.4%** | **46** | **54.3%** | **26** | **87.31 ID/min (-67.9%)** |
| | Baseline | 3.37 FPS | 192 | 58.9% | 92 | 67.4% | 81 | 272.01 ID/min |

*Smooth Demo Mode ("Analyze, then play")*: Click "Analyze & Play" on any uploaded video to pre-index detections with linear interpolation, enabling buttery-smooth 30–60 FPS playback with zero inference lag.

### B. Real Footage ANPR Review Sheet (`docs/anpr_review.html`)
- **15 Extracted Crops**: 0 / 15 read due to average 16px plate height in 768x432 WhatsApp video (below OCR resolving threshold).
- **Integrity Compliance**: 100% of unreadable crops are isolated—**zero** fake dossiers, fabricated owners, or "Verified" badges attached.

### C. Synthetic ANPR Benchmark (SYNTHETIC — 220 Perturbed Plates)
Tested across 220 synthetically generated Indian license plate crops with varied optical distortions (`samples/synthetic_plates/`):
- **Overall Exact Match**: **96.82%** (213 / 220)
- **Character Error Rate (CER)**: **0.32%** (7 errors across 2,194 characters)
- **Format Compliance**: **98.18%** (216 / 220)
- **Clean**: 97.73% Exact Match | 0.23% CER
- **Noise**: 100.00% Exact Match | 0.00% CER
- **Perspective**: 100.00% Exact Match | 0.00% CER
- **Low-Light**: 100.00% Exact Match | 0.00% CER
- **Blur**: 86.36% Exact Match | 1.38% CER

### D. Synthetic Multi-Object Tracking Benchmark (MOT Challenge Format)
Evaluated on synthetic mutual occlusion and crossing trajectories via `motmetrics`:
- **IDF1 Score**: **99.34%** (+14.32% over un-aliased baseline)
- **ID Switches**: **0** (eliminated during occlusion; baseline had 1 switch)
- **MOTA**: **98.68%**
- **Mostly Tracked (MT)**: 3 / 3 (100%) | **Mostly Lost (ML)**: 0 / 3 (0%)

---

## ⚠️ Known Limitations

1. **Optical Resolution**: Vehicles distant from the camera (<80x25 px plate crop) do not have enough pixels for optical character segmentation without telephoto optical lenses.
2. **CPU Throughput**: Full deep-learning detection + OCR on 16+ vehicles per frame achieves 0.4–4.4 FPS on CPU. Real-time 30 FPS multi-stream production requires NVIDIA CUDA / TensorRT GPU acceleration.
3. **Occlusion Buffer Limit**: Tracks occluded for longer than 2.0 seconds (`MAX_LOST_FRAMES=60`) are pruned to prevent memory bloat; subsequent reappearances trigger appearance-based Re-ID.
4. **Night Motion Smear**: Heavy motion blur from slow shutter speeds at night degrades character edges; optical strobe illumination is recommended for high-speed nighttime checkpoints.

---

## 📜 Operator Documentation & Guides

- [Operator Walkthrough & 5-Minute Demo Guide](docs/DEMO_GUIDE.md)
- [Comprehensive Upgrade & Verification Report](REPORT.md)
- [Real Footage ANPR Review Sheet](docs/anpr_review.html)
