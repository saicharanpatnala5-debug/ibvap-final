import React, { useState, useEffect } from 'react';
import {
  AccessibilitySettings,
  AlertAuditEntry,
  AlertIncident,
  CameraFeedItem,
  PlateStatus,
  PlateRegistryRecord,
} from './types';
import { Navbar, ActiveTab } from './components/Navbar';
import { CameraGrid } from './components/CameraGrid';
import { AlertsPanel } from './components/AlertsPanel';
import { SearchLogView } from './components/SearchLogView';
import { TopologyView } from './components/TopologyView';
import { AddCameraModal } from './components/AddCameraModal';
import { AccessibilityModal } from './components/AccessibilityModal';
import { PlateDossierModal } from './components/PlateDossierModal';
import { InvestigationModal } from './components/InvestigationModal';
import { AICommandCenter } from './components/AICommandCenter';
import { CommandBar } from './components/CommandBar';
import { FootageIntelligenceView } from './components/FootageIntelligence/FootageIntelligenceView';
import { ANPRRegistryView } from './components/ANPRRegistryView';
import { lookupVehicleDossier, determinePlateStatus } from './services/anprEngine';
import { videoAnalysisService } from './services/videoAnalysisService';
import {
  loadStoredCameras,
  saveStoredCameras,
  loadStoredAlerts,
  saveStoredAlerts,
  loadStoredPlateRecords,
  saveStoredPlateRecords,
  loadStoredEventLog,
  appendStoredEvent,
  clearStoredPlatformData,
  PlatformEventLogEntry,
} from './services/storageService';

