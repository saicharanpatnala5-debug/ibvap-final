import React, { useState, useRef, useEffect } from 'react';
import {
  Activity,
  AlertTriangle,
  BrainCircuit,
  CheckCircle2,
  ChevronDown,
  Clock,
  Compass,
  FileText,
  Filter,
  Layers,
  Maximize2,
  Minimize2,
  MoveRight,
  Package,
  Play,
  Pause,
  RotateCcw,
  Search,
  Share2,
  Shield,
  ShieldAlert,
  Sparkles,
  Tag,
  Upload,
  User,
  Users,
  Video,
  Volume2,
  VolumeX,
  Zap,
} from 'lucide-react';
import { CameraFeedItem } from '../../types';
import {
  FootageAnalysisResult,
  FootageIncidentReport,
  IntelligenceEntity,
  RecognizedActivityType,
  ScopedQueryAnswer,
} from '../../types/intelligence';
import { SAMPLE_FEED_PRESETS } from '../../data/sampleFeeds';
import {
  analyzeVideoElement,
  formatTimeSec,
  generateIncidentReport,
  PRESET_INTELLIGENCE_DATA,
  queryFootageIntelligence,
} from '../../services/footageIntelligenceEngine';
import { IncidentReportModal } from './IncidentReportModal';

interface FootageIntelligenceViewProps {
  cameras: CameraFeedItem[];
  onOpenAddCamera?: () => void;
}

