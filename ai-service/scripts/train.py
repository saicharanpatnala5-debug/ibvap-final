"""
IBVAP Model Training & Fine-Tuning Template
Template script for fine-tuning YOLO models on custom border surveillance
classes, camouflage apparel, or vehicle license plate datasets.
"""

import argparse
import os
import sys


def train_custom_model(
    data_yaml: str = "data/custom_dataset.yaml",
    base_model: str = "yolo26s.pt",
    epochs: int = 50,
    batch_size: int = 16,
    imgsz: int = 640,
    device: str = "auto",
    project: str = "runs/train",
    name: str = "ibvap_custom",
):
    try:
        from ultralytics import YOLO
    except ImportError:
        print("Error: 'ultralytics' is required. Run 'pip install ultralytics'.")
        sys.exit(1)

    print(f"[IBVAP Training Engine] Loading base model: '{base_model}'...")
    try:
        model = YOLO(base_model)
    except Exception as e:
        print(f"Warning: Base model '{base_model}' not found or failed ({e}). Loading 'yolo11s.pt'...")
        model = YOLO("yolo11s.pt")

    if not os.path.exists(data_yaml):
        print(f"[IBVAP Training Notice] Dataset config '{data_yaml}' not found.")
        print("Creating placeholder custom dataset YAML template...")
        os.makedirs(os.path.dirname(data_yaml) or ".", exist_ok=True)
        with open(data_yaml, "w") as f:
            f.write(
                "# IBVAP Surveillance Custom Dataset Config\n"
                "path: ./data/dataset\n"
                "train: images/train\n"
                "val: images/val\n"
                "test: images/test\n\n"
                "names:\n"
                "  0: person\n"
                "  1: vehicle\n"
                "  2: license_plate\n"
                "  3: contraband_cargo\n"
            )
        print(f"Template saved to '{data_yaml}'. Populate your annotations and run again.")
        return

    print(f"[IBVAP Training Engine] Starting training: {epochs} epochs, batch size {batch_size}...")
    results = model.train(
        data=data_yaml,
        epochs=epochs,
        batch=batch_size,
        imgsz=imgsz,
        device=device,
        project=project,
        name=name,
        plots=True,
    )
    print(f"[IBVAP Training Engine] Training complete! Metrics saved to '{project}/{name}'")
    return results


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Fine-tune YOLO model for IBVAP custom detection.")
    parser.add_argument("--data", type=str, default="data/custom_dataset.yaml", help="Path to dataset YAML file.")
    parser.add_argument("--base", type=str, default="yolo26s.pt", help="Base model checkpoint.")
    parser.add_argument("--epochs", type=int, default=50, help="Training epochs.")
    parser.add_argument("--batch", type=int, default=16, help="Batch size.")
    parser.add_argument("--imgsz", type=int, default=640, help="Image resolution.")
    parser.add_argument("--device", type=str, default="auto", help="Execution device (auto, cpu, 0).")

    args = parser.parse_args()
    train_custom_model(
        data_yaml=args.data,
        base_model=args.base,
        epochs=args.epochs,
        batch_size=args.batch,
        imgsz=args.imgsz,
        device=args.device,
    )
