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

  // Command center query trigger from CommandBar
  const [pendingCommandQuery, setPendingCommandQuery] = useState<string | null>(null);

  // ANPR Plate Registry records collected from camera detections
  const [plateRecords, setPlateRecords] = useState<PlateRegistryRecord[]>(() => loadStoredPlateRecords());

  // Append-only platform audit event log
  const [eventLog, setEventLog] = useState<PlatformEventLogEntry[]>(() => loadStoredEventLog());

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
    // Switch to monitoring tab so user immediately sees their camera
    setActiveTab('monitoring');
  };

  // Handle updating camera
  const handleUpdateCamera = (updatedCam: CameraFeedItem) => {
    setCameras((prev) => prev.map((c) => (c.id === updatedCam.id ? updatedCam : c)));
  };

  // Handle removing camera
  const handleRemoveCamera = (cameraId: string) => {
    setCameras((prev) => prev.filter((c) => c.id !== cameraId));
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

  // Continuous ANPR detection handler for vehicles seen in playback
  const handlePlateDetected = (plateInfo: {
    plate: string;
    confidence: number;
    cropUrl?: string;
    cameraId: string;
    cameraName?: string;
    videoTime: number;
    trackId?: number;
    formatType?: 'standard' | 'bharat' | 'invalid' | 'distance_gated';
    validationStatus?: string;
  }) => {
    const rawPlate = plateInfo.plate;
    const cleanPlate = rawPlate.toUpperCase().replace(/[^A-Z0-9]/g, '');
    const isDistanceGated =
      plateInfo.formatType === 'distance_gated' ||
      plateInfo.validationStatus === 'Plate not legible at this distance';

    let status: PlateStatus = 'Unreadable';
    let isValid = false;
    let formatType: any = plateInfo.formatType || 'invalid';

    if (isDistanceGated) {
      status = 'Plate not legible at this distance';
      formatType = 'distance_gated';
    } else if (plateInfo.formatType === 'standard' || plateInfo.formatType === 'bharat') {
      status = 'Valid format';
      isValid = true;
    } else if (plateInfo.validationStatus?.toLowerCase().includes('needs review') || cleanPlate.length >= 4) {
      status = 'Low confidence - needs review';
      isValid = false;
    } else {
      const statusInfo = determinePlateStatus(cleanPlate, plateInfo.confidence);
      status = statusInfo.status;
      isValid = statusInfo.isValidFormat;
      formatType = statusInfo.formatType || 'invalid';
    }

    const dossier = isValid ? lookupVehicleDossier(cleanPlate) : null;
    const cam = cameras.find((c) => c.id === plateInfo.cameraId);

    setPlateRecords((prev) => {
      // Find matching record by track ID or near-identical plate text within 12s video time
      const existingIdx = prev.findIndex((r) => {
        const timeDiff = Math.abs((r.videoTime || 0) - plateInfo.videoTime);
        if (plateInfo.trackId && r.trackId === plateInfo.trackId && timeDiff < 12) return true;
        if (!isDistanceGated && cleanPlate && r.plateNumber && r.plateNumber !== 'UNRESOLVED' && r.plateNumber !== 'UNREADABLE') {
          if (r.plateNumber === cleanPlate && timeDiff < 12) return true;
          // Levenshtein distance <= 2 for optical OCR variations of the same plate
          if (timeDiff < 12 && Math.abs(r.plateNumber.length - cleanPlate.length) <= 2) {
            let diff = 0;
            const minLen = Math.min(r.plateNumber.length, cleanPlate.length);
            for (let i = 0; i < minLen; i++) {
              if (r.plateNumber[i] !== cleanPlate[i]) diff++;
            }
            if (diff <= 2) return true;
          }
        }
        return false;
      });

      if (existingIdx >= 0) {
        const existing = prev[existingIdx];
        // Upgrade condition 1: New read is Valid format while existing was not
        // Upgrade condition 2: Existing was distance-gated, new read is a candidate plate
        // Upgrade condition 3: New read has significantly higher confidence (+5%)
        const shouldUpgrade =
          (isValid && !existing.isValidFormat) ||
          (existing.formatType === 'distance_gated' && !isDistanceGated && cleanPlate.length >= 4) ||
          (cleanPlate && plateInfo.confidence > existing.confidence + 5) ||
          ((plateInfo.attempts || 1) > (existing.attempts || 1));

        if (shouldUpgrade) {
          const updated = [...prev];
          updated[existingIdx] = {
            ...existing,
            plateNumber: cleanPlate || existing.plateNumber,
            status,
            formatValidationStatus: plateInfo.validationStatus || status,
            isValidFormat: isValid || existing.isValidFormat,
            formatType: formatType !== 'invalid' ? formatType : existing.formatType,
            confidence: Math.max(existing.confidence, plateInfo.confidence),
            cropUrl: plateInfo.cropUrl || existing.cropUrl,
            vehicleThumbnailUrl: plateInfo.vehicleThumbnailUrl || plateInfo.cropUrl || existing.vehicleThumbnailUrl,
            charConfidences: plateInfo.charConfidences || existing.charConfidences,
            scaleUsed: plateInfo.scaleUsed || existing.scaleUsed,
            attempts: Math.max(existing.attempts || 1, plateInfo.attempts || 1),
            bestGuessPlate: cleanPlate || existing.bestGuessPlate || 'UNRESOLVED',
            isAiAssisted: plateInfo.isAiAssisted ?? existing.isAiAssisted,
            dossier: dossier || existing.dossier,
            videoTime: plateInfo.videoTime,
          };
          saveStoredPlateRecords(updated);
          return updated;
        }
        return prev;
      }

      const newRecord: PlateRegistryRecord = {
        id: `rec-${cleanPlate || 'plate'}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        plateNumber: isDistanceGated ? 'UNRESOLVED' : (cleanPlate || 'UNRESOLVED'),
        status,
        formatValidationStatus: plateInfo.validationStatus || status,
        isValidFormat: isValid,
        formatType,
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
        bestGuessPlate: cleanPlate || 'UNRESOLVED',
        isAiAssisted: Boolean(plateInfo.isAiAssisted),
        dossier,
      };

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
  };

  // Clear all platform data (1-click wipe)
  const handleClearAllData = () => {
    clearStoredPlatformData();
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

      {/* Main Content Area */}
      <main className="mx-auto max-w-[1920px] px-3 py-6 sm:px-6">
        {activeTab === 'monitoring' && (
          <div className="pb-28">
            <CameraGrid
              cameras={cameras}
              alerts={alerts}
              onUpdateCamera={handleUpdateCamera}
              onRemoveCamera={handleRemoveCamera}
              onAlertGenerated={handleAlertGenerated}
              onSelectPlate={(plate, cropUrl) => setDossierPlate({ plate, cropUrl })}
              onPlateDetected={handlePlateDetected}
              onOpenAddCamera={() => setIsAddCameraOpen(true)}
              onAskAI={(prompt) => {
                setPendingCommandQuery(prompt);
                setActiveTab('command');
              }}
              reducedMotion={a11ySettings.reducedMotion}
              seekTarget={seekTarget}
            />
          </div>
        )}

        {activeTab === 'anpr' && (
          <div className="h-[calc(100vh-140px)] pb-28">
            <ANPRRegistryView
              records={plateRecords}
              cameras={cameras}
              onJumpToFootage={handleJumpToFootage}
              onAskAI={(prompt) => {
                setPendingCommandQuery(prompt);
                setActiveTab('command');
              }}
              onLoadDemoData={handleLoadDemoData}
              onClearAllData={handleClearAllData}
              onCorrectPlate={handleCorrectPlate}
              onUpgradeRecordWithAi={handleUpgradeRecordWithAi}
              onOpenAddCamera={() => setIsAddCameraOpen(true)}
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

        {activeTab === 'topology' && (
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
      />

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
