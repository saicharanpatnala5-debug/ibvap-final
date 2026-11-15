# IBVAP Pitch & Evaluation Defense Cheat Sheet

A concise reference guide addressing the top 10 tough questions from judges, technical evaluators, and security officers.

---

### Q1: "How accurate is your system?"
> **The Honest Pitch**: *"We separate synthetic benchmarks from physical camera reality with complete transparency."*
- **Synthetic Benchmark**: **89.55% exact match**, 95.45% within $\le 1$ character, and **2.02% CER** across 220 perturbed Indian license plates running on `fast-alpr` ONNX at **43.6 FPS on CPU** (22.9 ms).
- **Real-World CCTV**: In standard surveillance video ($768\times 432$) recorded at $>15$m distance, license plates are under 18 pixels tall—physically lacking the resolution needed for character recognition.
- **Data Integrity Guarantee**: We **physically distance-gate** targets ($<120\times 80$px) as *"Plate not legible at this distance"* and strictly validate 28 States + 8 UTs. Exactly **0 of 54 vehicle tracks produced a validated plate (40 were distance-gated, 14 were large enough to attempt)**. **We never guess, extrapolate, or hallucinate characters.**

---

### Q2: "Why not just run YOLO directly?"
> **The Honest Pitch**: *"Detection is just one component. The operational value is tracking, threat rules, append-only logs, and auditability."*
- YOLO produces isolated bounding boxes on single frames without temporal context.
- **IBVAP delivers a full surveillance ecosystem**:
  1. **Kinematics & Tracking**: Multi-target ByteTrack with occlusion re-ID and velocity vectors.
  2. **Virtual Policy Rules**: Point-in-polygon containment, directional tripwires, and configurable dwell loitering.
  3. **Incident State Machine**: Lifecycle transitions (`Open` $\rightarrow$ `Acknowledged` $\rightarrow$ `Resolved`) with Server-Sent Events (SSE).
  4. **Append-Only Audit Log**: In-memory audit log in Java Core-Service (no update/delete API).
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
> **The Honest Pitch**: *"The platform runs locally and is verified offline."*
- All neural weights (YOLO, Fast-ALPR detector, and OCR models) are pre-cached locally via `npm run setup`.
- Real footage (`samples/*.mp4`), facial crops, and review sheets are untracked and gitignored.
- **Offline UI Verification**: Verified via automated Playwright tests with non-localhost requests blocked: 0 external requests occurred (all fonts, styles, COCO-SSD detection models, and OCR models are bundled locally).
- **Optional Cloud Usage**: The AI Copilot uses a deterministic local heuristic engine summarizing active telemetry. Google Gemini is an optional external plugin that only receives single frame snapshots if the operator explicitly configures an API key.

---

### Q5: "How does this scale to multiple cameras?"
> **The Honest Pitch**: *"Our polyglot architecture separates vision processing from state and UI management."*
- **Measured Numbers (Single-Stream CPU)**:
  - Fast mode (`yolo26n @ 640`): measured **~11.5 FPS** (87 ms/frame).
  - Balanced mode (`yolo26s @ 960`): measured **~4.7 FPS** (212 ms/frame).
  - High mode (`yolo26m @ 1280`): measured **~1.1 FPS** (925 ms/frame).
  - Smooth 30 FPS playback is enabled via client-side pre-analysis (*Analyze & Play*).
- **Measured Gateway Load**: Tested under 200 concurrent HTTP requests (`tools/load-test.js`): 0 failed requests, median latency 14.8 ms.
- **Scale Projection (Untested)**: Multi-camera multi-GPU deployment (e.g. NVIDIA TensorRT / CUDA) and clustered Java services are architectural projections, not empirically verified production benchmarks.

---

### Q6: "Is the vehicle registry connected to real government databases?"
> **The Honest Pitch**: *"No, it is a simulated service with a pluggable interface boundary and no real integration."*
- Real Vahan/Parivahan API access requires authenticated agency credentials and authorization from the Ministry of Road Transport & Highways (MoRTH).
- **Interface Boundary**: `VehicleRegistryService` provides a modular service interface that can be replaced with an official government API client once credentials are provided.
- **Integrity Guarantee**: Distant or unreadable plates never attach a fake owner or fabricated vehicle dossier.

---

### Q7: "How do you handle Indian auto-rickshaws and two-wheelers?"
> **The Honest Pitch**: *"We fuse motorcycles and riders into unified tracks. For auto-rickshaws, we deliberately removed fragile aspect-ratio hacks."*
- Early prototypes used a bounding aspect ratio ($0.75 \le w/h \le 1.28$) to identify three-wheelers, but frontal cars approaching head-on were misclassified. We **removed the heuristic** to preserve data integrity.
- **Roadmap (To be verified / Rough estimate)**: Fine-tuning YOLO on Indian road traffic datasets:
  - **IDD (Indian Driving Dataset)**: 10,000+ dense images from IIIT-H (CC BY-NC-SA 4.0 research license, to be verified).
  - **Roboflow Indian Traffic Datasets**: 3,000–5,000 images under CC BY 4.0 (licenses vary across datasets).
  - Estimated requirements (rough estimate): **6 to 10 GPU hours** (~$10–$25 compute cost) on a cloud GPU.

---

### Q8: "Why did you build this in three different programming languages?"
> **The Honest Pitch**: *"We use the standard tool for each operational domain rather than forcing a single language."*
- **Python (`ai-service/`)**: Primary ecosystem for computer vision, PyTorch, Ultralytics, and ONNX Runtime.
- **Java 21 LTS (`core-service/`)**: Proven platform for state machines, thread-safe memory models, append-only audit logging, and Server-Sent Events.
- **TypeScript / Node.js (`gateway/` & `frontend/`)**: High-concurrency reverse proxying, rate limiting, and responsive React 19 VMS operator workstation.

---

### Q9: "What are the software licensing implications?"
> **The Honest Pitch**: *"Main open-source licences identified, no formal audit."*
- **Ultralytics YOLO**: AGPL-3.0 (fully open-source; commercial deployment requires an enterprise license from Ultralytics).
- **Fast-ALPR**: MIT (permissive open-source).
- **Spring Boot / Java**: Apache 2.0 (permissive).
- **Express / Helmet / Zod / React 19**: MIT.
- **IDD Dataset**: CC BY-NC-SA 4.0 (research license; to be verified for commercial use).

---

### Q10: "What is your security posture?"
> **The Honest Pitch**: *"We enforce baseline security controls, and we state our testing limits honestly in `SECURITY.md`."*
- **Implemented Controls**:
  - Automated refusal to start in production if default secrets (`SERVICE_TOKEN`, `JWT_SECRET`) are detected.
  - Helmet security headers, CORS origin restrictions, and rate limiting (30 req/min on AI endpoints).
  - File upload sanitization (`os.path.basename`, UUID naming, video container extension allowlist).
  - Automated SCA audits: `npm audit` (**0 vulnerabilities**) and `pip-audit` (**0 vulnerabilities**). Java dependencies were mapped via `mvn dependency:tree` but not scanned with a specialized CVE tool.
- **Honest Boundary**: This is an evaluation prototype and has not undergone third-party red-team penetration testing.
