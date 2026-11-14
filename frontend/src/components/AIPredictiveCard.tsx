import React from 'react';
import {
  Sparkles,
  TrendingUp,
  Percent,
  Clock,
  ShieldAlert,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Radio,
} from 'lucide-react';
import { AIPredictiveSignal, AIAnomalyDetection } from '../types';

interface AIPredictiveCardProps {
  prediction: AIPredictiveSignal;
  onAcceptPreemptive: (predId: string) => void;
  onDismissPreemptive: (predId: string) => void;
}

export const AIPredictiveCard: React.FC<AIPredictiveCardProps> = ({
  prediction,
  onAcceptPreemptive,
  onDismissPreemptive,
}) => {
  const {
    id,
    cameraName,
    title,
    prediction: predText,
    confidence,
    historicalPattern,
    timeWindow,
    evidence,
    suggestedPreemptiveAction,
    status,
  } = prediction;

  return (
    <div
      id={`ai-predictive-card-${id}`}
      className="my-3 rounded-xl border border-indigo-900/60 bg-gradient-to-br from-neutral-900 via-neutral-900 to-indigo-950/40 text-neutral-100 shadow-lg overflow-hidden"
    >
      {/* Prediction Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-indigo-900/40 bg-neutral-950/70 px-4 py-2.5 text-xs">
        <div className="flex items-center gap-2">
          <div className="flex h-5 w-5 items-center justify-center rounded bg-indigo-500/20 text-indigo-400">
            <Sparkles className="h-3.5 w-3.5" />
          </div>
          <span className="font-bold uppercase tracking-wider text-indigo-300">
            Predictive Early-Warning Signal
          </span>
          <span className="text-neutral-400">• Source: <strong className="text-neutral-300">{cameraName}</strong></span>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-indigo-950 border border-indigo-700/80 px-2 py-0.5 text-[11px] font-mono text-indigo-300 flex items-center gap-1">
            <Percent className="h-3 w-3" />
            Confidence: {confidence}% (Model-Estimated)
          </span>
          <span className="rounded-full bg-neutral-800 border border-neutral-700 px-2 py-0.5 text-[11px] text-neutral-300 flex items-center gap-1">
            <Clock className="h-3 w-3 text-amber-400" />
            {timeWindow}
          </span>
        </div>
      </div>

      <div className="p-4 space-y-3">
        <div>
          <h4 className="text-sm font-bold text-neutral-100">{title}</h4>
          <p className="mt-1 text-xs text-neutral-300 leading-relaxed">{predText}</p>
        </div>

        {/* Historical Pattern Correlation */}
        <div className="rounded-lg border border-neutral-800 bg-neutral-950/50 p-2.5 text-xs text-neutral-400">
          <div className="flex items-center gap-1.5 font-semibold text-neutral-300 mb-1">
            <TrendingUp className="h-3.5 w-3.5 text-indigo-400" />
            <span>HISTORICAL INCIDENT CORRELATION:</span>
          </div>
          <p className="text-neutral-300">{historicalPattern}</p>
        </div>

        {/* Evidence list */}
        {evidence.length > 0 && (
          <ul className="space-y-1">
            {evidence.map((ev, idx) => (
              <li key={idx} className="text-xs text-neutral-400 flex items-start gap-1.5">
                <span className="text-indigo-400 mt-0.5">•</span>
                <span>{ev}</span>
              </li>
            ))}
          </ul>
        )}

        {/* Suggested Preemptive Action */}
        <div className="rounded-lg border border-indigo-900/50 bg-indigo-950/30 p-3">
          <div className="text-xs font-semibold text-indigo-300 mb-1">
            SUGGESTED PREEMPTIVE MEASURE:
          </div>
          <p className="text-xs font-medium text-neutral-200">{suggestedPreemptiveAction}</p>
        </div>

        {/* Action Controls */}
        {status === 'unverified' ? (
          <div className="pt-1 flex items-center gap-2">
            <button
              type="button"
              onClick={() => onAcceptPreemptive(id)}
              className="flex items-center gap-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 px-3 py-1.5 text-xs font-semibold text-white transition-colors shadow-sm"
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              Dispatch Preemptive Patrol
            </button>
            <button
              type="button"
              onClick={() => onDismissPreemptive(id)}
              className="flex items-center gap-1.5 rounded-lg border border-neutral-700 bg-neutral-800 hover:bg-neutral-700 px-3 py-1.5 text-xs font-medium text-neutral-300 transition-colors"
            >
              <XCircle className="h-3.5 w-3.5" />
              Acknowledge & Monitor
            </button>
          </div>
        ) : (
          <div className="pt-1 text-xs font-medium text-indigo-300 flex items-center gap-1.5">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
            Status: <span className="capitalize">{status}</span> by Operator
          </div>
        )}
      </div>
    </div>
  );
};

interface AnomalyCardProps {
  anomaly: AIAnomalyDetection;
}

export const AnomalyCard: React.FC<AnomalyCardProps> = ({ anomaly }) => {
  return (
    <div className="my-2.5 rounded-xl border border-amber-900/50 bg-neutral-900/90 p-3.5 shadow-md">
      <div className="flex items-center justify-between text-xs mb-1.5">
        <div className="flex items-center gap-1.5 font-bold text-amber-400">
          <AlertCircle className="h-4 w-4" />
          <span>{anomaly.title}</span>
        </div>
        <span className="rounded bg-neutral-800 px-2 py-0.5 font-mono text-[11px] text-amber-300">
          Confidence: {anomaly.confidence}%
        </span>
      </div>
      <p className="text-xs text-neutral-300 mb-2">{anomaly.description}</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] font-mono rounded bg-neutral-950/60 p-2 border border-neutral-800">
        <div>
          <span className="text-neutral-500">Baseline: </span>
          <span className="text-neutral-400">{anomaly.baseline}</span>
        </div>
        <div>
          <span className="text-amber-500/90">Observed: </span>
          <span className="text-amber-300">{anomaly.observed}</span>
        </div>
      </div>
    </div>
  );
};
