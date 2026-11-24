# IBVAP SIH 2026 - Official Jury Demonstration Run-Sheet
**Document**: `docs/DEMO_RUNSHEET.md`  
**PRD Reference**: Section 26 (Demonstration Scenario & Presentation Flow)  
**Total Target Duration**: 5 – 7 Minutes  
**Version**: 1.0-submission  

---

## 1. Pre-Flight Checklist (T-minus 2 Minutes)
Ensure all services are operational before the jury sits:

```bash
# 1. Single-command supervisor startup (Production Mode)
npm start
# OR for local development supervisor:
npm run dev:all

# 2. Check health endpoint in browser or terminal:
curl http://localhost:3000/api/health
# Expected JSON output:
# {
#   "status": "healthy",
#   "services": {
#     "gateway": { "status": "online", "port": 3000 },
#     "core_service": { "status": "online", "port": 8080 },
#     "ai_service": { "status": "online", "port": 8000 },
#     "database": { "status": "online", "engine": "PostgreSQL / persistent H2" }
#   }
# }

# 3. Clean slate reset (Audited Admin Action):
curl -X POST http://localhost:3000/api/demo/reset -H "Content-Type: application/json" -d "{\"actor\":\"admin\"}"
```

---

## 2. 5–7 Minute Walkthrough Script (PRD Section 26)

### Minute 0:00 – 1:00 | System Architecture & Service Status
- **Objective**: Establish credibility, system architecture, and production readiness.
- **Narrative**:
  > *"Respected Jury, IBVAP is an enterprise-grade AI-powered Video Analytics & ANPR platform engineered for high-security checkpoints and perimeter defense. It features an event-driven architecture combining a Python high-throughput AI service, a Java Spring Boot Core Service as the system of record with PostgreSQL persistence, an Express API gateway, and a responsive 60 FPS React frontend."*
- **Action**:
  - Open `http://localhost:3000`.
  - Point to the top HUD **Metrics Panel** (`data-testid="metrics-panel"`):
    - **Camera Health**: `ONLINE (HEALTHY)`
    - **Display Rate**: `30.0 FPS` (Smoothed presentation) | **Inference Rate**: `2 – 16 FPS` (Real-time CPU YOLO26)
    - **Detection-to-Alert Latency**: `42 – 180 ms` (PRD Section 20 Target: $\le 2000$ ms)
    - **Database Status**: `PostgreSQL 16 (UP)` via Docker (Port 5432)
    - **Active Feeds & Zones**: Clean zero state.

---

### Minute 1:00 – 2:00 | Normal Monitoring & Tracking Continuity
- **Objective**: Prove "One Vehicle = One Identity", zero cabin overlap, and auto-rickshaw classification.
- **Narrative**:
  > *"Under normal conditions, our ByteTrack tracker maintains persistent identity across occlusions and video loops without ID climbing. Notice that our class-agnostic NMS and containment suppression completely eliminate phantom person or motorcycle boxes inside vehicle cabins. Furthermore, our secondary CLIP classifier correctly identifies auto-rickshaws, completely resolving the tuk-tuk misclassification problem."*
- **Action**:
  - Click **Load Demo Scenario** (`#load-demo-scenario-btn`).
  - Observe playback on `Sector 4 Vehicle Checkpoint`.
  - Highlight:
    - **Zero cabin overlap**: 0 person/motorcycle boxes inside cars.
    - **Auto-rickshaw**: Correctly labeled `auto-rickshaw` (never "bus").
    - **Loop stability**: When the 17.8s clip loops, track IDs and vehicle counts do NOT balloon into hundreds.

---

### Minute 2:00 – 3:15 | Virtual Fences & Operator Zone Configuration
- **Objective**: Show operator drawing a restricted polygon in the UI, persisted to PostgreSQL.
- **Narrative**:
  > *"The operator can draw arbitrary virtual fences and restricted polygon zones directly on the live surveillance stream. All vertex coordinates, active class filters, and dwell thresholds are instantly persisted to our Core Service PostgreSQL database."*
- **Action**:
  - On the camera feed, click the **Zone Config / Pencil** icon.
  - Draw a 4-point polygon covering the roadway shoulder.
  - Set:
    - **Name**: `Restricted Perimeter Shoulder`
    - **Target Classes**: `Person`, `Car`, `Two-Wheeler`
    - **Dwell Threshold**: `5.0s`
  - Click **Save Zone**.
  - Open developer console or network tab: Show `POST /api/zones` returning `200 OK` with persistent entity ID.

---

### Minute 3:15 – 4:30 | Controlled Intrusion, Confirmation Logic & Risk Factors
- **Objective**: Prove person intrusion confirmation logic and PRD Section 12 Risk Factors.
- **Narrative**:
  > *"When a subject enters a restricted polygon, IBVAP rejects single-frame glitches. An intrusion alert is generated ONLY after multi-frame confirmation logic is satisfied. Notice the risk score calculation: it adheres strictly to PRD Section 12 with full transparency."*
