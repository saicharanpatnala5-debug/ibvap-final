# IBVAP Tools

This directory holds utility and testing scripts:
- `camera-simulator.js`: Plain Node.js (>=20, ESM) script that simulates camera feed telemetry and posts synthetic detection/breach events to the core API for load testing and demonstrations.
- `load-test.js`: Benchmark runner evaluating API gateway throughput, WebSocket frame rates, and alert ingestion latency.
