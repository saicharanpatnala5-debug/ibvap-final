import React, { useState } from 'react';
import { Camera, Grid2X2, LayoutGrid, Maximize2, Plus, Sparkles, Video } from 'lucide-react';
import { AlertIncident, CameraFeedItem } from '../types';
import { CameraFeed } from './CameraFeed';

interface CameraGridProps {
  cameras: CameraFeedItem[];
  onUpdateCamera: (updated: CameraFeedItem) => void;
  onRemoveCamera: (id: string) => void;
  onAlertGenerated: (alert: AlertIncident) => void;
  onSelectPlate: (plate: string, cropUrl?: string) => void;
  onOpenAddCamera: () => void;
  onAskAI?: (prompt: string) => void;
  reducedMotion?: boolean;
  seekTarget?: { cameraId: string; time: number } | null;
}

export const CameraGrid: React.FC<CameraGridProps> = ({
  cameras,
  onUpdateCamera,
  onRemoveCamera,
  onAlertGenerated,
  onSelectPlate,
  onOpenAddCamera,
  onAskAI,
  reducedMotion = false,
  seekTarget,
}) => {
  const [layoutColumns, setLayoutColumns] = useState<'auto' | '1' | '2' | '3'>('auto');

  // Empty state if no cameras
  if (cameras.length === 0) {
    return (
      <div
        id="camera-empty-state"
        className="flex flex-col items-center justify-center rounded-2xl border border-neutral-800/80 bg-neutral-900/60 p-12 sm:p-20 text-center text-neutral-100 shadow-xl"
      >
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-neutral-800 border border-neutral-700/60 text-amber-400 mb-6 shadow-md">
          <Camera className="h-8 w-8" />
        </div>

        <h2 className="text-xl font-bold tracking-tight sm:text-2xl text-neutral-100">
          No Ingested Cameras Active
        </h2>
        <p className="mt-2 max-w-md text-sm text-neutral-400">
          IBVAP processes video feeds locally using real-time AI object detection, ANPR, and configurable virtual fence tripwires.
        </p>

        <div className="mt-8 flex flex-col sm:flex-row items-center gap-3">
          <button
            id="empty-add-camera-btn"
            type="button"
            onClick={onOpenAddCamera}
            className="flex items-center gap-2 rounded-xl bg-amber-500 px-5 py-3 text-sm font-semibold text-neutral-950 hover:bg-amber-400 transition-colors shadow-lg focus:outline-none focus:ring-2 focus:ring-amber-400"
          >
            <Plus className="h-5 w-5" />
            + Add Camera Feed
          </button>
        </div>

        <div className="mt-10 grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-2xl text-left">
          <div className="rounded-xl border border-neutral-800 bg-neutral-950/40 p-4">
            <span className="text-xs font-semibold text-neutral-200 block mb-1">
              File Ingestion
            </span>
            <p className="text-xs text-neutral-400">
              Upload local CCTV recordings (.mp4, .webm, .mov) with full frame-stepping & playback scrubbing.
            </p>
          </div>
          <div className="rounded-xl border border-neutral-800 bg-neutral-950/40 p-4">
            <span className="text-xs font-semibold text-neutral-200 block mb-1">
              RTSP & IP Streams
            </span>
            <p className="text-xs text-neutral-400">
              Connect network surveillance camera streams directly via IP or HTTP/HLS protocols.
            </p>
          </div>
          <div className="rounded-xl border border-neutral-800 bg-neutral-950/40 p-4">
            <span className="text-xs font-semibold text-neutral-200 block mb-1">
              Test Presets Included
            </span>
            <p className="text-xs text-neutral-400">
              Instant 1-click test feeds available in the modal if you do not have local surveillance files ready.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Grid layout class determination
  let gridClass = 'grid grid-cols-1 gap-6';
  if (layoutColumns === '1') {
    gridClass = 'grid grid-cols-1 gap-6';
  } else if (layoutColumns === '2') {
    gridClass = 'grid grid-cols-1 lg:grid-cols-2 gap-6';
  } else if (layoutColumns === '3') {
    gridClass = 'grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6';
  } else {
    // auto
    if (cameras.length === 1) gridClass = 'grid grid-cols-1 gap-6';
    else if (cameras.length === 2) gridClass = 'grid grid-cols-1 lg:grid-cols-2 gap-6';
    else gridClass = 'grid grid-cols-1 lg:grid-cols-2 gap-6';
  }

  return (
    <div id="camera-grid-section" className="space-y-4">
      {/* Grid Controls Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium uppercase tracking-wider text-neutral-400">
            Active Video Feeds ({cameras.length})
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Layout switchers */}
          <div className="hidden sm:flex items-center rounded-lg border border-neutral-800 bg-neutral-950 p-0.5 text-xs text-neutral-400">
            <button
              id="grid-layout-auto"
              type="button"
              onClick={() => setLayoutColumns('auto')}
              className={`rounded px-2.5 py-1 ${
                layoutColumns === 'auto'
                  ? 'bg-neutral-800 text-white font-medium'
                  : 'hover:text-neutral-200'
              }`}
            >
              Auto Grid
            </button>
            <button
              id="grid-layout-1col"
              type="button"
              onClick={() => setLayoutColumns('1')}
              className={`rounded px-2.5 py-1 ${
                layoutColumns === '1'
                  ? 'bg-neutral-800 text-white font-medium'
                  : 'hover:text-neutral-200'
              }`}
            >
              Single Feed
            </button>
            <button
              id="grid-layout-2col"
              type="button"
              onClick={() => setLayoutColumns('2')}
              className={`rounded px-2.5 py-1 ${
                layoutColumns === '2'
                  ? 'bg-neutral-800 text-white font-medium'
                  : 'hover:text-neutral-200'
              }`}
            >
              2 Columns
            </button>
          </div>

          <button
            id="grid-add-camera-btn"
            type="button"
            onClick={onOpenAddCamera}
            className="flex items-center gap-1.5 rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-xs font-medium text-neutral-200 hover:bg-neutral-750 hover:text-white"
          >
            <Plus className="h-3.5 w-3.5" />
            Add Feed
          </button>
        </div>
      </div>

      {/* Camera Feeds Grid */}
      <div className={gridClass}>
        {cameras.map((camera) => (
          <CameraFeed
            key={camera.id}
            camera={camera}
            onUpdateCamera={onUpdateCamera}
            onRemoveCamera={onRemoveCamera}
            onAlertGenerated={onAlertGenerated}
            onSelectPlate={onSelectPlate}
            onAskAI={onAskAI}
            reducedMotion={reducedMotion}
            seekToTime={seekTarget?.cameraId === camera.id ? seekTarget.time : undefined}
          />
        ))}
      </div>
    </div>
  );
};
