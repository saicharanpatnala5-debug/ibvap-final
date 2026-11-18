# Guide: Fine-Tuning IBVAP Weapon Detector on Free Google Colab GPU

Follow these exact steps to train the `weapons.pt` model weights on a free cloud GPU without utilizing local CPU resources:

### Step 1: Open Google Colab
1. Navigate to [https://colab.research.google.com](https://colab.research.google.com).
2. Click **Upload** and select the file [`ai-service/notebooks/train_weapons_colab.ipynb`](file:///C:/Users/SAI%20CHARAN/.gemini/antigravity/scratch/ibvap-final/ai-service/notebooks/train_weapons_colab.ipynb).

### Step 2: Enable GPU Hardware Acceleration
1. In the top Colab menu, select **Runtime > Change runtime type**.
2. Under **Hardware accelerator**, select **T4 GPU** (Standard Free tier).
3. Click **Save**.

### Step 3: Execute Training Pipeline
1. Select **Runtime > Run all** (or press `Ctrl + F9`).
2. The notebook will automatically:
   - Verify GPU access (`nvidia-smi`).
   - Install `ultralytics` and dependencies.
   - Construct the unified 3-class dataset (`firearm`, `bladed_weapon`, `blunt_object`).
   - Inject hard-negative background samples (smartphones, tools, umbrellas, bottles) to suppress false positives on everyday items.
   - Fine-tune YOLO for 35 epochs with multi-scale mosaic and mixup augmentations.
   - Evaluate on a held-out test split, reporting precision, recall, and mAP50.
   - Export PyTorch weights (`weapons.pt`) and ONNX model (`weapons.onnx`).

### Step 4: Download and Place Model Weights
1. When training finishes, Colab will trigger an automatic browser download of `weapons.pt`.
2. Move the downloaded `weapons.pt` file into the `models/` folder of your IBVAP workspace:
   ```bash
   models/weapons.pt
   ```
3. To enable the weapon detector in IBVAP:
   - Set `WEAPON_DETECTION=true` in `ai-service/.env` or toggle the **"Weapon detection (beta)"** switch in the Live Monitor UI.
