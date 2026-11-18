# Awiros Indian ANPR-OCR Microservice (Port 8001)

High-accuracy local optical character recognition service specializing in Indian license plates, based on the **Awiros Indian ANPR-OCR** model:
https://huggingface.co/Awiros/anpr-ocr

## Architecture
- **Model Backbone**: PP-OCRv5 SVTR_HGNet + PPHGNetV2_B4 with CTC loss.
- **Trained Corpus**: 558,767 Indian registration plates (Private-vehicle white, Commercial yellow, EV green, Dual-row motorcycles, etc.).
- **Parameters**: 37.3M (142.5 MB).
- **Reported Accuracy**: 98.42%.
- **Dual-Row Support**: Automatic aspect-ratio detection ($AR < 2.1$) and CTC sequential decoding for stacked Indian registration numbers (e.g. `UP14BQ208`).
- **Python Runtime**: Isolated Python 3.11 environment with PaddlePaddle 3.3.1 (isolated from Python 3.14 to prevent C++ ABI incompatibility on Windows).

## API Endpoints
- `GET /health` - Service health and active device telemetry.
- `POST /ocr/read-plate` - Accepts base64 encoded plate crop, returns text, confidence, char-level confidence, and layout indicator (`is_dual_row`).
- `POST /ocr/upload` - Multipart image upload for testing.

## Quickstart
```bash
# Set up dependencies and download HuggingFace model weights
python setup_model.py

# Run service
python -m uvicorn main:app --host 127.0.0.1 --port 8001
```
