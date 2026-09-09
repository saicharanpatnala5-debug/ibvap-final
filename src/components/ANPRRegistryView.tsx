import React, { useState, useMemo } from 'react';
import {
  Car,
  Search,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Video,
  Sparkles,
  ExternalLink,
  ShieldCheck,
  ShieldAlert,
  Fuel,
  Calendar,
  User,
  Phone,
  MapPin,
  FileCheck2,
  FileX2,
  Filter,
} from 'lucide-react';
import { PlateRegistryRecord, CameraFeedItem } from '../types';
import { lookupVehicleDossier, SIMULATED_VEHICLE_DATABASE } from '../services/anprEngine';

interface ANPRRegistryViewProps {
  records: PlateRegistryRecord[];
  cameras: CameraFeedItem[];
  onJumpToFootage: (cameraId: string, videoTime: number, plateNumber: string) => void;
  onAskAI?: (prompt: string) => void;
}

export const ANPRRegistryView: React.FC<ANPRRegistryViewProps> = ({
  records,
  cameras,
  onJumpToFootage,
  onAskAI,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'valid' | 'watchlist' | 'invalid'>('all');
  const [selectedRecordId, setSelectedRecordId] = useState<string | null>(null);

  // Combine live detections with curated registry records to ensure the user always has data to explore
  const combinedRecords: PlateRegistryRecord[] = useMemo(() => {
    const list: PlateRegistryRecord[] = [...records];
    const existingPlates = new Set(records.map((r) => r.plateNumber.toUpperCase()));

    // Seed preset records if not already in list
    const fallbackCam = cameras[0] || { id: 'cam-01', name: 'Primary Gate Camera' };
    const seedPlates = ['MH12AB4029', 'DL01CZ9876', 'UP32EV8812', '22BH1234AB', '7XYZ892'];

    seedPlates.forEach((plate, idx) => {
      if (!existingPlates.has(plate)) {
        const dossier = lookupVehicleDossier(plate);
        list.push({
          id: `seed-plate-${plate}`,
          plateNumber: plate,
          formatValidationStatus: dossier.validationStatus || 'Valid format',
          isValidFormat: dossier.validationStatus === 'Valid format',
          formatType: dossier.formatType,
          confidence: 96 - idx * 3,
          cameraId: fallbackCam.id,
          cameraName: fallbackCam.name,
          timestamp: Date.now() - (idx * 45000 + 12000),
          videoTime: 4.5 + idx * 8.0,
          dossier,
        });
      }
    });

    return list;
  }, [records, cameras]);

  // Filtering
  const filteredRecords = useMemo(() => {
    return combinedRecords.filter((rec) => {
      const q = searchQuery.toLowerCase().trim();
      const matchesQuery =
        !q ||
        rec.plateNumber.toLowerCase().includes(q) ||
        rec.dossier.registeredOwner.toLowerCase().includes(q) ||
        rec.dossier.vehicleMake.toLowerCase().includes(q) ||
        rec.dossier.vehicleModel.toLowerCase().includes(q) ||
        (rec.dossier.stateName && rec.dossier.stateName.toLowerCase().includes(q)) ||
        (rec.dossier.rtoOffice && rec.dossier.rtoOffice.toLowerCase().includes(q));

      if (!matchesQuery) return false;

      if (statusFilter === 'valid') {
        return rec.isValidFormat && rec.dossier.registrationStatus === 'Valid';
      }
      if (statusFilter === 'watchlist') {
        return rec.dossier.registrationStatus === 'Watchlist Flagged';
      }
      if (statusFilter === 'invalid') {
        return !rec.isValidFormat || rec.dossier.registrationStatus === 'Expired';
      }

      return true;
    });
  }, [combinedRecords, searchQuery, statusFilter]);

  const activeRecord = useMemo(() => {
    if (!selectedRecordId) return filteredRecords[0] || combinedRecords[0];
    return combinedRecords.find((r) => r.id === selectedRecordId) || combinedRecords[0];
  }, [selectedRecordId, filteredRecords, combinedRecords]);

  // Summary Metrics
  const metrics = useMemo(() => {
    const total = combinedRecords.length;
    const valid = combinedRecords.filter((r) => r.isValidFormat).length;
    const watchlist = combinedRecords.filter((r) => r.dossier.registrationStatus === 'Watchlist Flagged').length;
    const ev = combinedRecords.filter((r) => r.dossier.fuelType.includes('Electric')).length;
    return { total, valid, watchlist, ev };
  }, [combinedRecords]);

  return (
    <div id="anpr-registry-view" className="flex flex-col gap-6">
      {/* Top Banner: Disclaimer & Title */}
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
                  MoRTH / NHAI Standard
                </span>
              </div>
              <p className="text-xs text-neutral-400 mt-0.5">
                Automated Number Plate Recognition (ANPR) with multi-state RTO & Bharat (BH) series format verification.
              </p>
            </div>
          </div>

          <div className="inline-flex items-center gap-2 rounded-lg bg-amber-950/40 border border-amber-800/40 px-3 py-1.5 text-xs text-amber-300">
            <span className="h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
            <span>Demo / Simulated Registry Data</span>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5 pt-4 border-t border-neutral-800/70">
          <div className="rounded-lg bg-neutral-950/70 border border-neutral-800/80 p-3">
            <span className="text-[11px] font-medium text-neutral-400 block">Total Plates Logged</span>
            <span className="text-xl font-bold text-neutral-100 font-mono">{metrics.total}</span>
          </div>
          <div className="rounded-lg bg-neutral-950/70 border border-neutral-800/80 p-3">
            <span className="text-[11px] font-medium text-neutral-400 block">NHAI / RTO Verified</span>
            <span className="text-xl font-bold text-emerald-400 font-mono">{metrics.valid}</span>
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

      {/* Main Content Layout: List on Left, Selected Dossier on Right */}
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
                placeholder="Search by plate number, owner, make, or state..."
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
                All ({combinedRecords.length})
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
                Valid NHAI
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('watchlist')}
                className={`rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                  statusFilter === 'watchlist'
                    ? 'bg-red-950 border border-red-800 text-red-300 font-semibold'
                    : 'text-neutral-400 hover:bg-neutral-900 hover:text-neutral-200'
                }`}
              >
                Watchlist
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('invalid')}
                className={`rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                  statusFilter === 'invalid'
                    ? 'bg-amber-950 border border-amber-800 text-amber-300 font-semibold'
                    : 'text-neutral-400 hover:bg-neutral-900 hover:text-neutral-200'
                }`}
              >
                Unverified / Expired
              </button>
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
                const isWatchlist = record.dossier.registrationStatus === 'Watchlist Flagged';
                const isEV = record.dossier.fuelType.includes('Electric');
                const isCommercial = record.dossier.vehicleClass.toLowerCase().includes('cargo') || record.dossier.vehicleClass.toLowerCase().includes('transport');

                // High Security Registration Plate (HSRP) visual background
                const plateBgClass = isEV
                  ? 'bg-emerald-700 text-white'
                  : isCommercial
                  ? 'bg-amber-400 text-neutral-950'
                  : 'bg-white text-neutral-950';

                return (
                  <div
                    key={record.id}
                    id={`plate-item-${record.plateNumber}`}
                    onClick={() => setSelectedRecordId(record.id)}
                    className={`cursor-pointer rounded-xl border p-3.5 transition-all ${
                      isSelected
                        ? 'border-amber-500 bg-neutral-900 shadow-md ring-1 ring-amber-500/50'
                        : 'border-neutral-800/80 bg-neutral-900/50 hover:border-neutral-700 hover:bg-neutral-900/80'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      {/* Left: Indian Plate Visual + Make/Model */}
                      <div className="flex items-center gap-3">
                        {/* Realistic High-Contrast Plate Badge */}
                        <div className={`relative flex items-center rounded-md border border-neutral-400/30 px-2 py-1 shadow-xs font-mono font-bold tracking-wider text-sm select-none ${plateBgClass}`}>
                          {/* IND Left Strip */}
                          <div className="flex flex-col items-center justify-center mr-1.5 border-r border-black/20 pr-1 text-[8px] leading-tight text-blue-800 font-extrabold">
                            <span>IND</span>
                          </div>
                          <span>{record.plateNumber}</span>
                        </div>

                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-neutral-200">
                              {record.dossier.vehicleMake} {record.dossier.vehicleModel}
                            </span>
                            {isWatchlist && (
                              <span className="rounded bg-red-950 border border-red-800 px-1.5 py-0.2 text-[10px] font-bold text-red-400">
                                WATCHLIST
                              </span>
                            )}
                          </div>
                          <span className="text-xs text-neutral-400">
                            {record.dossier.registeredOwner} • {record.dossier.stateName || 'RTO Verified'}
                          </span>
                        </div>
                      </div>

                      {/* Right: Validation & Confidence */}
                      <div className="flex flex-col items-end gap-1">
                        <div className="flex items-center gap-1.5">
                          {record.isValidFormat ? (
                            <span className="inline-flex items-center gap-1 rounded bg-emerald-950/70 border border-emerald-800/60 px-1.5 py-0.5 text-[10px] font-medium text-emerald-400">
                              <CheckCircle2 className="h-3 w-3" />
                              Valid
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded bg-amber-950/70 border border-amber-800/60 px-1.5 py-0.5 text-[10px] font-medium text-amber-400">
                              <AlertTriangle className="h-3 w-3" />
                              Format Issue
                            </span>
                          )}
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
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[11px] text-neutral-500">
                          Seen at {record.videoTime !== undefined ? `${record.videoTime.toFixed(1)}s` : '0.0s'}
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onJumpToFootage(record.cameraId, record.videoTime || 0, record.plateNumber);
                        }}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 px-2.5 py-1 text-xs font-medium text-amber-400 transition-colors"
                      >
                        <Video className="h-3.5 w-3.5" />
                        Jump to Moment
                      </button>
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
                    <span className="rounded bg-neutral-800 px-1.5 py-0.2 text-[10px] text-neutral-400">
                      ID: {activeRecord.plateNumber}
                    </span>
                  </div>
                  <h2 className="text-lg font-bold text-neutral-100 mt-1">
                    {activeRecord.dossier.vehicleMake} {activeRecord.dossier.vehicleModel}
                  </h2>
                </div>

                {/* Status Badge */}
                <div className="flex flex-col items-end">
                  {activeRecord.dossier.registrationStatus === 'Valid' ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-950 border border-emerald-800 px-2.5 py-0.5 text-xs font-semibold text-emerald-300">
                      <ShieldCheck className="h-3.5 w-3.5" />
                      Valid Registration
                    </span>
                  ) : activeRecord.dossier.registrationStatus === 'Watchlist Flagged' ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-red-950 border border-red-800 px-2.5 py-0.5 text-xs font-semibold text-red-300">
                      <ShieldAlert className="h-3.5 w-3.5" />
                      Watchlist Flagged
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-950 border border-amber-800 px-2.5 py-0.5 text-xs font-semibold text-amber-300">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      {activeRecord.dossier.registrationStatus}
                    </span>
                  )}
                </div>
              </div>

              {/* Large HSRP Plate Display */}
              <div className="my-4 flex items-center justify-center p-3 rounded-lg bg-neutral-950 border border-neutral-800">
                <div
                  className={`flex items-center rounded-md border-2 border-neutral-400 px-4 py-2 font-mono font-bold tracking-widest text-lg shadow-sm ${
                    activeRecord.dossier.fuelType.includes('Electric')
                      ? 'bg-emerald-700 text-white'
                      : activeRecord.dossier.vehicleClass.toLowerCase().includes('cargo')
                      ? 'bg-amber-400 text-neutral-950'
                      : 'bg-white text-neutral-950'
                  }`}
                >
                  <div className="flex flex-col items-center justify-center mr-2.5 border-r-2 border-black/20 pr-2 text-[10px] leading-tight text-blue-800 font-extrabold">
                    <span>IND</span>
                  </div>
                  <span>{activeRecord.plateNumber}</span>
                </div>
              </div>

              {/* Format Validation Details */}
              <div className="rounded-lg bg-neutral-950/70 border border-neutral-800/80 p-3 mb-4 text-xs">
                <div className="flex items-center justify-between text-neutral-300 font-medium mb-1.5">
                  <span className="flex items-center gap-1.5 text-neutral-400">
                    <FileCheck2 className="h-3.5 w-3.5 text-amber-400" />
                    Format Standard:
                  </span>
                  <span className="font-mono text-neutral-200">
                    {activeRecord.dossier.formatType === 'bharat'
                      ? 'Bharat (BH) All-India'
                      : 'Indian NHAI / RTO (Standard)'}
                  </span>
                </div>
                <div className="flex items-center justify-between text-neutral-300 font-medium">
                  <span className="text-neutral-400">RTO Jurisdiction:</span>
                  <span className="text-neutral-200 text-right">
                    {activeRecord.dossier.rtoOffice || activeRecord.dossier.stateName || 'Ministry of Transport'}
                  </span>
                </div>
              </div>

              {/* Dossier Field Details */}
              <div className="space-y-3 text-xs">
                {/* Registered Owner */}
                <div className="flex items-center justify-between p-2 rounded-lg bg-neutral-950/50">
                  <span className="flex items-center gap-1.5 text-neutral-400">
                    <User className="h-3.5 w-3.5 text-neutral-500" />
                    Registered Owner
                  </span>
                  <span className="font-semibold text-neutral-100">{activeRecord.dossier.registeredOwner}</span>
                </div>

                {/* Owner Phone */}
                <div className="flex items-center justify-between p-2 rounded-lg bg-neutral-950/50">
                  <span className="flex items-center gap-1.5 text-neutral-400">
                    <Phone className="h-3.5 w-3.5 text-neutral-500" />
                    Contact Number
                  </span>
                  <span className="font-mono text-neutral-200">{activeRecord.dossier.ownerPhone}</span>
                </div>

                {/* Vehicle Class & Color */}
                <div className="flex items-center justify-between p-2 rounded-lg bg-neutral-950/50">
                  <span className="text-neutral-400">Class & Exterior</span>
                  <span className="text-neutral-200">
                    {activeRecord.dossier.vehicleClass} ({activeRecord.dossier.color})
                  </span>
                </div>

                {/* Fuel Type */}
                <div className="flex items-center justify-between p-2 rounded-lg bg-neutral-950/50">
                  <span className="flex items-center gap-1.5 text-neutral-400">
                    <Fuel className="h-3.5 w-3.5 text-neutral-500" />
                    Propulsion / Fuel
                  </span>
                  <span className="text-neutral-200">{activeRecord.dossier.fuelType}</span>
                </div>

                {/* Registration Date */}
                <div className="flex items-center justify-between p-2 rounded-lg bg-neutral-950/50">
                  <span className="flex items-center gap-1.5 text-neutral-400">
                    <Calendar className="h-3.5 w-3.5 text-neutral-500" />
                    Registration Date
                  </span>
                  <span className="text-neutral-200">{activeRecord.dossier.registrationDate}</span>
                </div>

                {/* Sighted Node / Location */}
                <div className="flex items-center justify-between p-2 rounded-lg bg-neutral-950/50">
                  <span className="flex items-center gap-1.5 text-neutral-400">
                    <MapPin className="h-3.5 w-3.5 text-neutral-500" />
                    Observed Camera
                  </span>
                  <span className="text-amber-400 font-medium">{activeRecord.cameraName}</span>
                </div>

                {/* Flag Reason if any */}
                {activeRecord.dossier.flagReason && (
                  <div className="rounded-lg bg-red-950/40 border border-red-900/50 p-2.5 text-red-300 text-xs">
                    <span className="font-bold block mb-0.5">Security Notice:</span>
                    {activeRecord.dossier.flagReason}
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="mt-5 flex flex-col gap-2">
                <button
                  type="button"
                  id={`jump-footage-btn-${activeRecord.plateNumber}`}
                  onClick={() =>
                    onJumpToFootage(activeRecord.cameraId, activeRecord.videoTime || 0, activeRecord.plateNumber)
                  }
                  className="w-full flex items-center justify-center gap-2 rounded-lg bg-amber-500 py-2 px-3 text-xs font-semibold text-neutral-950 hover:bg-amber-400 transition-colors shadow-sm"
                >
                  <Video className="h-4 w-4" />
                  View in Footage (Seek to {activeRecord.videoTime !== undefined ? `${activeRecord.videoTime.toFixed(1)}s` : '0.0s'})
                </button>

                {onAskAI && (
                  <button
                    type="button"
                    onClick={() =>
                      onAskAI(
                        `Investigate vehicle plate ${activeRecord.plateNumber} (${activeRecord.dossier.vehicleMake} ${activeRecord.dossier.vehicleModel}) detected on camera "${activeRecord.cameraName}". What is its risk level and authorization status?`
                      )
                    }
                    className="w-full flex items-center justify-center gap-2 rounded-lg border border-neutral-800 bg-neutral-800/80 py-2 px-3 text-xs font-medium text-neutral-200 hover:bg-neutral-800 transition-colors"
                  >
                    <Sparkles className="h-3.5 w-3.5 text-amber-400" />
                    Investigate Plate with AI Assistant
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-8 text-center text-neutral-400">
              Select a vehicle record to view dossier.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
