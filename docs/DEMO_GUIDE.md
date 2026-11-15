# IBVAP Demonstration & Operator Walkthrough Guide (Round 7)

**Project**: Intelligent Border Video Analytics Platform (IBVAP)  
**Target URL**: `http://localhost:3000`  
**Evaluation Mode**: Verified Offline Capable (No External Internet Required)  
**One-Command Launch**: `npm run dev:all`  
**One-Command Stop**: `npm run stop`  

---

## ⏱️ Measured Analyze Pipeline Timings (Real Surveillance Clips)

Measured on local CPU across both evaluation CCTV video clips (`samples/whatsapp_video_*.mp4`) for each quality profile:

| Video Clip | Duration & Frames | Quality Profile & Model | Total Analyze Time | Measured FPS | Latency / Frame |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Day Clip** (`...533pm.mp4`) | 12.0s (361 frames) | **Fast** (`yolo26n @ 640`) | **31.67 s** | **11.40 FPS** | 87.7 ms |
| **Day Clip** (`...533pm.mp4`) | 12.0s (361 frames) | **Balanced** (`yolo26s @ 960`) | **77.82 s** | **4.64 FPS** | 215.6 ms |
| **Day Clip** (`...533pm.mp4`) | 12.0s (361 frames) | **High** (`yolo26m @ 1280`) | **334.15 s** | **1.08 FPS** | 925.6 ms |
| **Night Clip** (`...842pm.mp4`) | 17.9s (536 frames) | **Fast** (`yolo26n @ 640`) | **46.41 s** | **11.55 FPS** | 86.6 ms |
| **Night Clip** (`...842pm.mp4`) | 17.9s (536 frames) | **Balanced** (`yolo26s @ 960`) | **113.80 s** | **4.71 FPS** | 212.3 ms |
| **Night Clip** (`...842pm.mp4`) | 17.9s (536 frames) | **High** (`yolo26m @ 1280`) | **530.42 s** | **1.01 FPS** | 989.6 ms |

> [!NOTE]
> **Demo Recommendation**: For live presentations and interactive evaluations, **Fast Mode** (`yolo26n @ 640`) is set as the platform default. It runs at **~11.5 FPS** on CPU (87 ms/frame) with minimal latency.
> Clicking **"Demo Scenario"** starts playing video immediately within 1–2 seconds.
> If the operator clicks **"Analyze & Play"** (Smooth Demo Mode), the browser pre-analyzes keyframes with a clear progress message and starts 60 FPS interpolated playback within ~8–10 seconds.

---

## ⏱️ 5-Minute Presentation Script (Minute-by-Minute)

### Minute 1: Clean Empty State & Offline Verification (00:00 - 01:00)
- **What to Click**: Open `http://localhost:3000` in a fresh browser tab (or click the **Reset** button in the top navbar).
- **What to Explain**:
  - Point to the navigation bar: all counters are strictly `0`, no artificial badges appear, and clean empty banners display across Live Monitor, Alerts, and Vehicle Registry.
  - Explain the verified offline design: all neural models (YOLO, Fast-ALPR detector and recognizer, MobileNet COCO-SSD) are pre-cached locally via `npm run setup`. Verified via automated Playwright tests with all non-localhost requests blocked: 0 external network requests occurred.
- **What the Audience Sees**: Pristine command center HUD with zero dummy mock records.

### Minute 2: Load Demo Scenario & Virtual Zone Configuration (01:00 - 02:00)
- **What to Click**: Click the **"Demo Scenario"** button in the top right navbar (or **"Load Demo Data"** on any empty view).
- **What to Explain**:
  - The system loads the configured border checkpoint camera (`Sector 4 Vehicle Checkpoint`) with a predefined perimeter shoulder zone (`Restricted Perimeter Shoulder`) and sample video.
  - The scenario starts playing immediately (within 1–2 seconds).
  - Point out the **configurable dwell threshold** (set to 5.0 seconds for evaluation demos, 30.0 seconds for border operations).
- **What the Audience Sees**: The active camera view appears, showing the polygon zone overlay on the road shoulder with live playback.

### Minute 3: Real Video Ingestion & Loitering Alert Proof (02:00 - 03:00)
- **What to Click**: 
  - Click **"+ Add Camera"** $\rightarrow$ **"Upload Video File"**, select `samples/whatsapp_video_2026_09_09_842pm.mp4`, and click **"Add Feed & Play"** (or observe the pre-loaded Demo Scenario).
