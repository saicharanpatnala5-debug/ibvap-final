import {
  AlertIncident,
  CameraFeedItem,
  PlateRegistryRecord,
  AIChatMessage,
} from '../types';

export const PIPELINE_SCHEMA_VERSION = 'v8.0.0';
export const PIPELINE_RUN_ID = 'r8-release-20261115';

export interface StorageEnvelope<T> {
  schemaVersion: string;
  runId: string;
  savedAt: number;
  data: T;
}

export interface PlatformEventLogEntry {
  id: string;
  timestamp: number;
  cameraName: string;
  cameraId?: string;
  eventType: string;
  riskScore: number;
  objectId?: number;
  details?: string;
}

export const STORAGE_KEYS = {
  CAMERAS: 'ibvap_cameras_v8',
  ALERTS: 'ibvap_alerts_v8',
  PLATES: 'ibvap_plates_v8',
  CHAT: 'ibvap_chat_history_v8',
  EVENT_LOG: 'ibvap_event_log_v8',
};

// Legacy unversioned storage keys that must be discarded to eliminate stale data
const LEGACY_STORAGE_KEYS = [
  'ibvap_cameras_v1',
  'ibvap_alerts_v1',
  'ibvap_plates_v1',
  'ibvap_chat_history_v1',
  'ibvap_event_log_v1',
  'ibvap_cameras',
  'ibvap_alerts',
  'ibvap_plates',
];

// Purge legacy unversioned keys on initialization
if (typeof window !== 'undefined') {
  try {
    LEGACY_STORAGE_KEYS.forEach((k) => localStorage.removeItem(k));
  } catch {
    // ignore
  }
}

// Version-validated envelope serialization
function wrapWithEnvelope<T>(data: T): string {
  const envelope: StorageEnvelope<T> = {
    schemaVersion: PIPELINE_SCHEMA_VERSION,
    runId: PIPELINE_RUN_ID,
    savedAt: Date.now(),
    data,
  };
  return JSON.stringify(envelope);
}

// Version-validated JSON parser
function safeJsonParseVersioned<T>(raw: string | null, fallback: T, keyName?: string): T {
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && 'schemaVersion' in parsed && 'data' in parsed) {
      if (parsed.schemaVersion !== PIPELINE_SCHEMA_VERSION) {
        console.warn(
          `[IBVAP Storage] Version mismatch for ${keyName || 'record'}: stored=${parsed.schemaVersion}, required=${PIPELINE_SCHEMA_VERSION}. Purging stale record.`
        );
        if (typeof window !== 'undefined' && keyName) {
          localStorage.removeItem(keyName);
        }
        return fallback;
      }
      return parsed.data as T;
    }
    // If raw payload is legacy unversioned JSON (e.g. raw array), discard immediately
    console.warn(`[IBVAP Storage] Discarding legacy unversioned data for ${keyName || 'key'}.`);
    if (typeof window !== 'undefined' && keyName) {
      localStorage.removeItem(keyName);
    }
    return fallback;
  } catch (err) {
    console.warn('[IBVAP Storage] Failed to parse key from localStorage:', err);
    if (typeof window !== 'undefined' && keyName) {
      localStorage.removeItem(keyName);
    }
    return fallback;
  }
}

// Clean raw filenames into human-readable camera names
export function cleanCameraName(rawName: string, fallbackIndex = 1): string {
  if (!rawName || typeof rawName !== 'string') return `Camera ${fallbackIndex}`;
  let clean = rawName.trim();
  clean = clean.replace(/\.(mp4|avi|mov|mkv|webm|m4v|flv|wmv)$/i, '');
  clean = clean.replace(/^(WhatsApp\s*Video|VID|REC|CCTV|DVR|MOV|DSC|CLIP)[-_\s]*/i, '');
  clean = clean.replace(/\bat\s*\d{1,2}[.:]\d{2}[.:]\d{2}\s*(?:AM|PM)?/i, '');
  clean = clean.replace(/\b\d{1,2}[.:]\d{2}[.:]\d{2}\s*(?:AM|PM)?/i, '');
  clean = clean.replace(/\b\d{4}[-_.]\d{2}[-_.]\d{2}\b/g, '');
  clean = clean.replace(/\b\d{6,14}\b/g, '');
  clean = clean.replace(/[-_]+/g, ' ').trim();
  if (!clean || clean.length < 2 || !/[a-zA-Z]/.test(clean)) {
    return `Camera ${fallbackIndex}`;
  }
  return clean;
}

