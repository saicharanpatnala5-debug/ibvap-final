import {
  AlertIncident,
  CameraFeedItem,
  PlateRegistryRecord,
  AIChatMessage,
} from '../types';

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

const STORAGE_KEYS = {
  CAMERAS: 'ibvap_cameras_v1',
  ALERTS: 'ibvap_alerts_v1',
  PLATES: 'ibvap_plates_v1',
  CHAT: 'ibvap_chat_history_v1',
  EVENT_LOG: 'ibvap_event_log_v1',
};

// Safe JSON parse helper
function safeJsonParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch (err) {
    console.warn('[IBVAP Storage] Failed to parse key from localStorage:', err);
    return fallback;
  }
}

// Clean raw filenames into human-readable camera names
export function cleanCameraName(rawName: string, fallbackIndex = 1): string {
  if (!rawName || typeof rawName !== 'string') return `Camera ${fallbackIndex}`;
  let clean = rawName.trim();
  // Strip file extensions
  clean = clean.replace(/\.(mp4|avi|mov|mkv|webm|m4v|flv|wmv)$/i, '');
  // Strip common camera/phone boilerplate prefixes
  clean = clean.replace(/^(WhatsApp\s*Video|VID|REC|CCTV|DVR|MOV|DSC|CLIP)[-_\s]*/i, '');
  // Strip timestamps like "at 8.42.08 PM" or "8.42.08 PM"
  clean = clean.replace(/\bat\s*\d{1,2}[.:]\d{2}[.:]\d{2}\s*(?:AM|PM)?/i, '');
  clean = clean.replace(/\b\d{1,2}[.:]\d{2}[.:]\d{2}\s*(?:AM|PM)?/i, '');
  // Strip date formats like "2026-09-09" or "2026_09_09" or "20260909"
  clean = clean.replace(/\b\d{4}[-_.]\d{2}[-_.]\d{2}\b/g, '');
  clean = clean.replace(/\b\d{6,14}\b/g, '');
  clean = clean.replace(/[-_]+/g, ' ').trim();
  // If only digits or punctuation remain, or string is too short, default to Camera N
  if (!clean || clean.length < 2 || !/[a-zA-Z]/.test(clean)) {
    return `Camera ${fallbackIndex}`;
  }
  return clean;
}

export function clearStoredPlatformData() {
  if (typeof window === 'undefined') return;
  Object.values(STORAGE_KEYS).forEach((key) => localStorage.removeItem(key));
}

// -------------------------------------------------------------
// CAMERAS & VIRTUAL ZONES
// -------------------------------------------------------------

export function loadStoredCameras(): CameraFeedItem[] {
  if (typeof window === 'undefined') return [];
  const stored = safeJsonParse<CameraFeedItem[]>(localStorage.getItem(STORAGE_KEYS.CAMERAS), []);
  // Filter out dead file cameras that had non-persisted blob URLs with no source
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
    // Retain only serializable data (avoid gigantic in-memory blob URLs if expired)
    const sanitized = cameras.slice(0, 20).map((c) => ({
      ...c,
      sourceUrl: c.sourceType === 'stream' ? c.sourceUrl : c.sourceUrl.startsWith('blob:') ? '' : c.sourceUrl,
      status: (c.sourceType === 'file' && c.sourceUrl.startsWith('blob:')) ? 'paused' : c.status,
    }));
    localStorage.setItem(STORAGE_KEYS.CAMERAS, JSON.stringify(sanitized));
  } catch (err) {
    console.warn('[IBVAP Storage] Failed to save cameras:', err);
  }
}

// -------------------------------------------------------------
// REAL-TIME ALERTS
// -------------------------------------------------------------

export function loadStoredAlerts(): AlertIncident[] {
  if (typeof window === 'undefined') return [];
  return safeJsonParse<AlertIncident[]>(localStorage.getItem(STORAGE_KEYS.ALERTS), []);
}

export function saveStoredAlerts(alerts: AlertIncident[], maxItems = 80) {
  if (typeof window === 'undefined') return;
  try {
    // Truncate large snapshot data URLs in storage to prevent quota overflow
    const sanitized = alerts.slice(0, maxItems).map((a) => ({
      ...a,
      snapshotUrl: typeof a.snapshotUrl === 'string' && a.snapshotUrl.length > 50000 ? undefined : a.snapshotUrl,
    }));
    localStorage.setItem(STORAGE_KEYS.ALERTS, JSON.stringify(sanitized));
  } catch (err) {
    console.warn('[IBVAP Storage] Failed to save alerts:', err);
  }
}

// -------------------------------------------------------------
// ANPR VEHICLE REGISTRY RECORDS
// -------------------------------------------------------------

export function loadStoredPlateRecords(): PlateRegistryRecord[] {
  if (typeof window === 'undefined') return [];
  return safeJsonParse<PlateRegistryRecord[]>(localStorage.getItem(STORAGE_KEYS.PLATES), []);
}

export function saveStoredPlateRecords(records: PlateRegistryRecord[], maxItems = 80) {
  if (typeof window === 'undefined') return;
  try {
    const sanitized = records.slice(0, maxItems).map((r) => ({
      ...r,
      cropUrl: typeof r.cropUrl === 'string' && r.cropUrl.length > 50000 ? undefined : r.cropUrl,
    }));
    localStorage.setItem(STORAGE_KEYS.PLATES, JSON.stringify(sanitized));
  } catch (err) {
    console.warn('[IBVAP Storage] Failed to save plate records:', err);
  }
}

// -------------------------------------------------------------
// AI COPILOT CHAT HISTORY
// -------------------------------------------------------------

export function loadStoredChatHistory(): AIChatMessage[] {
  if (typeof window === 'undefined') return [];
  return safeJsonParse<AIChatMessage[]>(localStorage.getItem(STORAGE_KEYS.CHAT), []);
}

export function saveStoredChatHistory(messages: AIChatMessage[], maxItems = 40) {
  if (typeof window === 'undefined') return;
  try {
    const sanitized = messages.slice(-maxItems).map((m) => ({
      ...m,
      attachment: m.attachment ? { name: m.attachment.name, type: m.attachment.type, url: '' } : undefined,
    }));
    localStorage.setItem(STORAGE_KEYS.CHAT, JSON.stringify(sanitized));
  } catch (err) {
    console.warn('[IBVAP Storage] Failed to save chat history:', err);
  }
}

// -------------------------------------------------------------
// APPEND-ONLY PLATFORM AUDIT EVENT LOG
// -------------------------------------------------------------

export function loadStoredEventLog(): PlatformEventLogEntry[] {
  if (typeof window === 'undefined') return [];
  return safeJsonParse<PlatformEventLogEntry[]>(localStorage.getItem(STORAGE_KEYS.EVENT_LOG), []);
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
    localStorage.setItem(STORAGE_KEYS.EVENT_LOG, JSON.stringify(updated));
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
