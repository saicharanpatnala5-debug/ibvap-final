"""
IBVAP Weapon Detection (Beta) Fine-Tuning Script
Taxonomy:
  0: firearm (handguns, pistols, revolvers, shotguns, rifles)
  1: bladed_weapon (knives, machetes, daggers, swords)
  2: blunt_object (bats, clubs, tactical batons, heavy pipes)
  (Hard Negatives: Handheld everyday objects like phones, tools, umbrellas, bottles mapped to empty background images)

Usage on GPU:
  python train_weapons.py --data data/weapons_merged.yaml --model yolo26s.pt --epochs 50 --imgsz 640 --batch 16
"""

import argparse
import os
import sys
import yaml
import shutil
from pathlib import Path


DEFAULT_YAML_PATH = "data/weapons_dataset.yaml"


def create_dataset_yaml(output_yaml: str = DEFAULT_YAML_PATH, dataset_root: str = "data/weapons_data"):
    """Creates YOLO dataset yaml mapping to the unified 3-class weapon taxonomy."""
    abs_root = os.path.abspath(dataset_root)
    config = {
        "path": abs_root,
        "train": "images/train",
        "val": "images/val",
        "test": "images/test",
        "names": {
            0: "firearm",
            1: "bladed_weapon",
            2: "blunt_object",
        },
        "license": "CC BY 4.0 / Research Open Access",
        "notes": "Object-centric classes only. Excludes person roles and demographic attributes."
    }
    os.makedirs(os.path.dirname(output_yaml) or ".", exist_ok=True)
    with open(output_yaml, "w", encoding="utf-8") as f:
        yaml.dump(config, f, default_flow_style=False)
    print(f"[IBVAP Weapon Trainer] Dataset YAML generated at: {output_yaml}")


def add_hard_negatives(hard_negatives_dir: str, target_images_dir: str, target_labels_dir: str):
    """
    Copies hard negative images (phones, tools, umbrellas, cameras, bottles) into the dataset
    and creates empty .txt label files so the model learns that everyday handheld objects
    are background / non-threats.
    """
    if not os.path.isdir(hard_negatives_dir):
        print(f"[IBVAP Weapon Trainer] Notice: No hard negatives folder at {hard_negatives_dir}. Skipping.")
        return 0

    os.makedirs(target_images_dir, exist_ok=True)
    os.makedirs(target_labels_dir, exist_ok=True)

    valid_exts = {".jpg", ".jpeg", ".png", ".webp"}
    count = 0
    for p in Path(hard_negatives_dir).iterdir():
        if p.suffix.lower() in valid_exts:
            dst_img = os.path.join(target_images_dir, f"hard_neg_{p.name}")
            shutil.copy2(str(p), dst_img)

            # Empty text label file indicates true background (no weapons present)
            dst_lbl = os.path.join(target_labels_dir, f"hard_neg_{p.stem}.txt")
            with open(dst_lbl, "w", encoding="utf-8") as f:
                pass
            count += 1

    print(f"[IBVAP Weapon Trainer] Injected {count} hard negative background images (phones/tools/umbrellas).")
    return count


