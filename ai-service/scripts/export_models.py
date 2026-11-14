"""
IBVAP YOLO Model Export Script
Exports PyTorch weights (yolo26s.pt / yolo11s.pt) into ONNX format for the
client-side browser fallback detector (frontend/public/models/yolo26s.onnx).
"""

import argparse
import os
import shutil
import sys


def export_model(
    model_name: str = "yolo26s.pt",
    imgsz: int = 640,
    output_dir: str = "../frontend/public/models",
    destination_name: str = "yolo26s.onnx",
):
    try:
        from ultralytics import YOLO
    except ImportError:
        print("Error: 'ultralytics' is required. Run 'pip install ultralytics'.")
        sys.exit(1)

    print(f"[IBVAP Model Exporter] Initializing model '{model_name}'...")
    try:
        model = YOLO(model_name)
    except Exception as e:
        print(f"Warning: Primary model '{model_name}' could not be initialized ({e}).")
        fallback = "yolo11s.pt"
        print(f"[IBVAP Model Exporter] Attempting fallback to '{fallback}'...")
        model = YOLO(fallback)

    print(f"[IBVAP Model Exporter] Exporting to ONNX (imgsz={imgsz}, opset=17)...")
    exported_path = model.export(
        format="onnx",
        imgsz=imgsz,
        opset=17,
        simplify=True,
    )
    print(f"[IBVAP Model Exporter] Export completed: {exported_path}")

    # Ensure output destination directory exists
    os.makedirs(output_dir, exist_ok=True)
    target_path = os.path.join(output_dir, destination_name)
    shutil.copyfile(exported_path, target_path)
    print(f"[IBVAP Model Exporter] Successfully staged model to '{target_path}'")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Export YOLO model to ONNX for IBVAP browser fallback.")
    parser.add_argument("--model", type=str, default="yolo26s.pt", help="YOLO model checkpoint name or path.")
    parser.add_argument("--imgsz", type=int, default=640, help="Input image dimension (default: 640).")
    parser.add_argument("--dest", type=str, default="../frontend/public/models", help="Destination folder for exported ONNX.")
    parser.add_argument("--name", type=str, default="yolo26s.onnx", help="Exported filename.")

    args = parser.parse_args()
    export_model(
        model_name=args.model,
        imgsz=args.imgsz,
        output_dir=args.dest,
        destination_name=args.name,
    )
