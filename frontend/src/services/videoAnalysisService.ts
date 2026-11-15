/**
 * Video Pre-Analysis Service ("Analyze, then Play" Demo Mode)
 *
 * Pre-analyzes uploaded CCTV/surveillance video files in the background:
 * - Extracts detections, tracking IDs, kinematics, and ANPR per frame
 * - Caches results indexed by video timestamp
 * - Provides silky-smooth 60 FPS interpolated bounding boxes during playback
 * - Eliminates real-time inference stutter and dropped frames
 */

import { TrackedObject, BoundingBox, ObjectClass } from '../types';
import {
  getDetectionModel,
  performLadderSurveillanceInference,
  ObjectTracker,
  analyzeFrameLuminance,
} from './detectionEngine';
import { extractAndReadLicensePlate } from './anprEngine';

export interface CachedFrame {
  timestamp: number; // in seconds
  objects: TrackedObject[];
  luminance: number;
  isNight: boolean;
  plateResult?: {
    plate: string;
    confidence: number;
    cropUrl?: string;
  };
}

export interface VideoAnalysisResult {
  videoId: string;
  duration: number;
  fps: number;
  totalFrames: number;
  frames: CachedFrame[];
  isComplete: boolean;
}

class VideoAnalysisService {
  private cache: Map<string, VideoAnalysisResult> = new Map();
  private analyzingState: Map<string, boolean> = new Map();
  private progressState: Map<string, number> = new Map();

  public isAnalyzed(videoId: string): boolean {
    const res = this.cache.get(videoId);
    return !!res && res.isComplete && res.frames.length > 0;
  }

  public isAnalyzing(videoId: string): boolean {
    return !!this.analyzingState.get(videoId);
  }

  public getProgress(videoId: string): number {
    return this.progressState.get(videoId) || 0;
  }

  public getCachedAnalysis(videoId: string): VideoAnalysisResult | undefined {
    return this.cache.get(videoId);
  }

  public clear(videoId?: string): void {
    if (videoId) {
      this.cache.delete(videoId);
      this.analyzingState.delete(videoId);
      this.progressState.delete(videoId);
    } else {
      this.cache.clear();
      this.analyzingState.clear();
      this.progressState.clear();
    }
  }

