import React, { useState, useEffect } from 'react';
import {
  AccessibilitySettings,
  AlertAuditEntry,
  AlertIncident,
  CameraFeedItem,
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
import { PlateRegistryRecord } from './types';
import { lookupVehicleDossier } from './services/anprEngine';
import {
  loadStoredCameras,
  saveStoredCameras,
  loadStoredAlerts,
  saveStoredAlerts,
  loadStoredPlateRecords,
  saveStoredPlateRecords,
  loadStoredEventLog,
  appendStoredEvent,
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

  // Accessibility settings (WCAG AA Compliance)
  const [a11ySettings, setA11ySettings] = useState<AccessibilitySettings>({
    highContrast: false,
    reducedMotion: false,
    textSize: 'normal',
  });

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
      const dossier = lookupVehicleDossier(plate);
      const cam = cameras.find((c) => c.id === newAlert.cameraId);

      setPlateRecords((prev) => {
        const existingRecent = prev.find(
          (r) => r.plateNumber === plate && Math.abs(r.timestamp - newAlert.timestamp) < 8000
        );
        if (existingRecent) return prev;

        const newRecord: PlateRegistryRecord = {
          id: `rec-${plate}-${Date.now()}`,
          plateNumber: plate,
          formatValidationStatus: dossier.validationStatus || 'Valid format',
          isValidFormat: dossier.validationStatus === 'Valid format',
          formatType: dossier.formatType,
          confidence: newAlert.confidence || 94,
          cameraId: newAlert.cameraId,
          cameraName: cam?.name || 'Surveillance Node',
          timestamp: newAlert.timestamp,
          videoTime: newAlert.videoTime !== undefined ? newAlert.videoTime : 0,
          dossier,
          cropUrl: newAlert.snapshotUrl,
        };
        return [newRecord, ...prev];
      });
    }
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

  // Count unacknowledged active alerts
  const activeAlertCount = alerts.filter((a) => a.status === 'active').length;

  // Text scaling class
  const textSizeClass =
    a11ySettings.textSize === 'large'
      ? 'text-lg'
      : a11ySettings.textSize === 'xl'
      ? 'text-xl'
      : 'text-base';

  return (
    <div
      id="ibvap-root"
      className={`min-h-screen bg-neutral-950 text-neutral-100 antialiased ${textSizeClass} ${
        a11ySettings.highContrast ? 'contrast-125' : ''
      }`}
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
      />

      {/* Main Content Area */}
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        {activeTab === 'monitoring' && (
          <CameraGrid
            cameras={cameras}
            onUpdateCamera={handleUpdateCamera}
            onRemoveCamera={handleRemoveCamera}
            onAlertGenerated={handleAlertGenerated}
            onSelectPlate={(plate, cropUrl) => setDossierPlate({ plate, cropUrl })}
            onOpenAddCamera={() => setIsAddCameraOpen(true)}
            onAskAI={(prompt) => {
              setPendingCommandQuery(prompt);
              setActiveTab('command');
            }}
            reducedMotion={a11ySettings.reducedMotion}
            seekTarget={seekTarget}
          />
        )}

        {activeTab === 'anpr' && (
          <div className="h-[calc(100vh-140px)]">
            <ANPRRegistryView
              records={plateRecords}
              cameras={cameras}
              onJumpToFootage={handleJumpToFootage}
              onAskAI={(prompt) => {
                setPendingCommandQuery(prompt);
                setActiveTab('command');
              }}
            />
          </div>
        )}

        {activeTab === 'alerts' && (
          <div className="h-[calc(100vh-140px)]">
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
          <div className="h-[calc(100vh-140px)]">
            <AICommandCenter
              cameras={cameras}
              alerts={alerts}
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
          <div className="h-[calc(100vh-140px)]">
            <FootageIntelligenceView
              cameras={cameras}
              onOpenAddCamera={() => setIsAddCameraOpen(true)}
            />
          </div>
        )}

        {activeTab === 'search' && (
          <div className="h-[calc(100vh-140px)]">
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
          <div className="h-[calc(100vh-140px)]">
            <TopologyView
              cameras={cameras}
              onSelectCamera={(camId) => {
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