- **What to Explain**:
  - The detector processes frames with CLAHE low-light enhancement and ByteTrack kinematics.
  - Watch the road shoulder: Pedestrian #10 dwells for 7.77 seconds. At exactly $t=5.2$s, a high-severity incident fires: `Loitering Alert: PEDESTRIAN #10`.
  - Point out that **moving and stationary vehicles in traffic trigger ZERO false loitering alarms**, eliminating alert fatigue.
  - Point to the timeline scrubber: an incident marker appears at the exact video timestamp (`00:05.2s`); clicking the marker seeks directly to the incident.
- **What the Audience Sees**: Continuous detection bounding boxes, velocity vectors, and a clean alert notification banner with video timestamp.

### Minute 4: ANPR Plate Trust & Resolution Limits (03:00 - 04:00)
- **What to Click**: Click the **"Vehicle Registry"** tab in the top navigation.
- **What to Explain**:
  - State the physical facts honestly: in low-resolution video ($768\times 432$), vehicles $>15$m away have license plates with heights under 18 pixels, which is below the optical resolution limit for character segmentation.
  - Rather than spamming the operator with false errors, distant vehicles are designated as `"Plate not legible at this distance"` (`distance_gated`) with neutral slate pills.
  - Strict Indian format validation rejects incomplete candidate reads (`KA037755`, `KA03AHD`). Exactly **0 of 54 vehicle tracks produced a validated plate (40 were distance-gated, 14 were large enough to attempt)**. No invalid reads attach to fabricated vehicle owner dossiers.
  - Click **"Correct Plate"** on an unreadable entry, type `DL01AB1234`, and save: demonstrate that operator manual overrides immediately update the registry with an append-only audit log entry in the Core-Service (no update/delete API).
- **What the Audience Sees**: Clean registry table with tight plate crops, distance-gated status badges, and validated audit logs.

### Minute 5: AI Copilot Offline Reasoning & Platform Reset (04:00 - 05:00)
- **What to Click**:
  - Press `Ctrl+K` (or click **"AI Copilot"** tab). Type: `Summarize active sector threats and monitored cameras`.
  - Then click **"Reset"** in the top navbar.
- **What to Explain**:
  - Even with zero internet and no Google Gemini API key configured, the AI Copilot provides deterministic, grounded reasoning summarizing monitored cameras, active zone breaches, and entity telemetry.
  - Clicking **"Reset"** executes an instant, one-click purge of all loaded feeds, active alerts, and registry records, returning the system to its pristine clean empty state.
- **What the Audience Sees**: Grounded tactical AI response, followed by immediate return to the 0-state ready for the next evaluator.

---

## 🛠️ Service Recovery & Troubleshooting Plan

If a service stops or a port collision occurs during a demonstration, execute this recovery procedure:

### 1. Instant System Reset (Fastest Fix)
From the repository root in PowerShell or Terminal:
```bash
# 1. Stop all lingering services
npm run stop

# 2. Restart all services cleanly
npm run dev:all
```
Wait 5 seconds and refresh `http://localhost:3000`.

### 2. Service-by-Service Diagnostic Matrix

| Service | Port | Diagnostic Check | Observed Symptom | Manual Recovery Command |
| :--- | :--- | :--- | :--- | :--- |
| **Express Gateway** | `3000` | `curl http://localhost:3000/api/health` | Browser shows "Cannot GET" or connection refused | `cd gateway && npm run dev` |
| **Python AI-Service** | `8000` | `curl http://localhost:8000/health` | CCTV player shows `Pipeline: Browser Fallback (COCO-SSD)` | `cd ai-service`<br>`.\.venv\Scripts\uvicorn app.main:app --port 8000 --host 0.0.0.0` |
| **Java Core-Service** | `8080` | `curl http://localhost:8080/actuator/health` | Alert updates fail; `/api/core/*` returns 502 Bad Gateway | `cd core-service`<br>`$env:JAVA_HOME = "$HOME\.jdk\jdk-21.0.6+7"`<br>`.\mvnw.cmd spring-boot:run` |

### 3. Port In Use / Zombie Process
If a message indicates `Port 3000/8000/8080 already in use`:
```powershell
# Windows PowerShell
npm run stop
```
Or manually kill the offending process:
```powershell
netstat -ano | findstr :3000
taskkill /F /PID <PID_FROM_NETSTAT>
```

---

## 🎥 Backup Walkthrough Recording (Gitignored)

A local backup video walkthrough of the complete 5-minute demo is pre-recorded using Playwright:
- **Location**: `docs/demo_video/backup_walkthrough.webm` (gitignored to protect repository size).
- **Re-recording Command**:
  ```bash
  cd frontend
  npx playwright test tests/recordDemoVideo.spec.ts
  ```
- If hardware failure or screen projection issues arise during a presentation, open `docs/demo_video/backup_walkthrough.webm` directly in VLC or browser for a video playback of the operational platform.
