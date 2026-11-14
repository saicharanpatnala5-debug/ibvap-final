import React from 'react';
import { AlertTriangle, Car, ShieldAlert, X, User, Phone, Calendar, MapPin } from 'lucide-react';
import { lookupVehicleDossier } from '../services/anprEngine';

interface PlateDossierModalProps {
  isOpen: boolean;
  onClose: () => void;
  plateNumber: string | null;
  anprCropUrl?: string;
}

export const PlateDossierModal: React.FC<PlateDossierModalProps> = ({
  isOpen,
  onClose,
  plateNumber,
  anprCropUrl,
}) => {
  if (!isOpen || !plateNumber) return null;

  const dossier = lookupVehicleDossier(plateNumber);

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
        {/* MANDATORY PROTOTYPE SIMULATION BANNER */}
        <div className="mb-4 flex items-center gap-2.5 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-amber-300">
          <AlertTriangle className="h-5 w-5 shrink-0" />
          <div className="text-xs">
            <span className="font-bold tracking-wider uppercase">Demo / simulated registry data</span> — Prototype verification only.
            This record is generated consistently for demonstration and is NOT connected to any live governmental motor vehicle registry or law enforcement database.
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
                  Demo / simulated registry data
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
              {dossier.plateNumber}
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span
                  className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-semibold border ${
                    dossier.validationStatus === 'Valid format'
                      ? 'bg-emerald-950/80 text-emerald-300 border-emerald-700/60'
                      : 'bg-red-950/80 text-red-300 border-red-700/60'
                  }`}
                >
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      dossier.validationStatus === 'Valid format' ? 'bg-emerald-400' : 'bg-red-400'
                    }`}
                  />
                  {dossier.validationStatus === 'Valid format'
                    ? dossier.formatType === 'bharat'
                      ? 'Valid format (Bharat BH Series)'
                      : 'Valid format (Indian NHAI/RTO)'
                    : 'Unreadable / invalid format'}
                </span>
                {dossier.stateName && (
                  <span className="text-[11px] text-neutral-400 font-medium">
                    {dossier.stateName}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1.5 text-xs">
                <span className="text-neutral-400">Registry Status:</span>
                <span
                  className={`inline-block h-2 w-2 rounded-full ${
                    dossier.registrationStatus === 'Watchlist Flagged'
                      ? 'bg-red-500 animate-pulse'
                      : dossier.registrationStatus === 'Expired'
                      ? 'bg-amber-400'
                      : 'bg-emerald-400'
                  }`}
                />
                <span
                  className={`font-semibold ${
                    dossier.registrationStatus === 'Watchlist Flagged'
                      ? 'text-red-400'
                      : dossier.registrationStatus === 'Expired'
                      ? 'text-amber-400'
                      : 'text-emerald-400'
                  }`}
                >
                  {dossier.registrationStatus}
                </span>
              </div>
            </div>
          </div>

          {anprCropUrl && (
            <div className="flex flex-col items-center">
              <span className="text-[10px] uppercase tracking-wider text-neutral-500 mb-1">
                Isolated Optical Crop
              </span>
              <img
                src={anprCropUrl}
                alt="License plate optical crop"
                className="h-10 rounded border border-neutral-700 object-contain bg-neutral-900"
              />
            </div>
          )}
        </div>

        {dossier.flagReason && (
          <div className="mt-3 flex items-start gap-2.5 rounded-lg border border-red-900/50 bg-red-950/30 p-3 text-xs text-red-300">
            <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold">Security Alert Reason:</span> {dossier.flagReason}
            </div>
          </div>
        )}

        {/* 7 Required Vehicle Details Grid */}
        <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
          {/* 1. Registered Owner Name */}
          <div className="rounded-lg border border-neutral-800/80 bg-neutral-950/40 p-3">
            <span className="text-xs text-neutral-400 block mb-1 flex items-center gap-1">
              <User className="h-3 w-3 text-neutral-500" /> Registered Owner
            </span>
            <p className="font-medium text-neutral-100">{dossier.registeredOwner}</p>
            <p className="text-xs text-neutral-500 mt-0.5">{dossier.ownerPhone}</p>
          </div>

          {/* 2. Vehicle Make & Model */}
          <div className="rounded-lg border border-neutral-800/80 bg-neutral-950/40 p-3">
            <span className="text-xs text-neutral-400 block mb-1 flex items-center gap-1">
              <Car className="h-3 w-3 text-neutral-500" /> Make & Model
            </span>
            <p className="font-medium text-neutral-100">
              {dossier.vehicleMake} {dossier.vehicleModel}
            </p>
            <p className="text-xs text-neutral-500 mt-0.5">Year: {dossier.year}</p>
          </div>

          {/* 3. Vehicle Class */}
          <div className="rounded-lg border border-neutral-800/80 bg-neutral-950/40 p-3">
            <span className="text-xs text-neutral-400 block mb-1">Vehicle Class</span>
            <p className="font-medium text-neutral-200">{dossier.vehicleClass}</p>
          </div>

          {/* 4. Color */}
          <div className="rounded-lg border border-neutral-800/80 bg-neutral-950/40 p-3">
            <span className="text-xs text-neutral-400 block mb-1">Vehicle Color</span>
            <p className="font-medium text-neutral-200">{dossier.color}</p>
          </div>

          {/* 5. Fuel Type */}
          <div className="rounded-lg border border-neutral-800/80 bg-neutral-950/40 p-3">
            <span className="text-xs text-neutral-400 block mb-1">Fuel / Powertrain Type</span>
            <p className="font-medium text-neutral-200">{dossier.fuelType}</p>
          </div>

          {/* 6. Registration Date */}
          <div className="rounded-lg border border-neutral-800/80 bg-neutral-950/40 p-3">
            <span className="text-xs text-neutral-400 block mb-1 flex items-center gap-1">
              <Calendar className="h-3 w-3 text-neutral-500" /> Registration Date
            </span>
            <p className="font-medium text-neutral-200">{dossier.registrationDate}</p>
          </div>
        </div>

        {/* 7. Registration Status & Location footer */}
        <div className="mt-3 flex items-center justify-between rounded-lg border border-neutral-800/80 bg-neutral-950/40 p-3 text-xs text-neutral-400">
          <span className="flex items-center gap-1">
            <MapPin className="h-3.5 w-3.5 text-neutral-500" />
            Last Ingestion Sensor Node:
          </span>
          <span className="font-medium text-neutral-200">{dossier.lastKnownLocation}</span>
        </div>

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
