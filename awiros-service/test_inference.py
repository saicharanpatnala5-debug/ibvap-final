import sys, os
from pathlib import Path

ppocr_dir = Path("PaddleOCR")
if str(ppocr_dir) not in sys.path:
    sys.path.insert(0, str(ppocr_dir))

import paddle
import numpy as np
import cv2
import copy
from safetensors.numpy import load_file
from ppocr.modeling.architectures import build_model as ppocr_build_model
from ppocr.postprocess import build_post_process

paddle.set_device("cpu")

CTC_NUM_CLASSES = 64
NRTR_NUM_CLASSES = 67

MODEL_CONFIG = {
    "Architecture": {
        "model_type": "rec",
        "algorithm": "SVTR_HGNet",
        "Transform": None,
        "Backbone": {"name": "PPHGNetV2_B4", "text_rec": True},
        "Head": {
            "name": "MultiHead",
            "out_channels_list": {
                "CTCLabelDecode": CTC_NUM_CLASSES,
                "NRTRLabelDecode": NRTR_NUM_CLASSES,
            },
            "head_list": [
                {
                    "CTCHead": {
                        "Neck": {
                            "name": "svtr",
                            "dims": 120,
                            "depth": 2,
                            "hidden_dims": 120,
                            "kernel_size": [1, 3],
                            "use_guide": True,
                        },
                        "Head": {"fc_decay": 1e-05},
                    }
                },
                {"NRTRHead": {"nrtr_dim": 384, "max_text_length": 25}},
            ],
        },
    },
}

post_process = build_post_process({
    "name": "CTCLabelDecode",
    "character_dict_path": "en_dict.txt",
    "use_space_char": True,
})

config = copy.deepcopy(MODEL_CONFIG)
model = ppocr_build_model(config["Architecture"])
model.eval()

np_state = load_file("model.safetensors")
state_dict = {k: paddle.to_tensor(v) for k, v in np_state.items()}
model.set_state_dict(state_dict)

def resize_for_rec(img_bgr, target_shape=[3, 48, 320]):
    _, h, w = target_shape
    img_h, img_w = img_bgr.shape[:2]
    ratio = h / img_h
    new_w = min(int(img_w * ratio), w)
    resized = cv2.resize(img_bgr, (new_w, h))
    if new_w < w:
        padded = np.zeros((h, w, 3), dtype=np.uint8)
        padded[:, :new_w, :] = resized
        resized = padded
    return resized

def preprocess(img_bgr):
    img = resize_for_rec(img_bgr)
    img = img.astype(np.float32) / 255.0
    img = (img - 0.5) / 0.5
    return img.transpose((2, 0, 1))

def predict_plate(img_bgr):
    tensor = paddle.to_tensor(np.expand_dims(preprocess(img_bgr), axis=0))
    with paddle.no_grad():
        preds = model(tensor)
    if isinstance(preds, dict):
        pred_tensor = preds.get("ctc", next(iter(preds.values())))
    elif isinstance(preds, (list, tuple)):
        pred_tensor = preds[0]
    else:
        pred_tensor = preds
    post_res = post_process(pred_tensor.numpy())
    if isinstance(post_res, (list, tuple)) and len(post_res) > 0:
        return post_res[0]
    return "", 0.0

if __name__ == "__main__":
    for p in Path("sample_images").glob("*.*"):
        im = cv2.imread(str(p))
        text, conf = predict_plate(im)
        print(f"{p.name}: '{text}' (conf: {conf:.4f})")
