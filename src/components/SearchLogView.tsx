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
} from 'lucide-react';
import { AlertIncident, AlertSeverity, CameraFeedItem, ObjectClass } from '../types';

interface SearchLogViewProps {
  incidents: AlertIncident[];
  cameras: CameraFeedItem[];
  onInvestigate: (incident: AlertIncident) => void;
  onSelectPlate: (plate: string) => void;
}

export const SearchLogView: React.FC<SearchLogViewProps> = ({
  incidents,
  cameras,
  onInvestigate,
  onSelectPlate,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCameraId, setSelectedCameraId] = useState<string>('all');
  const [selectedClass, setSelectedClass] = useState<string>('all');
  const [selectedSeverity, setSelectedSeverity] = useState<string>('all');
  const [timeRange, setTimeRange] = useState<'15m' | '1h' | '24h' | 'all'>('all');

  const filteredIncidents = useMemo(() => {
    const now = Date.now();
    return incidents.filter((item) => {
      // Search term (plate, title, camera name, object ID)
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

      // Camera filter
      if (selectedCameraId !== 'all' && item.cameraId !== selectedCameraId) {
        return false;
      }

      // Class filter
      if (selectedClass !== 'all' && item.objectClass !== selectedClass) {
        return false;
      }

      // Severity filter
      if (selectedSeverity !== 'all' && item.severity !== selectedSeverity) {
        return false;
      }

      // Time filter
      if (timeRange === '15m' && now - item.timestamp > 15 * 60 * 1000) return false;
      if (timeRange === '1h' && now - item.timestamp > 60 * 60 * 1000) return false;
      if (timeRange === '24h' && now - item.timestamp > 24 * 60 * 60 * 1000) return false;

      return true;
    });
  }, [incidents, searchTerm, selectedCameraId, selectedClass, selectedSeverity, timeRange]);

  const handleExportCsv = () => {
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
      `"${i.cameraName}"`,
      i.objectClass,
      i.objectId,
      i.severity,
      i.riskScore,
      `"${i.title}"`,
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

  return (
    <div
      id="search-log-view"
      className="flex flex-col h-full rounded-xl border border-neutral-800 bg-neutral-900 text-neutral-100 overflow-hidden"
    >
      {/* Search & Filter Header Bar */}
      <div className="border-b border-neutral-800 bg-neutral-950/60 p-4 space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold tracking-tight">
              Surveillance Incident & Search Log
            </h2>
            <p className="text-xs text-neutral-400">
              Query telemetry across all active feeds, object classes, plate readings, and risk scores
            </p>
          </div>
          <button
            id="export-csv-btn"
            type="button"
            onClick={handleExportCsv}
            className="flex items-center gap-1.5 rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-xs font-medium text-neutral-200 hover:bg-neutral-700 hover:text-white"
          >
            <Download className="h-3.5 w-3.5" />
            Export CSV
          </button>
        </div>

        {/* Filter Controls Row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-2.5">
          {/* Text / Plate Query Input */}
          <div className="relative md:col-span-2">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-neutral-500" />
            <input
              id="search-input"
              type="text"
              placeholder="Search plate, object ID, or camera..."
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

          {/* Object Class Filter */}
          <div>
            <select
              id="filter-class-select"
              value={selectedClass}
              onChange={(e) => setSelectedClass(e.target.value)}
              className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-xs text-neutral-200 focus:border-amber-500 focus:outline-none"
            >
              <option value="all">All Object Classes</option>
              <option value="person">People</option>
              <option value="car">Cars</option>
              <option value="truck">Trucks</option>
              <option value="bus">Buses</option>
              <option value="motorcycle">Motorcycles</option>
              <option value="bicycle">Bicycles</option>
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
              <option value="critical">Critical (70-100)</option>
              <option value="high">High (50-69)</option>
              <option value="medium">Medium (30-49)</option>
              <option value="low">Low (15-29)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Results Table */}
      <div className="flex-1 overflow-y-auto">
        {filteredIncidents.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center text-neutral-500">
            <Search className="h-10 w-10 text-neutral-600 mb-2" />
            <p className="text-sm font-medium text-neutral-400">No matching incident logs found</p>
            <p className="mt-1 text-xs">Try adjusting your filter criteria or search query</p>
          </div>
        ) : (
          <table className="w-full text-left text-xs border-collapse">
            <thead className="border-b border-neutral-800 bg-neutral-950/80 text-[11px] font-medium uppercase tracking-wider text-neutral-400 sticky top-0">
              <tr>
                <th className="py-3 px-4">Snapshot</th>
                <th className="py-3 px-4">Timestamp</th>
                <th className="py-3 px-4">Camera</th>
                <th className="py-3 px-4">Incident Event</th>
                <th className="py-3 px-4">Target Object</th>
                <th className="py-3 px-4">ANPR Plate</th>
                <th className="py-3 px-4">Risk / Severity</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-800">
              {filteredIncidents.map((incident) => {
                const isVehicle = ['car', 'truck', 'bus', 'motorcycle'].includes(
                  incident.objectClass
                );
                return (
                  <tr
                    key={incident.id}
                    className="hover:bg-neutral-800/40 transition-colors group"
                  >
                    {/* Snapshot */}
                    <td className="py-2.5 px-4 w-20">
                      {incident.snapshotUrl ? (
                        <img
                          src={incident.snapshotUrl}
                          alt="Snapshot"
                          className="h-10 w-16 rounded border border-neutral-800 object-cover bg-black"
                        />
                      ) : (
                        <div className="h-10 w-16 rounded border border-neutral-800 bg-neutral-950 flex items-center justify-center text-[9px] text-neutral-600">
                          N/A
                        </div>
                      )}
                    </td>

                    {/* Timestamp */}
                    <td className="py-2.5 px-4 whitespace-nowrap font-mono text-neutral-300">
                      {new Date(incident.timestamp).toLocaleDateString()}{' '}
                      <span className="text-neutral-500">
                        {new Date(incident.timestamp).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit',
                        })}
                      </span>
                    </td>

                    {/* Camera */}
                    <td className="py-2.5 px-4 whitespace-nowrap font-medium text-neutral-200">
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
                          className={`rounded px-1.5 py-0.2 text-[10px] uppercase font-bold ${
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
