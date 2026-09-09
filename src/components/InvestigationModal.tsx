import React from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Calendar,
  Camera,
  Car,
  CheckCircle2,
  Clock,
  Compass,
  Download,
  ExternalLink,
  MapPin,
  Moon,
  Shield,
  ShieldAlert,
  User,
  X,
  Zap,
} from 'lucide-react';
import { AlertIncident, CameraFeedItem } from '../types';

interface InvestigationModalProps {
  isOpen: boolean;
  onClose: () => void;
  incident: AlertIncident | null;
  allCameras: CameraFeedItem[];
  onSelectPlate: (plate: string) => void;
}

export const InvestigationModal: React.FC<InvestigationModalProps> = ({
  isOpen,
  onClose,
  incident,
  allCameras,
  onSelectPlate,
}) => {
  if (!isOpen || !incident) return null;

  const isVehicle = ['car', 'truck', 'bus', 'motorcycle'].includes(incident.objectClass);

  // Generate simulated cross-camera journey topology if multiple cameras exist
  const crossCameraHandoffs = [
    {
      cameraId: incident.cameraId,
      cameraName: incident.cameraName,
      timestamp: incident.timestamp - 18000,
      event: 'Object entering monitored perimeter sector',
    },
    {
      cameraId: incident.cameraId,
      cameraName: incident.cameraName,
      timestamp: incident.timestamp,
      event: incident.title,
    },
    ...(allCameras.length > 1
      ? [
          {
            cameraId: allCameras.find((c) => c.id !== incident.cameraId)?.id || 'cam-aux',
            cameraName:
              allCameras.find((c) => c.id !== incident.cameraId)?.name || 'Secondary Perimeter Node',
            timestamp: incident.timestamp + 24000,
            event: 'Predicted handoff vector along North-East corridor',
          },
        ]
      : []),
  ];

  const handleExportJson = () => {
    const dataStr =
      'data:text/json;charset=utf-8,' +
      encodeURIComponent(JSON.stringify(incident, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute(
      'download',
      `IBVAP-Incident-${incident.id}.json`
    );
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="investigation-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 backdrop-blur-xs"
    >
      <div
        id="investigation-modal-card"
        className="flex flex-col h-[90vh] w-full max-w-4xl rounded-xl border border-neutral-800 bg-neutral-900 text-neutral-100 shadow-2xl overflow-hidden"
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-neutral-800 px-6 py-4 bg-neutral-950/70">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-neutral-800 p-2 text-amber-400">
              <ShieldAlert className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 id="investigation-modal-title" className="text-base font-semibold tracking-tight">
                  Incident Forensic Investigation
                </h2>
                <span className="font-mono text-xs text-neutral-400">ID: {incident.id}</span>
              </div>
              <p className="text-xs text-neutral-400">
                Evidence snapshot, telemetry timeline, explainable risk factors, and cross-camera topology
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              id="export-incident-btn"
              type="button"
              onClick={handleExportJson}
              className="flex items-center gap-1.5 rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-xs font-medium text-neutral-200 hover:bg-neutral-700 hover:text-white"
            >
              <Download className="h-3.5 w-3.5" />
              Export Dossier (JSON)
            </button>
            <button
              id="close-investigation-btn"
              onClick={onClose}
              className="rounded-lg p-1.5 text-neutral-400 hover:bg-neutral-800 hover:text-white"
              aria-label="Close investigation modal"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Modal Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Top Row: Snapshot + Summary Card */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Snapshot Evidence Container */}
            <div className="space-y-2">
              <span className="text-xs font-medium uppercase tracking-wider text-neutral-400 block">
                Forensic Frame Evidence
              </span>
              <div className="relative rounded-xl border border-neutral-800 bg-black aspect-video flex items-center justify-center overflow-hidden">
                {incident.snapshotUrl ? (
                  <img
                    src={incident.snapshotUrl}
                    alt="Forensic Frame Snapshot"
                    className="h-full w-full object-contain"
                  />
                ) : (
                  <div className="text-xs text-neutral-500">Live Frame Ingestion Snapshot</div>
                )}
                <div className="absolute bottom-2 left-2 rounded bg-neutral-950/80 px-2 py-1 text-[11px] font-mono text-neutral-300">
                  Time: {incident.videoTime ? incident.videoTime.toFixed(2) + 's' : '0.00s'}
                </div>
              </div>
            </div>

            {/* Quick Metrics & Risk Score Card */}
            <div className="flex flex-col justify-between space-y-4">
              <div className="rounded-xl border border-neutral-800 bg-neutral-950/60 p-4 space-y-3">
                <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
                  <div>
                    <span className="text-xs text-neutral-400">Incident Classification</span>
                    <h3 className="text-sm font-semibold text-neutral-100">{incident.title}</h3>
                  </div>
                  <div className="text-right">
                    <span className="font-mono text-xl font-bold text-amber-400">
                      {incident.riskScore}/100
                    </span>
                    <span className="block text-[10px] text-neutral-400 uppercase">
                      {incident.severity} Severity
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <span className="text-neutral-500 block">Target Object</span>
                    <span className="font-medium text-neutral-200 capitalize">
                      {incident.objectClass} #{incident.objectId} ({incident.confidence}% conf)
                    </span>
                  </div>
                  <div>
                    <span className="text-neutral-500 block">Camera Node</span>
                    <span className="font-medium text-neutral-200">{incident.cameraName}</span>
                  </div>
                  <div>
                    <span className="text-neutral-500 block">Vector & Trajectory</span>
                    <span className="font-medium text-neutral-200">
                      {incident.direction || 'In Scene'} ({incident.speed || 'Nominal'})
                    </span>
                  </div>
                  <div>
                    <span className="text-neutral-500 block">Status</span>
                    <span className="font-medium text-amber-400 capitalize">{incident.status}</span>
                  </div>
                </div>

                {incident.anprPlate && (
                  <div className="mt-2 flex items-center justify-between rounded-lg border border-neutral-800 bg-neutral-900 p-2.5">
                    <div className="flex items-center gap-2">
                      <Car className="h-4 w-4 text-neutral-400" />
                      <div>
                        <span className="text-[10px] text-neutral-500 uppercase block">
                          ANPR Plate Extraction
                        </span>
                        <span className="font-mono font-bold text-emerald-400">
                          {incident.anprPlate}
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => onSelectPlate(incident.anprPlate!)}
                      className="rounded bg-neutral-800 hover:bg-neutral-700 px-2.5 py-1 text-xs text-neutral-200 flex items-center gap-1"
                    >
                      Dossier <ExternalLink className="h-3 w-3" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Explainable Risk Factors Breakdown */}
          <div className="rounded-xl border border-neutral-800 bg-neutral-950/60 p-5 space-y-3">
            <span className="text-xs font-semibold uppercase tracking-wider text-neutral-400 block">
              Contributing Risk Factors Audit
            </span>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {incident.riskFactors.map((factor) => (
                <div
                  key={factor.id}
                  className="flex items-start justify-between rounded-lg border border-neutral-800/80 bg-neutral-900/60 p-3"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                      <span className="text-xs font-semibold text-neutral-200">{factor.label}</span>
                    </div>
                    <p className="mt-1 text-xs text-neutral-400">{factor.description}</p>
                  </div>
                  <span className="font-mono text-xs font-bold text-amber-400 shrink-0 ml-3">
                    +{factor.score}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Cross-Camera Topology Journey */}
          <div className="rounded-xl border border-neutral-800 bg-neutral-950/60 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs font-semibold uppercase tracking-wider text-neutral-400 block">
                  Cross-Camera Topology Journey
                </span>
                <p className="text-xs text-neutral-400">
                  Trajectory correlation across camera network topology
                </p>
              </div>
              <span className="rounded bg-neutral-800 px-2 py-0.5 font-mono text-[11px] text-neutral-300">
                {crossCameraHandoffs.length} Nodes Mapped
              </span>
            </div>

            <div className="space-y-3">
              {crossCameraHandoffs.map((node, idx) => (
                <div key={idx} className="flex items-center gap-3">
                  <div className="flex flex-col items-center">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-neutral-800 text-xs font-semibold text-amber-400 border border-neutral-700">
                      {idx + 1}
                    </span>
                    {idx < crossCameraHandoffs.length - 1 && (
                      <span className="h-8 w-0.5 bg-neutral-800 my-0.5" />
                    )}
                  </div>
                  <div className="flex-1 rounded-lg border border-neutral-800/80 bg-neutral-900/50 p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-neutral-200">
                        {node.cameraName}
                      </span>
                      <span className="font-mono text-[11px] text-neutral-500">
                        {new Date(node.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-neutral-400">{node.event}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Audit Trail Timeline */}
          <div className="rounded-xl border border-neutral-800 bg-neutral-950/60 p-5 space-y-3">
            <span className="text-xs font-semibold uppercase tracking-wider text-neutral-400 block">
              Incident Action & Audit Trail
            </span>
            <div className="space-y-2">
              {incident.auditTrail.map((entry) => (
                <div
                  key={entry.id}
                  className="flex items-center justify-between rounded-lg border border-neutral-800 bg-neutral-900/60 p-3 text-xs"
                >
                  <div>
                    <span className="font-semibold text-neutral-200 capitalize">
                      {entry.action}
                    </span>
                    <span className="text-neutral-400 ml-2">by {entry.actor}</span>
                    {entry.note && (
                      <p className="text-[11px] text-neutral-400 mt-0.5">{entry.note}</p>
                    )}
                  </div>
                  <span className="font-mono text-[11px] text-neutral-500">
                    {new Date(entry.timestamp).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                    })}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-end border-t border-neutral-800 bg-neutral-950/80 px-6 py-3">
          <button
            id="close-investigation-footer-btn"
            onClick={onClose}
            className="rounded-lg bg-neutral-800 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700"
          >
            Close Investigation
          </button>
        </div>
      </div>
    </div>
  );
};
