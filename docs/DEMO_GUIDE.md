# IBVAP Demonstration & Operator Walkthrough Guide

The Intelligent Border Video Analytics Platform (IBVAP) is an enterprise multi-service surveillance platform designed for real-time border security, vehicle tracking, automatic number plate recognition (ANPR), and automated threat assessment.

---

## 📋 Operator Demo Checklist (Quick Reference)

Before presenting or evaluating the platform, use this checklist:

| Check | Item | Verification Step |
| :--- | :--- | :--- |
| [ ] | **Clean Empty State** | Open `http://localhost:3000` in a fresh incognito tab. Verify all counters are `0`, no navigation badges appear, and clean empty-state banners display. |
| [ ] | **Zero-Internet / Offline Mode** | Confirm `GEMINI_API_KEY` is absent or unset. AI Copilot operates purely on local telemetry and grounded rules without internet access. |
| [ ] | **Daytime Clip Evaluation** | Load `samples/whatsapp_video_2026_09_09_533pm.mp4` using **Analyze & Play**. Observe 8+ FPS processing, smooth 30 FPS playback, and persistent vehicle IDs. |
| [ ] | **Night Clip & Low-Light CLAHE** | Load `samples/whatsapp_video_2026_09_09_842pm.mp4`. Automatic CLAHE contrast enhancement activates for low-light night toll booth footage. |
| [ ] | **ANPR & Dossier Isolation** | Open **Vehicle Registry**. Confirmed plates show RTO dossiers; unreadable crops show raw thumbnails with **zero** attached dossiers or simulated owner info. |
| [ ] | **Manual Plate Correction** | Click **"Correct Plate"** on an unreadable entry, enter `DL01AB1234`, and confirm the change updates immediately with an immutable audit entry. |
| [ ] | **Fault Tolerance & Fallback** | Terminate the Python AI service (port 8000). Verify the CCTV player gracefully falls back to client-side detection without crashing. |

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
Navigate to `http://localhost:3000` in Google Chrome or Microsoft Edge.

---

## 🎯 Step-by-Step Operator Scenarios

### Scenario A: Clean Empty State Verification
1. Open `http://localhost:3000` in an Incognito browser window (or clear `localStorage`).
2. Verify:
   - **Monitored Cameras**: 0
   - **Active Alerts**: 0
   - **Logged Plates**: 0
   - **Tracked Entities**: 0
   - Navigation tabs show no badges when counts are zero.
   - Clear empty-state call-to-action displays on Live Monitoring, Alert Feed, and Vehicle Registry tabs.

### Scenario B: Analyze & Play (Smooth Surveillance Video)
Because real-time inference on CPU runs at 5–8 FPS while video footage is recorded at 30 FPS, IBVAP includes **Analyze & Play**:
1. On **Live Monitoring**, click **"Upload Footage"**.
2. Select `samples/whatsapp_video_2026_09_09_533pm.mp4` (Daytime clip) or `samples/whatsapp_video_2026_09_09_842pm.mp4` (Night toll clip).
3. Click **"Analyze & Play"**.
4. The backend pre-processes the clip, computes detections, persistent trajectories, and ANPR crops, and caches them.
5. Playback starts automatically at smooth, real-time 30 FPS with bounding boxes, velocity indicators, and direction vectors overlaid cleanly.

### Scenario C: Safe Demo Mode & One-Click Purge
1. Navigate to the **Vehicle Registry** or **Live Monitoring** tab.
2. Click the explicit **"Load Demo Data"** button.
3. Verify:
   - All loaded records are explicitly tagged `[Demo]`.
   - Simulated cameras and boundary zones appear.
4. Click **"Clear Demo Data"** to instantly restore the platform to a pristine 0-record empty state in one click.

### Scenario D: License Plate Isolation & Integrity
1. In the **Vehicle Registry**, observe the logged plates:
   - **Valid Format & High Confidence (>60%)**: Displays full RTO registry dossier (make, model, owner, state).
   - **Low Confidence (<60%) or Unreadable**: Displays raw plate crop and thumbnail. **No** dossier, **no** fake owner, and **no** verified badge are attached.
2. Click **"Correct Plate"** on an unreadable entry:
   - Input a valid plate number (e.g. `DL01AB1234`).
   - Click Save.
   - The plate updates immediately and an audit entry is logged to the Core-Service audit trail.

### Scenario E: AI Copilot Grounded Fallback (No Internet)
1. Ensure `GEMINI_API_KEY` is not set in `.env`.
2. Open the floating **AI Command Bar** at the bottom of the screen.
3. Type: `Show security status summary`.
4. The Copilot answers immediately using grounded local telemetry:
   - Reports current camera count, alert breakdown, and ANPR reads.
   - Operates with 0 external network dependencies.

---

## 🛡️ Service Recovery & Troubleshooting Guide

If any background service stops unexpectedly during a demo, follow these exact recovery commands:

| Failed Service | Observed Symptom | Recovery Command |
| :--- | :--- | :--- |
| **Python AI-Service (Port 8000)** | CCTV player shows `Pipeline: Browser Fallback (COCO-SSD)` | In PowerShell:<br>`cd ai-service`<br>`.\.venv\Scripts\uvicorn app.main:app --port 8000 --host 0.0.0.0` |
| **Java Core-Service (Port 8080)** | Alert feeds show cached data; `/api/core/*` returns 502 | In PowerShell:<br>`cd core-service`<br>`$env:JAVA_HOME = "$HOME\.jdk\jdk-21.0.6+7"`<br>`.\mvnw.cmd spring-boot:run` |
| **Express Gateway (Port 3000)** | Browser displays "Site cannot be reached" | In PowerShell (root directory):<br>`npm run dev:all` |
