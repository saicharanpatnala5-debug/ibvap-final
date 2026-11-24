# IBVAP: 1-Page Tactical Pitch Summary (SIH 2026 Submission)

**Platform**: Intelligent Border Video Analytics Platform (IBVAP)  
**Submission Release**: `v1.2-final`  
**Team**: Border Surveillance & Tactical Vision System

---

## 🎯 The Core Problem & Our Tactical Mission
Modern border checkpoints and perimeter fences are vulnerable to intrusion, loitering, and reconnaissance under poor lighting conditions. Human operators suffer from alarm fatigue caused by false triggers (in-cabin driver reflections, passing traffic, boundary flicker) and fragmented evidence across isolated sensors.

**IBVAP delivers an integrated, deterministic, explainable system of record**:
1. **One Vehicle = One Persistent Identity**: ByteTrack kinematics with automatic loop/seek reset eliminates phantom track multiplication.
2. **Physically Grounded Containment NMS**: Suppresses driver reflections inside cabins while preserving pedestrians on pavement and associating two-wheeler riders.
3. **Multi-Frame Confirmation Virtual Fences**: 3-frame debounce footpoint verification eliminates boundary noise.
4. **Explainable Risk Intelligence**: PRD Section 12 weighted scoring (+30 Intrusion, +20 Inward Direction, +15 Night Luminance, +15 Loiter, +10 Correlated).
5. **Incident Fusion & 1-Click Forensics**: Groups vehicle arrival, person exit, zone entry, and loitering into a single incident with a chronological timeline and instant $t \pm 3$s bounded replay.
6. **Defense-in-Depth Security**: BCrypt password hashing (work factor 10), salted authentication, and append-only PostgreSQL audit log.

---

## 📊 Honest Evaluation Metrics

| Metric | PRD Target | Measured Reality | Technical Defense Strategy |
| :--- | :---: | :---: | :--- |
| **Event-to-Alert Latency** | $\le 2.0$ seconds | **1.1 – 1.5 s (end-to-end)** | **Exceeds PRD requirement**. Includes 230.9 ms single-frame inference plus 3-frame debounce confirmation (~900 ms). Eliminates boundary flicker while alerting the operator in under 1.5 seconds. |
| **Analysis Throughput** | $\ge 15.0$ FPS | **3.3 FPS (CPU forward-pass)** | Forward-pass on laptop CPU takes ~123 ms (296 ms total pipeline). Plainly misses 15+ FPS on CPU. For smooth live demo, the platform uses **Analyze & Play** to pre-process footage and replay at 30 FPS. |
| **ANPR Transparency** | Gated Accuracy | **9 Confirmed / 16 Distant / 25 Scene** | 0 junk partial strings accepted. Confirmed plates meet $\ge 75\%$ confidence and multi-frame consensus; distant plates remain honest without hallucination. |
| **Person Containment** | Zero Pedestrian Loss | **0 (0.0%) Pavement Pedestrians Dropped** | Audited over 30 representative frames: 71 raw detections $\rightarrow$ 28 kept ground pedestrians, 11 fused riders, 6 in-cabin suppressed, 24 transient tracker ghosts filtered. |
| **RTSP Resilience** | Zero System Crash | **100% Recovery** | Tested with live MediaMTX stream. Killing publisher triggers clean reconnect with zero UI or backend crashes. |

---

## 🛡️ Scope Discipline & PRD Compliance

To ensure complete production stability for the jury, all experimental non-PRD prototypes have been quarantined:
- **Weapons Beta**: Hidden behind `VITE_ENABLE_WEAPONS_BETA=false`.
- **Multi-Camera Topology Labs**: Hidden behind `VITE_ENABLE_TOPOLOGY_LABS=false`. Single camera tactical perimeter prioritized.
- **Face Analytics Prototype**: Quarantined behind `ENABLE_FACE_ANALYTICS=false`.
- **Synthetic Watchlists & Dossiers**: Completely deleted. Empty operator-managed watchlist table only.
- **Controlled Demo Scenario Verification**: All incident fusion, zone intrusion, and loitering story flows are validated via Playwright integration tests (`frontend/tests/prdStory.spec.ts`). Real-world physical parking scenario is documented as awaiting field recording in `samples/demo_scenario.mp4`.

---

## 🚀 30-Second Demo Script for Evaluators

1. **Start the Stack**: Launch via `npm run demo`. Verify PostgreSQL health badge in top bar.
2. **Add RTSP Feed**: Open **Add Camera** $\rightarrow$ select `rtsp://localhost:8554/live/checkpoint` $\rightarrow$ shows instant live canvas and stream state.
3. **Draw Restricted Fence**: Draw 4-point polygon on pavement $\rightarrow$ set `RESTRICTED`.
4. **Trigger Incident Story**: Run via **Analyze & Play** or click **Demo Scenario**: normal pedestrian passes (0 alerts) $\rightarrow$ vehicle arrives (plate registered) $\rightarrow$ person enters zone $\rightarrow$ **Intrusion (+30)** fires after 3-frame confirmation $\rightarrow$ person loiters $\rightarrow$ **Loiter (+15)** factor attached $\rightarrow$ incident timeline generated in ~1.2s.
5. **Forensic Action**: Click **Replay** (bounded clip opens instantly) $\rightarrow$ click **Acknowledge** (audited in PostgreSQL) $\rightarrow$ open **Search** to find plate record.