export default function App() {
  const showTopology = import.meta.env.VITE_ENABLE_TOPOLOGY_LABS === 'true';

  // Navigation
  const [activeTab, setActiveTab] = useState<ActiveTab>('monitoring');

  // Cameras - Persisted in storage
  const [cameras, setCameras] = useState<CameraFeedItem[]>(() => loadStoredCameras());

  // Real-time Alerts - Persisted in storage
  const [alerts, setAlerts] = useState<AlertIncident[]>(() => loadStoredAlerts());

  // Modals state
  const [isAddCameraOpen, setIsAddCameraOpen] = useState(false);
  const [isA11yOpen, setIsA11yOpen] = useState(false);
  const [investigatingIncident, setInvestigatingIncident] = useState<AlertIncident | null>(null);
  const [dossierPlate, setDossierPlate] = useState<{ plate: string; cropUrl?: string } | null>(null);

  // Command center query trigger from CommandBar / Live Monitor
  const [pendingCommandQuery, setPendingCommandQuery] = useState<string | null>(null);
  const [pendingCommandAttachment, setPendingCommandAttachment] = useState<any | null>(null);

  // ANPR Plate Registry records collected from active camera detections (never hydrated from stale storage)
  const [plateRecords, setPlateRecords] = useState<PlateRegistryRecord[]>([]);

  // Append-only platform audit event log
  const [eventLog, setEventLog] = useState<PlatformEventLogEntry[]>(() => loadStoredEventLog());

  // Real analysis & HUD metrics state
  const [activeAnalysisFps, setActiveAnalysisFps] = useState<number | null>(null);
  const [activeDetectionLatencyMs, setActiveDetectionLatencyMs] = useState<number | null>(null);
  const [cameraStreamState, setCameraStreamState] = useState<'HEALTHY' | 'DEGRADED' | 'OFFLINE'>('HEALTHY');
  const [alertLatencySamples, setAlertLatencySamples] = useState<number[]>([]);
  const [rawLatencyLogs, setRawLatencyLogs] = useState<Array<{
    id: string;
    rule: string;
    cameraName: string;
    detectedAt: number;
    alertedAt: number;
    latencyMs: number;
    humanTime: string;
  }>>([]);
  const [showLatencyModal, setShowLatencyModal] = useState<boolean>(false);
  const [activeDatabaseEngine, setActiveDatabaseEngine] = useState<string | null>(null);

  // Auto-sync state changes with storage
  useEffect(() => {
    saveStoredCameras(cameras);
  }, [cameras]);

  useEffect(() => {
    saveStoredAlerts(alerts);
  }, [alerts]);

  useEffect(() => {
    saveStoredPlateRecords(plateRecords);
  }, [plateRecords]);

  // Check active database engine from /api/health
  useEffect(() => {
    const checkDb = () => {
      fetch('/api/health')
        .then((r) => r.ok ? r.json() : null)
        .then((data) => {
          const dbEngine = data?.services?.database?.engine || data?.services?.coreService?.services?.database?.engine;
          if (dbEngine) {
            setActiveDatabaseEngine(dbEngine);
          }
        })
        .catch(() => {});
    };
    checkDb();
    const iv = setInterval(checkDb, 10000);
    return () => clearInterval(iv);
  }, []);

  // Compute median & p95 over real events
  const latencyMetrics = React.useMemo(() => {
    if (alertLatencySamples.length === 0) return { median: null, p95: null, count: 0 };
    const sorted = [...alertLatencySamples].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length * 0.5)];
    const p95 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))];
    return { median, p95, count: sorted.length };
  }, [alertLatencySamples]);

  // Hydrate from PostgreSQL database via Core Service on mount
  useEffect(() => {
    fetch('/api/cameras')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (Array.isArray(data) && data.length > 0) {
          setCameras(data);
        }
      })
      .catch(() => {});

    fetch('/api/alerts')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (Array.isArray(data) && data.length > 0) {
          setAlerts((prev) => (prev.length === 0 ? data : prev));
        }
      })
      .catch(() => {});
  }, []);

  // Jump to specific camera and footage timestamp
  const [seekTarget, setSeekTarget] = useState<{ cameraId: string; time: number } | null>(null);

  // Accessibility settings (WCAG AA / AAA Compliance)
  const [a11ySettings, setA11ySettings] = useState<AccessibilitySettings>({
    highContrast: false,
    reducedMotion: false,
    textSize: 'normal',
  });

  // Apply accessibility settings to document root
  useEffect(() => {
    const root = document.documentElement;
    if (a11ySettings.highContrast) {
      root.classList.add('high-contrast');
    } else {
      root.classList.remove('high-contrast');
    }

    if (a11ySettings.reducedMotion) {
      root.classList.add('reduced-motion');
    } else {
      root.classList.remove('reduced-motion');
    }

    root.setAttribute('data-text-size', a11ySettings.textSize);
  }, [a11ySettings]);

  // Jump to footage handler
  const handleJumpToFootage = (cameraId: string, videoTime: number, _plateNumber: string) => {
    setSeekTarget({ cameraId, time: videoTime });
    setActiveTab('monitoring');
  };

  // Handle adding a camera
  const handleAddCamera = (newCam: CameraFeedItem) => {
    setCameras((prev) => [...prev, newCam]);
    // When new footage is uploaded, drop orphaned tracks that don't belong to any active camera
    setPlateRecords((prev) => prev.filter((r) => r.cameraId === newCam.id || cameras.some((c) => c.id === r.cameraId)));
    // Switch to monitoring tab so user immediately sees their camera
    setActiveTab('monitoring');
  };

  // Handle updating camera
  const handleUpdateCamera = (updatedCam: CameraFeedItem) => {
    const oldCam = cameras.find((c) => c.id === updatedCam.id);
    if (oldCam && oldCam.sourceUrl !== updatedCam.sourceUrl) {
      // Drop orphaned tracks from previous footage when new video source is assigned
      setPlateRecords((prev) => prev.filter((r) => r.cameraId !== updatedCam.id));
    }
    setCameras((prev) => prev.map((c) => (c.id === updatedCam.id ? updatedCam : c)));

    // Persist camera and zones to Core Service PostgreSQL
    fetch('/api/cameras', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: updatedCam.id,
        name: updatedCam.name,
        location: updatedCam.sourceType,
        streamUrl: updatedCam.sourceUrl,
        status: updatedCam.status,
        fps: updatedCam.fps,
      }),
    }).catch(() => {});

    if (updatedCam.zones && updatedCam.zones.length > 0) {
      updatedCam.zones.forEach((z) => {
        fetch('/api/zones', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(z),
        }).catch(() => {});
      });
    }
  };

  // Handle removing camera
  const handleRemoveCamera = (cameraId: string) => {
    setCameras((prev) => prev.filter((c) => c.id !== cameraId));
    setPlateRecords((prev) => prev.filter((r) => r.cameraId !== cameraId));
  };

  // Handle real-time alert generated from continuous detection pass
  const handleAlertGenerated = (newAlert: AlertIncident) => {
    setAlerts((prev) => {
      // Avoid duplicate alert bursts for same object/zone in short window (< 3 seconds)
      const existing = prev.find(
        (a) =>
          a.cameraId === newAlert.cameraId &&
          a.objectId === newAlert.objectId &&
          Math.abs(a.timestamp - newAlert.timestamp) < 3000
      );
      if (existing) return prev;
      return [newAlert, ...prev];
    });

    // Collect real event-to-alert latency measurement sample
    if (newAlert.eventToAlertLatencyMs !== undefined) {
      setAlertLatencySamples((prev) => [...prev, newAlert.eventToAlertLatencyMs!].slice(-100));
      setRawLatencyLogs((prev) => [
        {
          id: newAlert.id,
          rule: newAlert.ruleType || newAlert.title,
          cameraName: newAlert.cameraName,
          detectedAt: newAlert.detectionTimestamp || Date.now(),
          alertedAt: newAlert.alertCreatedTimestamp || Date.now(),
          latencyMs: newAlert.eventToAlertLatencyMs!,
          humanTime: new Date(newAlert.timestamp).toLocaleTimeString(),
        },
        ...prev,
      ].slice(0, 100));
    }

    // Record into append-only platform event log
    const updatedLog = appendStoredEvent({
      timestamp: newAlert.timestamp,
      cameraName: newAlert.cameraName,
      cameraId: newAlert.cameraId,
      eventType: newAlert.title,
      riskScore: newAlert.riskScore,
      objectId: newAlert.objectId,
      details: `Severity: ${newAlert.severity}${newAlert.anprPlate ? ` • Plate: ${newAlert.anprPlate}` : ''}`,
    });
    setEventLog(updatedLog);

    // Persist event to Core Service for event fusion and incident creation
    fetch('/api/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cameraId: newAlert.cameraId,
        cameraName: newAlert.cameraName,
        eventType: newAlert.ruleType.toUpperCase(),
        entity: {
          class: newAlert.objectClass,
          trackId: newAlert.objectId,
          anprPlate: newAlert.anprPlate,
          direction: newAlert.direction,
          speed: newAlert.speed,
          riskScore: newAlert.riskScore,
          zoneId: newAlert.zoneId,
          zoneName: newAlert.zoneName,
          videoTime: newAlert.videoTime,
        },
      }),
    }).catch(() => {});

    // If an ANPR plate was detected in this alert, record into vehicle registry
    if (newAlert.anprPlate) {
      const plate = newAlert.anprPlate.toUpperCase().replace(/[^A-Z0-9]/g, '');
      const confidence = newAlert.confidence || 85;
      const statusInfo = determinePlateStatus(plate, confidence);
      const status = statusInfo.status;
      const dossier = status === 'Valid format' ? lookupVehicleDossier(plate) : null;
      const cam = cameras.find((c) => c.id === newAlert.cameraId);

      setPlateRecords((prev) => {
        const existingRecent = prev.find(
          (r) => r.plateNumber === plate && Math.abs(r.timestamp - newAlert.timestamp) < 8000
        );
        if (existingRecent) return prev;

        const newRecord: PlateRegistryRecord = {
          id: `rec-${plate}-${Date.now()}`,
          plateNumber: plate,
          status,
          formatValidationStatus: status,
          isValidFormat: status === 'Valid format',
          formatType: statusInfo.formatType || 'invalid',
          confidence,
          cameraId: newAlert.cameraId,
          cameraName: cam?.name || 'Surveillance Node',
          timestamp: newAlert.timestamp,
          videoTime: newAlert.videoTime !== undefined ? newAlert.videoTime : 0,
          dossier,
          cropUrl: newAlert.entityCropUrl || newAlert.snapshotUrl,
          vehicleThumbnailUrl: newAlert.entityCropUrl || newAlert.snapshotUrl,
          trackId: newAlert.objectId,
        };
        return [newRecord, ...prev];
      });
    }
  };

  // Continuous ANPR detection handler for vehicles seen in playback (Strict Gating & One Vehicle One Identity)
  const handlePlateDetected = (plateInfo: {
    plate: string;
    confidence: number;
    cropUrl?: string;
    vehicleThumbnailUrl?: string;
    charConfidences?: number[];
    scaleUsed?: string;
    attempts?: number;
    isAiAssisted?: boolean;
    bestGuessPlate?: string;
    objectClass?: string;
    cameraId: string;
    cameraName?: string;
    videoTime: number;
    trackId?: number;
    formatType?: 'standard' | 'bharat' | 'invalid' | 'distance_gated';
    validationStatus?: string;
    isDualRow?: boolean;
    stateCode?: string;
    stateName?: string;
    rtoCode?: string;
    rtoOffice?: string;
    ocrModel?: string;
    vehicleClass?: string;
    vehicleColor?: string;
    vehicleColorHex?: string;
    vehicleCategory?: string;
    bodyType?: string;
    visualCharacteristics?: string;
    detectionConfidence?: number;
  }) => {
    // 1. Strictly vehicle classes only
    const rawClass = (plateInfo.objectClass || '').toLowerCase().trim();
    if (rawClass === 'person' || rawClass === 'pedestrian') {
      return;
    }

    const rawPlate = plateInfo.plate || '';
    const cleanPlate = rawPlate.toUpperCase().replace(/[^A-Z0-9]/g, '');

    // 2. Strict plate candidate gating:
    // Reject placeholder strings and partial junk reads (e.g. KA52, KKA51, MH5H51).
    // Valid Indian plates are minimum 8 alphanumeric chars and must match valid format with high confidence.
    const isStandardLength = cleanPlate.length >= 8 && cleanPlate.length <= 11;
    const isValidFormat = (plateInfo.formatType === 'standard' || plateInfo.formatType === 'bharat') && isStandardLength;
    if (!isValidFormat || plateInfo.confidence < 75) {
      return;
    }

    const status: PlateStatus = 'Valid format';
    // For real footage: Never attach fake owner/make/model dossiers. Only simulated seeds get dossiers.
    const dossier = lookupVehicleDossier(cleanPlate);
    const cam = cameras.find((c) => c.id === plateInfo.cameraId);

    setPlateRecords((prev) => {
      // 3. One Vehicle = One Identity matching:
      // Match by exact normalized plate OR edit distance <= 1 across all records
      const existingIdx = prev.findIndex((r) => {
        if (!r.plateNumber || r.plateNumber.length < 8) return false;
        if (r.plateNumber === cleanPlate) return true;
        if (Math.abs(r.plateNumber.length - cleanPlate.length) <= 1) {
          let diff = 0;
          const minLen = Math.min(r.plateNumber.length, cleanPlate.length);
          for (let i = 0; i < minLen; i++) {
            if (r.plateNumber[i] !== cleanPlate[i]) diff++;
          }
          if (diff <= 1) return true;
        }
        return false;
      });

      if (existingIdx >= 0) {
        // Vehicle already exists in registry - update sightings and confidence, DO NOT create new record!
        const existing = prev[existingIdx];
        const updated = [...prev];
        updated[existingIdx] = {
          ...existing,
          confidence: Math.max(existing.confidence, plateInfo.confidence),
          cropUrl: (plateInfo.confidence > existing.confidence && plateInfo.cropUrl) ? plateInfo.cropUrl : existing.cropUrl,
          vehicleThumbnailUrl: (plateInfo.confidence > existing.confidence && plateInfo.vehicleThumbnailUrl) ? plateInfo.vehicleThumbnailUrl : existing.vehicleThumbnailUrl,
          videoTime: plateInfo.videoTime,
          attempts: (existing.attempts || 1) + 1,
        };
        saveStoredPlateRecords(updated);
        return updated;
      }

      // 4. Create new vehicle registry record
      const visualClassEstimate = plateInfo.objectClass ? `Estimate: ${plateInfo.objectClass}` : 'Vehicle (Visual Estimate)';
      const visualColorEstimate = plateInfo.vehicleColor ? `Estimate: ${plateInfo.vehicleColor}` : undefined;

      const newRecord: PlateRegistryRecord = {
        id: `rec-${cleanPlate}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        plateNumber: cleanPlate,
        status,
        formatValidationStatus: plateInfo.validationStatus || 'Valid format',
        isValidFormat: true,
        formatType: plateInfo.formatType || 'standard',
        confidence: plateInfo.confidence,
        cameraId: plateInfo.cameraId,
        cameraName: plateInfo.cameraName || cam?.name || 'Surveillance Node',
        timestamp: Date.now(),
        videoTime: plateInfo.videoTime,
        trackId: plateInfo.trackId,
        cropUrl: plateInfo.cropUrl,
        vehicleThumbnailUrl: plateInfo.vehicleThumbnailUrl || plateInfo.cropUrl,
        charConfidences: plateInfo.charConfidences,
        scaleUsed: plateInfo.scaleUsed,
        attempts: plateInfo.attempts || 1,
        bestGuessPlate: cleanPlate,
        isAiAssisted: Boolean(plateInfo.isAiAssisted),
        dossier: dossier || null,
        isDualRow: plateInfo.isDualRow,
        stateCode: plateInfo.stateCode,
        stateName: plateInfo.stateName,
        rtoCode: plateInfo.rtoCode,
        rtoOffice: plateInfo.rtoOffice,
        ocrModel: plateInfo.ocrModel,
        vehicleClass: visualClassEstimate,
        vehicleColor: visualColorEstimate,
        vehicleColorHex: plateInfo.vehicleColorHex,
        vehicleCategory: plateInfo.vehicleCategory,
        bodyType: plateInfo.bodyType,
        visualCharacteristics: plateInfo.visualCharacteristics,
        detectionConfidence: plateInfo.detectionConfidence,
        officialLookupStatus: dossier ? 'Simulated Demo Record' : 'unavailable (no authorised source)',
      };

      // Persist sighting to Core Service PostgreSQL DB
      fetch('/api/core/vehicles/records', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          plateNumber: cleanPlate,
          confidence: plateInfo.confidence / 100.0,
          cameraId: plateInfo.cameraId,
          cameraName: plateInfo.cameraName || cam?.name || 'Surveillance Node',
          vehicleType: plateInfo.objectClass,
          color: plateInfo.vehicleColor,
          timestampInSource: plateInfo.videoTime,
          trackId: plateInfo.trackId,
        }),
      }).catch(() => {});

      const updated = [newRecord, ...prev].slice(0, 80);
      saveStoredPlateRecords(updated);
      return updated;
    });
  };

  // Alert actions with audit trail
  const handleAcknowledgeAlert = (alertId: string) => {
    const now = Date.now();
    const audit: AlertAuditEntry = {
      id: `audit-${now}`,
      action: 'acknowledged',
      actor: 'Security Operator',
      timestamp: now,
      note: 'Incident acknowledged by monitoring station operator.',
    };

    const targetAlert = alerts.find((a) => a.id === alertId);
    const updatedLog = appendStoredEvent({
      timestamp: now,
      cameraName: targetAlert?.cameraName || 'Surveillance Node',
      cameraId: targetAlert?.cameraId,
      eventType: 'Alert Acknowledged',
      riskScore: targetAlert?.riskScore || 0,
      objectId: targetAlert?.objectId,
      details: `Operator acknowledged incident: ${targetAlert?.title || alertId}`,
    });
    setEventLog(updatedLog);

    // Persist acknowledgment to Core Service & write audit log
    fetch(`/api/incidents/${alertId}/acknowledge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ operator: 'operator' }),
    }).catch(() => {});
    fetch(`/api/alerts/${alertId}/acknowledge`, { method: 'POST' }).catch(() => {});
    fetch('/api/audit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        actor: 'operator',
        action: 'ACKNOWLEDGE',
        targetType: 'ALERT',
        targetId: alertId,
        details: { status: 'acknowledged' },
      }),
    }).catch(() => {});

    setAlerts((prev) =>
      prev.map((a) =>
        a.id === alertId
          ? {
              ...a,
              status: 'acknowledged',
              auditTrail: [...a.auditTrail, audit],
            }
          : a
      )
    );
  };

  const handleEscalateAlert = (alertId: string) => {
    const now = Date.now();
    const audit: AlertAuditEntry = {
      id: `audit-${now}`,
      action: 'escalated',
      actor: 'Security Operator',
      timestamp: now,
      note: 'Escalated to Active Field Dispatch Team.',
    };

    const targetAlert = alerts.find((a) => a.id === alertId);
    const updatedLog = appendStoredEvent({
      timestamp: now,
      cameraName: targetAlert?.cameraName || 'Surveillance Node',
      cameraId: targetAlert?.cameraId,
      eventType: 'Alert Escalated',
      riskScore: targetAlert?.riskScore || 80,
      objectId: targetAlert?.objectId,
      details: `Incident escalated to field tactical team: ${targetAlert?.title || alertId}`,
    });
    setEventLog(updatedLog);

    // Persist escalation to Core Service & write audit log
    fetch(`/api/incidents/${alertId}/escalate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ operator: 'operator', notes: 'Tactical response dispatched.' }),
    }).catch(() => {});
    fetch(`/api/alerts/${alertId}/escalate`, { method: 'POST' }).catch(() => {});
    fetch('/api/audit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        actor: 'operator',
        action: 'ESCALATE',
        targetType: 'ALERT',
        targetId: alertId,
        details: { status: 'escalated' },
      }),
    }).catch(() => {});

    setAlerts((prev) =>
      prev.map((a) =>
        a.id === alertId
          ? {
              ...a,
              status: 'escalated',
              auditTrail: [...a.auditTrail, audit],
            }
          : a
      )
    );
  };

  const handleCloseAlert = (alertId: string) => {
    const now = Date.now();
    const audit: AlertAuditEntry = {
      id: `audit-${now}`,
      action: 'closed',
      actor: 'Security Operator',
      timestamp: now,
      note: 'Threat neutralized / marked false positive. Case closed.',
    };

    const targetAlert = alerts.find((a) => a.id === alertId);
    const updatedLog = appendStoredEvent({
      timestamp: now,
      cameraName: targetAlert?.cameraName || 'Surveillance Node',
      cameraId: targetAlert?.cameraId,
      eventType: 'Alert Closed',
      riskScore: targetAlert?.riskScore || 0,
      objectId: targetAlert?.objectId,
      details: `Incident closed: ${targetAlert?.title || alertId}`,
    });
    setEventLog(updatedLog);

    // Persist closure to Core Service & write audit log
    fetch(`/api/incidents/${alertId}/close`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ operator: 'operator', notes: 'Threat neutralized / case closed.' }),
    }).catch(() => {});
    fetch(`/api/alerts/${alertId}/close`, { method: 'POST' }).catch(() => {});
    fetch('/api/audit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        actor: 'operator',
        action: 'CLOSE',
        targetType: 'ALERT',
        targetId: alertId,
        details: { status: 'closed' },
      }),
    }).catch(() => {});

    setAlerts((prev) =>
      prev.map((a) =>
        a.id === alertId
          ? {
              ...a,
              status: 'closed',
              auditTrail: [...a.auditTrail, audit],
            }
          : a
      )
    );
  };

  // Load explicit demo camera preset
  const handleLoadDemoData = () => {
    const now = Date.now();
    const demoCams: CameraFeedItem[] = [
      {
        id: 'cam-demo-gate',
        name: 'Sector 4 Vehicle Checkpoint',
        sourceType: 'file',
        status: 'active',
        fps: 30,
        resolution: { width: 1280, height: 720 },
        sourceUrl: '/samples/whatsapp_video_2026_09_09_842pm.mp4',
        isNightMode: true,
        createdAt: now,
        zones: [
          {
            id: 'zone-demo-perimeter',
            cameraId: 'cam-demo-gate',
            name: 'Restricted Perimeter Shoulder',
            points: [
              { x: 0.02, y: 0.10 },
              { x: 0.22, y: 0.10 },
              { x: 0.22, y: 0.40 },
              { x: 0.02, y: 0.40 },
            ],
            type: 'polygon',
            color: '#ef4444',
            enabled: true,
            alertOnClasses: ['pedestrian', 'person', 'car', 'two-wheeler'],
            dwellThresholdSec: 5.0,
            createdAt: now,
          },
        ],
      },
    ];

    const demoPlates: PlateRegistryRecord[] = [
      {
        id: 'rec-demo-ka01m4449',
        plateNumber: 'KA01M4449',
        bestGuessPlate: 'KA01M4449',
        status: 'Valid format',
        formatValidationStatus: 'Valid format',
        isValidFormat: true,
        formatType: 'standard',
        confidence: 82.4,
        charConfidences: [88, 86, 85, 82, 80, 84, 82, 81, 78],
        scaleUsed: 'lower_50',
        attempts: 3,
        cameraId: 'cam-demo-gate',
        cameraName: 'Sector 4 Vehicle Checkpoint',
        timestamp: now - 1800000,
        videoTime: 4.3,
        trackId: 44,
        isDemo: true,
        dossier: null, // Unknown novel plate from footage: zero fabricated dossier
      },
      {
        id: 'rec-demo-dl01ab1234',
        plateNumber: 'DL01AB1234',
        bestGuessPlate: 'DL01AB1234',
        status: 'Valid format',
        formatValidationStatus: 'Valid format',
        isValidFormat: true,
        formatType: 'standard',
        confidence: 94.2,
        charConfidences: [96, 95, 94, 95, 93, 92, 95, 94, 96, 95],
        scaleUsed: 'native',
        attempts: 2,
        cameraId: 'cam-demo-gate',
        cameraName: 'Sector 4 Vehicle Checkpoint',
        timestamp: now - 3600000,
        videoTime: 1.2,
        trackId: 1,
        isDemo: true,
        dossier: lookupVehicleDossier('DL01AB1234'),
      },
      {
        id: 'rec-demo-kal111',
        plateNumber: 'KAL111',
        bestGuessPlate: 'KAL111',
        status: 'Low confidence - needs review',
        formatValidationStatus: 'Low confidence - needs review',
        isValidFormat: false,
        formatType: 'invalid',
        confidence: 59.0,
        charConfidences: [62, 58, 60, 56, 57, 61],
        scaleUsed: 'upscaled_2x',
        attempts: 3,
        cameraId: 'cam-demo-gate',
        cameraName: 'Sector 4 Vehicle Checkpoint',
        timestamp: now - 2400000,
        videoTime: 13.5,
        trackId: 130,
        isDemo: true,
      },
      {
        id: 'rec-demo-distant-101',
        plateNumber: 'UNRESOLVED',
        bestGuessPlate: 'UNRESOLVED',
        status: 'Plate not legible at this distance',
        formatValidationStatus: 'Plate not legible at this distance',
        isValidFormat: false,
        formatType: 'distance_gated',
        confidence: 0,
        scaleUsed: 'upscaled_2x',
        attempts: 2,
        cameraId: 'cam-demo-gate',
        cameraName: 'Sector 4 Vehicle Checkpoint',
        timestamp: now - 900000,
        videoTime: 0.8,
        trackId: 101,
        isDemo: true,
      },
    ];

    setCameras(demoCams);
    setAlerts([]);
    setPlateRecords(demoPlates);

    // Pre-warm video analysis cache for the demo camera
    videoAnalysisService
      .analyzeVideo('cam-demo-gate', '/samples/whatsapp_video_2026_09_09_842pm.mp4')
      .catch(() => {});
  };

  // Clear all platform data (1-click wipe)
  const handleClearAllData = () => {
    clearStoredPlatformData();
    if (typeof window !== 'undefined') {
      localStorage.removeItem('ibvap_plates_v8.0.0');
    }
    setCameras([]);
    setAlerts([]);
    setPlateRecords([]);
    setEventLog([]);
  };

  // Operator manual plate correction
  const handleCorrectPlate = (recordId: string, newPlate: string) => {
    const cleaned = newPlate.toUpperCase().replace(/[^A-Z0-9]/g, '');
    const statusInfo = determinePlateStatus(cleaned, 95);
    const status = statusInfo.status;
    const dossier = status === 'Valid format' ? lookupVehicleDossier(cleaned) : null;

    setPlateRecords((prev) =>
      prev.map((rec) => {
        if (rec.id !== recordId) return rec;
        return {
          ...rec,
          plateNumber: cleaned,
          status,
          formatValidationStatus: status,
          isValidFormat: status === 'Valid format',
          formatType: statusInfo.formatType || 'invalid',
          confidence: Math.max(rec.confidence, 92),
          dossier,
          manualCorrection: `Corrected from ${rec.plateNumber} to ${cleaned} by Security Operator`,
        };
      })
    );

    const updatedLog = appendStoredEvent({
      timestamp: Date.now(),
      cameraName: 'Vehicle Registry Station',
      eventType: 'Manual Plate Correction',
      riskScore: 10,
      details: `Operator corrected plate record ${recordId} to ${cleaned} (Status: ${status})`,
    });
    setEventLog(updatedLog);
  };

  // Upgrade record with AI-assisted plate read
  const handleUpgradeRecordWithAi = (recordId: string, aiData: any) => {
    const rawText = (aiData.plateText || '').trim().toUpperCase();
    const cleanPlate = rawText.replace(/[^A-Z0-9]/g, '');
    const isConfirmed = Boolean(aiData.isConfirmed);
    const isValid = Boolean(aiData.isValidFormat);
    const status: PlateStatus = isConfirmed ? 'Valid format' : 'Low confidence - needs review';
    const dossier = isConfirmed && isValid ? lookupVehicleDossier(cleanPlate) : null;

    setPlateRecords((prev) =>
      prev.map((rec) => {
        if (rec.id !== recordId) return rec;
        return {
          ...rec,
          plateNumber: cleanPlate && cleanPlate !== 'UNREADABLE' ? cleanPlate : rec.plateNumber,
          bestGuessPlate: cleanPlate && cleanPlate !== 'UNREADABLE' ? cleanPlate : rec.bestGuessPlate,
          status,
          formatValidationStatus: isConfirmed ? 'Valid (AI-assisted)' : 'Needs review',
          isValidFormat: isConfirmed && isValid,
          formatType: aiData.formatType || rec.formatType,
          confidence: Math.max(rec.confidence, aiData.confidence || 0),
          isAiAssisted: true,
          attempts: (rec.attempts || 1) + 1,
          dossier,
        };
      })
    );
  };

  // Count unacknowledged active alerts
  const activeAlertCount = alerts.filter((a) => a.status === 'active').length;

  return (
    <div
      id="ibvap-root"
      className="min-h-screen bg-neutral-950 text-neutral-100 antialiased"
    >
      {/* Header / Navbar */}
      <Navbar
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        cameraCount={cameras.length}
        alertCount={activeAlertCount}
        plateCount={plateRecords.length}
        onOpenAddCamera={() => setIsAddCameraOpen(true)}
        onOpenAccessibility={() => setIsA11yOpen(true)}
        onLoadDemoScenario={handleLoadDemoData}
        onResetPlatform={handleClearAllData}
      />

      {/* Visible Database Fallback Warning Banner (PRD Step 3) */}
      {activeDatabaseEngine && !activeDatabaseEngine.toLowerCase().includes('postgres') && (
        <div id="h2-fallback-warning-banner" className="bg-amber-950/90 border-b border-amber-600/70 px-4 py-2 text-xs text-amber-200 flex items-center justify-between shadow-md">
          <div className="flex items-center gap-2">
            <span className="font-bold text-amber-400">⚠️ DATABASE WARNING:</span>
            <span>Running on local H2 fallback database (<code>{activeDatabaseEngine}</code>). Data is stored locally, but production PostgreSQL container is offline. To start production PostgreSQL: <code>docker compose up -d postgres</code>.</span>
          </div>
          <span className="font-mono text-[10px] bg-amber-900/80 border border-amber-700 px-2 py-0.5 rounded text-amber-300">
            H2_FALLBACK_ACTIVE
          </span>
        </div>
      )}

      {/* Main Content Area */}
      <main className="mx-auto max-w-[1920px] px-3 py-6 sm:px-6">
        <div className={`pb-28 ${activeTab === 'monitoring' ? 'block' : 'hidden'}`}>
          {/* PRD Section 20 Metrics Panel */}
          <div
            id="prd-metrics-panel"
            data-testid="metrics-panel"
            className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-neutral-800 bg-neutral-900/90 px-4 py-2.5 text-xs shadow-md backdrop-blur-sm"
          >
            <div className="flex items-center gap-4 flex-wrap">
              <div className="flex items-center gap-2">
                <span className={`flex h-2 w-2 rounded-full ${cameras.length === 0 ? 'bg-neutral-600' : cameraStreamState === 'HEALTHY' ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
                <span className="font-semibold text-neutral-300">Camera Health:</span>
                <span id="metric-camera-health" className={`font-mono font-medium ${cameras.length === 0 ? 'text-neutral-500' : cameraStreamState === 'HEALTHY' ? 'text-emerald-400' : 'text-amber-400'}`}>
                  {cameras.length > 0 ? (cameraStreamState === 'HEALTHY' ? 'ONLINE (HEALTHY)' : cameraStreamState === 'DEGRADED' ? 'DEGRADED' : 'OFFLINE') : 'n/a'}
                </span>
              </div>
              <div className="h-3 w-px bg-neutral-700 hidden sm:block" />
              <div className="flex items-center gap-1.5">
                <span className="text-neutral-400">Analysis FPS:</span>
                <span id="metric-fps" className="font-mono font-semibold text-amber-300">
                  {cameras.length > 0 && activeAnalysisFps !== null && activeAnalysisFps > 0 ? `${activeAnalysisFps} FPS` : 'n/a'}
                </span>
              </div>
              <div className="h-3 w-px bg-neutral-700 hidden sm:block" />
              <div className="flex items-center gap-1.5">
                <span className="text-neutral-400">Event-to-Alert Latency:</span>
                <span id="metric-latency" className="font-mono font-semibold text-cyan-400">
                  {latencyMetrics.median !== null
                    ? `${latencyMetrics.median}ms (median) / ${latencyMetrics.p95}ms (p95)`
                    : 'n/a'}
                </span>
                {latencyMetrics.count > 0 && (
                  <button
                    type="button"
                    onClick={() => setShowLatencyModal(true)}
                    className="ml-1 text-[10px] text-cyan-400 underline hover:text-cyan-300"
                    title="View raw latency measurement audit log"
                  >
                    (raw log: {latencyMetrics.count} events)
                  </button>
                )}
              </div>
              <div className="h-3 w-px bg-neutral-700 hidden sm:block" />
              <div className="flex items-center gap-1.5">
                <span className="text-neutral-400">Database:</span>
                <span
                  id="metric-database"
                  className={`font-mono font-semibold px-1.5 py-0.5 rounded text-[10px] border ${
                    activeDatabaseEngine && activeDatabaseEngine.toLowerCase().includes('postgres')
                      ? 'bg-emerald-950/70 border-emerald-800/80 text-emerald-400'
                      : 'bg-amber-950/70 border-amber-800/80 text-amber-300'
                  }`}
                >
                  {activeDatabaseEngine || 'PostgreSQL (Connecting...)'}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2 text-neutral-400 text-[11px]">
              <span>Active Feeds: <strong className="text-neutral-200">{cameras.length}</strong></span>
              <span>•</span>
              <span>Active Zones: <strong className="text-neutral-200">{cameras.reduce((acc, c) => acc + (c.zones?.length || 0), 0)}</strong></span>
            </div>
          </div>

          <CameraGrid
            cameras={cameras}
            alerts={alerts}
            onUpdateCamera={handleUpdateCamera}
            onRemoveCamera={handleRemoveCamera}
            onAlertGenerated={handleAlertGenerated}
            onSelectPlate={(plate, cropUrl) => setDossierPlate({ plate, cropUrl })}
            onPlateDetected={handlePlateDetected}
            onOpenAddCamera={() => setIsAddCameraOpen(true)}
            onAskAI={(prompt, attachment) => {
              setPendingCommandQuery(prompt);
              setPendingCommandAttachment(attachment || null);
              setActiveTab('command');
            }}
            reducedMotion={a11ySettings.reducedMotion}
            seekTarget={seekTarget}
            onMetricsUpdate={(m) => {
              setActiveAnalysisFps(m.analysisFps);
              setActiveDetectionLatencyMs(m.detectionLatencyMs);
              setCameraStreamState(m.streamState);
            }}
          />
        </div>

        {activeTab === 'anpr' && (
          <div className="h-[calc(100vh-140px)] pb-28">
            <ANPRRegistryView
              records={plateRecords}
              cameras={cameras}
              onJumpToFootage={handleJumpToFootage}
              onAskAI={(prompt) => {
                setPendingCommandQuery(prompt);
                setPendingCommandAttachment(null);
                setActiveTab('command');
              }}
              onLoadDemoData={handleLoadDemoData}
              onClearAllData={handleClearAllData}
              onCorrectPlate={handleCorrectPlate}
              onUpgradeRecordWithAi={handleUpgradeRecordWithAi}
              onOpenAddCamera={() => setIsAddCameraOpen(true)}
              onAddPlateRecord={(rec) => {
                setPlateRecords((prev) => {
                  const updated = [rec, ...prev];
                  saveStoredPlateRecords(updated);
                  return updated;
                });
              }}
            />
          </div>
        )}

        {activeTab === 'alerts' && (
          <div className="h-[calc(100vh-140px)] pb-28">
            <AlertsPanel
              alerts={alerts}
              onAcknowledgeAlert={handleAcknowledgeAlert}
              onEscalateAlert={handleEscalateAlert}
              onCloseAlert={handleCloseAlert}
              onInvestigateAlert={(alert) => setInvestigatingIncident(alert)}
              onReplayAlert={(alert) => handleJumpToFootage(alert.cameraId, Math.max(0, (alert.videoTime || 0) - 3), alert.title)}
              onSelectPlate={(plate, cropUrl) => setDossierPlate({ plate, cropUrl })}
            />
          </div>
        )}

        {activeTab === 'command' && (
          <div className="h-[calc(100vh-140px)] pb-28">
            <AICommandCenter
              cameras={cameras}
              alerts={alerts}
              plateRecords={plateRecords}
              onAcknowledgeAlert={handleAcknowledgeAlert}
              onEscalateAlert={handleEscalateAlert}
              onCloseAlert={handleCloseAlert}
              onSelectPlate={(plate) => setDossierPlate({ plate })}
              onOpenIncidentModal={(incident) => setInvestigatingIncident(incident)}
              initialQuery={pendingCommandQuery}
              onClearInitialQuery={() => setPendingCommandQuery(null)}
              initialAttachment={pendingCommandAttachment}
              onClearInitialAttachment={() => setPendingCommandAttachment(null)}
            />
          </div>
        )}

        {activeTab === 'intelligence' && (
          <div className="h-[calc(100vh-140px)] pb-28">
            <FootageIntelligenceView
              cameras={cameras}
              onOpenAddCamera={() => setIsAddCameraOpen(true)}
            />
          </div>
        )}

        {activeTab === 'search' && (
          <div className="h-[calc(100vh-140px)] pb-28">
            <SearchLogView
              incidents={alerts}
              cameras={cameras}
              eventLog={eventLog}
              onInvestigate={(incident) => setInvestigatingIncident(incident)}
              onSelectPlate={(plate) => setDossierPlate({ plate })}
            />
          </div>
        )}

        {activeTab === 'topology' && showTopology && (
          <div className="h-[calc(100vh-140px)] pb-28">
            <TopologyView
              cameras={cameras}
              onSelectCamera={(_camId) => {
                setActiveTab('monitoring');
              }}
            />
          </div>
        )}
      </main>

      {/* Add Camera Modal */}
      <AddCameraModal
        isOpen={isAddCameraOpen}
        onClose={() => setIsAddCameraOpen(false)}
        onAddCamera={handleAddCamera}
      />

      {/* Accessibility Configuration Modal */}
      <AccessibilityModal
        isOpen={isA11yOpen}
        onClose={() => setIsA11yOpen(false)}
        settings={a11ySettings}
        onUpdateSettings={setA11ySettings}
      />

      {/* Vehicle Dossier Modal (SIMULATED DATA / PROTOTYPE) */}
      <PlateDossierModal
        isOpen={!!dossierPlate}
        onClose={() => setDossierPlate(null)}
        plateNumber={dossierPlate?.plate || null}
        anprCropUrl={dossierPlate?.cropUrl}
      />

      {/* Incident Forensic Investigation Modal */}
      <InvestigationModal
        isOpen={!!investigatingIncident}
        onClose={() => setInvestigatingIncident(null)}
        incident={investigatingIncident}
        allCameras={cameras}
        onSelectPlate={(plate) => setDossierPlate({ plate })}
        onReplayIncident={(camId, time, title) => handleJumpToFootage(camId, time, title)}
      />

      {/* Latency Measurement Raw Audit Log Modal */}
      {showLatencyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-xs">
          <div className="w-full max-w-2xl rounded-2xl border border-neutral-800 bg-neutral-900 p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-neutral-800 pb-3 mb-4">
              <div>
                <h3 className="text-sm font-bold text-neutral-100">Measured Event-to-Alert Latency Audit Log</h3>
                <p className="text-xs text-neutral-400 mt-0.5">
                  PRD Section 20 Target: &le; 2000 ms. Measured from frame bounding-box detection to alert persistence & UI presentation.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowLatencyModal(false)}
                className="rounded-lg p-1.5 text-neutral-400 hover:bg-neutral-800 hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="mb-4 grid grid-cols-3 gap-3 text-center">
              <div className="rounded-xl border border-neutral-800 bg-neutral-950/60 p-3">
                <span className="text-[10px] text-neutral-400 uppercase font-semibold block">Total Events Audited</span>
                <span className="text-lg font-mono font-bold text-neutral-100">{latencyMetrics.count}</span>
              </div>
              <div className="rounded-xl border border-neutral-800 bg-neutral-950/60 p-3">
                <span className="text-[10px] text-neutral-400 uppercase font-semibold block">Median Latency</span>
                <span className="text-lg font-mono font-bold text-cyan-400">
                  {latencyMetrics.median !== null ? `${latencyMetrics.median} ms` : 'n/a'}
                </span>
              </div>
              <div className="rounded-xl border border-neutral-800 bg-neutral-950/60 p-3">
                <span className="text-[10px] text-neutral-400 uppercase font-semibold block">P95 Latency</span>
                <span className="text-lg font-mono font-bold text-cyan-400">
                  {latencyMetrics.p95 !== null ? `${latencyMetrics.p95} ms` : 'n/a'}
                </span>
              </div>
            </div>

            <div className="max-h-72 overflow-y-auto font-mono text-xs border border-neutral-800 rounded-lg">
              <table className="w-full text-left">
                <thead className="bg-neutral-800/80 text-neutral-300 text-[11px] sticky top-0">
                  <tr>
                    <th className="p-2">Time</th>
                    <th className="p-2">Rule / Event</th>
                    <th className="p-2">Camera</th>
                    <th className="p-2 text-right">Measured Latency</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-800">
                  {rawLatencyLogs.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="p-4 text-center text-neutral-500 font-sans">
                        No alert events generated yet in this session.
                      </td>
                    </tr>
                  ) : (
                    rawLatencyLogs.map((log) => (
                      <tr key={log.id} className="hover:bg-neutral-800/40">
                        <td className="p-2 text-neutral-400">{log.humanTime}</td>
                        <td className="p-2 text-neutral-200">{log.rule}</td>
                        <td className="p-2 text-neutral-400">{log.cameraName}</td>
                        <td className="p-2 text-right font-bold text-cyan-400">{log.latencyMs} ms</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={() => setShowLatencyModal(false)}
                className="rounded-lg bg-neutral-800 px-4 py-2 text-xs font-semibold text-neutral-200 hover:bg-neutral-700 transition-colors"
              >
                Close Audit Log
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Persistent AI Command Bar */}
      {activeTab !== 'command' && (
        <CommandBar
          cameras={cameras}
          alerts={alerts}
          onExecuteQuery={(q) => {
            setPendingCommandQuery(q);
            setActiveTab('command');
          }}
          onOpenCommandCenter={() => setActiveTab('command')}
        />
      )}
    </div>
  );
}
