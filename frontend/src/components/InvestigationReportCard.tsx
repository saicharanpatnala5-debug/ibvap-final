import React from 'react';
import {
  AlertTriangle,
  Clock,
  Compass,
  FileText,
  MapPin,
  Radio,
  Share2,
  ShieldAlert,
  Sliders,
  Sparkles,
  ExternalLink,
  ChevronRight,
  Car,
  User,
} from 'lucide-react';
import { AIInvestigationReport } from '../types';
import { ExplainableRecommendationCard } from './ExplainableRecommendationCard';

interface InvestigationReportCardProps {
  report: AIInvestigationReport;
  onAcceptRec: (recId: string, note?: string) => void;
  onModifyRec: (recId: string, modifiedAction: string, note?: string) => void;
  onRejectRec: (recId: string, reason: string) => void;
  onOpenFullIncident?: (incidentId: string) => void;
  onSelectPlate?: (plate: string) => void;
}

export const InvestigationReportCard: React.FC<InvestigationReportCardProps> = ({
  report,
  onAcceptRec,
  onModifyRec,
  onRejectRec,
  onOpenFullIncident,
  onSelectPlate,
}) => {
  const {
    id,
    incidentId,
    incidentTitle,
    cameraName,
    summary,
    objectClass,
    objectId,
    anprPlate,
    timeline,
    contributingFactors,
    anomalies,
    crossCameraCorrelations,
    riskAssessment,
    recommendation,
  } = report;

  const isVehicle = ['car', 'truck', 'bus', 'motorcycle'].includes(objectClass);

  const severityBadgeColor =
    riskAssessment.level === 'critical'
      ? 'bg-red-950/80 border-red-800 text-red-400'
      : riskAssessment.level === 'high'
      ? 'bg-orange-950/80 border-orange-800 text-orange-400'
      : 'bg-amber-950/80 border-amber-800 text-amber-400';

  return (
    <div
      id={`investigation-report-${id}`}
      className="my-4 rounded-xl border border-neutral-800 bg-neutral-900 text-neutral-100 shadow-2xl overflow-hidden"
    >
      {/* Report Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-800 bg-neutral-950 px-5 py-3.5">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <FileText className="h-4 w-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono font-semibold text-neutral-400 uppercase tracking-wide">
                Investigation Report
              </span>
              <span className="rounded bg-neutral-800 px-1.5 py-0.2 text-[10px] font-mono text-neutral-300">
                #{incidentId.slice(-6)}
              </span>
            </div>
            <h3 className="text-sm font-bold text-neutral-100">{incidentTitle}</h3>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <span
            className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${severityBadgeColor}`}
          >
            <ShieldAlert className="h-3 w-3" />
            {riskAssessment.level.toUpperCase()} • Risk Score: {riskAssessment.score}/100
          </span>
          {onOpenFullIncident && (
            <button
              type="button"
              onClick={() => onOpenFullIncident(incidentId)}
              className="flex items-center gap-1 rounded-lg border border-neutral-700 bg-neutral-800 hover:bg-neutral-700 px-2.5 py-1 text-xs font-medium text-neutral-200 transition-colors"
            >
              Full Forensic View <ExternalLink className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>

      <div className="p-5 space-y-4">
        {/* Executive Summary Narrative */}
        <div className="rounded-lg border border-neutral-800/80 bg-neutral-950/40 p-3.5 text-xs text-neutral-300 leading-relaxed">
          <div className="flex items-center gap-1.5 text-neutral-400 font-semibold mb-1">
            <Sparkles className="h-3.5 w-3.5 text-amber-400" />
            <span>EXECUTIVE FORENSIC SUMMARY:</span>
          </div>
          <p>{summary}</p>
        </div>

        {/* Primary Subject Metadata Pill Bar */}
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-neutral-800 bg-neutral-950/70 px-3.5 py-2 text-xs">
          <div className="flex items-center gap-1.5 text-neutral-400">
            {isVehicle ? <Car className="h-3.5 w-3.5 text-amber-400" /> : <User className="h-3.5 w-3.5 text-amber-400" />}
            <span>Target: <strong className="text-neutral-200 font-mono">#{objectId} ({objectClass.toUpperCase()})</strong></span>
          </div>
          <span className="text-neutral-700">•</span>
          <div className="flex items-center gap-1 text-neutral-400">
            <MapPin className="h-3.5 w-3.5 text-neutral-400" />
            <span>Camera: <strong className="text-neutral-200">{cameraName}</strong></span>
          </div>
          {anprPlate && (
            <>
              <span className="text-neutral-700">•</span>
              <div className="flex items-center gap-1.5">
                <span className="text-neutral-400">Plate:</span>
                <button
                  type="button"
                  onClick={() => onSelectPlate && onSelectPlate(anprPlate)}
                  className="rounded bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 text-xs font-mono font-bold text-amber-400 hover:bg-amber-500/20 transition-colors"
                >
                  [{anprPlate}]
                </button>
              </div>
            </>
          )}
        </div>

        {/* Two-Column Grid: Timeline & Contributing Factors */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Structured Incident Timeline */}
          <div className="rounded-lg border border-neutral-800 bg-neutral-950/40 p-3.5">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-neutral-300 mb-3">
              <Clock className="h-3.5 w-3.5 text-amber-400" />
              <span>CHRONOLOGICAL TIMELINE:</span>
            </div>
            <div className="relative pl-4 space-y-3 before:absolute before:left-1.5 before:top-1 before:bottom-1 before:w-0.5 before:bg-neutral-800">
              {timeline.map((item, idx) => (
                <div key={idx} className="relative text-xs">
                  <div className="absolute -left-[19px] top-1 h-2 w-2 rounded-full border border-neutral-900 bg-amber-400" />
                  <span className="font-mono text-[11px] text-amber-400/90 font-medium">
                    {item.time}
                  </span>
                  <p className="text-neutral-300 mt-0.5">{item.event}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Contributing Factors & Anomalies */}
          <div className="space-y-4">
            {/* Contributing Factors */}
            <div className="rounded-lg border border-neutral-800 bg-neutral-950/40 p-3.5">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-neutral-300 mb-2">
                <Sliders className="h-3.5 w-3.5 text-amber-400" />
                <span>CONTRIBUTING RISK FACTORS:</span>
              </div>
              <ul className="space-y-1.5">
                {contributingFactors.map((cf, idx) => (
                  <li key={idx} className="text-xs flex items-start justify-between gap-2">
                    <span className="text-neutral-300 font-medium">{cf.factor}</span>
                    <span className="font-mono text-[11px] text-amber-400 shrink-0">
                      {cf.impact}
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Anomalies Detected */}
            <div className="rounded-lg border border-neutral-800 bg-neutral-950/40 p-3.5">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-neutral-300 mb-2">
                <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />
                <span>ANOMALIES & BEHAVIORAL DEVIATIONS:</span>
              </div>
              <ul className="space-y-1">
                {anomalies.map((anom, idx) => (
                  <li key={idx} className="text-xs text-neutral-400 flex items-start gap-1.5">
                    <span className="text-amber-400 mt-0.5">•</span>
                    <span className="text-neutral-300">{anom}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        {/* Cross-Camera Correlation / Spatial Handoff */}
        {crossCameraCorrelations.length > 0 && (
          <div className="rounded-lg border border-neutral-800 bg-neutral-950/40 p-3.5">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-neutral-300 mb-2">
              <Share2 className="h-3.5 w-3.5 text-amber-400" />
              <span>CROSS-CAMERA CORRELATION & TOPOLOGY HANDOFF:</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {crossCameraCorrelations.map((rel, idx) => (
                <div
                  key={idx}
                  className="rounded border border-neutral-800/80 bg-neutral-900/60 p-2 text-xs flex items-center justify-between"
                >
                  <div>
                    <strong className="text-neutral-200">{rel.cameraName}</strong>
                    <div className="text-[11px] text-neutral-400">
                      {rel.handoffVector || 'Adjacent Sector'}
                    </div>
                  </div>
                  <span className="rounded bg-neutral-800 px-1.5 py-0.5 font-mono text-[10px] text-amber-300">
                    {rel.similarity}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tied Explainable Recommendation */}
        <div className="pt-2">
          <div className="text-xs font-semibold text-neutral-400 uppercase tracking-wide mb-2 flex items-center gap-1.5">
            <Compass className="h-3.5 w-3.5 text-amber-400" />
            <span>OPERATIONAL ACTION DIRECTIVE</span>
          </div>
          <ExplainableRecommendationCard
            recommendation={recommendation}
            onAccept={onAcceptRec}
            onModify={onModifyRec}
            onReject={onRejectRec}
          />
        </div>
      </div>
    </div>
  );
};