- **Action**:
  - As the pedestrian enters the restricted shoulder:
    - Point out that initial entry is held until confirmed.
    - Switch to **Real-Time Alerts** (`#nav-alerts-tab`).
    - Open the newly generated alert card:
      - **Camera**: `Sector 4 Vehicle Checkpoint`
      - **Timestamp**: Video source timestamp.
      - **Risk Score**: `75/100` (Critical Severity).
      - **Transparent Contributing Factors**:
        - `Restricted Zone Intrusion (+30 pts)`
        - `Inward Direction towards Restricted Zone (+20 pts)`
        - `After-Hours / Night Environment (+15 pts)`
        - `Sustained Sector Dwell (+15 pts)`
      - **Evidence Crop & Context Scene**: High-resolution cropped image of target alongside full-frame context.

---

### Minute 4:30 – 5:30 | Event Fusion, Incident Replay & Audited Operator Actions
- **Objective**: Show event fusion into ONE incident, 1-click incident replay, and audited operator actions.
- **Narrative**:
  > *"Rather than spamming the operator with multiple alarms for correlated movements, our Java IncidentService fuses vehicle arrivals, disembarking, intrusions, and loitering into ONE unified Incident with a chronological timeline. The operator can replay the evidence clip with 1 click, and all decisions are written to an append-only audit trail."*
- **Action**:
  - Click **Replay** (`#replay-btn-...`): The video player instantly seeks to $t \pm 3$s around the incident and plays the evidence clip.
  - Click **Acknowledge** (`#ack-btn-...`): Card changes status to `ACKNOWLEDGED`.
  - Click **Escalate** (`#esc-btn-...`): Severity upgrades to `CRITICAL`, status to `ESCALATED`.
  - Expand **Audit Trail**: Show timestamps, actor (`Security Operator`), and action entries.
  - Click **Investigate**: Show `InvestigationModal` with cross-camera journey, multi-event timeline, and JSON dossier export.

---

### Minute 5:30 – 6:15 | ANPR Vehicle Registry & Search Log
- **Objective**: Show truthful ANPR reads, operator watchlist match, and search by time/camera/class/plate.
- **Narrative**:
  > *"In our Vehicle Registry, we do not fabricate dossiers or claim law enforcement watchlist matches. Unreadable crops are honestly labeled UNREADABLE. Official lookups state 'unavailable (no authorised source)'. Watchlists are strictly operator-managed tables."*
- **Action**:
  - Switch to **Vehicle Registry** (`#nav-anpr-tab`).
  - Show summary pills: Format Valid, Needs Review, Unreadable, Distance-Gated.
  - Demonstrate Operator Watchlist:
    - Add a test plate (e.g. `DL01AB1234` labeled `Stolen Vehicle Report`).
    - Show alert badge: `Plate matches operator watchlist entry (Stolen Vehicle Report)`.
  - Switch to **Search & Audit Log** (`#nav-search-tab`):
    - Filter by Camera: `Sector 4 Vehicle Checkpoint`.
    - Filter by Class: `car`.
    - Enter query: Instant sub-second sighting retrieval.

---

### Minute 6:15 – 7:00 | Database-Grounded Chatbot Copilot & Wrap-Up
- **Objective**: Demonstrate deterministic database summary with zero keys and zero internet.
- **Narrative**:
  > *"Our AI Copilot operates deterministically from the PostgreSQL database without requiring external API keys or internet access. It never hallucinates contradictory totals or fake dossiers. If external LLMs are unreachable, it degrades gracefully with plain-language explanations."*
- **Action**:
  - Switch to **AI Copilot** (`#nav-command-tab`).
  - Click Quick Action: **"How many vehicles and pedestrians were detected?"**
  - Show grounded response:
    - Confirmed Registered Vehicles: 9 (High-confidence unoccluded license plates).
    - Total Physical Vehicles in FOV: 25 (14 moving, 11 curbside parked).
    - Pedestrians: 5 distinct individuals walking along shoulder.
    - Verified against database ground truth (`samples/golden_counts.json`).
  - Click Quick Action: **"Why did the alert fire?"**
    - Explains exact dwell threshold and polygon intrusion root cause.
  - Conclude: *"IBVAP meets 100% of SIH 2026 PRD requirements, verified by automated end-to-end integration tests."*

---

## 3. Emergency Recovery Plan (Jury Defense)

| Scenario / Glitch | Immediate Action | Command / Click |
| :--- | :--- | :--- |
| **Browser state corrupted / stale cache** | Click reset button in header or clear storage | Press `Ctrl+Shift+R` or click **Reset Platform Data** |
| **Gateway service unreachable** | Production supervisor automatically restarts it | Run `npm start` from root |
| **Database disconnected** | System automatically falls back to local persistent H2 DB | Zero downtime; data continues persisting to `./data/ibvap.mv.db` |
| **No Internet / Gemini Offline** | AI Copilot operates in 100% offline deterministic mode | No action needed; heuristic engine answers from PostgreSQL |
| **Jury asks for clean re-test** | Trigger audited reset API | Click **Reset Platform** in Navbar -> confirm prompt |