def train_model(
    data_yaml: str,
    base_model: str = "yolo26s.pt",
    epochs: int = 50,
    imgsz: int = 640,
    batch: int = 16,
    device: str = "0",
    output_dir: str = "runs/weapons",
    force_cpu: bool = False
):
    import torch
    if not torch.cuda.is_available() and not force_cpu:
        print("\n" + "=" * 70)
        print("ERROR: No CUDA GPU detected on this host.")
        print("Per project specifications, weapon fine-tuning MUST run on a GPU runtime.")
        print("Please use the included Colab notebook (ai-service/notebooks/train_weapons_colab.ipynb)")
        print("on a free Google Colab T4/A100 GPU instance.")
        print("To run a lightweight CPU mock test for syntax verification only, pass --force-cpu.")
        print("=" * 70 + "\n")
        sys.exit(1)

    from ultralytics import YOLO
    print(f"[IBVAP Weapon Trainer] Initializing YOLO fine-tuning with base: {base_model}")
    model = YOLO(base_model)

    train_args = {
        "data": data_yaml,
        "epochs": epochs,
        "imgsz": imgsz,
        "batch": batch,
        "device": device if torch.cuda.is_available() else "cpu",
        "project": output_dir,
        "name": f"weapon_det_{imgsz}",
        "exist_ok": True,
        "mosaic": 1.0,        # Context mosaic for varied CCTV ranges
        "mixup": 0.10,        # Partial hand / body occlusion resilience
        "fliplr": 0.5,        # Left/right hand symmetry
        "degrees": 5.0,       # CCTV mounting tilt
        "perspective": 0.0005,
        "patience": 12,       # Early stopping
    }

    print(f"[IBVAP Weapon Trainer] Training configuration: {train_args}")
    results = model.train(**train_args)

    # Held-out evaluation
    print("[IBVAP Weapon Trainer] Evaluating model on held-out test split...")
    eval_metrics = model.val(data=data_yaml, split="test", imgsz=imgsz)
    print(f"[IBVAP Weapon Trainer] Held-out Evaluation Results:")
    print(f"  mAP50: {eval_metrics.box.map50:.4f}")
    print(f"  mAP50-95: {eval_metrics.box.map:.4f}")
    for idx, cname in enumerate(["firearm", "bladed_weapon", "blunt_object"]):
        if idx < len(eval_metrics.box.p):
            print(f"  Class '{cname}': Precision={eval_metrics.box.p[idx]:.3f}, Recall={eval_metrics.box.r[idx]:.3f}")

    # Export weights
    models_dst = os.path.abspath("models")
    os.makedirs(models_dst, exist_ok=True)
    best_weights = os.path.join(output_dir, f"weapon_det_{imgsz}", "weights", "best.pt")
    if os.path.exists(best_weights):
        target_pt = os.path.join(models_dst, "weapons.pt")
        shutil.copy2(best_weights, target_pt)
        print(f"[IBVAP Weapon Trainer] Saved PyTorch weights to: {target_pt}")

        # Export to ONNX for fast cross-platform deployment
        print("[IBVAP Weapon Trainer] Exporting ONNX runtime model...")
        best_model = YOLO(best_weights)
        onnx_path = best_model.export(format="onnx", imgsz=imgsz, dynamic=True)
        if os.path.exists(onnx_path):
            target_onnx = os.path.join(models_dst, "weapons.onnx")
            shutil.copy2(onnx_path, target_onnx)
            print(f"[IBVAP Weapon Trainer] Saved ONNX runtime model to: {target_onnx}")

    return results


def main():
    parser = argparse.ArgumentParser(description="Train IBVAP Weapon Detector")
    parser.add_argument("--data", type=str, default=DEFAULT_YAML_PATH, help="Path to dataset yaml")
    parser.add_argument("--model", type=str, default="yolo26s.pt", help="Base YOLO model")
    parser.add_argument("--epochs", type=int, default=50, help="Training epochs")
    parser.add_argument("--imgsz", type=int, default=640, help="Input image dimension (640 or 960)")
    parser.add_argument("--batch", type=int, default=16, help="Batch size")
    parser.add_argument("--device", type=str, default="0", help="CUDA device ID")
    parser.add_argument("--hard-negatives", type=str, default=None, help="Folder with phone/umbrella/tool images")
    parser.add_argument("--force-cpu", action="store_true", help="Force run on CPU for local smoke testing")

    args = parser.parse_args()

    if not os.path.exists(args.data):
        create_dataset_yaml(args.data)

    if args.hard_negatives:
        add_hard_negatives(args.hard_negatives, "data/weapons_data/images/train", "data/weapons_data/labels/train")

    train_model(
        data_yaml=args.data,
        base_model=args.model,
        epochs=args.epochs,
        imgsz=args.imgsz,
        batch=args.batch,
        device=args.device,
        force_cpu=args.force_cpu
    )


if __name__ == "__main__":
    main()
