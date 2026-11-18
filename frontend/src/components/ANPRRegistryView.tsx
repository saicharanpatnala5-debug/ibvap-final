import React, { useState, useMemo } from 'react';
import {
  Car,
  Search,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Video,
  Sparkles,
  ShieldAlert,
  Fuel,
  Calendar,
  User,
  MapPin,
  FileCheck2,
  Edit3,
  Plus,
  Trash2,
  EyeOff,
} from 'lucide-react';
import { PlateRegistryRecord, CameraFeedItem, PlateStatus } from '../types';

interface ANPRRegistryViewProps {
  records: PlateRegistryRecord[];
  cameras: CameraFeedItem[];
  onJumpToFootage: (cameraId: string, videoTime: number, plateNumber: string) => void;
  onAskAI?: (prompt: string) => void;
  onLoadDemoData?: () => void;
  onClearAllData?: () => void;
  onCorrectPlate?: (recordId: string, newPlate: string) => void;
  onOpenAddCamera?: () => void;
}

export const ANPRRegistryView: React.FC<ANPRRegistryViewProps> = ({
  records,
  cameras,
  onJumpToFootage,
  onAskAI,
  onLoadDemoData,
  onClearAllData,
  onCorrectPlate,
  onOpenAddCamera,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'valid' | 'review' | 'unreadable' | 'distant' | 'watchlist'>('all');
  const [selectedRecordId, setSelectedRecordId] = useState<string | null>(null);

  // Operator manual correction inline state
  const [isEditingPlate, setIsEditingPlate] = useState(false);
  const [correctionInput, setCorrectionInput] = useState('');

  // AI-assisted plate reading state
  const [isAiReading, setIsAiReading] = useState(false);
  const [showAiWarning, setShowAiWarning] = useState(false);
  const [aiReadError, setAiReadError] = useState<string | null>(null);

  const handleAiReadClick = () => {
    setShowAiWarning(true);
    setAiReadError(null);
  };

  const executeAiPlateRead = async () => {
    setShowAiWarning(false);
    if (!activeRecord) return;
    const crop = activeRecord.cropUrl || activeRecord.vehicleThumbnailUrl;
    if (!crop) {
      setAiReadError('No image crop available for this target.');
      return;
    }

    setIsAiReading(true);
    setAiReadError(null);

    try {
      const res = await fetch('/api/anpr/ai-read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cropBase64: crop }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.plateText && data.plateText !== 'UNREADABLE') {
          // Pre-populate correction input with AI-extracted text for operator review and confirmation
          setCorrectionInput(data.plateText);
          setIsEditingPlate(true);
        } else {
          setAiReadError('AI Vision could not extract a distinct license plate from this crop.');
        }
      } else {
        const err = await res.json().catch(() => ({}));
        setAiReadError(err.error || `AI plate read failed (${res.status})`);
      }
    } catch {
      setAiReadError('Network error calling AI plate read.');
    } finally {
      setIsAiReading(false);
    }
  };

  const formatVideoTimestamp = (sec?: number) => {
    if (sec === undefined || sec === null) return '00:00.0s';
    const m = Math.floor(sec / 60);
    const s = (sec % 60).toFixed(1);
    return `${m.toString().padStart(2, '0')}:${s.padStart(4, '0')}s`;
  };

  // Filtering
  const filteredRecords = useMemo(() => {
    return records.filter((rec) => {
      const q = searchQuery.toLowerCase().trim();
      const matchesQuery =
        !q ||
        rec.plateNumber.toLowerCase().includes(q) ||
        (rec.dossier?.registeredOwner && rec.dossier.registeredOwner.toLowerCase().includes(q)) ||
        (rec.dossier?.vehicleMake && rec.dossier.vehicleMake.toLowerCase().includes(q)) ||
        (rec.dossier?.vehicleModel && rec.dossier.vehicleModel.toLowerCase().includes(q)) ||
        (rec.dossier?.stateName && rec.dossier.stateName.toLowerCase().includes(q));

      if (!matchesQuery) return false;

      if (statusFilter === 'valid') {
        return rec.status === 'Valid format';
      }
      if (statusFilter === 'review') {
        return rec.status === 'Low confidence - needs review';
      }
      if (statusFilter === 'unreadable') {
        return rec.status === 'Unreadable';
      }
      if (statusFilter === 'distant') {
        return rec.status === 'Plate not legible at this distance' || rec.formatType === 'distance_gated';
      }
      if (statusFilter === 'watchlist') {
        return rec.dossier?.registrationStatus === 'Watchlist Flagged';
      }

      return true;
    });
  }, [records, searchQuery, statusFilter]);

  const activeRecord = useMemo(() => {
    if (!selectedRecordId) return filteredRecords[0] || records[0];
    return records.find((r) => r.id === selectedRecordId) || filteredRecords[0] || records[0];
  }, [selectedRecordId, filteredRecords, records]);

  // Summary Metrics computed strictly from real entries
  const metrics = useMemo(() => {
    const total = records.length;
    const formatValid = records.filter((r) => r.status === 'Valid format').length;
    const needsReview = records.filter((r) => r.status === 'Low confidence - needs review').length;
    const unreadable = records.filter((r) => r.status === 'Unreadable').length;
    const distant = records.filter((r) => r.status === 'Plate not legible at this distance' || r.formatType === 'distance_gated').length;
    const watchlist = records.filter((r) => r.dossier?.registrationStatus === 'Watchlist Flagged').length;
    const ev = records.filter((r) => r.dossier?.fuelType?.includes('Electric')).length;
    return { total, formatValid, needsReview, unreadable, distant, watchlist, ev };
  }, [records]);

  const handleApplyCorrection = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeRecord || !onCorrectPlate) return;
    const clean = correctionInput.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (clean) {
      onCorrectPlate(activeRecord.id, clean);
      setIsEditingPlate(false);
      setCorrectionInput('');
    }
  };

  const getStatusBadge = (status: PlateStatus, formatType?: string) => {
    if (status === 'Plate not legible at this distance' || formatType === 'distance_gated') {
      return (
        <span className="inline-flex items-center gap-1 rounded bg-neutral-800/90 border border-neutral-700/80 px-2 py-0.5 text-[11px] font-medium text-neutral-300" title="Physical resolution limit: vehicle is distant">
          <EyeOff className="h-3 w-3 text-neutral-400" />
          Distant Target
        </span>
      );
    }
    if (status === 'Valid format') {
      return (
        <span className="inline-flex items-center gap-1 rounded bg-emerald-950/80 border border-emerald-700/60 px-2 py-0.5 text-[11px] font-semibold text-emerald-300">
          <CheckCircle2 className="h-3 w-3" />
          Format Valid
        </span>
      );
    }
    if (status === 'Low confidence - needs review' || (status as string).includes('needs review') || (status as string).includes('Invalid format')) {
      return (
        <span className="inline-flex items-center gap-1 rounded bg-amber-950/80 border border-amber-700/60 px-2 py-0.5 text-[11px] font-semibold text-amber-300">
          <AlertTriangle className="h-3 w-3" />
          Needs Review
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 rounded bg-red-950/80 border border-red-700/60 px-2 py-0.5 text-[11px] font-semibold text-red-300">
        <AlertTriangle className="h-3 w-3" />
        Unreadable
      </span>
    );
  };

  return (
    <div id="anpr-registry-view" className="flex flex-col gap-6 pb-28">
      {/* Top Banner: Title & Controls */}
      <div className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-5 backdrop-blur-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400">
              <Car className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold tracking-tight text-neutral-100">
                  Vehicle Registry & ANPR Engine
                </h1>
                <span className="rounded bg-neutral-800 px-2 py-0.5 text-xs font-mono font-semibold text-neutral-300">
                  MoRTH / Indian Standard
                </span>
              </div>
              <p className="text-xs text-neutral-400 mt-0.5">
                Automated Number Plate Recognition (ANPR) with position-aware format verification and simulated registry lookup.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {records.length > 0 && onClearAllData && (
              <button
                type="button"
                id="clear-demo-anpr-btn"
                onClick={onClearAllData}
                className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-1.5 text-xs font-medium text-neutral-400 hover:text-red-400 hover:border-red-900/60 transition-colors"
                title="Clear all recorded plates from storage"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>Clear Records</span>
              </button>
            )}

            {records.length === 0 && onLoadDemoData && (
              <button
                type="button"
                id="load-demo-data-btn"
                onClick={onLoadDemoData}
                className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/50 bg-amber-500/10 px-3 py-1.5 text-xs font-semibold text-amber-300 hover:bg-amber-500/20 transition-colors"
              >
                <Sparkles className="h-3.5 w-3.5" />
                <span>Load Demo Data (Simulated)</span>
              </button>
            )}

            <div className="inline-flex items-center gap-2 rounded-lg bg-neutral-950/80 border border-neutral-800 px-3 py-1.5 text-xs text-neutral-400">
              <span className="h-2 w-2 rounded-full bg-emerald-400" />
              <span>Simulated Registry Integration</span>
            </div>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5 pt-4 border-t border-neutral-800/70">
          <div className="rounded-lg bg-neutral-950/70 border border-neutral-800/80 p-3">
            <span className="text-[11px] font-medium text-neutral-400 block">Total Plates Logged</span>
            <span id="anpr-total-plates-metric" className="text-xl font-bold text-neutral-100 font-mono">{metrics.total} Logged Reads</span>
          </div>
          <div className="rounded-lg bg-neutral-950/70 border border-neutral-800/80 p-3">
            <span className="text-[11px] font-medium text-neutral-400 block">Format Valid</span>
            <span className="text-xl font-bold text-emerald-400 font-mono">{metrics.formatValid}</span>
          </div>
          <div className="rounded-lg bg-neutral-950/70 border border-neutral-800/80 p-3">
            <span className="text-[11px] font-medium text-neutral-400 block">Watchlist Flagged</span>
            <span className="text-xl font-bold text-red-400 font-mono">{metrics.watchlist}</span>
          </div>
          <div className="rounded-lg bg-neutral-950/70 border border-neutral-800/80 p-3">
            <span className="text-[11px] font-medium text-neutral-400 block">Electric Vehicles (EV)</span>
            <span className="text-xl font-bold text-cyan-400 font-mono">{metrics.ev}</span>
          </div>
        </div>
      </div>

      {/* Empty State when no plates exist */}
      {records.length === 0 ? (
        <div
          id="anpr-empty-state"
          className="flex flex-col items-center justify-center rounded-2xl border border-neutral-800/80 bg-neutral-900/60 p-12 sm:p-20 text-center text-neutral-100 shadow-xl"
        >
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-neutral-800 border border-neutral-700/60 text-amber-400 mb-6 shadow-md">
            <Car className="h-8 w-8" />
          </div>

          <h2 className="text-xl font-bold tracking-tight sm:text-2xl text-neutral-100">
            No Plates Detected Yet
          </h2>
          <p className="mt-2 max-w-md text-sm text-neutral-400">
            Upload footage or connect a camera to begin ANPR logging. Vehicles detected by the vision engine will automatically extract license plates and verify formats.
          </p>

          <div className="mt-8 flex flex-col sm:flex-row items-center gap-3">
            {onOpenAddCamera && (
              <button
                type="button"
                onClick={onOpenAddCamera}
                className="flex items-center gap-2 rounded-xl bg-amber-500 px-5 py-3 text-sm font-semibold text-neutral-950 hover:bg-amber-400 transition-colors shadow-lg"
              >
                <Plus className="h-5 w-5" />
                Upload Footage / Add Camera
              </button>
            )}

            {onLoadDemoData && (
              <button
                type="button"
                id="load-demo-anpr-btn"
                onClick={onLoadDemoData}
                className="flex items-center gap-2 rounded-xl border border-neutral-700 bg-neutral-800 px-5 py-3 text-sm font-medium text-neutral-200 hover:bg-neutral-700 transition-colors"
              >
                <Sparkles className="h-4 w-4 text-amber-400" />
                Load Demo Data (Simulated)
              </button>
            )}
          </div>
        </div>
      ) : (
        /* Main Content Layout: List on Left, Selected Dossier on Right */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column: Search, Filters & Registry List */}
          <div className="lg:col-span-7 flex flex-col gap-4">
            {/* Controls Bar */}
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-neutral-500" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by plate number, owner, make..."
                  className="w-full rounded-lg border border-neutral-800 bg-neutral-900/90 pl-9 pr-4 py-2 text-xs text-neutral-200 placeholder-neutral-500 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2.5 top-2.5 text-xs text-neutral-400 hover:text-neutral-200"
                  >
                    Clear
                  </button>
                )}
              </div>

              {/* Filter Pills */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
                <button
                  type="button"
                  onClick={() => setStatusFilter('all')}
                  className={`rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                    statusFilter === 'all'
                      ? 'bg-neutral-800 text-neutral-100 font-semibold'
                      : 'text-neutral-400 hover:bg-neutral-900 hover:text-neutral-200'
                  }`}
                >
                  All ({records.length})
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter('valid')}
                  className={`rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                    statusFilter === 'valid'
                      ? 'bg-emerald-950 border border-emerald-800 text-emerald-300 font-semibold'
                      : 'text-neutral-400 hover:bg-neutral-900 hover:text-neutral-200'
                  }`}
                >
                  Format Valid ({metrics.formatValid})
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter('review')}
                  className={`rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                    statusFilter === 'review'
                      ? 'bg-amber-950 border border-amber-800 text-amber-300 font-semibold'
                      : 'text-neutral-400 hover:bg-neutral-900 hover:text-neutral-200'
                  }`}
                >
                  Needs Review ({metrics.needsReview})
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter('unreadable')}
                  className={`rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                    statusFilter === 'unreadable'
                      ? 'bg-red-950 border border-red-800 text-red-300 font-semibold'
                      : 'text-neutral-400 hover:bg-neutral-900 hover:text-neutral-200'
                  }`}
                >
                  Unreadable ({metrics.unreadable})
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter('distant')}
                  className={`rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                    statusFilter === 'distant'
                      ? 'bg-neutral-850 border border-neutral-600 text-neutral-200 font-semibold'
                      : 'text-neutral-400 hover:bg-neutral-900 hover:text-neutral-200'
                  }`}
                >
                  Distant ({metrics.distant})
                </button>
                {metrics.watchlist > 0 && (
                  <button
                    type="button"
                    onClick={() => setStatusFilter('watchlist')}
                    className={`rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                      statusFilter === 'watchlist'
                        ? 'bg-red-950 border border-red-800 text-red-300 font-semibold'
                        : 'text-neutral-400 hover:bg-neutral-900 hover:text-neutral-200'
                    }`}
                  >
                    Watchlist ({metrics.watchlist})
                  </button>
                )}
              </div>
            </div>

            {/* Plates Scroll List */}
            <div className="flex flex-col gap-2.5 max-h-[680px] overflow-y-auto pr-1">
              {filteredRecords.length === 0 ? (
                <div className="flex flex-col items-center justify-center p-12 rounded-xl border border-neutral-800 bg-neutral-900/40 text-center">
                  <Car className="h-10 w-10 text-neutral-600 mb-2" />
                  <p className="text-sm font-medium text-neutral-300">No vehicles match your filter</p>
                  <p className="text-xs text-neutral-500 mt-1">
                    Try adjusting search keywords or reset filter to "All".
                  </p>
                </div>
              ) : (
                filteredRecords.map((record) => {
                  const isSelected = activeRecord?.id === record.id;
                  const isWatchlist = record.dossier?.registrationStatus === 'Watchlist Flagged';
                  const isEV = record.dossier?.fuelType?.includes('Electric');
                  const cameraExists = cameras.some((c) => c.id === record.cameraId);

                  return (
                    <div
                      key={record.id}
                      id={`plate-item-${record.plateNumber}`}
                      onClick={() => {
                        setSelectedRecordId(record.id);
                        setIsEditingPlate(false);
                      }}
                      className={`cursor-pointer rounded-xl border p-3.5 transition-all ${
                        isSelected
                          ? 'border-amber-500 bg-neutral-900 shadow-md ring-1 ring-amber-500/50'
                          : 'border-neutral-800/80 bg-neutral-900/50 hover:border-neutral-700 hover:bg-neutral-900/80'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        {/* Left: Plate Badge + Info */}
                        <div className="flex items-center gap-3">
                          {/* Plate optical crop thumbnail if available */}
                          {record.cropUrl ? (
                            <div className="h-10 w-24 rounded border border-neutral-750 bg-black overflow-hidden flex items-center justify-center shrink-0">
                              <img
                                src={record.cropUrl}
                                alt={`Crop of ${record.plateNumber}`}
                                className="max-h-full max-w-full object-contain"
                              />
                            </div>
                          ) : (
                            <div className="flex items-center rounded-md border border-neutral-700 bg-white px-2 py-1 font-mono font-bold tracking-wider text-xs text-neutral-950 shrink-0">
                              <span className="text-[8px] text-blue-800 font-extrabold mr-1 border-r border-neutral-300 pr-1">IND</span>
                              <span>{record.plateNumber}</span>
                            </div>
                          )}

                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-semibold text-neutral-200">
                                {record.plateNumber}
                              </span>
                              {record.isDemo && (
                                <span className="rounded bg-neutral-800 px-1.5 py-0.2 text-[9px] font-mono text-amber-400 border border-neutral-700">
                                  DEMO
                                </span>
                              )}
                              {isWatchlist && (
                                <span className="rounded bg-red-950 border border-red-800 px-1.5 py-0.2 text-[10px] font-bold text-red-400">
                                  WATCHLIST
                                </span>
                              )}
                            </div>
                            <span className="text-xs text-neutral-400 block mt-0.5">
                              {record.dossier
                                ? `${record.dossier.vehicleMake} ${record.dossier.vehicleModel} • ${record.dossier.registeredOwner}`
                                : 'No registry record attached'}
                            </span>
                          </div>
                        </div>

                        {/* Right: Validation & Confidence */}
                        <div className="flex flex-col items-end gap-1">
                          <div className="flex items-center gap-1.5">
                            {getStatusBadge(record.status, record.formatType)}
                            <span className="font-mono text-xs text-neutral-400">
                              {record.confidence}% OCR
                            </span>
                          </div>
                          <span className="text-[11px] text-neutral-500 flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {record.cameraName}
                          </span>
                        </div>
                      </div>

                      {/* Bottom Quick-Action Bar */}
                      <div className="mt-3 flex items-center justify-between border-t border-neutral-800/60 pt-2.5 text-xs text-neutral-400">
                        <span className="font-mono text-[11px] text-neutral-500">
                          {record.trackId ? `Track #${record.trackId} • ` : ''}
                          Seen at {formatVideoTimestamp(record.videoTime)}
                        </span>

                        {(cameraExists || cameras.length > 0) && record.videoTime !== undefined ? (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              const targetCamId = cameraExists ? record.cameraId : cameras[0]?.id;
                              onJumpToFootage(targetCamId, record.videoTime || 0, record.plateNumber);
                            }}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 px-2.5 py-1 text-xs font-medium text-amber-400 transition-colors"
                          >
                            <Video className="h-3.5 w-3.5" />
                            Jump to Moment
                          </button>
                        ) : (
                          <span className="text-[11px] text-neutral-600 italic">
                            Source unavailable
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Right Column: Full Vehicle & Owner Dossier Card */}
          <div className="lg:col-span-5">
            {activeRecord ? (
              <div className="sticky top-20 rounded-xl border border-neutral-800 bg-neutral-900/80 p-5 backdrop-blur-md">
                <div className="flex items-start justify-between pb-4 border-b border-neutral-800">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono font-medium text-amber-400 uppercase tracking-wider">
                        Vehicle Dossier
                      </span>
                      {activeRecord.dossier && (
                        <span className="rounded bg-amber-950/70 border border-amber-800/60 px-1.5 py-0.5 text-[10px] text-amber-300 font-semibold">
                          Simulated Record
                        </span>
                      )}
                      <span className="rounded bg-neutral-800 px-1.5 py-0.2 text-[10px] text-neutral-400">
                        ID: {activeRecord.plateNumber}
                      </span>
                    </div>
                    <h2 className="text-lg font-bold text-neutral-100 mt-1">
                      {activeRecord.dossier
                        ? `${activeRecord.dossier.vehicleMake} ${activeRecord.dossier.vehicleModel}`
                        : 'No Verified Vehicle Dossier'}
                    </h2>
                  </div>

                  <div>{getStatusBadge(activeRecord.status, activeRecord.formatType)}</div>
                </div>

                {/* Plate Display + Crop */}
                <div className="my-4 flex flex-col sm:flex-row items-center justify-between gap-3 p-3 rounded-lg bg-neutral-950 border border-neutral-800">
                  <div className="flex items-center rounded-md border-2 border-neutral-700 bg-white px-4 py-2 font-mono font-bold tracking-widest text-lg text-neutral-950 shadow-sm">
                    <span className="text-[10px] text-blue-800 font-extrabold mr-2 border-r-2 border-black/20 pr-1.5">IND</span>
                    <span>{activeRecord.plateNumber}</span>
                  </div>

                  {activeRecord.cropUrl && (
                    <div className="flex flex-col items-center">
                      <span className="text-[10px] uppercase tracking-wider text-neutral-500 mb-1">
                        Isolated Crop
                      </span>
                      <div className="h-12 max-w-[180px] rounded border border-neutral-700 bg-black overflow-hidden flex items-center justify-center">
                        <img
                          src={activeRecord.cropUrl}
                          alt="Plate crop"
                          className="max-h-full max-w-full object-contain"
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* If plate is unreadable or needs review, NO fake dossier is displayed */}
                {!activeRecord.dossier ? (
                  <div className="rounded-xl border border-neutral-800 bg-neutral-950/60 p-5 text-center">
                    <Car className="mx-auto h-8 w-8 text-neutral-600 mb-2" />
                    <h3 className="text-sm font-semibold text-neutral-200">No Registry Record Attached</h3>
                    <p className="mt-1 text-xs text-neutral-400">
                      Registry data is never attached to unreadable or low-confidence reads. Simulated records are only returned for validated exact matches.
                    </p>

                    {/* Operator Quick Actions: Confirm Read, AI Read, Manual Correction */}
                    <div className="mt-4 pt-4 border-t border-neutral-800/80 flex flex-col gap-3">
                      <div className="flex flex-wrap items-center justify-center gap-2">
                        {activeRecord.plateNumber && activeRecord.plateNumber !== 'UNREADABLE' && activeRecord.plateNumber !== 'UNRESOLVED' && onCorrectPlate && (
                          <button
                            type="button"
                            id="confirm-plate-read-btn"
                            onClick={() => onCorrectPlate(activeRecord.id, activeRecord.plateNumber)}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors"
                            title="Confirm candidate read as verified"
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            <span>Confirm Read</span>
                          </button>
                        )}

                        <button
                          type="button"
                          id="ai-plate-read-btn"
                          disabled={isAiReading || (!activeRecord.cropUrl && !activeRecord.vehicleThumbnailUrl)}
                          onClick={handleAiReadClick}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-500/60 bg-cyan-950/60 hover:bg-cyan-900/80 px-3 py-1.5 text-xs font-semibold text-cyan-300 transition-colors disabled:opacity-50"
                          title="Optical plate reading with server-side Gemini Vision"
                        >
                          <Sparkles className="h-3.5 w-3.5 text-cyan-400" />
                          <span>{isAiReading ? 'Analyzing Crop...' : 'Read plate with AI'}</span>
                        </button>

                        {!isEditingPlate && (
                          <button
                            type="button"
                            id="open-plate-correction-btn"
                            onClick={() => {
                              setIsEditingPlate(true);
                              setCorrectionInput(activeRecord.plateNumber === 'UNREADABLE' ? '' : activeRecord.plateNumber);
                            }}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-xs font-medium text-amber-400 hover:bg-neutral-700 transition-colors"
                          >
                            <Edit3 className="h-3.5 w-3.5" />
                            <span>Manual Correction</span>
                          </button>
                        )}
                      </div>

                      {showAiWarning && (
                        <div className="p-3 rounded-lg bg-neutral-900 border border-amber-500/60 text-left">
                          <div className="flex items-start gap-2">
                            <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
                            <div className="text-xs text-neutral-300">
                              <strong className="text-amber-300 block mb-1">External Optical Inference Warning</strong>
                              Vehicle crop image will be sent to the Gemini Vision API for optical extraction.
                              Candidate text will be labelled <em>"AI-assisted - needs confirmation"</em> and no vehicle registry data will be attached until you review and confirm.
                            </div>
                          </div>
                          <div className="mt-3 flex justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => setShowAiWarning(false)}
                              className="px-2.5 py-1 text-xs text-neutral-400 hover:text-white"
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              id="confirm-ai-read-dispatch-btn"
                              onClick={executeAiPlateRead}
                              className="px-3 py-1 rounded bg-amber-500 text-neutral-950 font-semibold text-xs hover:bg-amber-400"
                            >
                              Proceed with AI Read
                            </button>
                          </div>
                        </div>
                      )}

                      {aiReadError && (
                        <div className="p-2 rounded bg-red-950/80 border border-red-800 text-xs text-red-300 text-left">
                          {aiReadError}
                        </div>
                      )}

                      {isEditingPlate && (
                        <form onSubmit={handleApplyCorrection} className="flex items-center gap-2 mt-2">
                          <input
                            type="text"
                            id="manual-plate-input"
                            value={correctionInput}
                            onChange={(e) => setCorrectionInput(e.target.value.toUpperCase())}
                            placeholder="e.g. MH12AB4029"
                            className="flex-1 rounded-lg border border-amber-500 bg-neutral-900 px-3 py-1.5 text-xs font-mono text-white placeholder-neutral-500 focus:outline-none"
                            autoFocus
                          />
                          <button
                            type="submit"
                            id="submit-plate-correction-btn"
                            className="rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-semibold text-neutral-950 hover:bg-amber-400"
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            onClick={() => setIsEditingPlate(false)}
                            className="rounded-lg bg-neutral-800 px-2.5 py-1.5 text-xs text-neutral-400 hover:text-white"
                          >
                            Cancel
                          </button>
                        </form>
                      )}
                    </div>
                  </div>
                ) : (
                  /* Verified Simulated Dossier */
                  <>
                    <div className="rounded-lg bg-neutral-950/70 border border-neutral-800/80 p-3 mb-4 text-xs">
                      <div className="flex items-center justify-between text-neutral-300 font-medium mb-1.5">
                        <span className="flex items-center gap-1.5 text-neutral-400">
                          <FileCheck2 className="h-3.5 w-3.5 text-amber-400" />
                          Format Standard:
                        </span>
                        <span className="font-mono text-neutral-200">
                          {activeRecord.formatType === 'bharat'
                            ? 'Bharat (BH) All-India'
                            : 'Indian State / RTO Format'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-neutral-300 font-medium">
                        <span className="text-neutral-400">RTO Jurisdiction:</span>
                        <span className="text-neutral-200 text-right">
                          {activeRecord.dossier.rtoOffice || activeRecord.dossier.stateName || 'Ministry of Transport'}
                        </span>
                      </div>
                    </div>

                    <div className="space-y-3 text-xs">
                      <div className="flex items-center justify-between p-2 rounded-lg bg-neutral-950/50">
                        <span className="flex items-center gap-1.5 text-neutral-400">
                          <User className="h-3.5 w-3.5 text-neutral-500" />
                          Registered Owner (Simulated)
                        </span>
                        <span className="font-semibold text-neutral-100">{activeRecord.dossier.registeredOwner}</span>
                      </div>

                      <div className="flex items-center justify-between p-2 rounded-lg bg-neutral-950/50">
                        <span className="flex items-center gap-1.5 text-neutral-400">
                          <Car className="h-3.5 w-3.5 text-neutral-500" />
                          Make & Model
                        </span>
                        <span className="font-semibold text-neutral-100">
                          {activeRecord.dossier.vehicleMake} {activeRecord.dossier.vehicleModel}
                        </span>
                      </div>

                      <div className="flex items-center justify-between p-2 rounded-lg bg-neutral-950/50">
                        <span className="text-neutral-400">Vehicle Class:</span>
                        <span className="text-neutral-200">{activeRecord.dossier.vehicleClass}</span>
                      </div>

                      <div className="flex items-center justify-between p-2 rounded-lg bg-neutral-950/50">
                        <span className="text-neutral-400">Powertrain / Fuel:</span>
                        <span className="text-neutral-200">{activeRecord.dossier.fuelType}</span>
                      </div>

                      <div className="flex items-center justify-between p-2 rounded-lg bg-neutral-950/50">
                        <span className="text-neutral-400">Contact Number:</span>
                        <span className="text-neutral-200 font-mono">{activeRecord.dossier.ownerPhone}</span>
                      </div>
                    </div>
                  </>
                )}

                {/* Operator manual correction toggle if dossier already matched but operator wants to edit */}
                {activeRecord.dossier && !isEditingPlate && (
                  <div className="mt-4 pt-3 border-t border-neutral-800 flex justify-end">
                    <button
                      type="button"
                      onClick={() => {
                        setIsEditingPlate(true);
                        setCorrectionInput(activeRecord.plateNumber);
                      }}
                      className="inline-flex items-center gap-1 text-[11px] text-neutral-400 hover:text-amber-400"
                    >
                      <Edit3 className="h-3 w-3" />
                      <span>Edit / Correct Plate</span>
                    </button>
                  </div>
                )}
                {activeRecord.dossier && isEditingPlate && (
                  <form onSubmit={handleApplyCorrection} className="mt-4 pt-3 border-t border-neutral-800 flex items-center gap-2">
                    <input
                      type="text"
                      value={correctionInput}
                      onChange={(e) => setCorrectionInput(e.target.value.toUpperCase())}
                      className="flex-1 rounded-lg border border-amber-500 bg-neutral-900 px-3 py-1.5 text-xs font-mono text-white placeholder-neutral-500 focus:outline-none"
                      autoFocus
                    />
                    <button
                      type="submit"
                      className="rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-semibold text-neutral-950 hover:bg-amber-400"
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsEditingPlate(false)}
                      className="rounded-lg bg-neutral-800 px-2.5 py-1.5 text-xs text-neutral-400 hover:text-white"
                    >
                      Cancel
                    </button>
                  </form>
                )}
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
};
