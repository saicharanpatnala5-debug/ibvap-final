import React, { useState, useMemo } from 'react';
import {
  Calendar,
  Camera,
  Car,
  Download,
  ExternalLink,
  Filter,
  Search,
  Shield,
  ShieldAlert,
  User,
  X,
  FileCode,
  ListFilter,
  Activity,
} from 'lucide-react';
import { AlertIncident, AlertSeverity, CameraFeedItem, ObjectClass } from '../types';
import {
  PlatformEventLogEntry,
  loadStoredEventLog,
  exportEventsToCsv,
  exportEventsToJson,
} from '../services/storageService';

interface SearchLogViewProps {
  incidents: AlertIncident[];
  cameras: CameraFeedItem[];
  onInvestigate: (incident: AlertIncident) => void;
  onSelectPlate: (plate: string) => void;
  eventLog?: PlatformEventLogEntry[];
}

export const SearchLogView: React.FC<SearchLogViewProps> = ({
  incidents,
  cameras,
  onInvestigate,
  onSelectPlate,
  eventLog = [],
}) => {
  const [activeViewMode, setActiveViewMode] = useState<'incidents' | 'event_log'>('incidents');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCameraId, setSelectedCameraId] = useState<string>('all');
  const [selectedClass, setSelectedClass] = useState<string>('all');
  const [selectedSeverity, setSelectedSeverity] = useState<string>('all');
  const [timeRange, setTimeRange] = useState<'15m' | '1h' | '24h' | 'all'>('all');

  // Filtered incidents
  const filteredIncidents = useMemo(() => {
    const now = Date.now();
    return incidents.filter((item) => {
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        const matchesPlate = item.anprPlate?.toLowerCase().includes(term);
        const matchesTitle = item.title.toLowerCase().includes(term);
        const matchesCam = item.cameraName.toLowerCase().includes(term);
        const matchesObj = `${item.objectClass} #${item.objectId}`.toLowerCase().includes(term);
        if (!matchesPlate && !matchesTitle && !matchesCam && !matchesObj) {
          return false;
        }
      }

      if (selectedCameraId !== 'all' && item.cameraId !== selectedCameraId) {
        return false;
      }

      if (selectedClass !== 'all' && item.objectClass !== selectedClass) {
        return false;
      }

      if (selectedSeverity !== 'all' && item.severity !== selectedSeverity) {
        return false;
      }

      if (timeRange === '15m' && now - item.timestamp > 15 * 60 * 1000) return false;
      if (timeRange === '1h' && now - item.timestamp > 60 * 60 * 1000) return false;
      if (timeRange === '24h' && now - item.timestamp > 24 * 60 * 60 * 1000) return false;

      return true;
    });
  }, [incidents, searchTerm, selectedCameraId, selectedClass, selectedSeverity, timeRange]);

  // Filtered append-only event log
  const effectiveEventLog = useMemo(() => {
    const list = eventLog.length > 0 ? eventLog : loadStoredEventLog();
    if (!searchTerm.trim()) return list;
    const term = searchTerm.toLowerCase();
    return list.filter(
      (e) =>
        e.eventType.toLowerCase().includes(term) ||
        e.cameraName.toLowerCase().includes(term) ||
        (e.details && e.details.toLowerCase().includes(term))
    );
  }, [eventLog, searchTerm]);

  // Export CSV handler
  const handleExportCsv = () => {
    if (activeViewMode === 'event_log') {
      exportEventsToCsv(effectiveEventLog);
      return;
    }

    const headers = [
      'Incident ID',
      'Timestamp',
      'Camera Name',
      'Object Class',
      'Object ID',
      'Severity',
      'Risk Score',
      'Title',
      'ANPR Plate',
      'Status',
    ];
    const rows = filteredIncidents.map((i) => [
      i.id,
      new Date(i.timestamp).toISOString(),
      `"${i.cameraName.replace(/"/g, '""')}"`,
      i.objectClass,
      i.objectId,
      i.severity,
      i.riskScore,
      `"${i.title.replace(/"/g, '""')}"`,
      i.anprPlate || 'N/A',
      i.status,
    ]);

    const csvContent =
      'data:text/csv;charset=utf-8,' +
      [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `IBVAP-Incident-Log-${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  // Export JSON handler
  const handleExportJson = () => {
    if (activeViewMode === 'event_log') {
      exportEventsToJson(effectiveEventLog);
      return;
    }

    const jsonStr = JSON.stringify(filteredIncidents, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `IBVAP-Incidents-${Date.now()}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div
      id="search-log-view"
      className="flex flex-col h-full rounded-xl border border-neutral-800 bg-neutral-900 text-neutral-100 overflow-hidden"
    >
      {/* Search & Filter Header Bar */}
      <div className="border-b border-neutral-800 bg-neutral-950/60 p-4 space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-base font-semibold tracking-tight">
                Surveillance Intelligence & Audit Log
              </h2>
              {/* Tab Selector */}
              <div className="inline-flex rounded-lg bg-neutral-900 border border-neutral-800 p-0.5 text-xs">
                <button
                  type="button"
                  onClick={() => setActiveViewMode('incidents')}
                  className={`rounded-md px-2.5 py-1 font-medium transition-colors ${
                    activeViewMode === 'incidents'
                      ? 'bg-amber-500 text-neutral-950 font-bold'
                      : 'text-neutral-400 hover:text-white'
                  }`}
                >
                  Incident Log ({filteredIncidents.length})
                </button>
                <button
                  type="button"
                  onClick={() => setActiveViewMode('event_log')}
                  className={`rounded-md px-2.5 py-1 font-medium transition-colors ${
                    activeViewMode === 'event_log'
                      ? 'bg-amber-500 text-neutral-950 font-bold'
                      : 'text-neutral-400 hover:text-white'
                  }`}
                >
                  Append-Only Event Log ({effectiveEventLog.length})
                </button>
              </div>
            </div>
            <p className="text-xs text-neutral-400 mt-1">
              {activeViewMode === 'incidents'
                ? 'Query real-time alerts across active camera nodes, object classes, license plates, and risk severity'
                : 'Immutable append-only platform ledger recording perimeter crossings, ANPR reads, operator acknowledgments, and escalations'}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              id="export-json-btn"
              type="button"
              onClick={handleExportJson}
              className="flex items-center gap-1.5 rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-xs font-medium text-neutral-200 hover:bg-neutral-700 hover:text-white transition-colors"
              title="Export displayed audit trail as JSON"
            >
              <FileCode className="h-3.5 w-3.5 text-amber-400" />
              <span>Export JSON</span>
            </button>
            <button
              id="export-csv-btn"
              type="button"
              onClick={handleExportCsv}
              className="flex items-center gap-1.5 rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-xs font-medium text-neutral-200 hover:bg-neutral-700 hover:text-white transition-colors"
              title="Export displayed audit trail as CSV spreadsheet"
            >
              <Download className="h-3.5 w-3.5 text-emerald-400" />
              <span>Export CSV</span>
            </button>
          </div>
        </div>

        {/* Filter Controls Row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-2.5">
          {/* Text / Plate Query Input */}
          <div className="relative md:col-span-2">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-neutral-500" />
            <input
              id="search-input"
              type="text"
              placeholder={activeViewMode === 'incidents' ? 'Search plate, object ID, or camera...' : 'Search event type, camera, or details...'}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full rounded-lg border border-neutral-700 bg-neutral-950 pl-9 pr-8 py-2 text-xs text-neutral-100 placeholder-neutral-500 focus:border-amber-500 focus:outline-none"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-2.5 top-2.5 text-neutral-400 hover:text-white"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {activeViewMode === 'incidents' && (
            <>
              {/* Camera Filter */}
              <div>
                <select
                  id="filter-camera-select"
                  value={selectedCameraId}
                  onChange={(e) => setSelectedCameraId(e.target.value)}
                  className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-xs text-neutral-200 focus:border-amber-500 focus:outline-none"
                >
                  <option value="all">All Cameras ({cameras.length})</option>
                  {cameras.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Class Filter */}
              <div>
                <select
                  id="filter-class-select"
                  value={selectedClass}
                  onChange={(e) => setSelectedClass(e.target.value)}
                  className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-xs text-neutral-200 focus:border-amber-500 focus:outline-none"
                >
                  <option value="all">All Object Classes</option>
                  <option value="person">Persons</option>
                  <option value="car">Cars</option>
                  <option value="truck">Trucks</option>
                  <option value="bus">Buses</option>
                  <option value="motorcycle">Motorcycles</option>
                </select>
              </div>

              {/* Severity Filter */}
              <div>
                <select
                  id="filter-severity-select"
                  value={selectedSeverity}
                  onChange={(e) => setSelectedSeverity(e.target.value)}
                  className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-xs text-neutral-200 focus:border-amber-500 focus:outline-none"
                >
                  <option value="all">All Severities</option>
                  <option value="critical">Critical (Score 70+)</option>
                  <option value="high">High (Score 50-69)</option>
                  <option value="medium">Medium (Score 30-49)</option>
                  <option value="low">Low (Score &lt;30)</option>
                </select>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Main Table Content */}
      <div className="flex-1 overflow-y-auto">
        {activeViewMode === 'event_log' ? (
          // APPEND-ONLY EVENT LOG VIEW
          effectiveEventLog.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center text-neutral-500">
              <Activity className="h-10 w-10 text-neutral-600 mb-2" />
              <p className="text-sm font-medium text-neutral-400">No audit events recorded yet</p>
              <p className="mt-1 text-xs">Platform events are logged here as cameras run detections and operator actions occur.</p>
            </div>
          ) : (
            <table className="w-full text-left border-collapse text-xs">
              <thead className="bg-neutral-950/80 sticky top-0 border-b border-neutral-800 text-neutral-400 font-medium">
                <tr>
                  <th className="py-2.5 px-4 whitespace-nowrap">Timestamp</th>
                  <th className="py-2.5 px-4 whitespace-nowrap">Camera Node</th>
                  <th className="py-2.5 px-4 whitespace-nowrap">Event Type</th>
                  <th className="py-2.5 px-4 whitespace-nowrap">Risk Score</th>
                  <th className="py-2.5 px-4">Event Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800/60">
                {effectiveEventLog.map((ev) => (
                  <tr key={ev.id} className="hover:bg-neutral-850/40 transition-colors">
                    <td className="py-2.5 px-4 whitespace-nowrap font-mono text-neutral-400">
                      {new Date(ev.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </td>
                    <td className="py-2.5 px-4 whitespace-nowrap text-neutral-200 font-medium">
                      {ev.cameraName}
                    </td>
                    <td className="py-2.5 px-4 whitespace-nowrap">
                      <span className="rounded bg-neutral-800 px-2 py-0.5 text-amber-300 font-medium">
                        {ev.eventType}
                      </span>
                    </td>
                    <td className="py-2.5 px-4 whitespace-nowrap font-mono font-bold">
                      <span
                        className={`rounded px-1.5 py-0.5 text-[11px] ${
                          ev.riskScore >= 70
                            ? 'bg-red-950 text-red-300 border border-red-800'
                            : ev.riskScore >= 50
                            ? 'bg-orange-950 text-orange-300 border border-orange-800'
                            : 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                        }`}
                      >
                        {ev.riskScore}/100
                      </span>
                    </td>
                    <td className="py-2.5 px-4 text-neutral-300 max-w-md truncate">
                      {ev.details || `Target Object #${ev.objectId || 'N/A'}`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        ) : filteredIncidents.length === 0 ? (
          // INCIDENTS LOG VIEW
          <div className="flex flex-col items-center justify-center py-20 text-center text-neutral-500">
            <Shield className="h-10 w-10 text-neutral-600 mb-2" />
            <p className="text-sm font-medium text-neutral-400">No surveillance alerts matching filters</p>
            <p className="mt-1 text-xs">Adjust filter settings or run a camera feed to generate detections</p>
          </div>
        ) : (
          <table className="w-full text-left border-collapse text-xs">
            <thead className="bg-neutral-950/80 sticky top-0 border-b border-neutral-800 text-neutral-400 font-medium">
              <tr>
                <th className="py-2.5 px-4 whitespace-nowrap">Time</th>
                <th className="py-2.5 px-4 whitespace-nowrap">Camera</th>
                <th className="py-2.5 px-4">Incident Title</th>
                <th className="py-2.5 px-4 whitespace-nowrap">Object</th>
                <th className="py-2.5 px-4 whitespace-nowrap">ANPR Plate</th>
                <th className="py-2.5 px-4 whitespace-nowrap">Risk Score</th>
                <th className="py-2.5 px-4 whitespace-nowrap text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-800/60">
              {filteredIncidents.map((incident) => {
                const isVehicle = ['car', 'truck', 'bus', 'motorcycle'].includes(incident.objectClass);

                return (
                  <tr key={incident.id} className="hover:bg-neutral-850/40 transition-colors">
                    {/* Time */}
                    <td className="py-2.5 px-4 whitespace-nowrap font-mono text-neutral-400">
                      {new Date(incident.timestamp).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                      })}
                    </td>

                    {/* Camera */}
                    <td className="py-2.5 px-4 whitespace-nowrap text-neutral-300 font-medium">
                      {incident.cameraName}
                    </td>

                    {/* Event Title */}
                    <td className="py-2.5 px-4 text-neutral-200 font-semibold max-w-xs truncate">
                      {incident.title}
                    </td>

                    {/* Object */}
                    <td className="py-2.5 px-4 whitespace-nowrap">
                      <span className="rounded bg-neutral-800 px-2 py-0.5 text-neutral-300 capitalize inline-flex items-center gap-1">
                        {isVehicle ? <Car className="h-3 w-3" /> : <User className="h-3 w-3" />}
                        {incident.objectClass} #{incident.objectId}
                      </span>
                    </td>

                    {/* Plate */}
                    <td className="py-2.5 px-4 whitespace-nowrap font-mono">
                      {incident.anprPlate ? (
                        <button
                          type="button"
                          onClick={() => onSelectPlate(incident.anprPlate!)}
                          className="rounded bg-neutral-800 hover:bg-neutral-700 px-2 py-0.5 font-bold text-emerald-400 flex items-center gap-1 transition-colors"
                        >
                          {incident.anprPlate}
                          <ExternalLink className="h-2.5 w-2.5" />
                        </button>
                      ) : (
                        <span className="text-neutral-600">—</span>
                      )}
                    </td>

                    {/* Severity & Score */}
                    <td className="py-2.5 px-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-neutral-200">
                          {incident.riskScore}
                        </span>
                        <span
                          className={`rounded px-1.5 py-0.5 text-[10px] uppercase font-bold ${
                            incident.severity === 'critical'
                              ? 'bg-red-950 text-red-300 border border-red-800'
                              : incident.severity === 'high'
                              ? 'bg-orange-950 text-orange-300 border border-orange-800'
                              : incident.severity === 'medium'
                              ? 'bg-amber-950 text-amber-300 border border-amber-800'
                              : 'bg-blue-950 text-blue-300 border border-blue-800'
                          }`}
                        >
                          {incident.severity}
                        </span>
                      </div>
                    </td>

                    {/* Actions */}
                    <td className="py-2.5 px-4 whitespace-nowrap text-right">
                      <button
                        type="button"
                        onClick={() => onInvestigate(incident)}
                        className="rounded bg-neutral-800 hover:bg-neutral-750 px-2.5 py-1 text-neutral-200 font-medium transition-colors"
                      >
                        Investigate
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};
