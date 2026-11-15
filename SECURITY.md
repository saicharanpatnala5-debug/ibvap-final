# IBVAP Baseline Security Controls, Architecture Assessment & Audit Scope

**Project**: Intelligent Border Video Analytics Platform (IBVAP)  
**Date**: November 15, 2026  
**Status**: Tactical Surveillance Prototype / Evaluation Build  
**Disclaimer**: This document details baseline security controls, residual architectural risks, and test boundaries. **No claim is made that this system is impenetrable or completely "secure".** Production deployment in critical infrastructure requires third-party penetration testing and formal accreditation.

---

## 1. Threat Model & Architecture Perimeter

IBVAP coordinates four operational tiers:
1. **Operator Client (`frontend/`)**: React 19 Single Page Application.
2. **Reverse Proxy & Gateway (`gateway/`)**: Node.js/Express service listening on port 3000 (public interface).
3. **Computer Vision Engine (`ai-service/`)**: Python/FastAPI service listening on port 8000 (internal service).
4. **System of Record (`core-service/`)**: Java 21 LTS / Spring Boot 3 service listening on port 8080 (internal service).

```mermaid
flowchart LR
    Client["Operator Browser"] -->|Port 3000 (Public Gateway)| GW["Express Reverse Proxy"]
    GW -->|Internal Proxied Calls| FastAPI["Python AI-Service (:8000)"]
    GW -->|Internal Proxied Calls| Spring["Java Core-Service (:8080)"]
    GW -.->|External HTTPS (Optional)| Gemini["Google Gemini API"]
```

---

## 2. Implemented Security Controls

### A. Secret Hygiene & Production Safeguards
- **Zero Secrets in Git History**: Verified via automated pattern matching (`AIza*`, private keys, JWT tokens) across all git commits and trees.
- **Production Refusal on Default Secrets**: Both `gateway/server.ts` and `ai-service/app/main.py` enforce runtime checks when `NODE_ENV=production` or `ENVIRONMENT=production`. The services **refuse to start** (`process.exit(1)` / `RuntimeError`) if `SERVICE_TOKEN` or `API_ACCESS_TOKEN` is unset or matches development default values (`ibvap-internal-secret-token-change-in-prod`).
- **Environment Isolation**: All configuration credentials are read exclusively from environment variables or local gitignored `.env` files.

### B. Network Access & CORS Protection
- **Gateway Reverse Proxy Isolation**: Operator browsers communicate only with Gateway on `:3000`. The gateway transparently validates requests before forwarding to internal services (`:8000`, `:8080`).
- **Strict CORS Policy**:
  - Express Gateway: Rejects cross-site fetch requests (`Sec-Fetch-Site: cross-site`) for sensitive AI endpoints.
  - Python AI-Service: CORS restricted via `CORSMiddleware` to explicit origins (`http://localhost:3000`, `http://127.0.0.1:3000`, `http://localhost:8080`).
  - Java Core-Service: CORS restricted in `WebConfig.java` to allowed localhost origins or configurable `ALLOWED_ORIGINS` environment variable.

### C. Security Headers & Payload Limits
- **HTTP Security Headers**: Express Gateway incorporates `helmet` for XSS protection, MIME sniffing prevention, frameguard protection, and DNS prefetch controls.
- **Request Size Limiting**:
  - Global JSON request body limited to **200 KB** to mitigate payload flooding and resource exhaustion attacks.
  - Dedicated route-level JSON parser (`10 MB`) enabled strictly for base64 optical video frames on `/api/vision/process-frame`.
- **API Rate Limiting**: AI copilot endpoints are governed by `express-rate-limit` capped at **30 requests per minute per IP address** (`429 Too Many Requests`).

### D. File Upload Validation & Path Traversal Prevention
- **Sanitized Filenames**: Video uploads in `ai-service/app/main.py` apply `os.path.basename()` to strip directory navigation sequences (`../`, `..\`).
- **UUID Destination Isolation**: Files are stored with UUID-based unique identifiers (`f"{source_id}{ext}"`) inside an isolated `data/uploads/` directory.
- **Strict Format Allowlist**: File extensions are restricted to supported video containers: `[".mp4", ".avi", ".mov", ".mkv", ".webm"]`. Unapproved executable or script extensions (`.exe`, `.sh`, `.py`, `.js`, `.php`) are rejected with `HTTP 400 Bad Request`.

### E. Append-Only Audit Logging
- **In-Memory Audit Trail**: `AuditService.java` in `core-service/` records security events, operator overrides, and state changes into an in-memory `ConcurrentLinkedDeque` (capped at 10,000 events).
- **Explicit Scope Boundary**: The log is append-only by interface (no update/delete API exists). It is **not** cryptographically signed, hash-chained, or an immutable ledger.

### F. Privacy & Footage Untracking
- **Repository Cleanliness**: Surveillance video recordings (`samples/*.mp4`), real license plate crops, face crops, and generated review sheets (`docs/*review*.html`) are strictly gitignored.
- **Pushed History Verification**: Verified that no raw surveillance clips exist in pushed git branches.

---

## 3. Dependency Vulnerability Assessment & Licensing

Main open-source licenses were identified across dependencies; no formal legal compliance audit was conducted. Software composition assessment conducted on November 15, 2026:

| Ecosystem | Tool | Findings | Remediation Status |
| :--- | :--- | :--- | :--- |
| **Node.js / Monorepo** | `npm audit` | **0 vulnerabilities** | Clean |
| **Python (`ai-service`)** | `pip-audit` | **0 vulnerabilities** | Clean (`pip` upgraded to 26.3) |
| **Java (`core-service`)** | `mvn dependency:tree` | Dependencies mapped; no CVE scanner run | Not scanned with a specialized CVE tool (e.g. OWASP dependency-check) |

---

## 4. Residual Risks

1. **Unencrypted Local Microservice Traffic**: Communication between Gateway (`:3000`), AI-Service (`:8000`), and Core-Service (`:8080`) uses plaintext HTTP over loopback (`localhost`). While acceptable for single-machine deployment, multi-host deployment requires mutual TLS (mTLS) or an encrypted service mesh.
2. **In-Memory Rate Limiting**: The rate limiter maintains client IP counters in process memory. In a distributed multi-replica deployment, counters must be stored in a shared Redis datastore.
3. **Session Authentication in Prototype**: The prototype `AuthController.java` issues session tokens for operator demonstration purposes. Production deployment requires integration with an enterprise Identity Provider (IdP) via OIDC / OAuth2 / SAML with asymmetric JWT signing (RS256).
4. **Denial of Service via Heavy Video Inference**: High-frequency video uploads without GPU acceleration can saturate CPU cores. An asynchronous message queue (e.g. RabbitMQ / Redis Streams) with worker autoscaling is recommended for multi-tenant production.

---

## 5. What Was NOT Tested

The following security dimensions were **outside the scope** of this automated audit:
- Physical hardware and firmware penetration testing of commercial IP/RTSP/ONVIF surveillance cameras.
- Kernel-level privilege escalation or container breakout assessments.
- State-sponsored side-channel or adversarial optical perturbation attacks (e.g., adversarial stickers on physical vehicle plates).
- Formal cryptographic verification of TLS handshakes or external cloud APIs.
- Long-duration volumetric DDoS attacks against network interfaces.

---

## 6. Vulnerability Disclosure & Reporting

To report a suspected security vulnerability or security weakness in IBVAP:
1. Open a confidential private advisory on GitHub or contact the repository administrator.
2. Provide reproducible proof-of-concept steps and affected platform components.
3. Do not disclose vulnerabilities publicly prior to coordinated mitigation.
