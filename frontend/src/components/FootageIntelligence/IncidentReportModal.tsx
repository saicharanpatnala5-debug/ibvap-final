import React, { useState } from 'react';
import {
  AlertTriangle,
  Calendar,
  Check,
  Clock,
  Copy,
  Download,
  ExternalLink,
  FileText,
  MapPin,
  Play,
  Printer,
  ShieldAlert,
  Users,
  X,
} from 'lucide-react';
import { FootageIncidentReport, ReportEventSequenceItem } from '../../types/intelligence';

interface IncidentReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  report: FootageIncidentReport | null;
  onSeekToTimestamp: (seconds: number) => void;
}

export const IncidentReportModal: React.FC<IncidentReportModalProps> = ({
  isOpen,
  onClose,
  report,
  onSeekToTimestamp,
}) => {
  const [copied, setCopied] = useState(false);

  if (!isOpen || !report) return null;

  const handleCopyReport = () => {
    const markdown = `# CCTV SURVEILLANCE INCIDENT FORENSIC REPORT
**Incident ID:** ${report.incidentId}
**Generated:** ${new Date(report.generatedAt).toLocaleString()}
**Location & Source:** ${report.locationAndSource}
**Duration Summary:** ${report.durationSummary}
**Overall Confidence:** ${report.confidenceScores.overallConfidence}%

---
## 1. EXECUTIVE SUMMARY
${report.finalAISummary}

---
## 2. SEQUENCE OF EVENTS (CHRONOLOGICAL)
${report.sequenceOfEvents.map((e) => `- [${e.formattedTime}] ${e.text}`).join('\n')}

---
## 3. ENTITIES INVOLVED
${report.entitiesInvolved.map((e) => `- ${e.label} (${e.type.toUpperCase()}) | Appearance: ${e.appearance} | Visible: ${e.firstSeenTime} - ${e.lastSeenTime} | Confidence: ${e.confidence}%`).join('\n')}

---
## 4. ANOMALIES & SECURITY RISK FLAGS
${report.anomalies.map((a) => `- [${a.formattedTime}] ${a.description} (Risk: ${a.riskScore}/100, Severity: ${a.severity.toUpperCase()}) - Threshold: ${a.threshold}`).join('\n')}

---
## 5. EVIDENCE TIMESTAMPS
${report.evidenceTimestamps.map((ev) => `- [${ev.formattedTime}] ${ev.label}: ${ev.reason}`).join('\n')}
`;

    navigator.clipboard.writeText(markdown);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handlePrint = () => {
    window.print();
  };

  const highestRisk = Math.max(...report.anomalies.map((a) => a.riskScore), 50);

  return (
    <div
      id="incident-report-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        id="incident-report-modal-content"
        className="relative w-full max-w-4xl rounded-xl border border-neutral-800 bg-neutral-950 text-neutral-100 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-neutral-800 px-6 py-4 bg-neutral-900/60">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400">
              <FileText className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-neutral-100 tracking-tight">
                  Automated Incident Forensic Report
                </h2>
                <span className="rounded bg-neutral-800 px-2 py-0.5 font-mono text-[11px] font-semibold text-amber-400 border border-neutral-700">
                  {report.incidentId}
                </span>
              </div>
              <p className="text-xs text-neutral-400">
                Ground-truth neural video comprehension & explainable intelligence audit
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCopyReport}
              className="flex items-center gap-1.5 rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-xs font-medium text-neutral-200 hover:bg-neutral-700 transition-colors"
              title="Copy markdown report to clipboard"
            >
              {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
              <span>{copied ? 'Copied' : 'Copy Report'}</span>
            </button>

            <button
              type="button"
              onClick={handlePrint}
              className="flex items-center gap-1.5 rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-xs font-medium text-neutral-200 hover:bg-neutral-700 transition-colors"
              title="Print report"
            >
              <Printer className="h-3.5 w-3.5" />
              <span>Print</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100 transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Scrollable Report Body */}
        <div className="overflow-y-auto p-6 space-y-6 text-sm">
          {/* Metadata Banner */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 rounded-lg border border-neutral-800 bg-neutral-900/40 p-3.5">
            <div>
              <span className="text-[11px] font-medium text-neutral-500 uppercase tracking-wider block">Source Camera</span>
              <div className="flex items-center gap-1.5 text-neutral-200 font-medium text-xs mt-0.5">
                <MapPin className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                <span className="truncate">{report.locationAndSource}</span>
              </div>
            </div>

            <div>
              <span className="text-[11px] font-medium text-neutral-500 uppercase tracking-wider block">Generated Timestamp</span>
              <div className="flex items-center gap-1.5 text-neutral-200 font-medium text-xs mt-0.5">
                <Calendar className="h-3.5 w-3.5 text-neutral-400 shrink-0" />
                <span>{new Date(report.generatedAt).toLocaleTimeString()}</span>
              </div>
            </div>

            <div>
              <span className="text-[11px] font-medium text-neutral-500 uppercase tracking-wider block">Clip Duration</span>
              <div className="flex items-center gap-1.5 text-neutral-200 font-medium text-xs mt-0.5">
                <Clock className="h-3.5 w-3.5 text-neutral-400 shrink-0" />
                <span className="font-mono">{report.durationSummary}</span>
              </div>
            </div>

            <div>
              <span className="text-[11px] font-medium text-neutral-500 uppercase tracking-wider block">Peak Threat Risk</span>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold font-mono ${
                  highestRisk >= 80 ? 'bg-red-500/20 text-red-400 border border-red-500/30' : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                }`}>
                  <ShieldAlert className="h-3.5 w-3.5" />
                  {highestRisk}/100 Risk
                </span>
                <span className="text-[11px] text-neutral-400">({report.confidenceScores.overallConfidence}% Conf.)</span>
              </div>
            </div>
          </div>

          {/* 1. Executive Summary */}
          <div className="rounded-lg border border-neutral-800 bg-neutral-900/30 p-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-amber-400 mb-2 flex items-center gap-2">
              <span className="flex h-5 w-5 items-center justify-center rounded bg-amber-500/20 text-amber-400 text-[11px]">1</span>
              Executive Scene Summary
            </h3>
            <p className="text-neutral-300 leading-relaxed text-xs sm:text-sm">
              {report.finalAISummary}
            </p>
          </div>

          {/* 2. Chronological Sequence of Events with Clickable Timestamps */}
          <div className="rounded-lg border border-neutral-800 bg-neutral-900/30 p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-amber-400 flex items-center gap-2">
                <span className="flex h-5 w-5 items-center justify-center rounded bg-amber-500/20 text-amber-400 text-[11px]">2</span>
                Chronological Sequence of Events
              </h3>
              <span className="text-[11px] text-neutral-400 italic">
                *Click any timestamp [MM:SS] to seek video player directly to evidence frame
              </span>
            </div>

            <div className="space-y-2 border-l border-neutral-800 ml-3 pl-4">
              {report.sequenceOfEvents.map((item, idx) => (
                <div key={idx} className="group relative flex items-start gap-3 py-1">
                  <span className="absolute -left-[21px] top-2 h-2.5 w-2.5 rounded-full bg-neutral-700 group-hover:bg-amber-400 transition-colors" />

                  {/* Clickable timestamp pill */}
                  <button
                    type="button"
                    onClick={() => {
                      onSeekToTimestamp(item.timestampSec);
                      onClose();
                    }}
                    className="inline-flex items-center gap-1 rounded bg-neutral-800 px-2 py-0.5 font-mono text-xs font-semibold text-amber-400 hover:bg-amber-500/20 hover:text-amber-300 border border-neutral-700 transition-colors shrink-0"
                    title={`Seek video to ${item.formattedTime}`}
                  >
                    <Play className="h-3 w-3 fill-amber-400" />
                    [{item.formattedTime}]
                  </button>

                  <div className="text-xs text-neutral-300 flex-1 leading-normal pt-0.5">
                    {item.type === 'alert' ? (
                      <span className="text-red-300 font-semibold">{item.text}</span>
                    ) : (
                      item.text
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 3. Entities Involved Table */}
          <div className="rounded-lg border border-neutral-800 bg-neutral-900/30 p-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-amber-400 mb-3 flex items-center gap-2">
              <span className="flex h-5 w-5 items-center justify-center rounded bg-amber-500/20 text-amber-400 text-[11px]">3</span>
              Entities Tracked & Identified
            </h3>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-neutral-800 text-neutral-400 font-medium">
                    <th className="pb-2">Entity ID</th>
                    <th className="pb-2">Classification</th>
                    <th className="pb-2">Visual Appearance</th>
                    <th className="pb-2">Active Range</th>
                    <th className="pb-2 text-right">Confidence</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-800/60">
                  {report.entitiesInvolved.map((ent) => (
                    <tr key={ent.id} className="hover:bg-neutral-800/30 transition-colors">
                      <td className="py-2.5 font-mono font-semibold text-amber-400">{ent.id}</td>
                      <td className="py-2.5 capitalize text-neutral-200">{ent.type}</td>
                      <td className="py-2.5 text-neutral-300">{ent.appearance}</td>
                      <td className="py-2.5 font-mono text-neutral-400">
                        {ent.firstSeenTime} – {ent.lastSeenTime}
                      </td>
                      <td className="py-2.5 text-right font-mono font-medium text-emerald-400">
                        {ent.confidence}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* 4. Anomalies & Risk Analysis */}
          <div className="rounded-lg border border-neutral-800 bg-neutral-900/30 p-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-amber-400 mb-3 flex items-center gap-2">
              <span className="flex h-5 w-5 items-center justify-center rounded bg-amber-500/20 text-amber-400 text-[11px]">4</span>
              Security Risk Analysis & Threshold Violations
            </h3>

            <div className="space-y-3">
              {report.anomalies.map((anom, idx) => (
                <div
                  key={idx}
                  className={`p-3 rounded-lg border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                    anom.riskScore >= 80
                      ? 'border-red-900/60 bg-red-950/20 text-red-200'
                      : 'border-amber-900/60 bg-amber-950/20 text-amber-200'
                  }`}
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          onSeekToTimestamp(anom.timestampSec);
                          onClose();
                        }}
                        className="font-mono text-xs font-bold px-1.5 py-0.5 rounded bg-black/40 border border-neutral-700 text-amber-300 hover:bg-neutral-800 inline-flex items-center gap-1"
                      >
                        <Play className="h-3 w-3 fill-amber-300" />
                        [{anom.formattedTime}]
                      </button>
                      <span className="font-semibold text-neutral-100 text-xs sm:text-sm">{anom.description}</span>
                    </div>
                    <p className="text-[11px] text-neutral-400">
                      <span className="font-medium text-neutral-300">Rule Trigger:</span> {anom.threshold}
                    </p>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <div className="text-right font-mono">
                      <span className="text-xs text-neutral-400 block">Risk Score</span>
                      <span className="text-sm font-bold text-red-400">{anom.riskScore}/100</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="border-t border-neutral-800 px-6 py-3 bg-neutral-900/80 flex items-center justify-between text-xs text-neutral-400">
          <div>
            System Analyst: <span className="text-neutral-200 font-medium">IBVAP Automated Video Understanding Engine</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-neutral-800 px-4 py-1.5 text-xs font-semibold text-neutral-200 hover:bg-neutral-700 transition-colors"
          >
            Close Report
          </button>
        </div>
      </div>
    </div>
  );
};
