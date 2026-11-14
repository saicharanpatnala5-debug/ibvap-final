# IBVAP Core Service (`core-service/`)

Java 21 + Spring Boot 3 + Maven Wrapper.

## Responsibilities
- System of record: users, camera metadata, virtual zones, alert incidents, and simulated vehicle registry.
- Security & Auth: JWT authentication, BCrypt hashing, role-based access control (OPERATOR vs ADMIN), service-token internal access.
- Risk Scoring Engine: Dynamic threat scoring based on severity, zone priority, dwell time, object classification, and time-of-day.
- Append-only immutable audit trail with JSON/CSV export.
- Real-time alert push to operators via WebSocket (STOMP) or SSE.
