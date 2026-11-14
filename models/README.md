# IBVAP Model Weights Directory

This directory provides documentation and instructions for neural model weights used across IBVAP services.

> [!IMPORTANT]
> **Do NOT commit binary weights (`.pt`, `.onnx`, `.engine`, `.weights`) to Git.** Large model weights are excluded by `.gitignore`.

---

## 1. Python AI Service (`ai-service/`)
- When `ai-service` starts, Ultralytics downloads `yolo26s.pt` automatically on first run if not already present.
- Configurable via `YOLO_MODEL` environment variable (defaults to `yolo26s.pt`, falling back to `yolo11s.pt` if unavailable on the system).

---

## 2. Browser Fallback YOLO ONNX Model (`frontend/public/models/`)
The in-browser ONNX Runtime Web worker (`frontend/public/workers/detector.worker.js`) runs a client-side YOLO26 ONNX model as an offline fallback when `ai-service` is unreachable.

### Exporting the ONNX Model
To export `yolo26s.pt` into the required browser ONNX format:

```bash
# Using the export helper script:
python ai-service/scripts/export_models.py

# Or directly via the Ultralytics CLI:
yolo export model=yolo26s.pt format=onnx imgsz=640 opset=17 simplify=True
```

### Model Placement
Place the exported model file at:
```
frontend/public/models/yolo26s.onnx
```

Once placed in `frontend/public/models/`, the file is served by Vite / Gateway at `/models/yolo26s.onnx` and loaded by `detector.worker.js`.