/**
 * 1-Click Platform Reset:
 * Clears ALL browser storage (localStorage and sessionStorage)
 * and resets backend core-service tables via /api/demo/clear.
 */
export function clearStoredPlatformData() {
  if (typeof window === 'undefined') return;
  try {
    localStorage.clear();
    sessionStorage.clear();
  } catch (err) {
    console.warn('[IBVAP Storage] Error clearing web storage:', err);
  }
  // Clear backend tables
  fetch('/api/demo/clear', { method: 'POST' }).catch((err) => {
    console.warn('[IBVAP Storage] Failed to clear core-service tables:', err);
  });
}

// -------------------------------------------------------------
// CAMERAS & VIRTUAL ZONES
// -------------------------------------------------------------

export function loadStoredCameras(): CameraFeedItem[] {
  if (typeof window === 'undefined') return [];
  const stored = safeJsonParseVersioned<CameraFeedItem[]>(
    localStorage.getItem(STORAGE_KEYS.CAMERAS),
    [],
    STORAGE_KEYS.CAMERAS
  );
  const valid = stored.filter((c) => {
    if (c.sourceType === 'file' && (!c.sourceUrl || c.sourceUrl.trim() === '')) {
      return false;
    }
    return true;
  });
  return valid.map((c) => ({
    ...c,
    zones: Array.isArray(c.zones) ? c.zones : [],
  }));
}

export function saveStoredCameras(cameras: CameraFeedItem[]) {
  if (typeof window === 'undefined') return;
  try {
    const sanitized = cameras.slice(0, 20).map((c) => ({
      ...c,
      sourceUrl: c.sourceType === 'stream' ? (c.sourceUrl || '') : (c.sourceUrl && c.sourceUrl.startsWith('blob:') ? '' : (c.sourceUrl || '')),
      status: c.sourceType === 'file' && c.sourceUrl && c.sourceUrl.startsWith('blob:') ? 'paused' : c.status,
    }));
    localStorage.setItem(STORAGE_KEYS.CAMERAS, wrapWithEnvelope(sanitized));
  } catch (err) {
    console.warn('[IBVAP Storage] Failed to save cameras:', err);
  }
}

// -------------------------------------------------------------
// REAL-TIME ALERTS
// -------------------------------------------------------------

export function loadStoredAlerts(): AlertIncident[] {
  if (typeof window === 'undefined') return [];
  return safeJsonParseVersioned<AlertIncident[]>(
    localStorage.getItem(STORAGE_KEYS.ALERTS),
    [],
    STORAGE_KEYS.ALERTS
  );
}

export function saveStoredAlerts(alerts: AlertIncident[], maxItems = 80) {
  if (typeof window === 'undefined') return;
  try {
    const sanitized = alerts.slice(0, maxItems).map((a) => ({
      ...a,
      snapshotUrl: typeof a.snapshotUrl === 'string' && a.snapshotUrl.length > 50000 ? undefined : a.snapshotUrl,
    }));
    localStorage.setItem(STORAGE_KEYS.ALERTS, wrapWithEnvelope(sanitized));
  } catch (err) {
    console.warn('[IBVAP Storage] Failed to save alerts:', err);
  }
}

// -------------------------------------------------------------
// ANPR VEHICLE REGISTRY RECORDS
// -------------------------------------------------------------

