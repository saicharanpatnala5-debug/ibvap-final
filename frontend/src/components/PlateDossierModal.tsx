import React, { useState } from 'react';
import { AlertTriangle, Car, ShieldAlert, X, User, Calendar, MapPin, CheckCircle2, Edit3 } from 'lucide-react';
import { lookupVehicleDossier, determinePlateStatus } from '../services/anprEngine';

interface PlateDossierModalProps {
  isOpen: boolean;
  onClose: () => void;
  plateNumber: string | null;
  anprCropUrl?: string;
  onCorrectPlate?: (oldPlate: string, newPlate: string) => void;
}

export const PlateDossierModal: React.FC<PlateDossierModalProps> = ({
  isOpen,
  onClose,
  plateNumber,
  anprCropUrl,
  onCorrectPlate,
}) => {
  const [manualInput, setManualInput] = useState('');
  const [isEditing, setIsEditing] = useState(false);

  if (!isOpen || !plateNumber) return null;

  const statusInfo = determinePlateStatus(plateNumber, 90);
  const dossier = lookupVehicleDossier(plateNumber);

  const handleApplyCorrection = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = manualInput.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (clean && onCorrectPlate) {
      onCorrectPlate(plateNumber, clean);
      setIsEditing(false);
      setManualInput('');
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="dossier-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-xs"
    >
      <div
        id="vehicle-dossier-card"
        className="w-full max-w-xl rounded-xl border border-neutral-800 bg-neutral-900 p-6 text-neutral-100 shadow-2xl"
      >
        {/* MANDATORY SIMULATION BANNER */}
        <div className="mb-4 flex items-center gap-2.5 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-amber-300">
          <AlertTriangle className="h-5 w-5 shrink-0" />
          <div className="text-xs">
            <span className="font-bold tracking-wider uppercase">Simulated Registry Data</span> — Prototype verification only.
            Registry records are simulated for testing and are NOT connected to live governmental motor vehicle databases.
          </div>
        </div>

        <div className="flex items-center justify-between border-b border-neutral-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-neutral-800 p-2 text-neutral-200">
              <Car className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 id="dossier-modal-title" className="text-lg font-semibold tracking-tight">
                  Vehicle Intelligence Dossier
                </h2>
                <span className="rounded bg-neutral-800 px-2 py-0.5 text-[10px] font-medium text-amber-400 border border-amber-500/30">
                  {dossier ? 'Simulated Match' : 'Unverified Read'}
                </span>
              </div>
              <p className="text-xs text-neutral-400">ANPR Optical Recognition Verification</p>
            </div>
          </div>
          <button
            id="close-dossier-modal-btn"
            onClick={onClose}
            className="rounded-lg p-1.5 text-neutral-400 hover:bg-neutral-800 hover:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
            aria-label="Close dossier modal"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Plate Header Card */}
        <div className="mt-4 flex flex-col sm:flex-row items-center justify-between gap-4 rounded-xl border border-neutral-800 bg-neutral-950 p-4">
          <div className="flex items-center gap-4">
            <div className="rounded-md border-2 border-neutral-700 bg-white px-4 py-2 font-mono text-xl font-bold tracking-widest text-neutral-900 shadow-inner">
              {plateNumber}
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span
                  className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-semibold border ${
                    statusInfo.status === 'Valid format'
                      ? 'bg-emerald-950/80 text-emerald-300 border-emerald-700/60'
                      : statusInfo.status === 'Low confidence - needs review'
                      ? 'bg-amber-950/80 text-amber-300 border-amber-700/60'
                      : 'bg-red-950/80 text-red-300 border-red-700/60'
                  }`}
                >
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      statusInfo.status === 'Valid format'
                        ? 'bg-emerald-400'
                        : statusInfo.status === 'Low confidence - needs review'
                        ? 'bg-amber-400'
                        : 'bg-red-400'
                    }`}
                  />
                  {statusInfo.status}
                </span>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-neutral-400">
                <span>Registry Record:</span>
                <span className={dossier ? 'text-emerald-400 font-semibold' : 'text-neutral-500 italic'}>
                  {dossier ? 'Simulated Match Found' : 'No registry record'}
                </span>
              </div>
            </div>
          </div>

          {anprCropUrl && (
            <div className="flex flex-col items-center">
              <span className="text-[10px] uppercase tracking-wider text-neutral-500 mb-1">
                Optical Crop
              </span>
              <img
                src={anprCropUrl}
                alt="License plate optical crop"
                className="h-10 rounded border border-neutral-700 object-contain bg-neutral-900"
              />
            </div>
          )}
        </div>

        {/* If NO verified dossier (unreadable or unmatched) */}
        {!dossier ? (
          <div className="mt-4 rounded-xl border border-neutral-800 bg-neutral-950/60 p-5 text-center">
            <Car className="mx-auto h-8 w-8 text-neutral-600 mb-2" />
            <h3 className="text-sm font-semibold text-neutral-200">No Registry Record Attached</h3>
            <p className="mt-1 text-xs text-neutral-400 max-w-md mx-auto">
              This plate was either read with low confidence, failed standard Indian/Bharat format validation,
              or has no matching record in the simulated registry database.
            </p>

            {/* Operator Manual Plate Correction Form */}
            <div className="mt-4 max-w-sm mx-auto">
              {!isEditing ? (
                <button
                  type="button"
                  onClick={() => {
                    setIsEditing(true);
                    setManualInput(plateNumber === 'UNREADABLE' ? '' : plateNumber);
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-xs font-medium text-amber-400 hover:bg-neutral-700"
                >
                  <Edit3 className="h-3.5 w-3.5" />
                  Operator Manual Plate Correction
                </button>
              ) : (
                <form onSubmit={handleApplyCorrection} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={manualInput}
                    onChange={(e) => setManualInput(e.target.value.toUpperCase())}
                    placeholder="e.g. MH12AB4029"
                    className="flex-1 rounded-lg border border-amber-500 bg-neutral-900 px-3 py-1.5 text-xs font-mono text-white placeholder-neutral-500 focus:outline-none"
                    autoFocus
                  />
                  <button
                    type="submit"
                    className="rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-semibold text-neutral-950 hover:bg-amber-400"
                  >
                    Apply
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsEditing(false)}
                    className="rounded-lg bg-neutral-800 px-2.5 py-1.5 text-xs text-neutral-400 hover:text-white"
                  >
                    Cancel
                  </button>
                </form>
              )}
            </div>
          </div>
        ) : (
          /* When Verified Simulated Match Exists */
          <>
            {dossier.flagReason && (
              <div className="mt-3 flex items-start gap-2.5 rounded-lg border border-red-900/50 bg-red-950/30 p-3 text-xs text-red-300">
                <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold">Security Alert Reason:</span> {dossier.flagReason}
                </div>
              </div>
            )}

            {/* Vehicle Details Grid */}
            <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-lg border border-neutral-800/80 bg-neutral-950/40 p-3">
                <span className="text-xs text-neutral-400 block mb-1 flex items-center gap-1">
                  <User className="h-3 w-3 text-neutral-500" /> Registered Owner (Simulated)
                </span>
                <p className="font-medium text-neutral-100">{dossier.registeredOwner}</p>
                <p className="text-xs text-neutral-500 mt-0.5">{dossier.ownerPhone}</p>
              </div>

              <div className="rounded-lg border border-neutral-800/80 bg-neutral-950/40 p-3">
                <span className="text-xs text-neutral-400 block mb-1 flex items-center gap-1">
                  <Car className="h-3 w-3 text-neutral-500" /> Make & Model
                </span>
                <p className="font-medium text-neutral-100">
                  {dossier.vehicleMake} {dossier.vehicleModel}
                </p>
                <p className="text-xs text-neutral-500 mt-0.5">Year: {dossier.year}</p>
              </div>

              <div className="rounded-lg border border-neutral-800/80 bg-neutral-950/40 p-3">
                <span className="text-xs text-neutral-400 block mb-1">Vehicle Class</span>
                <p className="font-medium text-neutral-200">{dossier.vehicleClass}</p>
              </div>

              <div className="rounded-lg border border-neutral-800/80 bg-neutral-950/40 p-3">
                <span className="text-xs text-neutral-400 block mb-1">Vehicle Color</span>
                <p className="font-medium text-neutral-200">{dossier.color}</p>
              </div>

              <div className="rounded-lg border border-neutral-800/80 bg-neutral-950/40 p-3">
                <span className="text-xs text-neutral-400 block mb-1">Fuel / Powertrain Type</span>
                <p className="font-medium text-neutral-200">{dossier.fuelType}</p>
              </div>

              <div className="rounded-lg border border-neutral-800/80 bg-neutral-950/40 p-3">
                <span className="text-xs text-neutral-400 block mb-1 flex items-center gap-1">
                  <Calendar className="h-3 w-3 text-neutral-500" /> Registration Date
                </span>
                <p className="font-medium text-neutral-200">{dossier.registrationDate}</p>
              </div>
            </div>

            <div className="mt-3 flex items-center justify-between rounded-lg border border-neutral-800/80 bg-neutral-950/40 p-3 text-xs text-neutral-400">
              <span className="flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5 text-neutral-500" />
                RTO Jurisdiction:
              </span>
              <span className="font-medium text-neutral-200">{dossier.rtoOffice || dossier.stateName || 'Ministry of Transport'}</span>
            </div>
          </>
        )}

        <div className="mt-6 flex justify-end border-t border-neutral-800 pt-4">
          <button
            id="close-dossier-btn"
            onClick={onClose}
            className="rounded-lg bg-neutral-800 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 focus:outline-none focus:ring-2 focus:ring-amber-500"
          >
            Close Dossier
          </button>
        </div>
      </div>
    </div>
  );
};
