import React, { useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  ExternalLink,
  Filter,
  Flame,
  Shield,
  ShieldAlert,
  UserCheck,
  XCircle,
  ArrowUpRight,
  Car,
  User,
  Plus,
} from 'lucide-react';
import { AlertIncident, AlertSeverity } from '../types';

interface AlertsPanelProps {
  alerts: AlertIncident[];
  onAcknowledgeAlert: (alertId: string) => void;
  onEscalateAlert: (alertId: string) => void;
  onCloseAlert: (alertId: string) => void;
  onInvestigateAlert: (alert: AlertIncident) => void;
  onSelectPlate: (plate: string, cropUrl?: string) => void;
  onOpenAddCamera?: () => void;
}

export const AlertsPanel: React.FC<AlertsPanelProps> = ({
  alerts,
  onAcknowledgeAlert,
  onEscalateAlert,
  onCloseAlert,
  onInvestigateAlert,
  onSelectPlate,
  onOpenAddCamera,
}) => {
  const [severityFilter, setSeverityFilter] = useState<AlertSeverity | 'all'>('all');
  const [expandedAlertIds, setExpandedAlertIds] = useState<Set<string>>(new Set());

  const toggleExpand = (id: string) => {
    setExpandedAlertIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const formatVideoTimestamp = (sec?: number) => {
    if (sec === undefined || sec === null) return null;
    const m = Math.floor(sec / 60);
    const s = (sec % 60).toFixed(1);
    return `${m.toString().padStart(2, '0')}:${s.padStart(4, '0')}s`;
  };

  // Sort alerts by severity precedence (critical > high > medium > low > normal), then newest first
  const severityRank: Record<AlertSeverity, number> = {
    critical: 5,
    high: 4,
    medium: 3,
    low: 2,
    normal: 1,
  };

  const filteredAlerts = alerts
    .filter((a) => (severityFilter === 'all' ? true : a.severity === severityFilter))
    .sort((a, b) => {
      const rankDiff = severityRank[b.severity] - severityRank[a.severity];
      if (rankDiff !== 0) return rankDiff;
      return b.timestamp - a.timestamp;
    });

  const getSeverityBadge = (sev: AlertSeverity) => {
    switch (sev) {
      case 'critical':
        return (
          <span className="flex items-center gap-1 rounded bg-red-950/80 border border-red-800/80 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-red-300">
            <Flame className="h-3 w-3 text-red-400" />
            Critical
          </span>
        );
      case 'high':
        return (
          <span className="flex items-center gap-1 rounded bg-orange-950/80 border border-orange-800/80 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-orange-300">
            <AlertTriangle className="h-3 w-3 text-orange-400" />
            High
          </span>
        );
      case 'medium':
        return (
          <span className="flex items-center gap-1 rounded bg-amber-950/80 border border-amber-800/80 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-amber-300">
            <AlertCircle className="h-3 w-3 text-amber-400" />
            Medium
          </span>
        );
      case 'low':
        return (
          <span className="flex items-center gap-1 rounded bg-blue-950/80 border border-blue-800/80 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-blue-300">
            <Shield className="h-3 w-3 text-blue-400" />
            Low
          </span>
        );
      default:
        return (
          <span className="flex items-center gap-1 rounded bg-neutral-800 border border-neutral-700 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-neutral-300">
            Normal
          </span>
        );
    }
  };

  const getStatusBadge = (status: AlertIncident['status']) => {
    switch (status) {
      case 'active':
        return (
          <span className="flex items-center gap-1 text-[11px] font-medium text-amber-400">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" />
            Active
          </span>
        );
      case 'acknowledged':
        return (
          <span className="flex items-center gap-1 text-[11px] font-medium text-sky-400">
            <UserCheck className="h-3 w-3" />
            Acknowledged
          </span>
        );
      case 'escalated':
        return (
          <span className="flex items-center gap-1 text-[11px] font-medium text-red-400">
            <ArrowUpRight className="h-3 w-3" />
            Escalated
          </span>
        );
      case 'closed':
        return (
          <span className="flex items-center gap-1 text-[11px] font-medium text-emerald-400">
            <CheckCircle2 className="h-3 w-3" />
            Closed
          </span>
        );
    }
  };

  return (
    <div
      id="alerts-panel-container"
      className="flex flex-col h-full rounded-xl border border-neutral-800 bg-neutral-900 overflow-hidden text-neutral-100"
    >
      {/* Panel Header */}
      <div className="border-b border-neutral-800 bg-neutral-950/60 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <ShieldAlert className="h-5 w-5 text-amber-400" />
            <div>
              <h2 className="text-base font-semibold tracking-tight">Real-Time Explainable Alerts</h2>
              <p className="text-xs text-neutral-400">
                Sorted by severity score • Transparent contributing factor breakdown
              </p>
            </div>
          </div>
          <span className="rounded-full bg-neutral-800 px-3 py-1 font-mono text-xs font-semibold text-neutral-200">
            {alerts.length} Total
          </span>
        </div>

        {/* Severity Filter Chips */}
        <div className="mt-3 flex items-center gap-1.5 overflow-x-auto pb-1">
          <Filter className="h-3.5 w-3.5 text-neutral-500 mr-1 shrink-0" />
          {(['all', 'critical', 'high', 'medium', 'low'] as const).map((sev) => (
            <button
              key={sev}
              id={`filter-sev-${sev}`}
              type="button"
              onClick={() => setSeverityFilter(sev)}
              className={`rounded-lg px-2.5 py-1 text-xs font-medium capitalize transition-colors ${
                severityFilter === sev
                  ? 'bg-amber-500 text-neutral-950 font-bold'
                  : 'bg-neutral-800/80 text-neutral-300 hover:bg-neutral-800'
              }`}
            >
              {sev} {sev !== 'all' && `(${alerts.filter((a) => a.severity === sev).length})`}
            </button>
          ))}
        </div>
      </div>

      {/* Alert Feed List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 pb-24">
        {alerts.length === 0 ? (
          <div id="alerts-empty-state" className="flex flex-col items-center justify-center py-20 text-center text-neutral-400">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-neutral-900 border border-neutral-800 text-amber-400 mb-4">
              <ShieldAlert className="h-7 w-7" />
            </div>
            <h3 className="text-base font-semibold text-neutral-200">No Incidents Recorded</h3>
            <p className="mt-1 text-xs text-neutral-400 max-w-sm">
              Upload footage or connect a camera to begin monitoring. System alerts are generated in real-time when boundary tripwires or restricted zones are crossed.
            </p>
            {onOpenAddCamera && (
              <button
                type="button"
                onClick={onOpenAddCamera}
                className="mt-6 inline-flex items-center gap-2 rounded-xl bg-amber-500 px-4 py-2.5 text-xs font-semibold text-neutral-950 hover:bg-amber-400 shadow-md transition-colors"
              >
                <Plus className="h-4 w-4" />
                Upload Footage / Add Camera
              </button>
            )}
          </div>
        ) : filteredAlerts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center text-neutral-500">
            <CheckCircle2 className="h-10 w-10 text-neutral-600 mb-2" />
            <p className="text-sm font-medium text-neutral-400">No active incidents match this filter</p>
            <p className="mt-1 text-xs max-w-xs">
              Try switching severity filter to "all".
            </p>
          </div>
        ) : (
          filteredAlerts.map((alert) => {
            const isExpanded = expandedAlertIds.has(alert.id);
            const isVehicle = ['car', 'truck', 'bus', 'motorcycle'].includes(alert.objectClass);

            return (
              <div
                key={alert.id}
                id={`alert-card-${alert.id}`}
                className="rounded-xl border border-neutral-800 bg-neutral-950/70 p-4 transition-all hover:border-neutral-700"
              >
                {/* Header Row: Title, Camera, Time, Severity */}
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm text-neutral-100">{alert.title}</span>
                      {getSeverityBadge(alert.severity)}
                      {getStatusBadge(alert.status)}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-neutral-400">
                      <span className="font-medium text-neutral-300">{alert.cameraName}</span>
                      <span>•</span>
                      <span className="flex items-center gap-1 font-mono text-[11px] text-neutral-300">
                        <Clock className="h-3 w-3 text-neutral-400" />
                        {alert.videoTime !== undefined
                          ? `Video: ${formatVideoTimestamp(alert.videoTime)}`
                          : new Date(alert.timestamp).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                              second: '2-digit',
                            })}
                      </span>
                      <span>•</span>
                      <span className="font-mono text-[11px] text-amber-400">
                        {alert.confidence}% Confidence
                      </span>
                    </div>
                  </div>

                  {/* Score Pill */}
                  <div className="text-right shrink-0">
                    <span className="font-mono text-base font-bold text-neutral-100">
                      {alert.riskScore}
                    </span>
                    <span className="text-[10px] text-neutral-500 block">RISK SCORE</span>
                  </div>
                </div>

                {/* Evidence Thumbnails: Tight Entity Crop + Context Scene Snapshot */}
                <div className="mt-3 flex items-center gap-3">
                  {alert.entityCropUrl && (
                    <div className="relative rounded border border-neutral-700 bg-black overflow-hidden h-14 w-16 flex items-center justify-center shrink-0" title="Target Entity Crop">
                      <img
                        src={alert.entityCropUrl}
                        alt="Target entity crop"
                        className="max-h-full max-w-full object-contain"
                      />
                      <span className="absolute bottom-0 inset-x-0 bg-black/75 text-[8px] font-mono text-center text-neutral-300 py-0.2">CROP</span>
                    </div>
                  )}
                  {alert.snapshotUrl && (
                    <div className="relative rounded border border-neutral-800 bg-black overflow-hidden h-14 w-24 shrink-0" title="Scene Snapshot">
                      <img
                        src={alert.snapshotUrl}
                        alt="Incident scene snapshot"
                        className="h-full w-full object-cover"
                      />
                      <span className="absolute bottom-0 inset-x-0 bg-black/75 text-[8px] font-mono text-center text-neutral-300 py-0.2">SCENE</span>
                    </div>
                  )}
                  <div className="flex-1 text-xs space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="rounded bg-neutral-800 px-2 py-0.5 font-medium text-neutral-300 capitalize flex items-center gap-1">
                        {isVehicle ? <Car className="h-3 w-3" /> : <User className="h-3 w-3" />}
                        {alert.objectClass} #{alert.objectId}
                      </span>
                      {alert.direction && (
                        <span className="text-neutral-400">Heading: {alert.direction}</span>
                      )}
                      {alert.speed && (
                        <span className="text-neutral-400">Speed: {alert.speed}</span>
                      )}
                    </div>

                    {/* ANPR Plate Badge if vehicle */}
                    {alert.anprPlate && (
                      <div className="flex items-center gap-2 pt-0.5">
                        <span className="text-[11px] text-neutral-400">Plate:</span>
                        <button
                          type="button"
                          onClick={() => onSelectPlate(alert.anprPlate!)}
                          className="rounded bg-neutral-800 hover:bg-neutral-700 px-2 py-0.5 font-mono text-xs font-semibold text-emerald-400 transition-colors flex items-center gap-1"
                          title="Open Vehicle Intelligence Dossier"
                        >
                          {alert.anprPlate}
                          <ExternalLink className="h-3 w-3" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Transparent Explainable Factors Breakdown */}
                <div className="mt-3 rounded-lg border border-neutral-800/80 bg-neutral-900/60 p-3">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400 block mb-2">
                    Transparent Contributing Factors Breakdown
                  </span>
                  <div className="space-y-1.5">
                    {alert.riskFactors.map((factor) => (
                      <div
                        key={factor.id}
                        className="flex items-center justify-between text-xs text-neutral-300"
                      >
                        <div className="flex items-center gap-2">
                          <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                          <span>{factor.label}</span>
                          <span className="text-[11px] text-neutral-500">
                            — {factor.description}
                          </span>
                        </div>
                        <span className="font-mono text-xs font-bold text-amber-400 ml-2">
                          +{factor.score}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Actions & Audit Trail Accordion */}
                <div className="mt-3 flex items-center justify-between border-t border-neutral-800 pt-3">
                  <div className="flex items-center gap-2">
                    {alert.status === 'active' && (
                      <button
                        type="button"
                        id={`ack-btn-${alert.id}`}
                        onClick={() => onAcknowledgeAlert(alert.id)}
                        className="rounded-md bg-neutral-800 px-2.5 py-1 text-xs font-medium text-neutral-200 hover:bg-neutral-700 hover:text-white transition-colors"
                      >
                        Acknowledge
                      </button>
                    )}
                    {alert.status !== 'escalated' && alert.status !== 'closed' && (
                      <button
                        type="button"
                        id={`esc-btn-${alert.id}`}
                        onClick={() => onEscalateAlert(alert.id)}
                        className="rounded-md bg-red-950/60 border border-red-800/60 px-2.5 py-1 text-xs font-medium text-red-300 hover:bg-red-900/80 transition-colors"
                      >
                        Escalate
                      </button>
                    )}
                    {alert.status !== 'closed' && (
                      <button
                        type="button"
                        id={`close-btn-${alert.id}`}
                        onClick={() => onCloseAlert(alert.id)}
                        className="rounded-md bg-neutral-800 px-2.5 py-1 text-xs font-medium text-neutral-300 hover:bg-neutral-700 transition-colors"
                      >
                        Close
                      </button>
                    )}
                    <button
                      type="button"
                      id={`investigate-btn-${alert.id}`}
                      onClick={() => onInvestigateAlert(alert)}
                      className="rounded-md bg-amber-500/10 border border-amber-500/30 px-2.5 py-1 text-xs font-medium text-amber-300 hover:bg-amber-500/20 transition-colors flex items-center gap-1"
                    >
                      Investigate <ArrowUpRight className="h-3 w-3" />
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => toggleExpand(alert.id)}
                    className="flex items-center gap-1 text-xs text-neutral-400 hover:text-neutral-200"
                  >
                    <span>Audit Trail ({alert.auditTrail.length})</span>
                    {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                  </button>
                </div>

                {/* Expanded Audit Trail Log */}
                {isExpanded && (
                  <div className="mt-3 border-t border-neutral-800/80 pt-3 space-y-2 text-xs">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400 block">
                      Chronological Audit Trail
                    </span>
                    {alert.auditTrail.map((entry) => (
                      <div
                        key={entry.id}
                        className="flex items-start justify-between rounded bg-neutral-900/80 p-2 text-neutral-300"
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-semibold capitalize text-neutral-200">
                              {entry.action}
                            </span>
                            <span className="text-neutral-400">by {entry.actor}</span>
                          </div>
                          {entry.note && <p className="text-[11px] text-neutral-400 mt-0.5">{entry.note}</p>}
                        </div>
                        <span className="font-mono text-[10px] text-neutral-500 shrink-0">
                          {new Date(entry.timestamp).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                            second: '2-digit',
                          })}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