  /**
   * Pre-analyzes an uploaded video file by stepping through frames.
   */
  public async analyzeVideo(
    videoId: string,
    videoSource: string | HTMLVideoElement,
    onProgress?: (progressPct: number) => void
  ): Promise<VideoAnalysisResult> {
    if (this.isAnalyzed(videoId)) {
      return this.cache.get(videoId)!;
    }

    this.analyzingState.set(videoId, true);
    this.progressState.set(videoId, 0);

    const tracker = new ObjectTracker();
    const frames: CachedFrame[] = [];

    // Setup offscreen video element for analysis if passed a URL
    let video: HTMLVideoElement;
    let cleanupElement = false;

    if (typeof videoSource === 'string') {
      video = document.createElement('video');
      video.src = videoSource;
      video.muted = true;
      video.preload = 'auto';
      video.crossOrigin = 'anonymous';
      cleanupElement = true;
    } else {
      video = videoSource;
    }

    try {
      // Ensure video metadata is loaded
      if (video.readyState < 1) {
        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error('Video metadata load timeout')), 10000);
          video.onloadedmetadata = () => {
            clearTimeout(timeout);
            resolve();
          };
          video.onerror = (e) => {
            clearTimeout(timeout);
            reject(e);
          };
        });
      }

      const duration = video.duration || 5.0;
      const vW = video.videoWidth || 1280;
      const vH = video.videoHeight || 720;

      // Analysis step: sample every 0.1s (10 FPS keyframes) for fast pre-analysis
      const stepSec = 0.10;
      const totalSteps = Math.ceil(duration / stepSec);

      // Reusable offscreen canvas
      const canvas = document.createElement('canvas');
      canvas.width = Math.min(640, vW);
      canvas.height = Math.min(360, vH);
      const ctx = canvas.getContext('2d', { willReadFrequently: true });

      const model = await getDetectionModel();

      for (let i = 0; i <= totalSteps; i++) {
        const targetTime = Math.min(duration, i * stepSec);

        // Seek video to targetTime
        video.currentTime = targetTime;
        await new Promise<void>((resolve) => {
          const onSeeked = () => {
            video.removeEventListener('seeked', onSeeked);
            resolve();
          };
          video.addEventListener('seeked', onSeeked);
        });

        // Compute luminance
        let luminance = 100;
        let isNight = false;
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const lumRes = analyzeFrameLuminance(ctx, canvas.width, canvas.height);
          luminance = lumRes.averageLuminance;
          isNight = lumRes.isNight;
        }

        // Run ladder inference
        const ladderRes = await performLadderSurveillanceInference(model, video, isNight);
        const rawDets = ladderRes.detections;

        // Run multi-object tracker
        const tracked = tracker.update(rawDets, Date.now() + Math.round(targetTime * 1000));

        // ANPR pass on vehicles
        let plateRes: { plate: string; confidence: number; cropUrl?: string } | undefined;
        for (const trk of tracked) {
          if (['car', 'truck', 'bus', 'motorcycle'].includes(trk.class)) {
            const anpr = await extractAndReadLicensePlate(video, trk.bbox);
            if (anpr.isReadable && anpr.plateText !== 'Unreadable') {
              trk.anpr = anpr;
              plateRes = {
                plate: anpr.plateText,
                confidence: anpr.confidence,
                cropUrl: anpr.cropDataUrl,
              };
              break;
            }
          }
        }

        frames.push({
          timestamp: targetTime,
          objects: tracked,
          luminance,
          isNight,
          plateResult: plateRes,
        });

        const pct = Math.min(100, Math.round(((i + 1) / (totalSteps + 1)) * 100));
        this.progressState.set(videoId, pct);
        if (onProgress) {
          onProgress(pct);
        }
      }

      const result: VideoAnalysisResult = {
        videoId,
        duration,
        fps: 10,
        totalFrames: frames.length,
        frames,
        isComplete: true,
      };

      this.cache.set(videoId, result);
      this.analyzingState.set(videoId, false);
      this.progressState.set(videoId, 100);

      return result;
    } catch (err) {
      this.analyzingState.set(videoId, false);
      throw err;
    } finally {
      if (cleanupElement && video.parentNode) {
        video.parentNode.removeChild(video);
      }
    }
  }

  /**
   * Retrieves tracked objects for a given playback time with smooth linear interpolation.
   */
  public getDetectionsAtTime(videoId: string, currentTime: number): TrackedObject[] {
    const analysis = this.cache.get(videoId);
    if (!analysis || analysis.frames.length === 0) {
      return [];
    }

    const frames = analysis.frames;

    // Binary search for nearest frame index
    let low = 0;
    let high = frames.length - 1;
    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      if (frames[mid].timestamp < currentTime) {
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }

    const idx1 = Math.max(0, Math.min(frames.length - 1, low - 1));
    const idx2 = Math.max(0, Math.min(frames.length - 1, low));

    const f1 = frames[idx1];
    const f2 = frames[idx2];

    if (idx1 === idx2 || f1.timestamp === f2.timestamp) {
      return f1.objects;
    }

    // Fraction between f1 and f2
    const alpha = Math.max(0, Math.min(1, (currentTime - f1.timestamp) / (f2.timestamp - f1.timestamp)));

    // Interpolate bounding boxes of tracks appearing in both frames
    const f2Map = new Map<number, TrackedObject>();
    for (const obj of f2.objects) {
      f2Map.set(obj.id, obj);
    }

    const interpolated: TrackedObject[] = [];

    for (const obj1 of f1.objects) {
      const obj2 = f2Map.get(obj1.id);
      if (obj2) {
        // Interpolate bbox coordinates
        const interpBox: BoundingBox = {
          x: obj1.bbox.x + (obj2.bbox.x - obj1.bbox.x) * alpha,
          y: obj1.bbox.y + (obj2.bbox.y - obj1.bbox.y) * alpha,
          width: obj1.bbox.width + (obj2.bbox.width - obj1.bbox.width) * alpha,
          height: obj1.bbox.height + (obj2.bbox.height - obj1.bbox.height) * alpha,
        };

        interpolated.push({
          ...obj2,
          bbox: interpBox,
          lastSeenTimestamp: Date.now(),
        });
        f2Map.delete(obj1.id);
      } else if (alpha < 0.4) {
        // Track fading out
        interpolated.push(obj1);
      }
    }

    // New tracks appearing in f2
    if (alpha > 0.6) {
      for (const obj2 of f2Map.values()) {
        interpolated.push(obj2);
      }
    }

    return interpolated;
  }
}

export const videoAnalysisService = new VideoAnalysisService();
