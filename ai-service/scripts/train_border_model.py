"""
IBVAP Border Surveillance Model Fine-Tuning Pipeline
Custom training pipeline for border security domain classes:
- person (pedestrians, border crossers, guards)
- vehicle (cars, trucks, 4x4, ATVs, buses)
- animal (wildlife, livestock, K9 patrols)
- backpack (suspicious baggage, carried payloads, dropped gear)
- camouflage_apparel (tactical uniforms, foliage ghillie concealment)
- weapon (handheld firearms, rifles)
"""

import argparse
import os
import sys
import yaml

DEFAULT_BORDER_YAML = "data/border_dataset.yaml"


def setup_border_dataset_yaml(yaml_path: str = DEFAULT_BORDER_YAML):
    """Generates the border surveillance dataset specification."""
    os.makedirs(os.path.dirname(yaml_path) or ".", exist_ok=True)

    config = {
        "path": os.path.abspath("data/border_surveillance"),
        "train": "images/train",
        "val": "images/val",
        "test": "images/test",
        "names": {
            0: "person",
            1: "vehicle",
            2: "animal",
            3: "backpack",
            4: "camouflage_apparel",
            5: "weapon",
        },
        # Hyperparameters recommended for long-range perimeter CCTV
        "hyp": {
            "lr0": 0.01,
            "lrf": 0.001,
            "mosaic": 1.0,       # High mosaic augmentation for varied distances
            "mixup": 0.15,       # Occlusion resilience
            "degrees": 5.0,      # Mild camera tilt
            "translate": 0.1,    # Sensor panning
            "scale": 0.5,        # Multi-scale for small distant border entities
        }
    }

    with open(yaml_path, "w") as f:
        yaml.dump(config, f, default_flow_style=False)

    print(f"[IBVAP Border Trainer] Dataset configuration written to: {yaml_path}")
    print("\n--- BORDER SURVEILLANCE DATASET SETUP GUIDE ---")
    print("Recommended public datasets for border security fine-tuning:")
    print("1. P-DESTRE / Border CCTV Surveillance Dataset (pedestrians & camouflage)")
    print("2. VisDrone Dataset (small, distant vehicles and persons in wide-area perimeter)")
    print("3. High-Resolution Thermal Perimeter Dataset (FLIR / KAIST)")
    print("Place dataset images in 'data/border_surveillance/images/{train,val}'")
    print("Place YOLO format label files (.txt) in 'data/border_surveillance/labels/{train,val}'")
    print("--------------------------------------------------\n")


def train_border_model(
    data_yaml: str = DEFAULT_BORDER_YAML,
    base_model: str = "yolo26s.pt",
    epochs: int = 100,
    batch_size: int = 16,
    imgsz: int = 960,  # 960px input resolution recommended for distant border targets
    device: str = "auto",
    project: str = "runs/train_border",
    name: str = "yolo_border_surveillance",
):
    try:
        from ultralytics import YOLO
    except ImportError:
        print("Error: 'ultralytics' is required. Run 'pip install ultralytics'.")
        sys.exit(1)

    if not os.path.exists(data_yaml):
        setup_border_dataset_yaml(data_yaml)
        print(f"Template created at {data_yaml}. Populate annotation data before training.")
        return

    print(f"[IBVAP Border Trainer] Initializing base model: {base_model}")
    try:
        model = YOLO(base_model)
    except Exception as e:
        print(f"Notice: Checkpoint {base_model} fallback to yolo11s.pt ({e})")
        model = YOLO("yolo11s.pt")

    print(f"[IBVAP Border Trainer] Starting training on border classes at resolution {imgsz}x{imgsz}...")
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

    print(f"[IBVAP Border Trainer] Training completed! Artifacts saved to: {project}/{name}")
    return results


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Fine-tune YOLO on border surveillance targets.")
    parser.add_argument("--data", type=str, default=DEFAULT_BORDER_YAML, help="Path to border dataset YAML")
    parser.add_argument("--base", type=str, default="yolo26s.pt", help="Base weights checkpoint")
    parser.add_argument("--epochs", type=int, default=100, help="Epoch count")
    parser.add_argument("--batch", type=int, default=16, help="Batch size")
    parser.add_argument("--imgsz", type=int, default=960, help="Image resolution (default: 960)")
    parser.add_argument("--device", type=str, default="auto", help="Device (cpu, cuda, 0)")
    parser.add_argument("--setup-only", action="store_true", help="Generate dataset YAML only")

    args = parser.parse_args()

    if args.setup_only:
        setup_border_dataset_yaml(args.data)
    else:
        train_border_model(
            data_yaml=args.data,
            base_model=args.base,
            epochs=args.epochs,
            batch_size=args.batch,
            imgsz=args.imgsz,
            device=args.device,
        )
