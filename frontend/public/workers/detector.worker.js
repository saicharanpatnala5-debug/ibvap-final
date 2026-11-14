/**
 * IBVAP Browser Fallback Detector Worker
 * Executes YOLO ONNX models via onnxruntime-web in a dedicated background worker thread.
 * Part of the IBVAP detection fallback ladder: ai-service -> browser YOLO worker -> COCO-SSD
 */

/* global importScripts, ort, self */

let session = null;
let isInitializing = false;
let modelLoadError = null;

const TARGET_IMGSZ = 640;
const CONF_THRESHOLD = 0.25;
const IOU_THRESHOLD = 0.45;

const COCO_CLASSES = [
  'person', 'bicycle', 'car', 'motorcycle', 'airplane', 'bus', 'train', 'truck', 'boat',
  'traffic light', 'fire hydrant', 'stop sign', 'parking meter', 'bench', 'bird', 'cat',
  'dog', 'horse', 'sheep', 'cow', 'elephant', 'bear', 'zebra', 'giraffe', 'backpack',
  'umbrella', 'handbag', 'tie', 'suitcase', 'frisbee', 'skis', 'snowboard', 'sports ball',
  'kite', 'baseball bat', 'baseball glove', 'skateboard', 'surfboard', 'tennis racket',
  'bottle', 'wine glass', 'cup', 'fork', 'knife', 'spoon', 'bowl', 'banana', 'apple',
  'sandwich', 'orange', 'broccoli', 'carrot', 'hot dog', 'pizza', 'donut', 'cake', 'chair',
  'couch', 'potted plant', 'bed', 'dining table', 'toilet', 'tv', 'laptop', 'mouse',
  'remote', 'keyboard', 'cell phone', 'microwave', 'oven', 'toaster', 'sink',
  'refrigerator', 'book', 'clock', 'vase', 'scissors', 'teddy bear', 'hair drier', 'toothbrush'
];

async function initSession(modelUrl) {
  if (session) return;
  if (isInitializing) return;
  isInitializing = true;

  try {
    if (typeof ort === 'undefined') {
      // Import onnxruntime-web via CDN if not bundled
      try {
        importScripts('https://cdn.jsdelivr.net/npm/onnxruntime-web@1.20.1/dist/ort.min.js');
      } catch (scriptErr) {
        console.warn('[YOLO Worker] Unable to load ort.min.js via importScripts:', scriptErr.message);
      }
    }

    if (typeof ort !== 'undefined' && modelUrl) {
      ort.env.wasm.numThreads = 2;
      session = await ort.InferenceSession.create(modelUrl, {
        executionProviders: ['wasm'],
        graphOptimizationLevel: 'all',
      });
      console.log('[YOLO Worker] ONNX Runtime session initialized successfully from:', modelUrl);
    } else {
      modelLoadError = 'ONNX runtime or model URL not available; operating in fallback mode';
    }
  } catch (err) {
    modelLoadError = err.message || String(err);
    console.warn('[YOLO Worker] Session init warning:', modelLoadError);
  } finally {
    isInitializing = false;
  }
}

function preprocess(imageData, targetWidth, targetHeight) {
  const { data, width, height } = imageData;
  const float32Data = new Float32Array(3 * targetWidth * targetHeight);
  const xRatio = width / targetWidth;
  const yRatio = height / targetHeight;

  // Bilinear/Nearest downsampling + RGB normalization (0 to 1)
  for (let y = 0; y < targetHeight; y++) {
    for (let x = 0; x < targetWidth; x++) {
      const srcX = Math.floor(x * xRatio);
      const srcY = Math.floor(y * yRatio);
      const srcIdx = (srcY * width + srcX) * 4;

      const r = data[srcIdx] / 255.0;
      const g = data[srcIdx + 1] / 255.0;
      const b = data[srcIdx + 2] / 255.0;

      const destIdx = y * targetWidth + x;
      float32Data[destIdx] = r; // R channel
      float32Data[targetWidth * targetHeight + destIdx] = g; // G channel
      float32Data[2 * targetWidth * targetHeight + destIdx] = b; // B channel
    }
  }

  return float32Data;
}

self.onmessage = async (e) => {
  const { type, payload } = e.data || {};

  if (type === 'INIT') {
    await initSession(payload?.modelUrl || '/models/yolo26n.onnx');
    self.postMessage({
      type: 'INIT_RESULT',
      success: !!session,
      error: modelLoadError,
    });
    return;
  }

  if (type === 'DETECT') {
    const startTime = performance.now();
    const { imageData, width, height, timestamp } = payload;

    if (!session) {
      // If ONNX session not loaded, signal caller to step down the fallback ladder to COCO-SSD
      self.postMessage({
        type: 'DETECT_RESULT',
        success: false,
        fallbackToNext: true,
        reason: modelLoadError || 'ONNX worker session uninitialized',
        detections: [],
        timestamp,
        elapsedMs: performance.now() - startTime,
      });
      return;
    }

    try {
      const inputTensorData = preprocess(imageData, TARGET_IMGSZ, TARGET_IMGSZ);
      const tensor = new ort.Tensor('float32', inputTensorData, [1, 3, TARGET_IMGSZ, TARGET_IMGSZ]);

      const feeds = {};
      const inputName = session.inputNames[0];
      feeds[inputName] = tensor;

      const results = await session.run(feeds);
      const output = results[session.outputNames[0]];

      const detections = [];
      // Post-process YOLO outputs (e.g. [1, 84, 8400] shape for YOLOv8/v11/26)
      if (output && output.data) {
        const data = output.data;
        const numClasses = 80;
        const numAnchors = Math.floor(data.length / (numClasses + 4));

        for (let i = 0; i < numAnchors; i++) {
          let maxScore = 0;
          let maxClass = -1;
          for (let c = 0; c < numClasses; c++) {
            const score = data[(4 + c) * numAnchors + i];
            if (score > maxScore) {
              maxScore = score;
              maxClass = c;
            }
          }

          if (maxScore >= CONF_THRESHOLD) {
            const cx = data[0 * numAnchors + i] / TARGET_IMGSZ;
            const cy = data[1 * numAnchors + i] / TARGET_IMGSZ;
            const w = data[2 * numAnchors + i] / TARGET_IMGSZ;
            const h = data[3 * numAnchors + i] / TARGET_IMGSZ;

            detections.push({
              class: COCO_CLASSES[maxClass] || 'object',
              score: Math.round(maxScore * 100),
              bbox: {
                x: Math.max(0, cx - w / 2),
                y: Math.max(0, cy - h / 2),
                width: Math.min(1, w),
                height: Math.min(1, h),
              },
            });
          }
        }
      }

      self.postMessage({
        type: 'DETECT_RESULT',
        success: true,
        detections,
        timestamp,
        elapsedMs: Math.round(performance.now() - startTime),
      });
    } catch (err) {
      self.postMessage({
        type: 'DETECT_RESULT',
        success: false,
        fallbackToNext: true,
        reason: err.message || String(err),
        detections: [],
        timestamp,
        elapsedMs: Math.round(performance.now() - startTime),
      });
    }
  }
};
