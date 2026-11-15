import os
import torch
from PIL import Image
import open_clip

# Candidate classes specified in Round 8 Step 3:
# prompts: car, auto-rickshaw (tuk-tuk), bus, truck, motorcycle/scooter, bicycle, van
CANDIDATE_LABELS = [
    "car",
    "auto-rickshaw",
    "bus",
    "truck",
    "motorcycle",
    "bicycle",
    "van",
]

PROMPTS = [
    f"a photo of a {label}" for label in [
        "car",
        "auto-rickshaw tuk-tuk three-wheeler",
        "bus",
        "truck",
        "motorcycle or scooter",
        "bicycle",
        "van",
    ]
]

print("[Test CLIP] Loading ViT-B-32 model from local checkpoint...")
device = "cpu"
model = open_clip.create_model('ViT-B-32', pretrained=None)
checkpoint_path = r'C:\Users\SAI CHARAN\.cache\huggingface\hub\models--timm--vit_base_patch32_clip_224.openai\snapshots\a6f597a30f7b82c51704746581f9a4e41421e878\open_clip_pytorch_model.bin'
open_clip.load_checkpoint(model, checkpoint_path)
model.eval()

preprocess = open_clip.image_transform(
    image_size=224,
    is_train=False,
    mean=(0.48145466, 0.4578275, 0.40821073),
    std=(0.26862954, 0.26130258, 0.27577711),
)
tokenizer = open_clip.get_tokenizer('ViT-B-32')

text_tokens = tokenizer(PROMPTS)

# Test on crop_truck_139.jpg
crop_path = "scratch/crop_truck_139.jpg"
if os.path.exists(crop_path):
    img = Image.open(crop_path).convert("RGB")
    image_tensor = preprocess(img).unsqueeze(0).to(device)

    with torch.no_grad():
        image_features = model.encode_image(image_tensor)
        text_features = model.encode_text(text_tokens)

        image_features /= image_features.norm(dim=-1, keepdim=True)
        text_features /= text_features.norm(dim=-1, keepdim=True)

        similarity = (100.0 * image_features @ text_features.T).softmax(dim=-1)[0]

    for label, prompt, score in zip(CANDIDATE_LABELS, PROMPTS, similarity):
        print(f"  {label:<15}: {score.item()*100:.1f}%")

    top_idx = similarity.argmax().item()
    print(f"\n[Test CLIP] Predicted: {CANDIDATE_LABELS[top_idx]} ({similarity[top_idx].item()*100:.1f}%)")
else:
    print(f"File {crop_path} does not exist.")
