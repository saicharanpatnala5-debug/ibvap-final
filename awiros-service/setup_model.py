import os
import sys
import subprocess
import urllib.request
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
WEIGHTS_PATH = BASE_DIR / "model.safetensors"
DICT_PATH = BASE_DIR / "en_dict.txt"
PADDLEOCR_DIR = BASE_DIR / "PaddleOCR"

HF_BASE = "https://huggingface.co/Awiros/anpr-ocr/resolve/main"

def download_file(url: str, dest_path: Path):
    if dest_path.exists() and dest_path.stat().st_size > 0:
        print(f"✓ Already present: {dest_path.name} ({dest_path.stat().st_size / (1024*1024):.1f} MB)")
        return
    print(f"Downloading {dest_path.name} from {url}...")
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req) as resp, open(dest_path, "wb") as f:
        total = int(resp.headers.get("Content-Length", 0))
        downloaded = 0
        chunk_size = 1024 * 512
        while True:
            chunk = resp.read(chunk_size)
            if not chunk:
                break
            f.write(chunk)
            downloaded += len(chunk)
            if total > 0:
                percent = (downloaded / total) * 100
                sys.stdout.write(f"\r  Progress: {percent:.1f}% ({downloaded / (1024*1024):.1f}/{total / (1024*1024):.1f} MB)")
                sys.stdout.flush()
    print(f"\n✓ Downloaded {dest_path.name} successfully.")

def ensure_paddleocr():
    if (PADDLEOCR_DIR / "ppocr" / "__init__.py").is_file():
        print("✓ PaddleOCR package already present.")
        return
    print(f"Cloning PaddleOCR (shallow depth 1) into {PADDLEOCR_DIR}...")
    subprocess.check_call([
        "git", "clone", "--depth", "1",
        "https://github.com/PaddlePaddle/PaddleOCR.git",
        str(PADDLEOCR_DIR),
    ])
    print("✓ Cloned PaddleOCR.")

if __name__ == "__main__":
    download_file(f"{HF_BASE}/model.safetensors", WEIGHTS_PATH)
    download_file(f"{HF_BASE}/en_dict.txt", DICT_PATH)
    # also download sample test images for evaluation
    images_dir = BASE_DIR / "sample_images"
    images_dir.mkdir(exist_ok=True)
    sample_imgs = [
        "images/10_14_68e6fcf21e55ac002f310971_awi_1.jpg",
        "images/10_20_68f0b5ea88aefc002f543e60_awi_1.jpg",
        "images/10_20_68fc5fb360b026003091b0eb_awi_1.jpg",
        "images/10_20_69027403e20fe9002fceedaa_awi_1.jpg",
        "images/10_21_68ecddf9925604002f70876a_awi_1.jpg",
        "images/two_row-set-1_1_1420_.jpg",
    ]
    for s_img in sample_imgs:
        dest = images_dir / Path(s_img).name
        download_file(f"{HF_BASE}/{s_img}", dest)
    ensure_paddleocr()
    print("All Awiros ANPR-OCR assets are ready!")
