"""
IBVAP License Plate Detector Training Pipeline
Specialized training script for YOLO-based license plate detection on vehicle surveillance footage.
"""

import argparse
import os
import sys
import yaml

DEFAULT_DATASET_YAML = "data/plate_dataset.yaml"


def setup_plate_dataset_yaml(yaml_path: str = DEFAULT_DATASET_YAML):
    """Generates the dataset configuration file and guidance for public datasets."""
    os.makedirs(os.path.dirname(yaml_path) or ".", exist_ok=True)
    
    config = {
        "path": os.path.abspath("data/plate_dataset"),
        "train": "images/train",
        "val": "images/val",
        "test": "images/test",
        "names": {
            0: "license_plate"
        }
    }
    
    with open(yaml_path, "w") as f:
        yaml.dump(config, f, default_flow_style=False)
        
    print(f"[IBVAP ANPR Trainer] Dataset configuration written to: {yaml_path}")
    print("\n--- PUBLIC DATASET DOWNLOAD & SETUP GUIDE ---")
    print("To train on real license plates, download an annotated YOLO format dataset:")
    print("1. Roboflow Universe License Plate Dataset:")
    print("   curl -L \"https://universe.roboflow.com/ds/your-key\" > roboflow.zip; unzip roboflow.zip -d data/plate_dataset")
    print("2. Indian Number Plate Dataset (Kaggle):")
    print("   kaggle datasets download -d sarthakvajpayee/ai-indian-license-plate-dataset")
    print("   Extract and place images in 'data/plate_dataset/images' and labels in 'data/plate_dataset/labels'")
    print("---------------------------------------------\n")


def train_plate_model(
    data_yaml: str = DEFAULT_DATASET_YAML,
    base_model: str = "yolo26s.pt",
    epochs: int = 50,
    batch_size: int = 16,
    imgsz: int = 640,
    device: str = "auto",
    project: str = "runs/train_plates",
    name: str = "yolo_anpr_detector",
):
    try:
        from ultralytics import YOLO
    except ImportError:
        print("Error: 'ultralytics' is required. Run 'pip install ultralytics'.")
        sys.exit(1)

    if not os.path.exists(data_yaml):
        setup_plate_dataset_yaml(data_yaml)
        print(f"Dataset config created at {data_yaml}. Populate image directories before starting full training.")
        return

    print(f"[IBVAP ANPR Trainer] Loading checkpoint: {base_model}")
    try:
        model = YOLO(base_model)
    except Exception as e:
        print(f"Warning: Base model {base_model} unavailable ({e}), defaulting to yolo11s.pt")
        model = YOLO("yolo11s.pt")

    print(f"[IBVAP ANPR Trainer] Starting Plate Detection fine-tuning ({epochs} epochs, imgsz={imgsz})...")
    results = model.train(
        data=data_yaml,
        epochs=epochs,
        batch=batch_size,
        imgsz=imgsz,
        device=device,
        project=project,
        name=name,
        single_cls=True,  # Class 0: license_plate
        plots=True,
    )
    print(f"[IBVAP ANPR Trainer] Training finished! Model checkpoints stored in '{project}/{name}'")
    return results


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Train custom YOLO License Plate detector for IBVAP.")
    parser.add_argument("--data", type=str, default=DEFAULT_DATASET_YAML, help="Path to plate dataset YAML")
    parser.add_argument("--base", type=str, default="yolo26s.pt", help="Base YOLO weights")
    parser.add_argument("--epochs", type=int, default=50, help="Epoch count")
    parser.add_argument("--batch", type=int, default=16, help="Batch size")
    parser.add_argument("--imgsz", type=int, default=640, help="Image resolution")
    parser.add_argument("--device", type=str, default="auto", help="Device (cpu, cuda, 0)")
    parser.add_argument("--setup-only", action="store_true", help="Only setup YAML configuration and instructions")

    args = parser.parse_args()

    if args.setup_only:
        setup_plate_dataset_yaml(args.data)
    else:
        train_plate_model(
            data_yaml=args.data,
            base_model=args.base,
            epochs=args.epochs,
            batch_size=args.batch,
            imgsz=args.imgsz,
            device=args.device,
        )
