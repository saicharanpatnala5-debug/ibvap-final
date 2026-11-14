import React, { useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Edit3,
  ShieldCheck,
  Percent,
  Compass,
  FileCheck,
  Radio,
  Clock,
  ChevronRight,
  ShieldAlert,
} from 'lucide-react';
import { AIRecommendation } from '../types';

interface ExplainableRecommendationCardProps {
  recommendation: AIRecommendation;
  onAccept: (recId: string, note?: string) => void;
  onModify: (recId: string, modifiedAction: string, note?: string) => void;
  onReject: (recId: string, reason: string) => void;
  onInvestigateIncident?: (incidentId: string) => void;
}

export const ExplainableRecommendationCard: React.FC<ExplainableRecommendationCardProps> = ({
  recommendation,
  onAccept,
  onModify,
  onReject,
  onInvestigateIncident,
}) => {
  const [isModifying, setIsModifying] = useState(false);
  const [modifiedText, setModifiedText] = useState(recommendation.recommendedAction);
  const [operatorNote, setOperatorNote] = useState('');
  const [isRejecting, setIsRejecting] = useState(false);
  const [rejectReason, setRejectReason] = useState('Authorized personnel on premises');

  const {
    id,
    title,
    why,
    evidence,
    confidence,
    recommendedAction,
    status,
    cameraName,
    incidentId,
    timestamp,
  } = recommendation;

  const handleConfirmModify = () => {
    onModify(id, modifiedText, operatorNote);
    setIsModifying(false);
  };

  const handleConfirmReject = () => {
    onReject(id, rejectReason);
    setIsRejecting(false);
  };

  // Status Badge styling
  const statusBadge =
    status === 'accepted' ? (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-950/80 border border-emerald-800/80 px-2.5 py-0.5 text-xs font-semibold text-emerald-400">
        <CheckCircle2 className="h-3 w-3" />
        Operator-Confirmed
      </span>
    ) : status === 'rejected' ? (
      <span className="inline-flex items-center gap-1 rounded-full bg-red-950/80 border border-red-800/80 px-2.5 py-0.5 text-xs font-semibold text-red-400">
        <XCircle className="h-3 w-3" />
        Operator-Rejected
      </span>
    ) : status === 'modified' ? (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-950/80 border border-amber-800/80 px-2.5 py-0.5 text-xs font-semibold text-amber-400">
        <Edit3 className="h-3 w-3" />
        Operator-Modified
      </span>
    ) : (
      <span className="inline-flex items-center gap-1 rounded-full bg-neutral-800 border border-neutral-700 px-2.5 py-0.5 text-xs font-semibold text-neutral-300">
        <Clock className="h-3 w-3 text-amber-400 animate-pulse" />
        Unverified (Pending Operator Decision)
      </span>
    );

  return (
    <div
      id={`ai-rec-card-${id}`}
      className="my-3 rounded-xl border border-neutral-800 bg-neutral-900/90 text-neutral-100 shadow-lg overflow-hidden backdrop-blur-sm"
    >
      {/* Top Banner with Trust & Verification State */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-800/80 bg-neutral-950/60 px-4 py-2.5 text-xs">
        <div className="flex items-center gap-2">
          <div className="flex h-5 w-5 items-center justify-center rounded bg-amber-500/20 text-amber-400">
            <ShieldAlert className="h-3.5 w-3.5" />
          </div>
          <span className="font-semibold text-neutral-200">Explainable AI Recommendation</span>
          {cameraName && (
            <span className="text-neutral-400">
              • Source: <strong className="text-neutral-300">{cameraName}</strong>
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {statusBadge}
          <div className="flex items-center gap-1 rounded bg-neutral-800 px-2 py-0.5 text-[11px] font-mono text-neutral-300">
            <Percent className="h-3 w-3 text-amber-400" />
            <span>Confidence: {confidence}%</span>
          </div>
        </div>
      </div>

      <div className="p-4 space-y-3.5">
        {/* Title */}
        <h4 className="text-sm font-bold text-neutral-100 flex items-center justify-between">
          <span>{title}</span>
          {incidentId && onInvestigateIncident && (
            <button
              type="button"
              onClick={() => onInvestigateIncident(incidentId)}
              className="text-xs text-amber-400 hover:text-amber-300 flex items-center gap-1 font-medium transition-colors"
            >
              Investigate Incident <ChevronRight className="h-3 w-3" />
            </button>
          )}
        </h4>

        {/* 1. WHY (Reasoning) */}
        <div className="rounded-lg border border-neutral-800 bg-neutral-950/50 p-3">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-400 mb-1">
            <Radio className="h-3.5 w-3.5" />
            <span>WHY (AI Reasoning):</span>
          </div>
          <p className="text-xs text-neutral-300 leading-relaxed">{why}</p>
        </div>

        {/* 2. EVIDENCE (Specific Data Points) */}
        <div className="rounded-lg border border-neutral-800 bg-neutral-950/50 p-3">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-neutral-300 mb-1.5">
            <FileCheck className="h-3.5 w-3.5 text-amber-400" />
            <span>EVIDENCE (Ground-Truth Data Points):</span>
          </div>
          <ul className="space-y-1">
            {evidence.map((point, idx) => (
              <li key={idx} className="text-xs text-neutral-400 flex items-start gap-1.5">
                <span className="text-amber-400/80 font-mono mt-0.5">•</span>
                <span className="text-neutral-300">{point}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* 3. RECOMMENDED ACTION */}
        <div className="rounded-lg border border-amber-900/40 bg-amber-950/20 p-3">
          <div className="flex items-center justify-between text-xs font-semibold text-amber-300 mb-1">
            <div className="flex items-center gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5 text-amber-400" />
              <span>RECOMMENDED OPERATIONAL ACTION:</span>
            </div>
            {status === 'modified' && (
              <span className="text-[10px] text-amber-400 font-normal italic">
                (Modified by Operator)
              </span>
            )}
          </div>
          <p className="text-xs font-medium text-amber-100/90 leading-relaxed">
            {recommendation.modifiedAction || recommendedAction}
          </p>
          {recommendation.operatorNote && (
            <p className="mt-1 text-[11px] text-neutral-400 italic">
              Note: &quot;{recommendation.operatorNote}&quot;
            </p>
          )}
        </div>

        {/* 4. HUMAN-IN-THE-LOOP CONTROLS (Accept / Modify / Reject) */}
        {status === 'unverified' && !isModifying && !isRejecting && (
          <div className="pt-1 flex flex-wrap items-center gap-2">
            <button
              id={`rec-accept-btn-${id}`}
              type="button"
              onClick={() => onAccept(id)}
              className="flex items-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors"
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              Accept & Execute Action
            </button>

            <button
              id={`rec-modify-btn-${id}`}
              type="button"
              onClick={() => setIsModifying(true)}
              className="flex items-center gap-1.5 rounded-lg border border-neutral-700 bg-neutral-800 hover:bg-neutral-700 px-3 py-1.5 text-xs font-medium text-neutral-200 transition-colors"
            >
              <Edit3 className="h-3.5 w-3.5 text-amber-400" />
              Modify Action
            </button>

            <button
              id={`rec-reject-btn-${id}`}
              type="button"
              onClick={() => setIsRejecting(true)}
              className="flex items-center gap-1.5 rounded-lg border border-red-900/70 bg-red-950/40 hover:bg-red-900/60 px-3 py-1.5 text-xs font-medium text-red-300 transition-colors"
            >
              <XCircle className="h-3.5 w-3.5" />
              Reject
            </button>
          </div>
        )}

        {/* Inline Modifier Form */}
        {isModifying && (
          <div className="rounded-lg border border-neutral-700 bg-neutral-950 p-3 space-y-2">
            <label className="block text-xs font-medium text-neutral-300">
              Customize Operational Directive:
            </label>
            <textarea
              rows={2}
              value={modifiedText}
              onChange={(e) => setModifiedText(e.target.value)}
              className="w-full rounded-md border border-neutral-800 bg-neutral-900 p-2 text-xs text-neutral-100 focus:border-amber-500 focus:outline-none"
            />
            <input
              type="text"
              placeholder="Operator rationale / dispatch notes (optional)..."
              value={operatorNote}
              onChange={(e) => setOperatorNote(e.target.value)}
              className="w-full rounded-md border border-neutral-800 bg-neutral-900 px-2 py-1.5 text-xs text-neutral-200 focus:border-amber-500 focus:outline-none"
            />
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setIsModifying(false)}
                className="rounded px-2.5 py-1 text-xs text-neutral-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmModify}
                className="rounded bg-amber-500 hover:bg-amber-400 px-3 py-1 text-xs font-semibold text-neutral-950"
              >
                Confirm & Log Decision
              </button>
            </div>
          </div>
        )}

        {/* Inline Rejection Form */}
        {isRejecting && (
          <div className="rounded-lg border border-red-900/60 bg-neutral-950 p-3 space-y-2">
            <label className="block text-xs font-medium text-red-300">
              Select Operator Justification for Rejection:
            </label>
            <select
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              className="w-full rounded-md border border-neutral-800 bg-neutral-900 p-1.5 text-xs text-neutral-200 focus:border-red-500 focus:outline-none"
            >
              <option value="Authorized personnel on premises">Authorized personnel on premises</option>
              <option value="False positive lighting / shadow reflection">False positive lighting / shadow reflection</option>
              <option value="Scheduled delivery / contractor visit">Scheduled delivery / contractor visit</option>
              <option value="Camera maintenance / test routine">Camera maintenance / test routine</option>
              <option value="Operator discretion: Threat neutralized">Operator discretion: Threat neutralized</option>
            </select>
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setIsRejecting(false)}
                className="rounded px-2.5 py-1 text-xs text-neutral-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmReject}
                className="rounded bg-red-600 hover:bg-red-500 px-3 py-1 text-xs font-semibold text-white"
              >
                Confirm Rejection & Log
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