export function loadStoredPlateRecords(): PlateRegistryRecord[] {
  // Registry data must be tied to a loaded active video source.
  // Never hydrate unlinked stale records on startup, refresh or when no video is active.
  return [];
}

export function saveStoredPlateRecords(records: PlateRegistryRecord[], maxItems = 80) {
  if (typeof window === 'undefined') return;
  try {
    if (!records || records.length === 0) {
      localStorage.removeItem(STORAGE_KEYS.PLATES);
      return;
    }
    const sanitized = records.slice(0, maxItems).map((r) => ({
      ...r,
      cropUrl: typeof r.cropUrl === 'string' && r.cropUrl.length > 50000 ? undefined : r.cropUrl,
    }));
    localStorage.setItem(STORAGE_KEYS.PLATES, wrapWithEnvelope(sanitized));
  } catch (err) {
    console.warn('[IBVAP Storage] Failed to save plate records:', err);
  }
}

// -------------------------------------------------------------
// AI COPILOT CHAT HISTORY
// -------------------------------------------------------------

export function loadStoredChatHistory(): AIChatMessage[] {
  if (typeof window === 'undefined') return [];
  return safeJsonParseVersioned<AIChatMessage[]>(
    localStorage.getItem(STORAGE_KEYS.CHAT),
    [],
    STORAGE_KEYS.CHAT
  );
}

export function saveStoredChatHistory(messages: AIChatMessage[], maxItems = 40) {
  if (typeof window === 'undefined') return;
  try {
    const sanitized = messages.slice(-maxItems).map((m) => ({
      ...m,
      attachment: m.attachment ? { name: m.attachment.name, type: m.attachment.type, url: '' } : undefined,
    }));
    localStorage.setItem(STORAGE_KEYS.CHAT, wrapWithEnvelope(sanitized));
  } catch (err) {
    console.warn('[IBVAP Storage] Failed to save chat history:', err);
  }
}

// -------------------------------------------------------------
// APPEND-ONLY PLATFORM AUDIT EVENT LOG
// -------------------------------------------------------------

export function loadStoredEventLog(): PlatformEventLogEntry[] {
  if (typeof window === 'undefined') return [];
  return safeJsonParseVersioned<PlatformEventLogEntry[]>(
    localStorage.getItem(STORAGE_KEYS.EVENT_LOG),
    [],
    STORAGE_KEYS.EVENT_LOG
  );
}

export function appendStoredEvent(
  entry: Omit<PlatformEventLogEntry, 'id'>,
  maxEntries = 300
): PlatformEventLogEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const current = loadStoredEventLog();
    const newEntry: PlatformEventLogEntry = {
      id: `evt-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      ...entry,
    };
    const updated = [newEntry, ...current].slice(0, maxEntries);
    localStorage.setItem(STORAGE_KEYS.EVENT_LOG, wrapWithEnvelope(updated));
    return updated;
  } catch (err) {
    console.warn('[IBVAP Storage] Failed to append event log:', err);
    return [];
  }
}

// -------------------------------------------------------------
// EXPORT HELPERS (JSON & CSV)
// -------------------------------------------------------------

export function exportEventsToJson(events: PlatformEventLogEntry[], filename?: string) {
  const jsonStr = JSON.stringify(events, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename || `IBVAP-Audit-Log-${Date.now()}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function exportEventsToCsv(events: PlatformEventLogEntry[], filename?: string) {
  const headers = ['Event ID', 'Timestamp (ISO)', 'Camera Name', 'Event Type', 'Risk Score', 'Target ID', 'Details'];
  const rows = events.map((e) => [
    e.id,
    new Date(e.timestamp).toISOString(),
    `"${(e.cameraName || 'Surveillance Node').replace(/"/g, '""')}"`,
    `"${(e.eventType || 'Event').replace(/"/g, '""')}"`,
    e.riskScore,
    e.objectId ?? 'N/A',
    `"${(e.details || '').replace(/"/g, '""')}"`,
  ]);

  const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename || `IBVAP-Audit-Log-${Date.now()}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
