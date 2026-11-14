# IBVAP Demonstration & Operator Walkthrough Guide

The Intelligent Border Video Analytics Platform (IBVAP) is an enterprise multi-service surveillance platform designed for real-time border security, vehicle tracking, automatic number plate recognition (ANPR), and automated threat assessment.

---

## 🚀 Quick Start (5-Minute Evaluation)

### 1. One-Command System Launch
Launch all three backend services (Express Gateway on port 3000, Python AI-Service on port 8000, and Spring Boot Core-Service on port 8080) with a single command:
```bash
npm run dev:all
```
Alternatively, with Docker Compose:
```bash
docker compose up --build
```

### 2. Verify System Health
Open your browser or run curl against the Gateway health monitor:
```bash
curl http://localhost:3000/api/health
```
**Expected Response:**
```json
{
  "status": "ok",
  "gateway": "online",
  "services": {
    "gateway": { "status": "online", "port": 3000 },
    "aiService": { "status": "ok", "yolo_model": "yolo26s.pt" },
    "coreService": { "status": "ok", "javaVersion": "21.0.6" }
  }
}
```

### 3. Open the Surveillance Dashboard
Navigate to `http://localhost:3000`.

---

## 🎯 Verification Scenarios

### Scenario A: Clean Empty State Verification
1. On fresh load without uploaded footage, verify:
   - **Monitored Cameras**: 0
   - **Active Alerts**: 0
   - **Logged Plates**: 0
   - **Tracked Entities**: 0
   - Navigation badges are hidden when counts are zero.
   - Clear empty-state call-to-action displays on Live Monitoring, Alert Feed, and Vehicle Registry tabs.

### Scenario B: Load Safe Demo Data
1. Navigate to the **Vehicle Registry** or **Live Monitoring** tab.
2. Click the explicit **"Load Demo Data"** button.
3. Verify:
   - All loaded records are explicitly tagged `[Demo]`.
   - Simulated cameras and boundary zones appear.
   - Click **"Clear Demo Data"** to instantly restore the platform to a pristine 0-record empty state in one click.

### Scenario C: Detection Fallback Ladder
IBVAP uses a resilient 3-tier fallback ladder:
1. **Tier 1 (Default)**: Python AI-Service (`FastAPI + YOLO26 + ByteTrack`)
2. **Tier 2 (Browser Worker)**: Background Web Worker (`ONNX Runtime Web + YOLO26 ONNX`)
3. **Tier 3 (In-Browser Offline Fallback)**: Client-side MobileNet COCO-SSD

**How to test graceful degradation:**
1. While streaming footage, terminate the Python AI service (`kill task` or stop port 8000).
2. The UI does **NOT** crash.
3. The HUD overlay displays:
   `Pipeline: Browser COCO-SSD (Fallback)`
4. Restart the Python AI service; the platform seamlessly reconnects and upgrades to `Python AI-Service (YOLO26)`.

### Scenario D: License Plate & Dossier Isolation
1. In the Vehicle Registry, observe read plates:
   - **Valid Format & High Confidence (>60%)**: Displays full RTO registry dossier (make, model, owner, state).
   - **Low Confidence (<60%) or Unreadable**: Displays raw plate crop and thumbnail. **No** dossier, **no** fake owner, and **no** verified badge are attached.
   - Click **"Correct Plate"** on an unreadable entry to manually input the valid plate number. The update is automatically logged to the immutable audit trail.

### Scenario E: Automated Incident Generation & Simulation
To stress-test telemetry and incidents with simulated border events:
```bash
node tools/camera-simulator.js --interval 2000
```
To run HTTP performance benchmarks across the services:
```bash
node tools/load-test.js --requests 50 --concurrency 10
```

---

## 🛡️ Failure Recovery & Degradation Matrix

| Scenario | Behavior | Recovery Action |
| :--- | :--- | :--- |
| **Missing `GEMINI_API_KEY`** | AI Copilot operates in grounded telemetry fallback mode without errors | Add key to `.env` if cloud analysis is desired |
| **Python AI-Service Down** | Camera feeds drop down fallback ladder to in-browser neural detection | Restart `ai-service` via `npm run dev:all` |
| **Java Core-Service Down** | Gateway returns cached telemetry; alerts fall back gracefully | Restart Spring Boot service on port 8080 |
| **Corrupted Video File** | Video player displays clear error state without halting UI | Re-upload valid MP4/WebM video |
