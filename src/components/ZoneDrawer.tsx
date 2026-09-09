import React, { useState } from 'react';
import {
  Check,
  Plus,
  Shield,
  Trash2,
  X,
  Eye,
  EyeOff,
  AlertTriangle,
  MoveHorizontal,
  Square,
  Slash,
} from 'lucide-react';
import { CrossingDirection, ObjectClass, Point, VirtualZone, ZoneType } from '../types';

interface ZoneDrawerProps {
  cameraId: string;
  zones: VirtualZone[];
  onUpdateZones: (zones: VirtualZone[]) => void;
  isDrawingMode: boolean;
  onSetDrawingMode: (active: boolean) => void;
  currentDrawingType: ZoneType;
  onSetDrawingType: (type: ZoneType) => void;
  inProgressPoints: Point[];
  onClearInProgress: () => void;
  onSaveNewZone: (name: string, type: ZoneType, direction: CrossingDirection, classes: ObjectClass[]) => void;
}

export const ZoneDrawer: React.FC<ZoneDrawerProps> = ({
  cameraId,
  zones,
  onUpdateZones,
  isDrawingMode,
  onSetDrawingMode,
  currentDrawingType,
  onSetDrawingType,
  inProgressPoints,
  onClearInProgress,
  onSaveNewZone,
}) => {
  const [newZoneName, setNewZoneName] = useState('');
  const [direction, setDirection] = useState<CrossingDirection>('any');
  const [selectedClasses, setSelectedClasses] = useState<ObjectClass[]>([
    'person',
    'car',
    'truck',
    'bus',
    'motorcycle',
  ]);

  const toggleZoneActive = (zoneId: string) => {
    const updated = zones.map((z) =>
      z.id === zoneId ? { ...z, enabled: !z.enabled } : z
    );
    onUpdateZones(updated);
  };

  const deleteZone = (zoneId: string) => {
    onUpdateZones(zones.filter((z) => z.id !== zoneId));
  };

  const handleStartDrawing = (type: ZoneType) => {
    onSetDrawingType(type);
    onSetDrawingMode(true);
    onClearInProgress();
    setNewZoneName(
      type === 'line'
        ? `Virtual Fence ${zones.length + 1}`
        : `Restricted Area ${zones.length + 1}`
    );
  };

  const handleFinishDrawing = () => {
    const minPoints = currentDrawingType === 'line' ? 2 : 3;
    if (inProgressPoints.length < minPoints) return;

    onSaveNewZone(
      newZoneName.trim() || `Zone ${zones.length + 1}`,
      currentDrawingType,
      direction,
      selectedClasses
    );
    onSetDrawingMode(false);
    onClearInProgress();
    setNewZoneName('');
  };

  const handleCancelDrawing = () => {
    onSetDrawingMode(false);
    onClearInProgress();
    setNewZoneName('');
  };

  const toggleClass = (cls: ObjectClass) => {
    if (selectedClasses.includes(cls)) {
      setSelectedClasses(selectedClasses.filter((c) => c !== cls));
    } else {
      setSelectedClasses([...selectedClasses, cls]);
    }
  };

  return (
    <div
      id="zone-drawer-panel"
      className="rounded-xl border border-neutral-800 bg-neutral-900/90 p-4 text-neutral-100 backdrop-blur-md"
    >
      <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
        <div className="flex items-center gap-2">
          <Shield className="h-4 w-4 text-amber-400" />
          <h3 className="text-sm font-semibold tracking-wide">Virtual Fences & Restricted Zones</h3>
        </div>
        <span className="rounded bg-neutral-800 px-2 py-0.5 text-xs text-neutral-400">
          {zones.filter((z) => z.enabled).length}/{zones.length} active
        </span>
      </div>

      {/* Note that zones are off by default */}
      <div className="mt-2.5 text-[11px] text-neutral-400">
        Perimeter rules are strictly disabled by default. Configure custom tripwires or polygon boundaries below.
      </div>

      {/* In-progress drawing banner */}
      {isDrawingMode && (
        <div className="mt-3 rounded-lg border border-amber-500/50 bg-amber-500/10 p-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-amber-300">
              Drawing {currentDrawingType === 'line' ? 'Virtual Fence Line' : 'Restricted Polygon'}
            </span>
            <span className="text-[11px] text-amber-400/80">
              {inProgressPoints.length} point{inProgressPoints.length === 1 ? '' : 's'} placed
            </span>
          </div>
          <p className="mt-1 text-[11px] text-neutral-300">
            Click on the video canvas to plot points.{' '}
            {currentDrawingType === 'line'
              ? 'Click 2 points to define the line barrier.'
              : 'Click 3 or more points to form the boundary enclosure.'}
          </p>

          <div className="mt-3 space-y-2">
            <div>
              <label className="block text-[10px] font-medium uppercase tracking-wider text-neutral-400">
                Zone Name
              </label>
              <input
                type="text"
                value={newZoneName}
                onChange={(e) => setNewZoneName(e.target.value)}
                placeholder="e.g. North Perimeter Fence"
                className="mt-1 w-full rounded border border-neutral-700 bg-neutral-950 px-2.5 py-1.5 text-xs text-white focus:border-amber-500 focus:outline-none"
              />
            </div>

            {currentDrawingType === 'line' && (
              <div>
                <label className="block text-[10px] font-medium uppercase tracking-wider text-neutral-400">
                  Crossing Direction
                </label>
                <div className="mt-1 grid grid-cols-3 gap-1">
                  {(['any', 'left_to_right', 'right_to_left'] as const).map((dir) => (
                    <button
                      key={dir}
                      type="button"
                      onClick={() => setDirection(dir)}
                      className={`rounded border px-2 py-1 text-[10px] font-medium ${
                        direction === dir
                          ? 'border-amber-500 bg-amber-500/20 text-amber-300'
                          : 'border-neutral-800 bg-neutral-950 text-neutral-400'
                      }`}
                    >
                      {dir === 'any' && 'Bidirectional'}
                      {dir === 'left_to_right' && 'Left → Right'}
                      {dir === 'right_to_left' && 'Right → Left'}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div>
              <label className="block text-[10px] font-medium uppercase tracking-wider text-neutral-400">
                Trigger On Target Classes
              </label>
              <div className="mt-1 flex flex-wrap gap-1">
                {(['person', 'car', 'truck', 'bus', 'motorcycle', 'bicycle'] as ObjectClass[]).map(
                  (cls) => (
                    <button
                      key={cls}
                      type="button"
                      onClick={() => toggleClass(cls)}
                      className={`rounded px-2 py-0.5 text-[10px] font-medium capitalize ${
                        selectedClasses.includes(cls)
                          ? 'bg-amber-500 text-neutral-950'
                          : 'bg-neutral-800 text-neutral-400'
                      }`}
                    >
                      {cls}
                    </button>
                  )
                )}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={handleCancelDrawing}
                className="rounded bg-neutral-800 px-3 py-1 text-xs text-neutral-300 hover:bg-neutral-700"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={
                  inProgressPoints.length < (currentDrawingType === 'line' ? 2 : 3)
                }
                onClick={handleFinishDrawing}
                className="rounded bg-amber-500 px-3 py-1 text-xs font-semibold text-neutral-950 hover:bg-amber-400 disabled:opacity-40"
              >
                Save Zone
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Creation triggers */}
      {!isDrawingMode && (
        <div className="mt-3 flex gap-2">
          <button
            id="draw-line-fence-btn"
            type="button"
            onClick={() => handleStartDrawing('line')}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-neutral-800 bg-neutral-950/80 py-2 text-xs font-medium text-neutral-200 transition-colors hover:border-amber-500/50 hover:bg-neutral-800"
          >
            <Slash className="h-3.5 w-3.5 text-amber-400" />
            + Virtual Fence (Line)
          </button>
          <button
            id="draw-polygon-zone-btn"
            type="button"
            onClick={() => handleStartDrawing('polygon')}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-neutral-800 bg-neutral-950/80 py-2 text-xs font-medium text-neutral-200 transition-colors hover:border-amber-500/50 hover:bg-neutral-800"
          >
            <Square className="h-3.5 w-3.5 text-amber-400" />
            + Restricted Area (Polygon)
          </button>
        </div>
      )}

      {/* Existing zones list */}
      <div className="mt-4 space-y-2">
        {zones.length === 0 ? (
          <div className="rounded-lg border border-neutral-800/80 bg-neutral-950/40 p-4 text-center text-xs text-neutral-500">
            No virtual zones configured on this feed yet.
          </div>
        ) : (
          zones.map((zone) => (
            <div
              key={zone.id}
              className={`flex items-center justify-between rounded-lg border p-2.5 text-xs transition-colors ${
                zone.enabled
                  ? 'border-neutral-700 bg-neutral-950/80 text-neutral-200'
                  : 'border-neutral-800/50 bg-neutral-950/30 text-neutral-500'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: zone.color }}
                />
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="font-semibold text-neutral-100">{zone.name}</span>
                    <span className="rounded bg-neutral-800 px-1 py-0.2 text-[9px] uppercase font-mono text-neutral-400">
                      {zone.type}
                    </span>
                  </div>
                  <div className="text-[10px] text-neutral-400">
                    {zone.alertOnClasses.slice(0, 3).join(', ')}
                    {zone.alertOnClasses.length > 3 ? ` +${zone.alertOnClasses.length - 3}` : ''}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-1">
                <button
                  type="button"
                  title={zone.enabled ? 'Disable zone' : 'Enable zone'}
                  onClick={() => toggleZoneActive(zone.id)}
                  className={`rounded p-1.5 hover:bg-neutral-800 ${
                    zone.enabled ? 'text-amber-400' : 'text-neutral-500'
                  }`}
                >
                  {zone.enabled ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                </button>
                <button
                  type="button"
                  title="Delete zone"
                  onClick={() => deleteZone(zone.id)}
                  className="rounded p-1.5 text-neutral-500 hover:bg-neutral-800 hover:text-red-400"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
