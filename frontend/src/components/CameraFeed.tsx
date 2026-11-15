import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  Volume2,
  VolumeX,
  Maximize,
  Minimize,
  ChevronLeft,
  ChevronRight,
  Moon,
  Sun,
  Shield,
  Layers,
  Sparkles,
  Info,
  Trash2,
  Edit2,
} from 'lucide-react';
import {
  AlertIncident,
  BoundingBox,
  CameraFeedItem,
  ObjectClass,
  Point,
  TrackedObject,
  VirtualZone,
  ZoneType,
  CrossingDirection,
} from '../types';
import {
  analyzeFrameLuminance,
  checkZoneViolations,
  enhanceNightCanvas,
  getDetectionModel,
  mapCocoClass,
  performSurveillanceInference,
  performLadderSurveillanceInference,
  DetectionEngineType,
  ObjectTracker,
  LightweightMotionTracker,
} from '../services/detectionEngine';
import { extractAndReadLicensePlate } from '../services/anprEngine';
import { createAlertIncident } from '../services/riskEngine';
import {
  registerCameraFrameProvider,
  unregisterCameraFrameProvider,
} from '../services/cameraFrameRegistry';
import { AlertEngine } from '../services/alertEngine';
import { ZoneDrawer } from './ZoneDrawer';
import { videoAnalysisService } from '../services/videoAnalysisService';

interface CameraFeedProps {
  camera: CameraFeedItem;
  alerts?: AlertIncident[];
  onUpdateCamera: (updated: CameraFeedItem) => void;
  onRemoveCamera: (id: string) => void;
  onAlertGenerated: (alert: AlertIncident) => void;
  onSelectPlate: (plate: string, cropUrl?: string) => void;
  onPlateDetected?: (info: {
    plate: string;
    confidence: number;
    cropUrl?: string;
    cameraId: string;
    cameraName?: string;
    videoTime: number;
    trackId?: number;
    formatType?: 'standard' | 'bharat' | 'invalid' | 'distance_gated';
    validationStatus?: string;
  }) => void;
  onInspectObject?: (object: TrackedObject) => void;
  onAskAI?: (prompt: string) => void;
  reducedMotion?: boolean;
  seekToTime?: number | null;
}

