"""
IBVAP Zero-Shot Vehicle Crop Classifier
Uses OpenCLIP (ViT-B-32) to perform second-stage fine-grained vehicle re-classification
on detected vehicle crops. Solves COCO class limitations (e.g., auto-rickshaws detected as buses/trucks).
- Pre-computes text embeddings at startup for zero runtime text-encoding overhead.
- Classifies vehicle crops in ~100ms on CPU.
- Fully offline capable using cached checkpoint.
"""

import os
import time
from typing import Optional, Tuple
import numpy as np
import cv2
from PIL import Image

try:
    import torch
    import open_clip
    import huggingface_hub
    CLIP_AVAILABLE = True
except ImportError:
    CLIP_AVAILABLE = False


CANDIDATE_CLASSES = [
    "car",
    "auto-rickshaw",
    "bus",
    "truck",
    "motorcycle",
    "bicycle",
    "van",
]

PROMPTS = [
    "a photo of a car",
    "a photo of an auto-rickshaw tuk-tuk three-wheeler",
    "a photo of a bus",
    "a photo of a truck",
    "a photo of a motorcycle or scooter",
    "a photo of a bicycle",
    "a photo of a delivery van",
]


class VehicleCropClassifier:
    """
    Singleton crop classifier for secondary vehicle fine-grained classification.
    """
    _instance: Optional["VehicleCropClassifier"] = None

    @classmethod
    def get_instance(cls) -> "VehicleCropClassifier":
        if cls._instance is None:
            cls._instance = VehicleCropClassifier()
        return cls._instance

    def __init__(self, device: str = "cpu"):
        self.device = device
        self.model = None
        self.preprocess = None
        self.text_features = None
        self.is_ready = False

        if not CLIP_AVAILABLE:
            print("[VehicleCropClassifier] Notice: open_clip or torch not installed. Running in mock mode.")
            return

        self._init_model()

    def _init_model(self):
        try:
            # 1. Locate checkpoint from HuggingFace cache or local models directory
            checkpoint_path = None
            repo_id = "timm/vit_base_patch32_clip_224.openai"
            filename = "open_clip_pytorch_model.bin"

            # Check direct local paths first
            local_candidates = [
                os.path.join(os.getcwd(), "models", filename),
                os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "models", filename),
            ]
            for c in local_candidates:
                if os.path.exists(c):
                    checkpoint_path = c
                    break

            if not checkpoint_path:
                try:
                    checkpoint_path = huggingface_hub.try_to_load_from_cache(repo_id, filename)
                except Exception:
                    pass

            if not checkpoint_path or not os.path.exists(checkpoint_path):
                print(f"[VehicleCropClassifier] Notice: {filename} not in cache. Zero-shot classifier dormant until cached.")
                return

            print(f"[VehicleCropClassifier] Loading ViT-B-32 from {checkpoint_path}...")
            t0 = time.time()
            self.model = open_clip.create_model("ViT-B-32", pretrained=None)
            open_clip.load_checkpoint(self.model, checkpoint_path)
            self.model.to(self.device)
            self.model.eval()

            self.preprocess = open_clip.image_transform(
                image_size=224,
                is_train=False,
                mean=(0.48145466, 0.4578275, 0.40821073),
                std=(0.26862954, 0.26130258, 0.27577711),
            )
            tokenizer = open_clip.get_tokenizer("ViT-B-32")

            # Precompute text features once
            tokens = tokenizer(PROMPTS).to(self.device)
            with torch.no_grad():
                text_feats = self.model.encode_text(tokens)
                self.text_features = text_feats / text_feats.norm(dim=-1, keepdim=True)

            self.is_ready = True
            print(f"[VehicleCropClassifier] Loaded ViT-B-32 zero-shot classifier in {time.time() - t0:.2f}s.")

        except Exception as e:
            print(f"[VehicleCropClassifier] Initialization error: {e}")
            self.is_ready = False

    def classify_crop(self, crop_bgr: np.ndarray) -> Optional[Tuple[str, float]]:
        """
        Classifies vehicle crop into (predicted_label, confidence_0_to_1).
        Returns None if classifier is not ready or crop is invalid.
        """
        if not self.is_ready or crop_bgr is None or crop_bgr.size == 0:
            return None

        h, w = crop_bgr.shape[:2]
        if h < 24 or w < 24:
            return None

        try:
            rgb = cv2.cvtColor(crop_bgr, cv2.COLOR_BGR2RGB)
            pil_img = Image.fromarray(rgb)
            tensor = self.preprocess(pil_img).unsqueeze(0).to(self.device)

            with torch.no_grad():
                img_feats = self.model.encode_image(tensor)
                img_feats = img_feats / img_feats.norm(dim=-1, keepdim=True)
                similarity = (100.0 * img_feats @ self.text_features.T).softmax(dim=-1)[0]

            top_idx = similarity.argmax().item()
            label = CANDIDATE_CLASSES[top_idx]
            conf = float(similarity[top_idx].item())
            return label, conf

        except Exception as e:
            print(f"[VehicleCropClassifier] Inference error: {e}")
            return None
