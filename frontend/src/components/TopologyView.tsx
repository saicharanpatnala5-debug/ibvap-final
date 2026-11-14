import React from 'react';
import { Camera, MapPin, Radio, Shield, Video, Zap } from 'lucide-react';
import { CameraFeedItem } from '../types';

interface TopologyViewProps {
  cameras: CameraFeedItem[];
  onSelectCamera: (cameraId: string) => void;
}

export const TopologyView: React.FC<TopologyViewProps> = ({
  cameras,
  onSelectCamera,
}) => {
  return (
    <div
      id="topology-view-container"
      className="flex flex-col h-full rounded-xl border border-neutral-800 bg-neutral-900 text-neutral-100 p-6 overflow-y-auto"
    >
      <div className="border-b border-neutral-800 pb-4">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-neutral-800 p-2 text-amber-400">
            <Radio className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-base font-semibold tracking-tight">
              Camera Network Topology & Spatial Coverage
            </h2>
            <p className="text-xs text-neutral-400">
              Inter-camera handoff vectors, active perimeter coverage, and video sensor health
            </p>
          </div>
        </div>
      </div>

      {cameras.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center text-neutral-500">
          <Camera className="h-10 w-10 text-neutral-600 mb-2" />
          <p className="text-sm font-medium text-neutral-400">No cameras deployed in network topology</p>
          <p className="mt-1 text-xs">Add one or more cameras to establish coverage mapping</p>
        </div>
      ) : (
        <div className="mt-6 space-y-6">
          {/* Visual Topology Diagram */}
          <div className="relative rounded-xl border border-neutral-800 bg-neutral-950 p-8 min-h-[320px] flex items-center justify-center overflow-hidden">
            {/* Background grid */}
            <div
              className="absolute inset-0 opacity-15"
              style={{
                backgroundImage:
                  'radial-gradient(circle at 1px 1px, rgba(255,255,255,0.2) 1px, transparent 0)',
                backgroundSize: '24px 24px',
              }}
            />

            {/* Render Nodes */}
            <div className="relative z-10 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-8 w-full max-w-4xl">
              {cameras.map((cam, idx) => (
                <div
                  key={cam.id}
                  id={`topo-node-${cam.id}`}
                  onClick={() => onSelectCamera(cam.id)}
                  className="cursor-pointer group relative rounded-xl border border-neutral-800 bg-neutral-900/90 p-4 transition-all hover:border-amber-500/60 hover:bg-neutral-850 shadow-lg"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="flex h-2 w-2 rounded-full bg-emerald-400" />
                      <span className="font-mono text-[10px] text-neutral-400">
                        NODE-{String(idx + 1).padStart(2, '0')}
                      </span>
                    </div>
                    <span className="rounded bg-neutral-800 px-1.5 py-0.5 font-mono text-[10px] text-neutral-300">
                      {cam.fps} FPS
                    </span>
                  </div>

                  <div className="mt-3 flex items-center gap-3">
                    <div className="rounded-lg bg-neutral-800 p-2 text-neutral-200 group-hover:text-amber-400 transition-colors">
                      <Video className="h-5 w-5" />
                    </div>
                    <div>
                      <h4 className="text-sm font-semibold text-neutral-100 group-hover:text-amber-300 transition-colors">
                        {cam.name}
                      </h4>
                      <p className="text-xs text-neutral-400">
                        {cam.sourceType === 'file' ? 'Local Recording' : 'IP Video Stream'}
                      </p>
                    </div>
                  </div>

                  <div className="mt-3 pt-3 border-t border-neutral-800/80 flex items-center justify-between text-xs text-neutral-400">
                    <span>Virtual Fences: {cam.zones.length}</span>
                    <span className="text-amber-400/80 group-hover:text-amber-400 font-medium">
                      View Feed →
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Camera Table details */}
          <div className="rounded-xl border border-neutral-800 bg-neutral-950 p-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-3">
              Ingested Camera Nodes Specification
            </h3>
            <div className="divide-y divide-neutral-800 text-xs">
              {cameras.map((cam) => (
                <div key={cam.id} className="py-2.5 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="h-2 w-2 rounded-full bg-emerald-400" />
                    <div>
                      <span className="font-medium text-neutral-200">{cam.name}</span>
                      <span className="text-neutral-500 ml-2 font-mono">({cam.id})</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-6 text-neutral-400">
                    <span>Status: <strong className="text-emerald-400 font-normal">Active Ingestion</strong></span>
                    <span>Zones: {cam.zones.length}</span>
                    <span>FPS: {cam.fps}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