export const FootageIntelligenceView: React.FC<FootageIntelligenceViewProps> = ({
  cameras,
  onOpenAddCamera,
}) => {
  // Video Source Management
  const [selectedSourceType, setSelectedSourceType] = useState<'preset' | 'camera' | 'upload'>('preset');
  const [selectedSourceId, setSelectedSourceId] = useState<string>('sample-pedestrian-2');
  const [customVideoUrl, setCustomVideoUrl] = useState<string | null>(null);
  const [customVideoName, setCustomVideoName] = useState<string>('');

  // Video Playback State
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(28);
  const [playbackRate, setPlaybackRate] = useState<number>(1);
  const [isMuted, setIsMuted] = useState<boolean>(true);

  // Analysis State
  const [analysisResult, setAnalysisResult] = useState<FootageAnalysisResult>(
    PRESET_INTELLIGENCE_DATA['sample-pedestrian-2']
  );
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [analysisProgress, setAnalysisProgress] = useState<{ percent: number; stage: string }>({
    percent: 0,
    stage: '',
  });

  // Selected Tab for Intelligence Layers
  const [activeLayerTab, setActiveLayerTab] = useState<
    'summary' | 'entities' | 'activities' | 'interactions' | 'events' | 'query'
  >('summary');

  // Query State
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [queryAnswer, setQueryAnswer] = useState<ScopedQueryAnswer | null>(null);
  const [isQuerying, setIsQuerying] = useState<boolean>(false);

  // Entity Filter
  const [entityFilter, setEntityFilter] = useState<'all' | 'person' | 'vehicle' | 'object'>('all');
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null);

  // Activity Filter
  const [activityFilter, setActivityFilter] = useState<string>('all');

  // Report Modal
  const [isReportOpen, setIsReportOpen] = useState<boolean>(false);
  const [incidentReport, setIncidentReport] = useState<FootageIncidentReport | null>(null);

  // Drag-and-drop file upload state
  const [isDraggingOver, setIsDraggingOver] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Current Video Source URL computation
  const activeVideoUrl =
    selectedSourceType === 'upload' && customVideoUrl
      ? customVideoUrl
      : selectedSourceType === 'camera'
      ? cameras.find((c) => c.id === selectedSourceId)?.sourceUrl || SAMPLE_FEED_PRESETS[0].url
      : SAMPLE_FEED_PRESETS.find((p) => p.id === selectedSourceId)?.url || SAMPLE_FEED_PRESETS[1].url;

  // Sync Analysis Data when preset changes
  useEffect(() => {
    if (selectedSourceType === 'preset' && PRESET_INTELLIGENCE_DATA[selectedSourceId]) {
      setAnalysisResult(PRESET_INTELLIGENCE_DATA[selectedSourceId]);
      setQueryAnswer(null);
    }
  }, [selectedSourceId, selectedSourceType]);

  // Video Time Update & Bounding Box Overlay Rendering
  const handleTimeUpdate = () => {
    if (!videoRef.current) return;
    const t = videoRef.current.currentTime;
    setCurrentTime(t);

    // Draw active bounding boxes on overlay canvas
    drawOverlayBoundingBoxes(t);
  };

  const handleLoadedMetadata = () => {
    if (!videoRef.current) return;
    setDuration(videoRef.current.duration || 28);
  };

  // Seek helper
  const seekTo = (seconds: number) => {
    if (!videoRef.current) return;
    const clamped = Math.max(0, Math.min(seconds, duration));
    videoRef.current.currentTime = clamped;
    setCurrentTime(clamped);
    drawOverlayBoundingBoxes(clamped);
  };

  const togglePlay = () => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
      setIsPlaying(false);
    } else {
      videoRef.current.play().catch(() => {});
      setIsPlaying(true);
    }
  };

  const handleStep = (deltaSeconds: number) => {
    seekTo(currentTime + deltaSeconds);
  };

  const handleSpeedChange = (rate: number) => {
    setPlaybackRate(rate);
    if (videoRef.current) {
      videoRef.current.playbackRate = rate;
    }
  };

  // Draw synchronized bounding boxes and tracking trajectory on the video overlay
  const drawOverlayBoundingBoxes = (timeSec: number) => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Resize canvas if needed
    if (canvas.width !== video.clientWidth || canvas.height !== video.clientHeight) {
      canvas.width = video.clientWidth;
      canvas.height = video.clientHeight;
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const cW = canvas.width;
    const cH = canvas.height;

    // Find entities active around this timestamp (±0.8s)
    const activeEntities = analysisResult.entities.filter(
      (ent) => timeSec >= ent.firstSeenSec - 0.5 && timeSec <= ent.lastSeenSec + 0.5
    );

    activeEntities.forEach((entity) => {
      // Find closest keyframe to current time
      if (!entity.keyframes || entity.keyframes.length === 0) return;

      let closest = entity.keyframes[0];
      let minDiff = Math.abs(timeSec - closest.timestampSec);

      for (const kf of entity.keyframes) {
        const diff = Math.abs(timeSec - kf.timestampSec);
        if (diff < minDiff) {
          minDiff = diff;
          closest = kf;
        }
      }

      if (minDiff > 2.5) return; // Beyond temporal vicinity

      const isSelected = selectedEntityId === entity.id;
      const isRunner = entity.primaryActivity === 'running';
      const isObject = entity.type === 'object';

      const strokeColor = isSelected
        ? '#3b82f6'
        : isRunner
        ? '#ef4444'
        : isObject
        ? '#f59e0b'
        : '#10b981';

      const x = closest.bbox.x * cW;
      const y = closest.bbox.y * cH;
      const w = closest.bbox.width * cW;
      const h = closest.bbox.height * cH;

      // Draw bounding box
      ctx.lineWidth = isSelected ? 3 : 2;
      ctx.strokeStyle = strokeColor;
      ctx.strokeRect(x, y, w, h);

      // Label banner
      ctx.fillStyle = isSelected ? 'rgba(59, 130, 246, 0.9)' : 'rgba(0, 0, 0, 0.75)';
      ctx.fillRect(x, Math.max(0, y - 20), Math.min(180, w + 30), 20);

      ctx.fillStyle = '#ffffff';
      ctx.font = '11px monospace';
      ctx.fillText(`${entity.id} [${entity.primaryActivity}]`, x + 4, Math.max(14, y - 6));
    });
  };

  // Run full dynamic video understanding analysis
  const handleRunAnalysis = async () => {
    if (!videoRef.current) return;
    setIsAnalyzing(true);
    setAnalysisProgress({ percent: 5, stage: 'Starting video decoder...' });

    try {
      const currentName =
        selectedSourceType === 'upload'
          ? customVideoName || 'Uploaded Clip'
          : selectedSourceType === 'camera'
          ? cameras.find((c) => c.id === selectedSourceId)?.name || 'Surveillance Stream'
          : SAMPLE_FEED_PRESETS.find((p) => p.id === selectedSourceId)?.name || 'Surveillance Feed';

      const result = await analyzeVideoElement(videoRef.current, currentName, (percent, stage) => {
        setAnalysisProgress({ percent, stage });
      });

      setAnalysisResult(result);
      setQueryAnswer(null);
    } catch (err) {
      console.error('Video understanding failed:', err);
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Scoped Query Execution
  const handleExecuteQuery = (queryText: string) => {
    if (!queryText.trim()) return;
    setIsQuerying(true);
    setTimeout(() => {
      const ans = queryFootageIntelligence(queryText, analysisResult);
      setQueryAnswer(ans);
      setIsQuerying(false);
    }, 200);
  };

  // Generate Formal Report
  const handleOpenReport = () => {
    const report = generateIncidentReport(analysisResult);
    setIncidentReport(report);
    setIsReportOpen(true);
  };

  // Handle local video file upload (click or drag & drop)
  const handleFileUpload = (file: File) => {
    if (!file.type.startsWith('video/')) {
      alert('Please select a valid video file (MP4, WebM, MOV).');
      return;
    }
    const url = URL.createObjectURL(file);
    setCustomVideoUrl(url);
    setCustomVideoName(file.name);
    setSelectedSourceType('upload');
    setSelectedSourceId(`upload-${Date.now()}`);
  };

  // Query chips suggestions
  const suggestedQueries = [
    'Did anyone run?',
    'Show all vehicles and plates',
    'Did anyone leave a bag or package?',
    'Who entered the area after 00:10?',
    'What interactions occurred between subjects?',
  ];

  // Highest severity score calculation
  const maxRisk = Math.max(...analysisResult.flaggedEvents.map((f) => f.riskScore), 45);

  return (
    <div id="footage-intelligence-container" className="flex flex-col h-full bg-neutral-950 text-neutral-100 overflow-y-auto">
      {/* Top Header / Control Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-800 bg-neutral-900/80 px-4 py-3 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400 shadow-sm">
            <BrainCircuit className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-bold tracking-tight text-neutral-100">
                Footage Intelligence Engine
              </h1>
              <span className="rounded bg-amber-500/20 text-amber-400 border border-amber-500/30 px-1.5 py-0.2 text-[10px] font-semibold uppercase tracking-wider">
                Video Understanding
              </span>
            </div>
            <p className="text-[11px] text-neutral-400">
              Multi-layered entity tracking, activity recognition, risk scoring, & traceable incident reports
            </p>
          </div>
        </div>

        {/* Source Selector & Main Actions */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Preset / Camera / Upload dropdown */}
          <div className="flex items-center gap-1 bg-neutral-950 border border-neutral-800 rounded-lg p-1">
            <button
              type="button"
              onClick={() => {
                setSelectedSourceType('preset');
                setSelectedSourceId('sample-pedestrian-2');
              }}
              className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                selectedSourceType === 'preset' ? 'bg-neutral-800 text-neutral-100 font-semibold' : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              Presets
            </button>
            {cameras.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setSelectedSourceType('camera');
                  setSelectedSourceId(cameras[0].id);
                }}
                className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                  selectedSourceType === 'camera' ? 'bg-neutral-800 text-neutral-100 font-semibold' : 'text-neutral-400 hover:text-neutral-200'
                }`}
              >
                Cameras ({cameras.length})
              </button>
            )}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className={`flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                selectedSourceType === 'upload' ? 'bg-neutral-800 text-neutral-100 font-semibold' : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              <Upload className="h-3 w-3" />
              Upload
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="video/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFileUpload(f);
              }}
            />
          </div>

          {/* Sub-selector for Preset or Camera */}
          {selectedSourceType === 'preset' && (
            <select
              value={selectedSourceId}
              onChange={(e) => setSelectedSourceId(e.target.value)}
              className="bg-neutral-900 border border-neutral-800 rounded-lg px-2.5 py-1.5 text-xs text-neutral-200 focus:outline-none focus:ring-1 focus:ring-amber-500"
            >
              {SAMPLE_FEED_PRESETS.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.name}
                </option>
              ))}
            </select>
          )}

          {selectedSourceType === 'camera' && cameras.length > 0 && (
            <select
              value={selectedSourceId}
              onChange={(e) => setSelectedSourceId(e.target.value)}
              className="bg-neutral-900 border border-neutral-800 rounded-lg px-2.5 py-1.5 text-xs text-neutral-200 focus:outline-none focus:ring-1 focus:ring-amber-500"
            >
              {cameras.map((cam) => (
                <option key={cam.id} value={cam.id}>
                  {cam.name}
                </option>
              ))}
            </select>
          )}

          {/* Action: Run AI Analysis */}
          <button
            type="button"
            disabled={isAnalyzing}
            onClick={handleRunAnalysis}
            className="flex items-center gap-1.5 rounded-lg bg-neutral-800 border border-neutral-700 hover:bg-neutral-700 px-3 py-1.5 text-xs font-semibold text-neutral-100 transition-colors disabled:opacity-50"
          >
            <Zap className={`h-3.5 w-3.5 text-amber-400 ${isAnalyzing ? 'animate-spin' : ''}`} />
            <span>{isAnalyzing ? 'Analyzing...' : 'Re-analyze with AI'}</span>
          </button>

          {/* Action: Generate Incident Report */}
          <button
            type="button"
            onClick={handleOpenReport}
            className="flex items-center gap-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-neutral-950 px-3 py-1.5 text-xs font-bold transition-colors shadow-sm"
          >
            <FileText className="h-3.5 w-3.5" />
            <span>Generate Incident Report</span>
          </button>
        </div>
      </div>

      {/* Analysis Progress Bar Banner */}
      {isAnalyzing && (
        <div className="bg-amber-950/40 border-b border-amber-900/50 px-4 py-2 flex items-center justify-between text-xs text-amber-300">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-amber-400 animate-ping" />
            <span className="font-mono">{analysisProgress.stage}</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-32 bg-neutral-800 rounded-full h-2 overflow-hidden">
              <div
                className="bg-amber-400 h-full transition-all duration-300 rounded-full"
                style={{ width: `${analysisProgress.percent}%` }}
              />
            </div>
            <span className="font-mono font-bold">{analysisProgress.percent}%</span>
          </div>
        </div>
      )}

      {/* Main Grid: Video Player (Left) + Multi-Layer Intelligence Tabs (Right) */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-0 overflow-hidden">
        {/* LEFT COLUMN: Video Player & Timeline Controls (5 Cols) */}
        <div className="lg:col-span-6 flex flex-col border-r border-neutral-800 bg-neutral-950 p-4 space-y-3 overflow-y-auto">
          {/* Video Player Card */}
          <div
            className={`relative rounded-xl border overflow-hidden bg-black aspect-video flex items-center justify-center ${
              isDraggingOver ? 'border-amber-400 ring-2 ring-amber-400/50' : 'border-neutral-800'
            }`}
            onDragOver={(e) => {
              e.preventDefault();
              setIsDraggingOver(true);
            }}
            onDragLeave={() => setIsDraggingOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDraggingOver(false);
              const f = e.dataTransfer.files?.[0];
              if (f) handleFileUpload(f);
            }}
          >
            <video
              ref={videoRef}
              src={activeVideoUrl}
              crossOrigin="anonymous"
              playsInline
              muted={isMuted}
              onTimeUpdate={handleTimeUpdate}
              onLoadedMetadata={handleLoadedMetadata}
              className="w-full h-full object-contain cursor-pointer"
              onClick={togglePlay}
            />

            {/* Bounding Box & Trajectory Canvas Overlay */}
            <canvas
              ref={canvasRef}
              className="absolute inset-0 pointer-events-none w-full h-full"
            />

            {/* Drag & Drop Prompt Overlay when dragging */}
            {isDraggingOver && (
              <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center text-amber-400 pointer-events-none">
                <Upload className="h-10 w-10 mb-2 animate-bounce" />
                <p className="text-sm font-bold">Drop surveillance video file here</p>
              </div>
            )}

            {/* Top Video Status Badges */}
            <div className="absolute top-3 left-3 flex items-center gap-2">
              <span className="inline-flex items-center gap-1 rounded bg-black/70 backdrop-blur-md px-2 py-0.5 font-mono text-[11px] font-semibold text-neutral-200 border border-neutral-700">
                <Clock className="h-3 w-3 text-amber-400" />
                {formatTimeSec(currentTime)} / {formatTimeSec(duration)}
              </span>

              {selectedEntityId && (
                <span className="inline-flex items-center gap-1 rounded bg-blue-900/80 px-2 py-0.5 font-mono text-[11px] font-semibold text-blue-200 border border-blue-700">
                  Tracking: {selectedEntityId}
                </span>
              )}
            </div>

            {/* Quick Play Overlay on Pause */}
            {!isPlaying && (
              <button
                type="button"
                onClick={togglePlay}
                className="absolute inset-0 m-auto h-12 w-12 rounded-full bg-black/60 border border-neutral-700 flex items-center justify-center text-neutral-100 hover:bg-amber-500 hover:text-neutral-950 transition-colors"
                title="Play Video"
              >
                <Play className="h-5 w-5 fill-current ml-0.5" />
              </button>
            )}
          </div>

          {/* Timeline Scrubber with Color-Coded Event Markers */}
          <div className="space-y-1.5 bg-neutral-900/50 p-3 rounded-xl border border-neutral-800">
            {/* Timeline track with flagged alert pins */}
            <div className="relative w-full">
              <input
                type="range"
                min={0}
                max={duration || 28}
                step={0.1}
                value={currentTime}
                onChange={(e) => seekTo(parseFloat(e.target.value))}
                className="w-full h-2 bg-neutral-800 rounded-lg appearance-none cursor-pointer accent-amber-500 focus:outline-none"
              />

              {/* Event Markers Overlay on Scrubber */}
              <div className="absolute top-0 left-0 w-full h-2 pointer-events-none flex items-center">
                {analysisResult.flaggedEvents.map((ev) => {
                  const pct = Math.min(100, Math.max(0, (ev.timestampSec / duration) * 100));
                  return (
                    <span
                      key={ev.id}
                      className="absolute top-1/2 -translate-y-1/2 h-3 w-1 rounded-full bg-red-500 shadow-sm"
                      style={{ left: `${pct}%` }}
                      title={`[${ev.formattedTime}] ${ev.title}`}
                    />
                  );
                })}
              </div>
            </div>

            {/* Player Controls */}
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={togglePlay}
                  className="p-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 transition-colors"
                  title={isPlaying ? 'Pause' : 'Play'}
                >
                  {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 fill-current" />}
                </button>

                <button
                  type="button"
                  onClick={() => handleStep(-1)}
                  className="px-2 py-1 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-[11px] font-mono font-medium text-neutral-300"
                  title="Step Back 1s"
                >
                  -1s
                </button>

                <button
                  type="button"
                  onClick={() => handleStep(1)}
                  className="px-2 py-1 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-[11px] font-mono font-medium text-neutral-300"
                  title="Step Forward 1s"
                >
                  +1s
                </button>

                <button
                  type="button"
                  onClick={() => seekTo(0)}
                  className="p-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300"
                  title="Reset to 00:00"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                </button>

                <button
                  type="button"
                  onClick={() => setIsMuted(!isMuted)}
                  className="p-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300"
                  title={isMuted ? 'Unmute' : 'Mute'}
                >
                  {isMuted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
                </button>
              </div>

              {/* Speed & Timecode */}
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1 bg-neutral-950 border border-neutral-800 rounded px-1.5 py-0.5 text-[11px]">
                  <span className="text-neutral-400">Speed:</span>
                  {[0.5, 1, 1.5, 2].map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => handleSpeedChange(s)}
                      className={`px-1 rounded ${
                        playbackRate === s ? 'text-amber-400 font-bold' : 'text-neutral-400 hover:text-neutral-200'
                      }`}
                    >
                      {s}x
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Quick Jump Timeline Strip: Clickable key events */}
          <div className="rounded-xl border border-neutral-800 bg-neutral-900/40 p-3">
            <span className="text-[11px] font-bold uppercase tracking-wider text-neutral-400 block mb-2">
              Key Evidence Moments (Click to Jump)
            </span>
            <div className="flex flex-wrap gap-1.5">
              {analysisResult.flaggedEvents.map((fe) => (
                <button
                  key={fe.id}
                  type="button"
                  onClick={() => seekTo(fe.timestampSec)}
                  className="inline-flex items-center gap-1 rounded bg-red-950/40 border border-red-800/60 px-2 py-1 text-xs text-red-300 hover:bg-red-900/60 transition-colors"
                >
                  <Play className="h-3 w-3 fill-red-300 shrink-0" />
                  <span className="font-mono font-bold">[{fe.formattedTime}]</span>
                  <span className="truncate max-w-[140px]">{fe.title}</span>
                </button>
              ))}

              {analysisResult.interactions.map((int) => (
                <button
                  key={int.id}
                  type="button"
                  onClick={() => seekTo(int.evidenceTimestampSec)}
                  className="inline-flex items-center gap-1 rounded bg-neutral-800 border border-neutral-700 px-2 py-1 text-xs text-neutral-300 hover:bg-neutral-700 transition-colors"
                >
                  <Play className="h-3 w-3 fill-amber-400 shrink-0" />
                  <span className="font-mono text-amber-400">[{formatTimeSec(int.evidenceTimestampSec)}]</span>
                  <span>Interaction</span>
                </button>
              ))}
            </div>
          </div>

          {/* File Upload / Drop Area */}
          <div
            onClick={() => fileInputRef.current?.click()}
            className="rounded-xl border border-dashed border-neutral-800 hover:border-neutral-700 bg-neutral-900/20 p-3 text-center cursor-pointer transition-colors text-xs text-neutral-400 flex items-center justify-center gap-2"
          >
            <Upload className="h-4 w-4 text-amber-400" />
            <span>Upload custom surveillance footage (MP4, WebM) or drag & drop</span>
          </div>
        </div>

        {/* RIGHT COLUMN: 6 Intelligence Layers (6 Cols) */}
        <div className="lg:col-span-6 flex flex-col bg-neutral-950 overflow-hidden">
          {/* Layer Tabs Header */}
          <div className="flex items-center overflow-x-auto border-b border-neutral-800 bg-neutral-900/50 px-3 py-2 gap-1 shrink-0">
            <button
              type="button"
              onClick={() => setActiveLayerTab('summary')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                activeLayerTab === 'summary'
                  ? 'bg-neutral-800 text-neutral-100 font-semibold'
                  : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              <Compass className="h-3.5 w-3.5 text-amber-400" />
              1. Scene Summary
            </button>

            <button
              type="button"
              onClick={() => setActiveLayerTab('entities')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                activeLayerTab === 'entities'
                  ? 'bg-neutral-800 text-neutral-100 font-semibold'
                  : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              <User className="h-3.5 w-3.5 text-blue-400" />
              2. Entities ({analysisResult.entities.length})
            </button>

            <button
              type="button"
              onClick={() => setActiveLayerTab('activities')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                activeLayerTab === 'activities'
                  ? 'bg-neutral-800 text-neutral-100 font-semibold'
                  : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              <Activity className="h-3.5 w-3.5 text-emerald-400" />
              3. Activities ({analysisResult.activities.length})
            </button>

            <button
              type="button"
              onClick={() => setActiveLayerTab('interactions')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                activeLayerTab === 'interactions'
                  ? 'bg-neutral-800 text-neutral-100 font-semibold'
                  : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              <Users className="h-3.5 w-3.5 text-purple-400" />
              4. Interactions ({analysisResult.interactions.length})
            </button>

            <button
              type="button"
              onClick={() => setActiveLayerTab('events')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                activeLayerTab === 'events'
                  ? 'bg-neutral-800 text-neutral-100 font-semibold'
                  : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              <ShieldAlert className="h-3.5 w-3.5 text-red-400" />
              5. Risk Alerts ({analysisResult.flaggedEvents.length})
            </button>

            <button
              type="button"
              onClick={() => setActiveLayerTab('query')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                activeLayerTab === 'query'
                  ? 'bg-amber-500/20 text-amber-300 font-semibold border border-amber-500/30'
                  : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              <Search className="h-3.5 w-3.5 text-amber-400" />
              6. Video Q&A
            </button>
          </div>

          {/* Layer Content Viewport */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {/* ================= LAYER 1: SCENE SUMMARY ================= */}
            {activeLayerTab === 'summary' && (
              <div className="space-y-4">
                {/* Executive Assessment Card */}
                <div className="rounded-xl border border-neutral-800 bg-neutral-900/40 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                      <Compass className="h-4 w-4" />
                      Scene Intelligence Summary
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded text-xs font-bold font-mono ${
                        maxRisk >= 80
                          ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                          : maxRisk >= 60
                          ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                          : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                      }`}
                    >
                      {maxRisk >= 80 ? 'CRITICAL RISK' : maxRisk >= 60 ? 'ELEVATED RISK' : 'NORMAL ACTIVITY'}
                    </span>
                  </div>

                  <p className="text-sm text-neutral-200 leading-relaxed font-normal">
                    {analysisResult.sceneSummary}
                  </p>
                </div>

                {/* Stat Counters Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="rounded-lg border border-neutral-800 bg-neutral-900/30 p-3">
                    <span className="text-[11px] text-neutral-400 block">Entities Tracked</span>
                    <span className="text-xl font-mono font-bold text-neutral-100 mt-1 block">
                      {analysisResult.entities.length}
                    </span>
                    <span className="text-[10px] text-emerald-400">100% ID Stability</span>
                  </div>

                  <div className="rounded-lg border border-neutral-800 bg-neutral-900/30 p-3">
                    <span className="text-[11px] text-neutral-400 block">Activities Classified</span>
                    <span className="text-xl font-mono font-bold text-neutral-100 mt-1 block">
                      {analysisResult.activities.length}
                    </span>
                    <span className="text-[10px] text-neutral-400">Controlled Vocabulary</span>
                  </div>

                  <div className="rounded-lg border border-neutral-800 bg-neutral-900/30 p-3">
                    <span className="text-[11px] text-neutral-400 block">Interactions Logged</span>
                    <span className="text-xl font-mono font-bold text-neutral-100 mt-1 block">
                      {analysisResult.interactions.length}
                    </span>
                    <span className="text-[10px] text-purple-400">Proximity Analyzed</span>
                  </div>

                  <div className="rounded-lg border border-neutral-800 bg-neutral-900/30 p-3">
                    <span className="text-[11px] text-neutral-400 block">Security Risk Flags</span>
                    <span className="text-xl font-mono font-bold text-red-400 mt-1 block">
                      {analysisResult.flaggedEvents.length}
                    </span>
                    <span className="text-[10px] text-red-400 font-mono">Max: {maxRisk}/100</span>
                  </div>
                </div>

                {/* Quick Action to Generate Full Report */}
                <div className="rounded-xl border border-amber-500/20 bg-amber-950/20 p-4 flex flex-col sm:flex-row items-center justify-between gap-3">
                  <div className="space-y-0.5 text-center sm:text-left">
                    <h4 className="text-xs font-bold text-amber-300">
                      Need a formal, audit-ready security incident document?
                    </h4>
                    <p className="text-[11px] text-neutral-400">
                      Generates a full forensic report with clickable timestamps for every claim.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleOpenReport}
                    className="rounded-lg bg-amber-500 px-3.5 py-1.5 text-xs font-bold text-neutral-950 hover:bg-amber-400 transition-colors shrink-0"
                  >
                    View Formal Report
                  </button>
                </div>
              </div>
            )}

            {/* ================= LAYER 2: ENTITY TIMELINE ================= */}
            {activeLayerTab === 'entities' && (
              <div className="space-y-3">
                {/* Filter Row */}
                <div className="flex items-center justify-between">
                  <span className="text-xs text-neutral-400">Filter by Classification:</span>
                  <div className="flex items-center gap-1 bg-neutral-900 p-1 rounded-lg border border-neutral-800 text-xs">
                    {(['all', 'person', 'vehicle', 'object'] as const).map((type) => (
                      <button
                        key={type}
                        type="button"
                        onClick={() => setEntityFilter(type)}
                        className={`px-2.5 py-1 rounded capitalize font-medium ${
                          entityFilter === type
                            ? 'bg-neutral-800 text-neutral-100 font-semibold'
                            : 'text-neutral-400 hover:text-neutral-200'
                        }`}
                      >
                        {type}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Entity Cards */}
                <div className="space-y-3">
                  {analysisResult.entities
                    .filter((e) => entityFilter === 'all' || e.type === entityFilter)
                    .map((entity) => {
                      const isSelected = selectedEntityId === entity.id;

                      return (
                        <div
                          key={entity.id}
                          className={`rounded-xl border transition-all p-4 space-y-3 ${
                            isSelected
                              ? 'border-blue-500 bg-blue-950/20'
                              : 'border-neutral-800 bg-neutral-900/30 hover:border-neutral-700'
                          }`}
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex items-center gap-2.5">
                              <span
                                className="h-3 w-3 rounded-full shrink-0"
                                style={{ backgroundColor: entity.appearance.colorHex || '#94a3b8' }}
                                title={`Primary Color: ${entity.appearance.primaryColor}`}
                              />
                              <div>
                                <h4 className="text-xs font-bold text-neutral-100 font-mono">
                                  {entity.id} — {entity.displayLabel}
                                </h4>
                                <p className="text-[11px] text-neutral-400">
                                  {entity.appearance.clothingDescription ||
                                    entity.appearance.vehicleTypeDescription ||
                                    entity.appearance.primaryColor}
                                </p>
                              </div>
                            </div>

                            <div className="flex items-center gap-2">
                              <span className="rounded bg-neutral-800 px-2 py-0.5 font-mono text-[11px] text-neutral-300">
                                {entity.formattedTimeRange}
                              </span>
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedEntityId(isSelected ? null : entity.id);
                                  seekTo(entity.firstSeenSec);
                                }}
                                className={`px-2 py-0.5 rounded text-xs font-semibold ${
                                  isSelected
                                    ? 'bg-blue-600 text-white'
                                    : 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700'
                                }`}
                              >
                                {isSelected ? 'Focused' : 'Focus'}
                              </button>
                            </div>
                          </div>

                          {/* Movement Path Description */}
                          <div className="text-xs text-neutral-300 bg-neutral-950/60 p-2 rounded-lg border border-neutral-800/80">
                            <span className="text-neutral-500 font-medium block text-[10px] uppercase">
                              Observed Trajectory
                            </span>
                            {entity.movementPath}
                          </div>

                          {/* Clickable Waypoints */}
                          <div>
                            <span className="text-[10px] text-neutral-500 uppercase tracking-wider block mb-1.5">
                              Waypoint Checkpoints (Click to Seek)
                            </span>
                            <div className="flex flex-wrap gap-1.5">
                              {entity.pathWaypoints.map((wp, idx) => (
                                <button
                                  key={idx}
                                  type="button"
                                  onClick={() => seekTo(wp.timestampSec)}
                                  className="inline-flex items-center gap-1 rounded bg-neutral-800 hover:bg-amber-500/20 hover:text-amber-300 border border-neutral-700 px-2 py-1 text-[11px] text-neutral-300 transition-colors"
                                  title={wp.description}
                                >
                                  <Play className="h-2.5 w-2.5 fill-amber-400 text-amber-400" />
                                  <span className="font-mono font-semibold">[{wp.formattedTime}]</span>
                                  <span className="truncate max-w-[120px]">{wp.description}</span>
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>
            )}

            {/* ================= LAYER 3: ACTIVITY RECOGNITION ================= */}
            {activeLayerTab === 'activities' && (
              <div className="space-y-3">
                {/* Controlled Vocabulary Header */}
                <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-neutral-400 bg-neutral-900/40 p-2 rounded-lg border border-neutral-800">
                  <span className="font-semibold text-neutral-300">Vocabulary:</span>
                  {[
                    'all',
                    'walking',
                    'running',
                    'entering',
                    'exiting',
                    'picking up',
                    'dropping',
                    'interacting',
                    'gathering',
                  ].map((act) => (
                    <button
                      key={act}
                      type="button"
                      onClick={() => setActivityFilter(act)}
                      className={`px-2 py-0.5 rounded capitalize ${
                        activityFilter === act
                          ? 'bg-amber-500/20 text-amber-300 font-bold border border-amber-500/40'
                          : 'bg-neutral-800 text-neutral-400 hover:text-neutral-200'
                      }`}
                    >
                      {act}
                    </button>
                  ))}
                </div>

                {/* Activity Event Cards */}
                <div className="space-y-2">
                  {analysisResult.activities
                    .filter((a) => activityFilter === 'all' || a.activity === activityFilter)
                    .map((act) => (
                      <div
                        key={act.id}
                        className="rounded-lg border border-neutral-800 bg-neutral-900/30 p-3 flex items-start justify-between gap-3 hover:border-neutral-700 transition-colors"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => seekTo(act.startSec)}
                              className="inline-flex items-center gap-1 rounded bg-neutral-800 px-2 py-0.5 font-mono text-xs font-semibold text-amber-400 hover:bg-neutral-700 border border-neutral-700 transition-colors"
                              title="Seek to activity start"
                            >
                              <Play className="h-3 w-3 fill-amber-400" />
                              [{act.formattedRange}]
                            </button>
                            <span className="font-bold text-xs text-neutral-200 uppercase tracking-wide">
                              {act.activity}
                            </span>
                            <span className="text-xs text-neutral-400 font-mono">
                              ({act.entityLabel})
                            </span>
                          </div>
                          <p className="text-xs text-neutral-300 leading-normal">{act.reason}</p>
                        </div>

                        <span className="rounded bg-neutral-800 px-2 py-0.5 font-mono text-[11px] text-emerald-400 border border-neutral-700 shrink-0">
                          {act.confidence}% Conf.
                        </span>
                      </div>
                    ))}
                </div>
              </div>
            )}

            {/* ================= LAYER 4: RELATIONSHIPS & INTERACTIONS ================= */}
            {activeLayerTab === 'interactions' && (
              <div className="space-y-3">
                {analysisResult.interactions.length === 0 ? (
                  <div className="text-center py-8 text-neutral-500 text-xs">
                    No multi-entity convergence or close-proximity interactions were observed in this clip.
                  </div>
                ) : (
                  analysisResult.interactions.map((int) => (
                    <div
                      key={int.id}
                      className="rounded-xl border border-neutral-800 bg-neutral-900/30 p-4 space-y-3"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="flex h-6 w-6 items-center justify-center rounded bg-purple-500/20 text-purple-400 text-xs">
                            <Users className="h-3.5 w-3.5" />
                          </span>
                          <h4 className="text-xs font-bold text-neutral-100">
                            {int.sourceEntityLabel} & {int.targetEntityLabel}
                          </h4>
                        </div>

                        <button
                          type="button"
                          onClick={() => seekTo(int.evidenceTimestampSec)}
                          className="inline-flex items-center gap-1 rounded bg-neutral-800 px-2.5 py-1 font-mono text-xs font-bold text-amber-400 hover:bg-neutral-700 border border-neutral-700 transition-colors"
                        >
                          <Play className="h-3 w-3 fill-amber-400" />
                          [{formatTimeSec(int.evidenceTimestampSec)}] Seek Evidence
                        </button>
                      </div>

                      <p className="text-xs text-neutral-300 leading-relaxed">{int.description}</p>

                      <div className="grid grid-cols-3 gap-2 pt-2 border-t border-neutral-800/80 text-[11px] font-mono">
                        <div>
                          <span className="text-neutral-500 block">Proximity</span>
                          <span className="text-neutral-200">
                            {(int.proximityDistance * 12).toFixed(1)} meters
                          </span>
                        </div>
                        <div>
                          <span className="text-neutral-500 block">Dwell Time</span>
                          <span className="text-neutral-200">{int.dwellDurationSec}s</span>
                        </div>
                        <div>
                          <span className="text-neutral-500 block">Confidence</span>
                          <span className="text-emerald-400">{int.confidence}%</span>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* ================= LAYER 5: FLAGGED EVENTS & RISK SCORING ================= */}
            {activeLayerTab === 'events' && (
              <div className="space-y-3">
                {analysisResult.flaggedEvents.map((event) => (
                  <div
                    key={event.id}
                    className={`rounded-xl border p-4 space-y-3 ${
                      event.riskScore >= 80
                        ? 'border-red-900/60 bg-red-950/20'
                        : 'border-amber-900/60 bg-amber-950/20'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => seekTo(event.timestampSec)}
                            className="inline-flex items-center gap-1 rounded bg-black/40 px-2 py-0.5 font-mono text-xs font-bold text-amber-300 hover:bg-black/70 border border-neutral-700 transition-colors"
                          >
                            <Play className="h-3 w-3 fill-amber-300" />
                            [{event.formattedTime}]
                          </button>
                          <h4 className="text-xs font-bold text-neutral-100">{event.title}</h4>
                        </div>
                        <p className="text-xs text-neutral-300">{event.reason}</p>
                      </div>

                      <div className="text-right font-mono shrink-0">
                        <span className="text-xs text-neutral-400 block">Risk Score</span>
                        <span className="text-base font-bold text-red-400">
                          {event.riskScore}/100
                        </span>
                      </div>
                    </div>

                    {/* Rule Threshold Explanation */}
                    <div className="bg-black/40 p-2.5 rounded-lg border border-neutral-800 text-[11px] text-neutral-400">
                      <span className="text-neutral-300 font-semibold">Violation Threshold: </span>
                      {event.thresholdCrossed}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* ================= LAYER 6: NATURAL-LANGUAGE QUERY ================= */}
            {activeLayerTab === 'query' && (
              <div className="space-y-4">
                {/* Search Input Bar */}
                <div className="space-y-2">
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="Ask anything about this footage (e.g., Did anyone run? Show vehicles...)"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleExecuteQuery(searchQuery);
                      }}
                      className="w-full rounded-xl border border-neutral-700 bg-neutral-900 px-4 py-2.5 pl-10 text-xs text-neutral-100 placeholder-neutral-500 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
                    />
                    <Search className="absolute left-3.5 top-3 h-4 w-4 text-neutral-400" />
                  </div>

                  {/* Suggested Query Chips */}
                  <div className="flex flex-wrap gap-1.5">
                    {suggestedQueries.map((q, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => {
                          setSearchQuery(q);
                          handleExecuteQuery(q);
                        }}
                        className="rounded-full border border-neutral-800 bg-neutral-900/60 px-2.5 py-1 text-[11px] text-neutral-300 hover:border-amber-500/50 hover:text-amber-300 transition-colors"
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Grounded Query Answer Card */}
                {isQuerying ? (
                  <div className="p-6 rounded-xl border border-neutral-800 bg-neutral-900/30 text-center text-xs text-neutral-400 flex items-center justify-center gap-2">
                    <Sparkles className="h-4 w-4 text-amber-400 animate-spin" />
                    <span>Searching multi-layer video comprehension index...</span>
                  </div>
                ) : queryAnswer ? (
                  <div className="rounded-xl border border-amber-500/30 bg-amber-950/10 p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-amber-400 flex items-center gap-1.5">
                        <Sparkles className="h-4 w-4" />
                        Grounded Answer
                      </span>
                      <span className="font-mono text-[11px] text-emerald-400">
                        {queryAnswer.groundingConfidence}% Grounding Confidence
                      </span>
                    </div>

                    <p className="text-xs sm:text-sm text-neutral-200 leading-relaxed font-normal">
                      {queryAnswer.answer}
                    </p>

                    {/* Relevant Clickable Timestamps */}
                    {queryAnswer.relevantTimestamps.length > 0 && (
                      <div className="pt-2 border-t border-neutral-800">
                        <span className="text-[11px] text-neutral-400 block mb-1.5">
                          Evidence Timestamps (Click to Seek):
                        </span>
                        <div className="flex flex-wrap gap-1.5">
                          {queryAnswer.relevantTimestamps.map((ts, idx) => (
                            <button
                              key={idx}
                              type="button"
                              onClick={() => seekTo(ts.timestampSec)}
                              className="inline-flex items-center gap-1 rounded bg-neutral-800 hover:bg-amber-500/20 hover:text-amber-300 border border-neutral-700 px-2.5 py-1 text-xs font-medium text-neutral-200 transition-colors"
                            >
                              <Play className="h-3 w-3 fill-amber-400 text-amber-400" />
                              <span className="font-mono font-bold text-amber-400">
                                [{ts.formattedTime}]
                              </span>
                              <span>{ts.label}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-6 text-neutral-500 text-xs">
                    Enter a query above or click a prompt chip to search across entities, activities, and events.
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Formal Incident Report Modal */}
      <IncidentReportModal
        isOpen={isReportOpen}
        onClose={() => setIsReportOpen(false)}
        report={incidentReport}
        onSeekToTimestamp={(sec) => seekTo(sec)}
      />
    </div>
  );
};
