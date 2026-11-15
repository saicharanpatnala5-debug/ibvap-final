# IBVAP Pitch & Evaluation Defense Cheat Sheet

A concise reference guide addressing the top 10 tough questions from judges, technical evaluators, and security officers.

---

### Q1: "How accurate is your system?"
> **The Honest Pitch**: *"We separate synthetic benchmarks from physical camera reality with complete transparency."*
- **Synthetic Benchmark**: **89.55% exact match**, 95.45% within $\le 1$ character, and **2.02% CER** across 220 perturbed Indian license plates running on `fast-alpr` ONNX at **43.6 FPS on CPU** (22.9 ms).
- **Real-World CCTV**: In standard surveillance video ($768\times 432$) recorded at $>15$m distance, license plates are under 18 pixels tall—physically below the optical Nyquist limit for character segmentation.
- **Data Integrity Guarantee**: We **physically distance-gate** targets ($<120\times 80$px) as *"Plate not legible at this distance"* and strictly validate 28 States + 8 UTs. Exactly **0 of 54 distant vehicles** produced a validated plate. **We never guess, extrapolate, or hallucinate characters.**

---

### Q2: "Why not just run YOLO directly?"
> **The Honest Pitch**: *"Detection is just one component. The operational value is tracking, threat rules, chain of custody, and auditability."*
- YOLO produces isolated bounding boxes on single frames without temporal context.
- **IBVAP delivers a full surveillance ecosystem**:
  1. **Kinematics & Tracking**: Multi-target ByteTrack with occlusion re-ID and velocity vectors.
  2. **Virtual Policy Rules**: Point-in-polygon containment, directional tripwires, and configurable dwell loitering.
  3. **Incident State Machine**: Lifecycle transitions (`Open` $\rightarrow$ `Acknowledged` $\rightarrow$ `Resolved`) with Server-Sent Events (SSE).
  4. **Cryptographic Audit Ledger**: Immutable audit log in Java Core-Service.
  5. **Human-in-the-Loop Review**: Side-by-side tight entity crop and full-frame context drawer with manual correction override.

---

### Q3: "How do you prevent false alarm fatigue?"
> **The Honest Pitch**: *"Alerts require a confirmed track, explicit zone geometry, temporal hysteresis, and rate caps."*
- **Empirical Proof**:
  - Detections require **3 consecutive hits** (`min_hits=3`) before a tracklet is confirmed.
  - Loitering is restricted exclusively to **pedestrians dwelling inside restricted zones** for $\ge 30$ seconds (or 5s in demo profile).
  - Rate limiting enforces a **10s cooldown per track/rule** and a **hard cap of 5 alerts/cam/minute**.
  - **Measured Evidence**: Moving and stationary cars in traffic trigger **zero false alarms**. On our test footage, Pedestrian #10 dwells for 7.77s and triggers exactly one alert at $t=5.2$s. Shifting the zone away triggers **zero alerts**.

---

### Q4: "What about privacy and network exposure?"
> **The Honest Pitch**: *"The platform is 100% on-premises and runs completely offline."*
- All neural weights (YOLO, Fast-ALPR detector, and OCR models) are pre-cached locally via `npm run setup`.
- Real footage (`samples/*.mp4`), facial crops, and review sheets are untracked and gitignored.
- **Zero Cloud Leakage**: The AI Copilot uses a local grounded heuristic engine summarizing active telemetry. Google Gemini is an optional external plugin that only receives single frame snapshots if the operator configures an API key.

---

### Q5: "How does this scale to multiple cameras?"
> **The Honest Pitch**: *"Our polyglot architecture decouples heavy vision processing from state and UI management."*
- On a standard modern CPU, each stream processes at **3 to 9 FPS** (or smooth 30 FPS playback using our pre-processing *Analyze & Play* pipeline).
- **Production Architecture**:
  - The Python vision worker (`ai-service`) scales horizontally across multi-GPU nodes (using NVIDIA TensorRT / CUDA for 60+ FPS multi-stream throughput).
  - The Java Core-Service handles thousands of concurrent event streams with microsecond thread latency.

---

### Q6: "Is the vehicle registry connected to real government databases?"
> **The Honest Pitch**: *"No, it uses simulated RTO registration mock records. Official Vahan access requires government credentials."*
- Real Vahan/Parivahan API access requires authenticated agency credentials and authorization from the Ministry of Road Transport & Highways (MoRTH).
- **Clean Architecture**: `VehicleRegistryService` provides a modular service boundary ready to connect to official government gateways via mTLS.
- **Integrity Guarantee**: Distant or unreadable plates never attach a fake owner or fabricated vehicle dossier.

---

### Q7: "How do you handle Indian auto-rickshaws and two-wheelers?"
> **The Honest Pitch**: *"We fuse motorcycles and riders into unified tracks. For auto-rickshaws, we deliberately removed fragile aspect-ratio hacks."*
- Early prototypes used a bounding aspect ratio ($0.75 \le w/h \le 1.28$) to identify three-wheelers, but frontal cars approaching head-on were misclassified. We **removed the heuristic** to preserve data integrity.
- **Roadmap**: Fine-tuning YOLO on Indian road traffic datasets:
  - **IDD (Indian Driving Dataset)**: 10,000+ dense images from IIIT-H (CC BY-NC-SA 4.0 research license).
  - **Roboflow Indian Traffic Datasets**: 3,000–5,000 images under CC BY 4.0.
  - Requires **6 to 10 GPU hours** (~$10–$25 compute cost) on an NVIDIA A10G.

---

### Q8: "Why did you build this in three different programming languages?"
> **The Honest Pitch**: *"We use the best-in-class tool for each operational domain rather than forcing a single language."*
- **Python (`ai-service/`)**: The undisputed standard for computer vision, PyTorch, Ultralytics, and ONNX Runtime.
- **Java 21 LTS (`core-service/`)**: Enterprise standard for high-throughput state machines, thread-safe memory models, immutable audit ledgers, and Server-Sent Events.
- **TypeScript / Node.js (`gateway/` & `frontend/`)**: High-concurrency reverse proxying, rate limiting, and responsive React 19 VMS operator workstation.

---

### Q9: "What are the software licensing implications?"
> **The Honest Pitch**: *"All dependencies have been audited for open-source compliance."*
- **Ultralytics YOLO**: AGPL-3.0 (fully open-source; commercial deployment requires an enterprise license from Ultralytics).
- **Fast-ALPR**: MIT (permissive open-source).
- **Spring Boot / Java**: Apache 2.0 (enterprise permissive).
- **Express / Helmet / Zod / React 19**: MIT.
- **IDD Dataset**: CC BY-NC-SA 4.0 (for non-commercial research and evaluation).

---

### Q10: "What is your security posture?"
> **The Honest Pitch**: *"We enforce enterprise security controls, and we state our testing limits honestly in `SECURITY.md`."*
- **Implemented Controls**:
  - Automated refusal to start in production if default secrets (`SERVICE_TOKEN`, `JWT_SECRET`) are detected.
  - Helmet security headers, CORS origin restrictions, and rate limiting (30 req/min on AI endpoints).
  - File upload sanitization (`os.path.basename`, UUID naming, video container extension allowlist).
  - Automated SCA audits: `npm audit` (**0 vulnerabilities**) and `pip-audit` (**0 vulnerabilities**).
- **Honest Boundary**: This is an evaluation prototype and has not undergone third-party red-team penetration testing.