export const CameraFeed: React.FC<CameraFeedProps> = ({
  camera,
  alerts = [],
  onUpdateCamera,
  onRemoveCamera,
  onAlertGenerated,
  onSelectPlate,
  onPlateDetected,
  onAskAI,
  reducedMotion = false,
  seekToTime,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Persistent reusable offscreen canvases to eliminate GC churn and UI lag
  const offscreenLumRef = useRef<HTMLCanvasElement | null>(null);
  const offscreenSnapRef = useRef<HTMLCanvasElement | null>(null);

  const alertEngineRef = useRef<AlertEngine>(new AlertEngine());
  const trackerRef = useRef<ObjectTracker>(new ObjectTracker());
  const motionTrackerRef = useRef<LightweightMotionTracker>(new LightweightMotionTracker());
  const lastMotionCheckRef = useRef<number>(0);
  const isDetectingRef = useRef<boolean>(false);
  const lastDetectionTimeRef = useRef<number>(0);

  // VMS Quality & Overlay State
  const [qualityMode, setQualityMode] = useState<'fast' | 'balanced' | 'high'>('fast');
  const [showDetectionsOverlay, setShowDetectionsOverlay] = useState<boolean>(true);
  const [showEventsDrawer, setShowEventsDrawer] = useState<boolean>(false);

  // Keyboard shortcut: 'D' to toggle detection overlay
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === 'd' || e.key === 'D') {
        setShowDetectionsOverlay((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleQualityChange = async (mode: 'fast' | 'balanced' | 'high') => {
    setQualityMode(mode);
    try {
      await fetch('/api/v1/model/quality', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quality: mode }),
      });
    } catch {
      // Offline fallback
    }
  };

  // Playback state
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);
  const [isMuted, setIsMuted] = useState<boolean>(true);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [videoResolution, setVideoResolution] = useState<{ w: number; h: number }>({
    w: 1280,
    h: 720,
  });

  // User-editable camera name
  const [isEditingName, setIsEditingName] = useState<boolean>(false);
  const [editedName, setEditedName] = useState<string>(camera.name);

  // Detection & Night State
  const [isNightMode, setIsNightMode] = useState<boolean>(camera.isNightMode);
  const [averageLuminance, setAverageLuminance] = useState<number>(120);
  const [trackedObjects, setTrackedObjects] = useState<TrackedObject[]>([]);
  const [modelLoading, setModelLoading] = useState<boolean>(true);
  const [inferenceFps, setInferenceFps] = useState<number>(0);
  const [detectionLatencyMs, setDetectionLatencyMs] = useState<number>(28);

  // Zone Drawer state
  const [showZoneDrawer, setShowZoneDrawer] = useState<boolean>(false);
  const [isDrawingMode, setIsDrawingMode] = useState<boolean>(false);
  const [currentDrawingType, setCurrentDrawingType] = useState<ZoneType>('line');
  const [inProgressPoints, setInProgressPoints] = useState<Point[]>([]);
  const [latestReadPlate, setLatestReadPlate] = useState<{
    plate: string;
    confidence: number;
    cropUrl?: string;
    timestamp: number;
    isValidFormat?: boolean;
    formatType?: string;
    validationStatus?: string;
  } | null>(null);
  const autoOpenedPlatesRef = useRef<Set<string>>(new Set());

  // Decoupled smooth rendering & interpolation refs
  const displayTracksRef = useRef<
    Map<number, { bbox: BoundingBox; track: TrackedObject; alpha: number }>
  >(new Map());
  const targetTracksRef = useRef<TrackedObject[]>([]);
  const lastUiUpdateRef = useRef<number>(0);

  // Hidden debug mode (?debug=1 in URL parameter, off by default)
  const [isDebugMode] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return new URLSearchParams(window.location.search).get('debug') === '1';
  });

  const [currentEngine, setCurrentEngine] = useState<DetectionEngineType>('ai-service');

  // WebSocket streaming connection state to ai-service
  const [isWsConnected, setIsWsConnected] = useState<boolean>(false);

  // Smooth Demo Mode ("Analyze, then play") state
  const [isPreAnalyzed, setIsPreAnalyzed] = useState<boolean>(() => videoAnalysisService.isAnalyzed(camera.id));
  const [isAnalyzingVideo, setIsAnalyzingVideo] = useState<boolean>(() => videoAnalysisService.isAnalyzing(camera.id));
  const [analysisProgress, setAnalysisProgress] = useState<number>(() => videoAnalysisService.getProgress(camera.id));

  const handleTogglePreAnalysis = async () => {
    if (isPreAnalyzed) {
      setIsPreAnalyzed(false);
      return;
    }
    if (isAnalyzingVideo || !videoRef.current) return;
    setIsAnalyzingVideo(true);
    setAnalysisProgress(0);
    try {
      await videoAnalysisService.analyzeVideo(camera.id, videoRef.current, (pct) => {
        setAnalysisProgress(pct);
      });
      setIsPreAnalyzed(true);
    } catch (err) {
      console.error('Failed to pre-analyze video:', err);
    } finally {
      setIsAnalyzingVideo(false);
    }
  };
  const lastRenderTimeRef = useRef<number>(performance.now());
  const renderFpsRef = useRef<number>(60);
  const frameCountRef = useRef<number>(0);
  const lastFpsCalcTimeRef = useRef<number>(performance.now());

  // WebSocket ingestion for ai-service streaming & zone telemetry
  useEffect(() => {
    const wsUrl = camera.wsUrl || (camera.aiSourceId ? `ws://${window.location.hostname}:8000/ws/${camera.aiSourceId}` : null);
    if (!wsUrl) return;

    let ws: WebSocket | null = null;
    let isCancelled = false;

    try {
      ws = new WebSocket(wsUrl);
      ws.onopen = () => {
        if (!isCancelled) setIsWsConnected(true);
      };
      ws.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          if (payload.entities && Array.isArray(payload.entities)) {
            const mappedTracks: TrackedObject[] = payload.entities.map((e: any) => ({
              id: typeof e.id === 'number' ? e.id : parseInt(String(e.id).replace(/\D/g, ''), 10) || 100,
              class: (e.class || 'moving_object') as ObjectClass,
              confidence: Math.round((e.confidence ?? 0.8) * 100),
              confidenceTier: (e.confidence ?? 0.8) > 0.7 ? 'high' : (e.confidence ?? 0.8) > 0.4 ? 'medium' : 'low',
              bbox: {
                x: e.box[0],
                y: e.box[1],
                width: e.box[2],
                height: e.box[3],
              },
              firstSeenTimestamp: Date.now() - (e.age ?? 0) * 33,
              lastSeenTimestamp: Date.now(),
              trajectory: [],
              velocity: Math.round(e.speed ?? 0),
              direction: e.direction || 'Stationary',
              isLoitering: false,
              hasCrossedZoneIds: [],
              state: e.state,
              age: e.age,
              hits: e.hits,
              speed: e.speed,
              footpoint: e.footpoint ? { x: e.footpoint[0], y: e.footpoint[1] } : undefined,
            }));

            targetTracksRef.current = mappedTracks;

            // Debounced state update for UI lists
            const now = performance.now();
            if (now - lastUiUpdateRef.current > 200) {
              setTrackedObjects(mappedTracks);
              lastUiUpdateRef.current = now;
            }
          }
        } catch {
          // Ignore malformed ws frame
        }
      };
      ws.onerror = () => {
        if (!isCancelled) setIsWsConnected(false);
      };
      ws.onclose = () => {
        if (!isCancelled) setIsWsConnected(false);
      };
    } catch {
      setIsWsConnected(false);
    }

    return () => {
      isCancelled = true;
      if (ws) ws.close();
    };
  }, [camera.wsUrl, camera.aiSourceId]);

  // Register active camera frame provider for AI visual grounding
  useEffect(() => {
    registerCameraFrameProvider(camera.id, camera.name, () => {
      const video = videoRef.current;
      if (!video || video.readyState < 2) return null;
      const snapCanvas = document.createElement('canvas');
      snapCanvas.width = video.videoWidth || 640;
      snapCanvas.height = video.videoHeight || 360;
      const ctx = snapCanvas.getContext('2d');
      if (!ctx) return null;
      ctx.drawImage(video, 0, 0, snapCanvas.width, snapCanvas.height);
      return {
        dataUrl: snapCanvas.toDataURL('image/jpeg', 0.88),
        width: snapCanvas.width,
        height: snapCanvas.height,
        trackedObjects: targetTracksRef.current,
        isNightMode,
        currentTime: video.currentTime,
      };
    });
    return () => {
      unregisterCameraFrameProvider(camera.id);
    };
  }, [camera.id, camera.name, isNightMode]);

  // Load detection model on mount
  useEffect(() => {
    let mounted = true;
    getDetectionModel()
      .then((model) => {
        if (mounted) {
          setModelLoading(false);
          console.log('Detection engine initialized successfully');
        }
      })
      .catch((err) => {
        if (mounted) {
          setModelLoading(false);
          console.warn('Detection model initialization notice:', err);
        }
      });
    return () => {
      mounted = false;
    };
  }, []);

  // Update video playback speed
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.playbackRate = playbackSpeed;
    }
  }, [playbackSpeed]);

  // Handle jump-to-time request from Vehicle Registry or Timeline
  useEffect(() => {
    if (seekToTime !== undefined && seekToTime !== null && videoRef.current) {
      const vid = videoRef.current;
      vid.currentTime = seekToTime;
      setCurrentTime(seekToTime);
      vid.play().catch(() => {});
      setIsPlaying(true);
      setTimeout(() => {
        runDetectionPass();
      }, 50);
    }
  }, [seekToTime]);

  // Video loaded metadata
  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      const w = videoRef.current.videoWidth || 1280;
      const h = videoRef.current.videoHeight || 720;
      setVideoResolution({ w, h });
      setDuration(videoRef.current.duration || 0);

      // Attempt auto-play and trigger instant initial detection pass
      videoRef.current
        .play()
        .then(() => setIsPlaying(true))
        .catch(() => setIsPlaying(false));

      runDetectionPass();
    }
  };

  // Immediate detection pass as soon as first video frame is available
  const handleLoadedData = () => {
    runDetectionPass();
  };

  // Step frames forwards or backwards (approx 1/30s = 0.0333s)
  const stepFrame = (forward: boolean) => {
    if (!videoRef.current) return;
    videoRef.current.pause();
    setIsPlaying(false);
    const step = 1 / 30;
    const newTime = forward
      ? Math.min(duration, videoRef.current.currentTime + step)
      : Math.max(0, videoRef.current.currentTime - step);
    videoRef.current.currentTime = newTime;
    setCurrentTime(newTime);
  };

  const togglePlay = () => {
    if (!videoRef.current) return;
    if (videoRef.current.paused) {
      videoRef.current.play();
      setIsPlaying(true);
    } else {
      videoRef.current.pause();
      setIsPlaying(false);
    }
  };

  const handleTimeUpdate = () => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    if (videoRef.current) {
      videoRef.current.currentTime = time;
      setCurrentTime(time);
    }
  };

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().then(() => setIsFullscreen(true));
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false));
    }
  };

  // Continuous background detection loop
  const runDetectionPass = useCallback(async () => {
    // If remote ai-service is actively streaming over WebSocket, bypass local in-browser model pass
    if (isWsConnected || isPreAnalyzed) {
      return;
    }

    // Pause immediately if browser tab is hidden to conserve system resources
    if (typeof document !== 'undefined' && document.hidden) {
      return;
    }

    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState < 2) {
      return;
    }

    const now = performance.now();

    // Safety watchdog: recover if a previous inference pass timed out or hung
    if (isDetectingRef.current && now - lastDetectionTimeRef.current > 1500) {
      isDetectingRef.current = false;
    }

    if (isDetectingRef.current) {
      return;
    }

    // Low debounce limit (75ms) allowing pipelined passes at ~8-10 FPS without UI contention
    if (now - lastDetectionTimeRef.current < 75) {
      return;
    }

    isDetectingRef.current = true;
    lastDetectionTimeRef.current = now;

    try {
      const vW = video.videoWidth;
      const vH = video.videoHeight;
      if (!vW || !vH) return;

      // Ensure canvas matches video internal dimensions
      if (canvas.width !== vW || canvas.height !== vH) {
        canvas.width = vW;
        canvas.height = vH;
      }

      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return;

      // 1. Analyze Luminance for Night / Low-Light Detection using reusable offscreen canvas
      if (!offscreenLumRef.current) {
        offscreenLumRef.current = document.createElement('canvas');
      }
      const offscreen = offscreenLumRef.current;
      const targetW = Math.min(320, vW);
      const targetH = Math.min(180, vH);
      if (offscreen.width !== targetW || offscreen.height !== targetH) {
        offscreen.width = targetW;
        offscreen.height = targetH;
      }

      const offCtx = offscreen.getContext('2d', { willReadFrequently: true });
      if (offCtx) {
        offCtx.drawImage(video, 0, 0, offscreen.width, offscreen.height);
        const lumResult = analyzeFrameLuminance(offCtx, offscreen.width, offscreen.height);
        setAverageLuminance(lumResult.averageLuminance);
        const nightActive = lumResult.isNight;
        if (nightActive !== isNightMode) {
          setIsNightMode(nightActive);
        }

        if (nightActive) {
          enhanceNightCanvas(offCtx, offscreen.width, offscreen.height);
        }
      }

      // 2. Real Detection Pass using Fallback Ladder: ai-service -> browser YOLO worker -> COCO-SSD
      const model = await getDetectionModel();

      const ladderResult = await performLadderSurveillanceInference(model, video, isNightMode);
      const rawDetections = ladderResult.detections;
      setCurrentEngine(ladderResult.engine);
      setInferenceFps(Math.round(1000 / Math.max(1, ladderResult.latencyMs)));
      setDetectionLatencyMs(ladderResult.latencyMs);

      // 3. Multi-object tracker update with persistent IDs, provisional reconciliation & trajectories
      const updatedTracks = trackerRef.current.update(rawDetections, Date.now());

      // 4. Automatic ANPR on vehicles in the same background detection pass
      for (const track of updatedTracks) {
        const isVehicle = [
          'car',
          'truck',
          'bus',
          'two-wheeler',
          'three-wheeler',
          'auto-rickshaw',
          'truck/bus',
          'motorcycle',
        ].includes(track.class);
        if (isVehicle && !track.anpr) {
          extractAndReadLicensePlate(video, track.bbox).then((anprResult) => {
            track.anpr = anprResult;
            if (anprResult.isReadable && anprResult.plateText && anprResult.plateText !== 'Unreadable') {
              const bestCrop = anprResult.plateCropDataUrl || anprResult.cropDataUrl;
              setLatestReadPlate({
                plate: anprResult.plateText,
                confidence: anprResult.confidence,
                cropUrl: bestCrop,
                timestamp: Date.now(),
                isValidFormat: anprResult.isValidFormat,
                formatType: anprResult.formatType,
                validationStatus: anprResult.validationStatus,
              });
              if (onPlateDetected) {
                onPlateDetected({
                  plate: anprResult.plateText,
                  confidence: anprResult.confidence,
                  cropUrl: bestCrop,
                  cameraId: camera.id,
                  cameraName: camera.name,
                  videoTime: video.currentTime,
                  trackId: track.id,
                  formatType: anprResult.formatType,
                  validationStatus: anprResult.validationStatus,
                });
              }
              if (!autoOpenedPlatesRef.current.has(anprResult.plateText)) {
                autoOpenedPlatesRef.current.add(anprResult.plateText);
                onSelectPlate(anprResult.plateText, bestCrop);
              }
            } else if (anprResult.formatType === 'distance_gated') {
              if (onPlateDetected && !autoOpenedPlatesRef.current.has(`dist-${track.id}`)) {
                autoOpenedPlatesRef.current.add(`dist-${track.id}`);
                const bestCrop = anprResult.cropDataUrl;
                onPlateDetected({
                  plate: 'DISTANCE_GATED',
                  confidence: anprResult.confidence,
                  cropUrl: bestCrop,
                  cameraId: camera.id,
                  cameraName: camera.name,
                  videoTime: video.currentTime,
                  trackId: track.id,
                  formatType: 'distance_gated',
                  validationStatus: 'Plate not legible at this distance',
                });
              }
            }
          });
        }
      }

      // 5. Explicit VMS Alert Evaluation with Hysteresis & Rate Capping
      // Pre-capture frame snapshot for evidence
      if (!offscreenSnapRef.current) {
        offscreenSnapRef.current = document.createElement('canvas');
        offscreenSnapRef.current.width = 480;
        offscreenSnapRef.current.height = 270;
      }
      const snapCanvas = offscreenSnapRef.current;
      const sCtx = snapCanvas.getContext('2d');
      if (sCtx) {
        sCtx.drawImage(video, 0, 0, snapCanvas.width, snapCanvas.height);
      }
      const snapshotUrl = snapCanvas.toDataURL('image/jpeg', 0.82);

      const evaluatedAlerts = alertEngineRef.current.evaluate({
        camera,
        tracks: updatedTracks,
        videoTime: video.currentTime,
        isNightMode,
        canvasSnapshotUrl: snapshotUrl,
        videoElement: video,
      });

      for (const alert of evaluatedAlerts) {
        onAlertGenerated(alert);
      }

      // Store in ref for smooth 60fps interpolation rendering without waiting for React re-render
      targetTracksRef.current = updatedTracks;

      // Responsively update React state for UI lists (200ms debounce)
      const nowTime = performance.now();
      if (nowTime - lastUiUpdateRef.current > 200) {
        setTrackedObjects(updatedTracks);
        lastUiUpdateRef.current = nowTime;
      }
    } catch (err) {
      console.warn('Frame detection pass skipped:', err);
    } finally {
      isDetectingRef.current = false;
    }
  }, [camera, isNightMode, onAlertGenerated, onSelectPlate, isWsConnected]);

  // Continuous Pipelined Background Detection Loop:
  // Starts processing frames simultaneously with upload/playback setup,
  // synchronized with compositor frame presentation via requestVideoFrameCallback or throttled timer.
  // Automatically suspends when browser tab is hidden to eliminate idle GPU/CPU drain.
  useEffect(() => {
    let timeoutId: number | null = null;
    let rvfcId: number | null = null;
    let isCancelled = false;

    const triggerPass = async () => {
      if (isCancelled) return;
      if (document.hidden) return; // Tab paused

      const video = videoRef.current;
      if (video && video.readyState >= 2) {
        await runDetectionPass();
      }
      if (!isCancelled && !document.hidden) {
        const videoEl = videoRef.current as any;
        if (videoEl && typeof videoEl.requestVideoFrameCallback === 'function' && !video?.paused) {
          rvfcId = videoEl.requestVideoFrameCallback(() => {
            triggerPass();
          });
        } else {
          timeoutId = window.setTimeout(triggerPass, 65);
        }
      }
    };

    // Tab visibility listener: resume immediately when operator returns to tab
    const handleVisibilityChange = () => {
      if (!document.hidden && !isCancelled) {
        triggerPass();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    triggerPass();

    return () => {
      isCancelled = true;
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (timeoutId) clearTimeout(timeoutId);
      const videoEl = videoRef.current as any;
      if (videoEl && rvfcId && typeof videoEl.cancelVideoFrameCallback === 'function') {
        videoEl.cancelVideoFrameCallback(rvfcId);
      }
    };
  }, [runDetectionPass]);

  // High-performance 60 FPS Canvas Rendering & Bounding-Box Interpolation Loop
  // Smoothly lerps bounding boxes between detection passes for silky smooth motion tracking.
  useEffect(() => {
    let animationFrameId: number;

    const renderLoop = () => {
      const canvas = canvasRef.current;
      const video = videoRef.current;
      if (canvas && video && video.readyState >= 2) {
        const vW = video.videoWidth;
        const vH = video.videoHeight;
        if (vW && vH && (canvas.width !== vW || canvas.height !== vH)) {
          canvas.width = vW;
          canvas.height = vH;
        }

        const ctx = canvas.getContext('2d');
        if (ctx) {
          const cW = canvas.width;
          const cH = canvas.height;
          ctx.clearRect(0, 0, cW, cH);

          // Calculate render delta-time for framerate-independent box interpolation
          const nowPerf = performance.now();
          const dt = Math.min(0.1, Math.max(0.001, (nowPerf - lastRenderTimeRef.current) / 1000));
          lastRenderTimeRef.current = nowPerf;

          // Rolling FPS calculation for debug display
          frameCountRef.current++;
          if (nowPerf - lastFpsCalcTimeRef.current >= 500) {
            renderFpsRef.current = Math.round(
              (frameCountRef.current * 1000) / (nowPerf - lastFpsCalcTimeRef.current)
            );
            frameCountRef.current = 0;
            lastFpsCalcTimeRef.current = nowPerf;
          }

          // 0. Smooth Demo Mode ("Analyze, then play") sync OR Lightweight Optical/Motion Tracking
          if (isPreAnalyzed && video.readyState >= 2) {
            const cachedTracks = videoAnalysisService.getDetectionsAtTime(camera.id, video.currentTime);
            targetTracksRef.current = cachedTracks;
          } else if (nowPerf - lastMotionCheckRef.current > 32) {
            lastMotionCheckRef.current = nowPerf;
            if (!video.paused && video.readyState >= 2 && !isWsConnected) {
              const motionRegions = motionTrackerRef.current.detectMotion(video);
              if (motionRegions.length > 0) {
                const updated = trackerRef.current.addProvisionalMotion(motionRegions, Date.now());
                targetTracksRef.current = updated;
              }
            }
          }

          // 1. Draw Virtual Fences / Restricted Zones
          for (const zone of camera.zones) {
            if (!zone.enabled) continue;
            const pts = zone.points;
            if (pts.length < 2) continue;

            ctx.save();
            ctx.strokeStyle = zone.color || '#f59e0b';
            ctx.lineWidth = 2.5;

            if (zone.type === 'line') {
              const p1 = { x: pts[0].x * cW, y: pts[0].y * cH };
              const p2 = { x: pts[1].x * cW, y: pts[1].y * cH };

              ctx.beginPath();
              ctx.moveTo(p1.x, p1.y);
              ctx.lineTo(p2.x, p2.y);
              ctx.stroke();

              // Draw directional perpendicular marker
              const midX = (p1.x + p2.x) / 2;
              const midY = (p1.y + p2.y) / 2;
              ctx.fillStyle = zone.color || '#f59e0b';
              ctx.beginPath();
              ctx.arc(midX, midY, 5, 0, Math.PI * 2);
              ctx.fill();

              // Label
              ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
              ctx.fillRect(midX - 40, midY - 24, 80, 18);
              ctx.fillStyle = '#ffffff';
              ctx.font = '11px sans-serif';
              ctx.textAlign = 'center';
              ctx.fillText(zone.name, midX, midY - 11);
            } else if (zone.type === 'polygon' && pts.length >= 3) {
              ctx.beginPath();
              ctx.moveTo(pts[0].x * cW, pts[0].y * cH);
              for (let i = 1; i < pts.length; i++) {
                ctx.lineTo(pts[i].x * cW, pts[i].y * cH);
              }
              ctx.closePath();
              ctx.fillStyle = 'rgba(245, 158, 11, 0.12)';
              ctx.fill();
              ctx.stroke();

              // Label at centroid
              const avgX = (pts.reduce((acc, p) => acc + p.x, 0) / pts.length) * cW;
              const avgY = (pts.reduce((acc, p) => acc + p.y, 0) / pts.length) * cH;
              ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
              ctx.fillRect(avgX - 45, avgY - 12, 90, 20);
              ctx.fillStyle = '#ffffff';
              ctx.font = '11px sans-serif';
              ctx.textAlign = 'center';
              ctx.fillText(zone.name, avgX, avgY + 2);
            }
            ctx.restore();
          }

          // 2. Draw In-Progress Zone Points (during drawing mode)
          if (isDrawingMode && inProgressPoints.length > 0) {
            ctx.save();
            ctx.strokeStyle = '#f59e0b';
            ctx.lineWidth = 2;
            ctx.setLineDash([5, 5]);

            ctx.beginPath();
            ctx.moveTo(inProgressPoints[0].x * cW, inProgressPoints[0].y * cH);
            for (let i = 1; i < inProgressPoints.length; i++) {
              ctx.lineTo(inProgressPoints[i].x * cW, inProgressPoints[i].y * cH);
            }
            ctx.stroke();

            // Vertex dots
            ctx.setLineDash([]);
            ctx.fillStyle = '#f59e0b';
            for (const pt of inProgressPoints) {
              ctx.beginPath();
              ctx.arc(pt.x * cW, pt.y * cH, 5, 0, Math.PI * 2);
              ctx.fill();
            }
            ctx.restore();
          }

          // 3. Interpolate Tracked Objects for Smooth 60 FPS Bounding Box Transitions
          // Framerate-independent exponential smoothing between incoming detections & WebSocket packets
          const displayMap = displayTracksRef.current;
          const targetTracks = targetTracksRef.current;
          const targetIdSet = new Set(targetTracks.map((t) => t.id));
          const lerpFactor = reducedMotion ? 1 : 1 - Math.exp(-dt * 18.0);

          targetTracks.forEach((tgt) => {
            let disp = displayMap.get(tgt.id);
            if (!disp) {
              disp = {
                bbox: { ...tgt.bbox },
                track: tgt,
                alpha: 0.1,
              };
              displayMap.set(tgt.id, disp);
            }
            disp.bbox.x += (tgt.bbox.x - disp.bbox.x) * lerpFactor;
            disp.bbox.y += (tgt.bbox.y - disp.bbox.y) * lerpFactor;
            disp.bbox.width += (tgt.bbox.width - disp.bbox.width) * lerpFactor;
            disp.bbox.height += (tgt.bbox.height - disp.bbox.height) * lerpFactor;
            disp.track = tgt;
            disp.alpha = Math.min(1, disp.alpha + 0.15);
          });

          // Gracefully fade out departed tracks
          for (const [id, disp] of displayMap.entries()) {
            if (!targetIdSet.has(id)) {
              disp.alpha -= 0.08;
              if (disp.alpha <= 0) {
                displayMap.delete(id);
              }
            }
          }

          // 4. Render Tracked Objects with Thin Bounding Boxes & High Precision
          if (showDetectionsOverlay) {
            for (const disp of displayMap.values()) {
              const obj = disp.track;
              const bbox = disp.bbox;
              const isProvisional = !!obj.isProvisional;
              const isPedestrian = obj.class === 'pedestrian' || obj.class === 'person';
              const isTwoWheeler = obj.class === 'two-wheeler' || obj.class === 'motorcycle' || obj.class === 'bicycle';
              const isThreeWheeler = obj.class === 'three-wheeler' || obj.class === 'auto-rickshaw';
              const isHeavy = obj.class === 'truck/bus' || obj.class === 'truck' || obj.class === 'bus';
              const isLuggage = ['suitcase', 'backpack', 'handbag'].includes(obj.class);
              const isPerson = isPedestrian;
              const isVehicle = ['car', 'two-wheeler', 'three-wheeler', 'auto-rickshaw', 'truck/bus', 'truck', 'bus', 'motorcycle'].includes(obj.class);

              const bx = Math.max(1, Math.min(cW - 4, Math.round(bbox.x * cW)));
              const by = Math.max(1, Math.min(cH - 4, Math.round(bbox.y * cH)));
              const bw = Math.max(4, Math.min(cW - bx - 1, Math.round(bbox.width * cW)));
              const bh = Math.max(4, Math.min(cH - by - 1, Math.round(bbox.height * cH)));

              const color = isProvisional
                ? '#f59e0b'
                : isPedestrian
                ? '#38bdf8'
                : isTwoWheeler
                ? '#c084fc'
                : isThreeWheeler
                ? '#fbbf24'
                : isHeavy
                ? '#fb923c'
                : isLuggage
                ? '#94a3b8'
                : '#34d399';
              const badgeBg = 'rgba(15, 23, 42, 0.92)';

            ctx.save();
            ctx.globalAlpha = Math.max(0.05, Math.min(1, disp.alpha));

            // Trajectory trail: shown in debug mode or when motion trails enabled
            if (isDebugMode || (!reducedMotion && obj.trajectory.length > 1)) {
              ctx.save();
              ctx.lineWidth = isDebugMode ? 2 : 1.5;
              ctx.strokeStyle = isProvisional
                ? 'rgba(245, 158, 11, 0.45)'
                : isPerson
                ? 'rgba(6, 182, 212, 0.45)'
                : isLuggage
                ? 'rgba(239, 68, 68, 0.45)'
                : 'rgba(16, 185, 129, 0.45)';
              ctx.beginPath();
              if (obj.trajectory.length > 0) {
                const start = obj.trajectory[0];
                ctx.moveTo(start.x * cW, start.y * cH);
                for (let i = 1; i < obj.trajectory.length; i++) {
                  ctx.lineTo(obj.trajectory[i].x * cW, obj.trajectory[i].y * cH);
                }
                ctx.stroke();

                if (isDebugMode) {
                  for (const pt of obj.trajectory) {
                    ctx.fillStyle = ctx.strokeStyle;
                    ctx.beginPath();
                    ctx.arc(pt.x * cW, pt.y * cH, 2, 0, Math.PI * 2);
                    ctx.fill();
                  }
                }
              }
              ctx.restore();
            }

            // Bounding Box
            ctx.save();
            ctx.lineWidth = isProvisional ? 1.8 : obj.confidenceTier === 'high' ? 2 : 1.5;
            ctx.strokeStyle = color;
            if (isProvisional || obj.state === 'tentative') {
              ctx.setLineDash([5, 3]);
            } else if (obj.confidenceTier === 'low' || obj.state === 'lost') {
              ctx.setLineDash([4, 3]);
            } else {
              ctx.setLineDash([]);
            }
            ctx.strokeRect(bx, by, bw, bh);

            // Footpoint crosshair in debug mode (?debug=1)
            if (isDebugMode) {
              const footX = bx + bw / 2;
              const footY = by + bh;
              ctx.save();
              ctx.strokeStyle = '#38bdf8';
              ctx.fillStyle = '#0284c7';
              ctx.lineWidth = 1.5;
              ctx.beginPath();
              ctx.arc(footX, footY, 3, 0, Math.PI * 2);
              ctx.fill();
              ctx.stroke();
              ctx.restore();
            }

            // Secondary Person Head / Face Frame if available
            if (isPerson && obj.headBbox) {
              const hx = Math.max(1, Math.min(cW - 4, Math.round(obj.headBbox.x * cW)));
              const hy = Math.max(1, Math.min(cH - 4, Math.round(obj.headBbox.y * cH)));
              const hw = Math.max(4, Math.min(cW - hx - 1, Math.round(obj.headBbox.width * cW)));
              const hh = Math.max(4, Math.min(cH - hy - 1, Math.round(obj.headBbox.height * cH)));

              ctx.strokeStyle = 'rgba(6, 182, 212, 0.7)';
              ctx.lineWidth = 1.2;
              ctx.setLineDash([]);
              ctx.strokeRect(hx, hy, hw, hh);
            }

            // Compact ID Top Badge (clean, un-cluttered; detailed only in ?debug=1)
            let labelText: string;
            if (isDebugMode) {
              const stateStr = (obj.state || (isProvisional ? 'tentative' : 'confirmed')).toUpperCase();
              const hitsStr = obj.hits !== undefined ? ` h:${obj.hits}` : '';
              const speedStr = obj.speed !== undefined ? ` ${Math.round(obj.speed)}px/s` : '';
              labelText = `[${stateStr}] #${obj.id} ${obj.class}${hitsStr}${speedStr} ${obj.confidence}%`;
            } else {
              const speedTag = obj.speed && obj.speed > 8 ? ` • ${Math.round(obj.speed)}px/s` : '';
              labelText = isProvisional
                ? `⚡ #${obj.id} MOTION`
                : `#${obj.id} ${obj.class}${speedTag}`;
            }

            ctx.font = '600 10px system-ui, -apple-system, sans-serif';
            const textWidth = ctx.measureText(labelText).width;
            const badgeH = 16;
            const badgeW = textWidth + 10;

            const badgeY = by < badgeH + 2 ? by + 2 : by - badgeH;
            const badgeX = Math.max(1, Math.min(cW - badgeW - 1, bx));

            ctx.fillStyle = isProvisional
              ? badgeBg
              : obj.confidenceTier === 'low'
              ? 'rgba(71, 85, 105, 0.92)'
              : badgeBg;
            ctx.fillRect(badgeX, badgeY, badgeW, badgeH);

            ctx.fillStyle = '#ffffff';
            ctx.textAlign = 'left';
            ctx.fillText(labelText, badgeX + 5, badgeY + 12);

            // ANPR License Plate Badge on Vehicles with Indian NHAI/RTO Format Validation Status
            if (isVehicle && obj.anpr) {
              const isRead = obj.anpr.isReadable && obj.anpr.plateText !== 'Unreadable';
              const isValid = obj.anpr.isValidFormat && isRead;
              const formatLabel = isValid
                ? obj.anpr.formatType === 'bharat'
                  ? 'Valid BH series'
                  : 'Valid format'
                : 'Unreadable / invalid format';
              const plateStr = isRead
                ? `ANPR: ${obj.anpr.plateText} (${obj.anpr.confidence}%) • ${formatLabel}`
                : `ANPR: Unreadable • ${formatLabel}`;
              const plateW = ctx.measureText(plateStr).width + 12;
              const plateY = Math.min(cH - 4, by + bh + 16);
              const plateX = Math.max(1, Math.min(cW - plateW - 1, bx));

              ctx.fillStyle = isValid
                ? 'rgba(5, 150, 105, 0.95)'
                : isRead
                ? 'rgba(180, 83, 9, 0.95)'
                : 'rgba(75, 85, 99, 0.90)';
              ctx.fillRect(plateX, plateY - 14, plateW, 18);

              ctx.fillStyle = '#ffffff';
              ctx.fillText(plateStr, plateX + 6, plateY - 1);
            }

            ctx.restore();
          }
        }

          // 5. In-Canvas Debug Telemetry HUD when ?debug=1 is enabled
          if (isDebugMode) {
            ctx.save();
            const hudX = 12;
            const hudY = 12;
            const hudW = 270;
            const hudH = 86;
            ctx.fillStyle = 'rgba(15, 23, 42, 0.90)';
            ctx.fillRect(hudX, hudY, hudW, hudH);
            ctx.strokeStyle = '#0284c7';
            ctx.lineWidth = 1;
            ctx.strokeRect(hudX, hudY, hudW, hudH);

            ctx.font = '700 11px monospace';
            ctx.fillStyle = '#38bdf8';
            ctx.textAlign = 'left';
            ctx.fillText('⚡ TRACKING HUD (?debug=1)', hudX + 8, hudY + 16);

            ctx.font = '10px monospace';
            ctx.fillStyle = '#94a3b8';
            const engineLabel = isWsConnected
              ? 'WebSocket AI-Service'
              : currentEngine === 'ai-service'
              ? 'Python AI-Service (YOLO26)'
              : currentEngine === 'yolo-worker'
              ? 'Browser YOLO (ONNX)'
              : 'Browser COCO-SSD (Fallback)';
            ctx.fillText(
              `Pipeline: ${engineLabel}`,
              hudX + 8,
              hudY + 32
            );
            ctx.fillText(
              `Display FPS: ${renderFpsRef.current} | Latency: ${detectionLatencyMs}ms`,
              hudX + 8,
              hudY + 46
            );

            const confirmedCount = Array.from(displayMap.values()).filter(
              (d) => (d.track.state || 'confirmed') === 'confirmed'
            ).length;
            const tentativeCount = Array.from(displayMap.values()).filter(
              (d) => d.track.state === 'tentative' || d.track.isProvisional
            ).length;
            ctx.fillText(
              `Tracks: ${displayMap.size} (Conf: ${confirmedCount}, Tent: ${tentativeCount})`,
              hudX + 8,
              hudY + 60
            );

            const activeIds = Array.from(displayMap.keys())
              .map((id) => `#${id}`)
              .slice(0, 6)
              .join(' ');
            ctx.fillText(`Track IDs: ${activeIds || 'None'}`, hudX + 8, hudY + 74);
            ctx.restore();
          }
        }
      }
      animationFrameId = requestAnimationFrame(renderLoop);
    };

    animationFrameId = requestAnimationFrame(renderLoop);
    return () => cancelAnimationFrame(animationFrameId);
  }, [camera.zones, isDrawingMode, inProgressPoints, reducedMotion, isDebugMode, isWsConnected]);

  // Handle canvas click during zone drawing mode or interactive ANPR inspection
  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const clickX = (e.clientX - rect.left) / rect.width;
    const clickY = (e.clientY - rect.top) / rect.height;

    if (isDrawingMode) {
      const normPt: Point = {
        x: Math.max(0, Math.min(1, clickX)),
        y: Math.max(0, Math.min(1, clickY)),
      };
      setInProgressPoints((prev) => [...prev, normPt]);
      return;
    }

    // Direct 1-click dossier opening when clicking on a detected vehicle
    const clickedTrack = trackedObjects.find(
      (obj) =>
        clickX >= obj.bbox.x &&
        clickX <= obj.bbox.x + obj.bbox.width &&
        clickY >= obj.bbox.y &&
        clickY <= obj.bbox.y + obj.bbox.height
    );

    if (clickedTrack?.anpr?.isReadable && clickedTrack.anpr.plateText !== 'Unreadable') {
      onSelectPlate(clickedTrack.anpr.plateText, clickedTrack.anpr.cropDataUrl);
    }
  };

  const handleSaveNewZone = (
    name: string,
    type: ZoneType,
    direction: CrossingDirection,
    alertOnClasses: ObjectClass[]
  ) => {
    const newZone: VirtualZone = {
      id: `zone-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      cameraId: camera.id,
      name,
      type,
      direction,
      alertOnClasses,
      points: inProgressPoints,
      enabled: true,
      color: type === 'line' ? '#f59e0b' : '#ef4444',
      createdAt: Date.now(),
    };

    const updatedZones = [...camera.zones, newZone];
    onUpdateCamera({ ...camera, zones: updatedZones });
  };

  // Format time mm:ss.ms
  const formatTime = (secs: number) => {
    if (isNaN(secs)) return '00:00.0';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    const ms = Math.floor((secs % 1) * 10);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${ms}`;
  };

  return (
    <div
      ref={containerRef}
      id={`camera-feed-card-${camera.id}`}
      className="flex flex-col rounded-xl border border-neutral-800 bg-neutral-900 shadow-xl overflow-hidden"
    >
      {/* Feed Header */}
      <div className="flex items-center justify-between border-b border-neutral-800 px-4 py-2.5 bg-neutral-950/60">
        <div className="flex items-center gap-3">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
          </span>
          <div>
            {isEditingName ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const finalName = editedName.trim() || camera.name;
                  onUpdateCamera({ ...camera, name: finalName });
                  setIsEditingName(false);
                }}
                className="flex items-center gap-1.5"
              >
                <input
                  type="text"
                  value={editedName}
                  onChange={(e) => setEditedName(e.target.value)}
                  className="rounded border border-amber-500 bg-neutral-950 px-2 py-0.5 text-xs text-white focus:outline-none"
                  autoFocus
                  onBlur={() => {
                    const finalName = editedName.trim() || camera.name;
                    onUpdateCamera({ ...camera, name: finalName });
                    setIsEditingName(false);
                  }}
                />
              </form>
            ) : (
              <div className="flex items-center gap-1.5 group">
                <h3 className="text-sm font-semibold text-neutral-100">{camera.name}</h3>
                <button
                  type="button"
                  onClick={() => setIsEditingName(true)}
                  className="opacity-0 group-hover:opacity-100 text-neutral-500 hover:text-amber-400 transition-opacity p-0.5"
                  title="Rename camera"
                >
                  <Edit2 className="h-3 w-3" />
                </button>
              </div>
            )}
            <div className="flex items-center gap-2 text-[11px] text-neutral-400">
              <span>{camera.sourceType === 'file' ? 'Local Video File' : 'IP Stream'}</span>
              <span>•</span>
              <span>{videoResolution.w}x{videoResolution.h}</span>
              <span>•</span>
              <span className="font-mono text-neutral-300">
                {inferenceFps > 0 ? `${inferenceFps} FPS` : 'Analyzing'}
              </span>
              <span>•</span>
              <span
                className="font-mono text-emerald-400 bg-emerald-950/60 border border-emerald-800/40 rounded px-1.5 py-0.5 text-[10px]"
                title="Visual feedback: local motion tracking provides instant provisional boxes in <30ms, confirmed by neural detection in ~70-90ms"
              >
                ⚡ &lt;30ms motion / ~{detectionLatencyMs}ms AI
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Hidden Debug Mode Indicator */}
          {isDebugMode && (
            <div
              id={`debug-mode-badge-${camera.id}`}
              className="flex items-center gap-1 rounded-full border border-sky-500/50 bg-sky-950/60 px-2.5 py-1 text-xs font-mono font-medium text-sky-300"
              title="Tracking Debug Telemetry Active (?debug=1)"
            >
              <span className="h-2 w-2 rounded-full bg-sky-400 animate-pulse" />
              <span>DEBUG (?debug=1)</span>
            </div>
          )}

          {/* Automatic Night Mode Indicator */}
          <div
            id={`night-mode-badge-${camera.id}`}
            title={`Ambient Luminance: ${averageLuminance}/255 (${
              isNightMode ? 'Night Mode Active' : 'Day Mode'
            })`}
            className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium border ${
              isNightMode
                ? 'border-indigo-500/50 bg-indigo-950/50 text-indigo-300'
                : 'border-amber-500/30 bg-amber-500/10 text-amber-300'
            }`}
          >
            {isNightMode ? (
              <>
                <Moon className="h-3 w-3 text-indigo-400" />
                <span>Night Active</span>
              </>
            ) : (
              <>
                <Sun className="h-3 w-3 text-amber-400" />
                <span>Day Mode</span>
              </>
            )}
          </div>

          {/* AI Explain Footage Button */}
          {onAskAI && (
            <button
              id={`ai-explain-feed-btn-${camera.id}`}
              onClick={() => onAskAI(`Explain what's going on in the footage for ${camera.name}`)}
              className="flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium border border-indigo-700/60 bg-indigo-950/40 text-indigo-300 hover:bg-indigo-900/60 transition-colors"
              title="Ground AI Chatbot on current live video frame & active telemetry"
            >
              <Sparkles className="h-3 w-3 text-indigo-400" />
              <span>Explain Scene</span>
            </button>
          )}

          {/* Smooth Demo Mode Button for Uploaded Videos */}
          {camera.sourceType === 'file' && (
            <button
              id={`smooth-demo-btn-${camera.id}`}
              onClick={handleTogglePreAnalysis}
              disabled={isAnalyzingVideo}
              className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium border transition-colors ${
                isPreAnalyzed
                  ? 'border-emerald-500/60 bg-emerald-950/40 text-emerald-300 hover:bg-emerald-900/50'
                  : isAnalyzingVideo
                  ? 'border-cyan-500/60 bg-cyan-950/50 text-cyan-300'
                  : 'border-neutral-700 bg-neutral-800 text-neutral-300 hover:bg-neutral-700'
              }`}
              title={
                isPreAnalyzed
                  ? 'Smooth 30 FPS Demo Mode Active (Click to switch to live inference)'
                  : 'Pre-analyze video in background for smooth 30 FPS playback with zero stutter'
              }
            >
              <Sparkles className={`h-3 w-3 ${isPreAnalyzed ? 'text-emerald-400' : isAnalyzingVideo ? 'text-cyan-400 animate-spin' : 'text-neutral-400'}`} />
              <span>
                {isPreAnalyzed
                  ? '⚡ 30 FPS Mode'
                  : isAnalyzingVideo
                  ? `Analyzing ${analysisProgress}%`
                  : 'Analyze & Play'}
              </span>
            </button>
          )}

          {/* Quality Selector: Fast / Balanced / High */}
          <div className="flex items-center rounded-lg border border-neutral-800 bg-neutral-950 p-0.5 text-xs">
            <button
              type="button"
              onClick={() => handleQualityChange('fast')}
              className={`rounded px-2 py-0.5 font-medium transition-colors ${
                qualityMode === 'fast'
                  ? 'bg-sky-500 text-neutral-950 font-bold'
                  : 'text-neutral-400 hover:text-white'
              }`}
              title="Fast Mode: yolo26n @ 640 for real-time low-latency preview"
            >
              Fast
            </button>
            <button
              type="button"
              onClick={() => handleQualityChange('balanced')}
              className={`rounded px-2 py-0.5 font-medium transition-colors ${
                qualityMode === 'balanced'
                  ? 'bg-sky-500 text-neutral-950 font-bold'
                  : 'text-neutral-400 hover:text-white'
              }`}
              title="Balanced Mode: yolo26s @ 960 (recommended default surveillance)"
            >
              Balanced
            </button>
            <button
              type="button"
              onClick={() => handleQualityChange('high')}
              className={`rounded px-2 py-0.5 font-medium transition-colors ${
                qualityMode === 'high'
                  ? 'bg-sky-500 text-neutral-950 font-bold'
                  : 'text-neutral-400 hover:text-white'
              }`}
              title="High Quality Mode: yolo26m @ 1280 for dense traffic analysis"
            >
              High
            </button>
          </div>

          {/* Overlay Toggle */}
          <button
            type="button"
            onClick={() => setShowDetectionsOverlay(!showDetectionsOverlay)}
            className={`flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium border transition-colors ${
              showDetectionsOverlay
                ? 'border-emerald-500/50 bg-emerald-950/40 text-emerald-300'
                : 'border-neutral-800 bg-neutral-900 text-neutral-400 hover:text-neutral-200'
            }`}
            title="Toggle detection bounding boxes (or press 'D')"
          >
            <Layers className="h-3.5 w-3.5" />
            <span>Overlay {showDetectionsOverlay ? 'ON' : 'OFF'}</span>
          </button>

          {/* Events Drawer Toggle */}
          <button
            type="button"
            onClick={() => setShowEventsDrawer(!showEventsDrawer)}
            className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium border transition-colors ${
              showEventsDrawer
                ? 'border-rose-500 bg-rose-500/20 text-rose-300'
                : 'border-neutral-800 bg-neutral-900 text-neutral-300 hover:bg-neutral-800'
            }`}
            title="Toggle camera event feed"
          >
            <Shield className="h-3 w-3" />
            <span>Events ({alerts.length})</span>
          </button>

          {/* Zones drawer toggle */}
          <button
            id={`toggle-zones-btn-${camera.id}`}
            onClick={() => setShowZoneDrawer(!showZoneDrawer)}
            className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium border transition-colors ${
              showZoneDrawer
                ? 'border-amber-500 bg-amber-500/20 text-amber-300'
                : 'border-neutral-700 bg-neutral-800 text-neutral-300 hover:bg-neutral-700'
            }`}
          >
            <Shield className="h-3 w-3" />
            <span>Virtual Fences ({camera.zones.length})</span>
          </button>

          {/* Remove camera */}
          <button
            id={`remove-cam-btn-${camera.id}`}
            onClick={() => onRemoveCamera(camera.id)}
            className="rounded-lg p-1.5 text-neutral-400 hover:bg-neutral-800 hover:text-red-400"
            title="Remove Camera Feed"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Main Video + Canvas Stage */}
      <div
        className="relative w-full bg-black overflow-hidden select-none flex items-center justify-center"
        style={{
          aspectRatio:
            videoResolution.w > 0 && videoResolution.h > 0
              ? `${videoResolution.w} / ${videoResolution.h}`
              : '16 / 9',
        }}
      >
        <video
          ref={videoRef}
          src={camera.sourceUrl}
          playsInline
          muted={isMuted}
          loop
          onLoadedMetadata={handleLoadedMetadata}
          onLoadedData={handleLoadedData}
          onTimeUpdate={handleTimeUpdate}
          onEnded={() => setIsPlaying(false)}
          className="absolute inset-0 h-full w-full object-fill block"
        />

        {/* AI Overlay Canvas */}
        <canvas
          ref={canvasRef}
          onClick={handleCanvasClick}
          className={`absolute inset-0 h-full w-full object-fill block ${
            isDrawingMode ? 'cursor-crosshair' : 'cursor-default'
          }`}
        />

        {/* Minimalist Pre-Analysis Progress Bar Overlay ("Analyze, then play") */}
        {isAnalyzingVideo && (
          <div className="absolute inset-x-6 bottom-16 z-30 flex flex-col gap-1.5 rounded-xl bg-neutral-950/90 border border-cyan-800/80 p-3 shadow-2xl backdrop-blur-md">
            <div className="flex items-center justify-between text-xs font-mono text-cyan-300">
              <span className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-cyan-400 animate-ping" />
                Analyzing footage for smooth 30 FPS playback... Video will start automatically once ready.
              </span>
              <span className="font-bold">{analysisProgress}%</span>
            </div>
            <div className="h-1.5 w-full bg-neutral-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-cyan-500 to-emerald-400 transition-all duration-150"
                style={{ width: `${analysisProgress}%` }}
              />
            </div>
          </div>
        )}

        {/* Model Loading indicator */}
        {modelLoading && (
          <div className="absolute top-3 left-3 flex items-center gap-2 rounded-lg bg-neutral-900/90 border border-neutral-800 px-3 py-1.5 text-xs text-neutral-300 backdrop-blur-xs">
            <Sparkles className="h-3.5 w-3.5 text-amber-400 animate-spin" />
            <span>Initializing AI Detection Engine...</span>
          </div>
        )}

        {/* Active Track Badges / Quick ANPR Clicker */}
        {trackedObjects.length > 0 && (
          <div className="absolute bottom-3 left-3 flex flex-wrap gap-1.5 max-w-[70%] pointer-events-auto">
            {trackedObjects.slice(0, 4).map((obj) => (
              <div
                key={obj.id}
                className="flex items-center gap-1.5 rounded bg-neutral-950/85 border border-neutral-800 px-2 py-0.5 text-[11px] text-neutral-300 backdrop-blur-xs"
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    obj.class === 'person' ? 'bg-sky-400' : 'bg-orange-400'
                  }`}
                />
                <span>
                  #{obj.id} {obj.class}
                </span>
                {obj.anpr && (
                  <button
                    onClick={() => onSelectPlate(obj.anpr!.plateText, obj.anpr!.cropDataUrl)}
                    className={`ml-1 rounded px-1.5 py-0.5 font-mono text-[10px] border transition-colors ${
                      obj.anpr.isValidFormat && obj.anpr.isReadable
                        ? 'bg-emerald-950/80 text-emerald-300 hover:text-emerald-200 border-emerald-600/60'
                        : 'bg-amber-950/70 text-amber-300 hover:text-amber-200 border-amber-600/50'
                    }`}
                    title={`ANPR: ${obj.anpr.plateText} (${obj.anpr.validationStatus || 'Format check'})`}
                  >
                    {obj.anpr.isReadable
                      ? `${obj.anpr.plateText} • ${obj.anpr.isValidFormat ? 'Valid format' : 'Invalid format'}`
                      : 'Unreadable'}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Overlay Zone Drawer when active */}
        {showZoneDrawer && (
          <div className="absolute top-3 right-3 w-80 max-h-[90%] overflow-y-auto z-20">
            <ZoneDrawer
              cameraId={camera.id}
              zones={camera.zones}
              onUpdateZones={(updated) => onUpdateCamera({ ...camera, zones: updated })}
              isDrawingMode={isDrawingMode}
              onSetDrawingMode={setIsDrawingMode}
              currentDrawingType={currentDrawingType}
              onSetDrawingType={setCurrentDrawingType}
              inProgressPoints={inProgressPoints}
              onClearInProgress={() => setInProgressPoints([])}
              onSaveNewZone={handleSaveNewZone}
            />
          </div>
        )}

        {/* Right-Hand Collapsible Real-Time Events Feed */}
        {showEventsDrawer && (
          <div className="absolute top-0 right-0 bottom-0 w-80 bg-neutral-950/95 border-l border-neutral-800 z-30 flex flex-col p-3 shadow-2xl backdrop-blur-md overflow-hidden">
            <div className="flex items-center justify-between pb-2 mb-2 border-b border-neutral-800">
              <span className="text-xs font-bold tracking-wider uppercase text-neutral-200">
                Camera Events ({alerts.length})
              </span>
              <button
                type="button"
                onClick={() => setShowEventsDrawer(false)}
                className="text-neutral-400 hover:text-white text-xs px-1.5 py-0.5 rounded bg-neutral-900 border border-neutral-800"
              >
                ✕ Close
              </button>
            </div>
            <div className="flex-1 overflow-y-auto space-y-2 pr-1">
              {alerts.length === 0 ? (
                <div className="p-6 text-center text-xs text-neutral-500">
                  No events recorded on this feed.
                </div>
              ) : (
                alerts.map((a) => {
                  const badgeColor =
                    a.severity === 'critical'
                      ? 'border-red-500/50 bg-red-950/50 text-red-300'
                      : a.severity === 'high'
                      ? 'border-amber-500/50 bg-amber-950/50 text-amber-300'
                      : 'border-sky-500/50 bg-sky-950/50 text-sky-300';
                  return (
                    <div
                      key={a.id}
                      onClick={() => {
                        if (videoRef.current) {
                          videoRef.current.currentTime = a.videoTime;
                          setCurrentTime(a.videoTime);
                          videoRef.current.pause();
                          setIsPlaying(false);
                        }
                      }}
                      className="cursor-pointer rounded-lg border border-neutral-800 bg-neutral-900/80 p-2.5 hover:border-neutral-700 hover:bg-neutral-850 transition-all text-left"
                    >
                      <div className="flex items-center justify-between gap-1 mb-1.5">
                        <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded border ${badgeColor}`}>
                          {a.severity}
                        </span>
                        <span className="font-mono text-[11px] text-sky-400 font-semibold">
                          {formatTime(a.videoTime)}
                        </span>
                      </div>
                      <p className="text-xs font-semibold text-neutral-100 line-clamp-1">{a.title}</p>
                      <p className="text-[11px] text-neutral-400 mt-1 line-clamp-2">
                        {a.riskFactors[0]?.description || `Object #${a.objectId} (${a.objectClass})`}
                      </p>
                      {a.entityCropUrl && (
                        <div className="mt-2 h-14 w-full bg-black rounded overflow-hidden flex items-center justify-center border border-neutral-800">
                          <img src={a.entityCropUrl} alt="Target crop" className="h-full object-contain" />
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>

      {/* Real-time ANPR Match Notification Banner with Indian Format Validation Status */}
      {latestReadPlate && (
        <div className="flex items-center justify-between border-t border-emerald-500/30 bg-emerald-950/70 px-3.5 py-2 text-xs text-emerald-200">
          <div className="flex items-center gap-2">
            <span
              className={`h-2 w-2 rounded-full ${
                latestReadPlate.isValidFormat ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'
              }`}
            />
            <span>
              ANPR Read Detected:{' '}
              <strong className="font-mono text-white text-sm tracking-wider">
                {latestReadPlate.plate}
              </strong>{' '}
              ({latestReadPlate.confidence}% Conf) •{' '}
              <span
                className={`font-semibold ${
                  latestReadPlate.isValidFormat ? 'text-emerald-300' : 'text-amber-300'
                }`}
              >
                {latestReadPlate.validationStatus ||
                  (latestReadPlate.isValidFormat
                    ? latestReadPlate.formatType === 'bharat'
                      ? 'Valid BH series'
                      : 'Valid format'
                    : 'Unreadable / invalid format')}
              </span>
            </span>
          </div>
          <button
            type="button"
            onClick={() => onSelectPlate(latestReadPlate.plate, latestReadPlate.cropUrl)}
            className="rounded bg-emerald-500 hover:bg-emerald-400 text-neutral-950 px-3 py-1 font-semibold text-xs transition-colors shadow-sm"
          >
            View Vehicle Dossier
          </button>
        </div>
      )}

      {/* Video Playback Controls (Standard controls per requirement 1) */}
      <div className="border-t border-neutral-800 bg-neutral-950 p-3">
        {/* Scrubber Time Slider with Timeline Event Markers */}
        <div className="relative flex items-center gap-3">
          <span className="font-mono text-xs text-neutral-400 w-16">
            {formatTime(currentTime)}
          </span>
          <div className="relative flex-1 flex items-center">
            {/* Event Markers Track */}
            {alerts && alerts.length > 0 && duration > 0 && (
              <div className="absolute inset-x-0 -top-2.5 h-3 pointer-events-none z-10">
                {alerts.map((a) => {
                  const pct = Math.max(0, Math.min(100, (a.videoTime / duration) * 100));
                  const dotColor =
                    a.severity === 'critical'
                      ? 'bg-rose-500'
                      : a.severity === 'high'
                      ? 'bg-amber-500'
                      : 'bg-sky-500';
                  return (
                    <button
                      key={a.id}
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (videoRef.current) {
                          videoRef.current.currentTime = a.videoTime;
                          setCurrentTime(a.videoTime);
                          videoRef.current.pause();
                          setIsPlaying(false);
                        }
                      }}
                      title={`[${formatTime(a.videoTime)}] ${a.title} (${a.severity.toUpperCase()})`}
                      className={`pointer-events-auto absolute -top-0.5 h-2.5 w-2.5 -translate-x-1/2 rounded-full ${dotColor} border border-neutral-950 shadow-sm transition-transform hover:scale-175 cursor-pointer`}
                      style={{ left: `${pct}%` }}
                    />
                  );
                })}
              </div>
            )}
            <input
              id={`scrubber-input-${camera.id}`}
              type="range"
              min={0}
              max={duration || 100}
              step={0.05}
              value={currentTime}
              onChange={handleSeek}
              className="h-1.5 w-full cursor-pointer appearance-none rounded-lg bg-neutral-800 accent-sky-500 focus:outline-none"
            />
          </div>
          <span className="font-mono text-xs text-neutral-400 w-16 text-right">
            {formatTime(duration)}
          </span>
        </div>

        {/* Control Buttons row */}
        <div className="mt-2.5 flex items-center justify-between">
          <div className="flex items-center gap-1 sm:gap-2">
            {/* Play / Pause */}
            <button
              id={`play-pause-btn-${camera.id}`}
              type="button"
              onClick={togglePlay}
              className="rounded-lg bg-neutral-800 p-2 text-neutral-200 hover:bg-neutral-700 hover:text-white"
              title={isPlaying ? 'Pause' : 'Play'}
            >
              {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            </button>

            {/* Frame step back */}
            <button
              id={`step-back-btn-${camera.id}`}
              type="button"
              onClick={() => stepFrame(false)}
              className="rounded-lg p-2 text-neutral-400 hover:bg-neutral-800 hover:text-white"
              title="Step -1 Frame (1/30s)"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>

            {/* Frame step forward */}
            <button
              id={`step-fwd-btn-${camera.id}`}
              type="button"
              onClick={() => stepFrame(true)}
              className="rounded-lg p-2 text-neutral-400 hover:bg-neutral-800 hover:text-white"
              title="Step +1 Frame (1/30s)"
            >
              <ChevronRight className="h-4 w-4" />
            </button>

            {/* Playback Speeds: 0.5x, 1x, 1.5x, 2x, 4x */}
            <div className="ml-2 flex items-center rounded-lg border border-neutral-800 bg-neutral-900 p-0.5 text-xs">
              {[0.5, 1, 1.5, 2, 4].map((speed) => (
                <button
                  key={speed}
                  id={`speed-btn-${camera.id}-${speed}`}
                  type="button"
                  onClick={() => setPlaybackSpeed(speed)}
                  className={`rounded px-2 py-1 font-medium transition-colors ${
                    playbackSpeed === speed
                      ? 'bg-amber-500 text-neutral-950 font-bold'
                      : 'text-neutral-400 hover:text-white'
                  }`}
                >
                  {speed}x
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Audio Mute toggle */}
            <button
              id={`mute-btn-${camera.id}`}
              type="button"
              onClick={() => {
                if (videoRef.current) {
                  videoRef.current.muted = !isMuted;
                  setIsMuted(!isMuted);
                }
              }}
              className="rounded-lg p-2 text-neutral-400 hover:bg-neutral-800 hover:text-white"
              title={isMuted ? 'Unmute' : 'Mute'}
            >
              {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
            </button>

            {/* Fullscreen toggle */}
            <button
              id={`fullscreen-btn-${camera.id}`}
              type="button"
              onClick={toggleFullscreen}
              className="rounded-lg p-2 text-neutral-400 hover:bg-neutral-800 hover:text-white"
              title="Toggle Fullscreen"
            >
              {isFullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
