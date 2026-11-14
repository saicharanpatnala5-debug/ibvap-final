# IBVAP AI Service (`ai-service/`)

Python 3.11 + FastAPI + Uvicorn + Ultralytics YOLO26 + OpenCV.

## Responsibilities
- Real-time video ingestion (video file loop, RTSP stream, USB webcam).
- Ultralytics YOLO26 object detection with automated model download (`yolo26s.pt`).
- ByteTrack multi-object tracking, velocity, and trajectory vector estimation.
- OpenCV adaptive CLAHE/gamma low-light image preprocessing.
- Geometric point-in-polygon zone breach and virtual-fence crossing detection.
- Vehicle license plate localization & OCR (RapidOCR/EasyOCR) with multi-frame confidence voting.
- Per-frame WebSocket JSON telemetry (`/ws/{id}`), frame snapshots (`/frame/{id}`), and state queries (`/state/{id}`).
