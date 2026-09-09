export type ObjectClass =
  | 'person'
  | 'car'
  | 'truck'
  | 'bus'
  | 'motorcycle'
  | 'bicycle'
  | 'suitcase'
  | 'backpack'
  | 'handbag'
  | 'moving_object';

export type AlertSeverity = 'normal' | 'low' | 'medium' | 'high' | 'critical';

export type ZoneType = 'line' | 'polygon';

export type CrossingDirection = 'any' | 'left_to_right' | 'right_to_left' | 'inbound' | 'outbound';

export interface Point {
  x: number; // Normalized 0 to 1
  y: number; // Normalized 0 to 1
}

export interface VirtualZone {
  id: string;
  cameraId: string;
  name: string;
  type: ZoneType;
  points: Point[];
  enabled: boolean;
  color: string;
  direction?: CrossingDirection;
  alertOnClasses: ObjectClass[];
  createdAt: number;
}

export interface BoundingBox {
  x: number;      // Normalized 0 to 1
  y: number;      // Normalized 0 to 1
  width: number;  // Normalized 0 to 1
  height: number; // Normalized 0 to 1
}

export interface TrackedTrajectoryPoint {
  x: number;
  y: number;
  timestamp: number;
}

export interface ANPRResult {
  plateText: string;
  confidence: number;
  isReadable: boolean;
  isValidFormat?: boolean;
  formatType?: 'standard' | 'bharat' | 'invalid';
  validationStatus?: 'Valid format' | 'Unreadable / invalid format';
  stateCode?: string;
  rtoCode?: string;
  series?: string;
  plateNumber?: string;
  cropDataUrl?: string;
  processedAt: number;
}

export interface EntityAppearance {
  primaryColor: string;
  secondaryColor?: string;
  colorHex?: string;
  clothingDescription?: string;
  vehicleTypeDescription?: string;
  colorHist?: number[];
}

export interface TrackedObject {
  id: number;
  class: ObjectClass;
  confidence: number;
  confidenceTier: 'high' | 'medium' | 'low';
  bbox: BoundingBox;
  lastSeenTimestamp: number;
  firstSeenTimestamp: number;
  trajectory: TrackedTrajectoryPoint[];
  velocity: number; // pixels per second approximate
  direction: string; // "North", "South-East", "Static", etc.
  anpr?: ANPRResult;
  isLoitering: boolean;
  hasCrossedZoneIds: string[];
  headBbox?: BoundingBox; // Secondary upper body/face region for person tracking
  isProvisional?: boolean; // Fast local motion tracker provisional box prior to AI confirmation
  provisionalLabel?: string;
  appearance?: EntityAppearance;
}

export interface FrameAnalysisResult {
  timestamp: number;
  videoTime: number;
  isNightMode: boolean;
  averageLuminance: number; // 0 to 255
  objects: TrackedObject[];
  rawDetectionsCount: number;
}

export interface RiskFactor {
  id: string;
  label: string;
  score: number;
  description: string;
}

export interface AlertAuditEntry {
  id: string;
  action: 'generated' | 'acknowledged' | 'escalated' | 'closed';
  actor: string;
  timestamp: number;
  note?: string;
}

export interface AlertIncident {
  id: string;
  cameraId: string;
  cameraName: string;
  timestamp: number;
  videoTime: number;
  title: string;
  severity: AlertSeverity;
  riskScore: number; // 0 to 100
  riskFactors: RiskFactor[];
  objectClass: ObjectClass;
  objectId: number;
  confidence: number;
  snapshotUrl?: string;
  anprPlate?: string;
  anprConfidence?: number;
  zoneId?: string;
  zoneName?: string;
  status: 'active' | 'acknowledged' | 'escalated' | 'closed';
  auditTrail: AlertAuditEntry[];
  direction?: string;
  speed?: string;
}

export interface CameraFeedItem {
  id: string;
  name: string;
  sourceType: 'file' | 'stream';
  sourceUrl: string; // Object URL or RTSP/HTTP URL
  fileName?: string;
  fileSize?: number;
  status: 'active' | 'paused' | 'error' | 'connecting';
  resolution?: { width: number; height: number };
  fps: number;
  isNightMode: boolean;
  zones: VirtualZone[];
  createdAt: number;
}

export interface VehicleDossier {
  plateNumber: string;
  registeredOwner: string;
  vehicleMake: string;
  vehicleModel: string;
  vehicleClass: string; // e.g. Sedan, SUV, Commercial Cargo Van, Heavy Transport, Motorcycle
  color: string;
  fuelType: string; // e.g. Gasoline, Diesel, Hybrid, Electric (BEV)
  registrationDate: string; // e.g. 14 Mar 2021
  registrationStatus: 'Valid' | 'Expired' | 'Suspended' | 'Watchlist Flagged';
  year: number;
  ownerPhone: string;
  flagReason?: string;
  lastKnownLocation: string;
  isSimulatedDemo: true;
  validationStatus?: 'Valid format' | 'Unreadable / invalid format';
  formatType?: 'standard' | 'bharat' | 'invalid';
  stateName?: string;
  rtoOffice?: string;
}

export interface PlateRegistryRecord {
  id: string;
  plateNumber: string;
  formatValidationStatus: 'Valid format' | 'Unreadable / invalid format';
  isValidFormat: boolean;
  formatType?: 'standard' | 'bharat' | 'invalid';
  confidence: number;
  cameraId: string;
  cameraName: string;
  timestamp: number;
  videoTime?: number;
  cropUrl?: string;
  dossier: VehicleDossier;
}

export interface AccessibilitySettings {
  highContrast: boolean;
  reducedMotion: boolean;
  textSize: 'normal' | 'large' | 'xl';
}

// ==========================================
// AI COMMAND CENTER & REASONING TYPES
// ==========================================

export type AIRecommendationActionType =
  | 'dispatch'
  | 'escalate'
  | 'acknowledge'
  | 'lockdown'
  | 'verify_anpr'
  | 'adjust_sensitivity'
  | 'custom';

export interface AIRecommendation {
  id: string;
  incidentId?: string;
  cameraId?: string;
  cameraName?: string;
  title: string;
  why: string; // Reasoning
  evidence: string[]; // Specific live data points / detections
  confidence: number; // 0 to 100%
  recommendedAction: string;
  actionType: AIRecommendationActionType;
  status: 'unverified' | 'accepted' | 'modified' | 'rejected';
  timestamp: number;
  decidedAt?: number;
  operatorNote?: string;
  modifiedAction?: string;
}

export interface AIInvestigationReport {
  id: string;
  incidentId: string;
  incidentTitle: string;
  cameraId: string;
  cameraName: string;
  timestamp: number;
  summary: string;
  objectClass: ObjectClass;
  objectId: number;
  anprPlate?: string;
  timeline: Array<{
    time: string;
    event: string;
    type: 'entry' | 'alert' | 'zone' | 'motion' | 'handoff' | 'anpr';
  }>;
  contributingFactors: Array<{ factor: string; impact: string }>;
  anomalies: string[];
  crossCameraCorrelations: Array<{
    cameraId: string;
    cameraName: string;
    similarity: string;
    timestamp: number;
    handoffVector?: string;
  }>;
  riskAssessment: {
    level: AlertSeverity;
    score: number;
    explanation: string;
  };
  recommendation: AIRecommendation;
}

export interface AIPredictiveSignal {
  id: string;
  cameraId: string;
  cameraName: string;
  title: string;
  prediction: string;
  confidence: number; // e.g. 84%
  historicalPattern: string;
  timeWindow: string; // e.g. "Next 15-30 minutes"
  evidence: string[];
  suggestedPreemptiveAction: string;
  status: 'unverified' | 'accepted' | 'modified' | 'rejected';
  timestamp: number;
}

export interface AIAnomalyDetection {
  id: string;
  cameraId: string;
  cameraName: string;
  type: 'time_deviation' | 'frequency_spike' | 'unusual_object' | 'loitering_cluster' | 'plate_anomaly';
  title: string;
  description: string;
  baseline: string; // Expected normal behavior
  observed: string; // Actual live deviation
  confidence: number;
  recommendation: AIRecommendation;
  timestamp: number;
}

export interface AIChatMessage {
  id: string;
  sender: 'user' | 'ai' | 'system';
  text: string;
  timestamp: number;
  referencedEntities?: {
    cameraIds?: string[];
    incidentIds?: string[];
    plateNumbers?: string[];
  };
  recommendation?: AIRecommendation;
  investigationReport?: AIInvestigationReport;
  predictiveSignals?: AIPredictiveSignal[];
  anomalies?: AIAnomalyDetection[];
  attachment?: {
    name: string;
    type: 'image' | 'video' | 'doc';
    url: string;
  };
}

export interface AIDecisionAuditEntry {
  id: string;
  recommendationId: string;
  suggestionTitle: string;
  recommendedAction: string;
  decision: 'accepted' | 'modified' | 'rejected';
  operator: string;
  note?: string;
  appliedAction: string;
  timestamp: number;
  sourceCamera?: string;
  sourceIncidentId?: string;
}

export interface AISessionMemory {
  focusedIncidentId?: string;
  focusedCameraId?: string;
  focusedPlate?: string;
  investigationCount: number;
  lastQueryTopic?: string;
}
