export type ObjectClass =
  | 'person'
  | 'pedestrian'
  | 'car'
  | 'truck'
  | 'bus'
  | 'truck/bus'
  | 'motorcycle'
  | 'bicycle'
  | 'two-wheeler'
  | 'three-wheeler'
  | 'auto-rickshaw'
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
  dwellThresholdSec?: number; // Configurable loitering dwell threshold (default: 30s, demo profile: 5s)
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
  formatType?: 'standard' | 'bharat' | 'invalid' | 'distance_gated';
  validationStatus?: string;
  stateCode?: string;
  stateName?: string;
  rtoCode?: string;
  rtoOffice?: string;
  series?: string;
  plateNumber?: string;
  cropDataUrl?: string;
  plateCropDataUrl?: string;
  vehicleCropDataUrl?: string;
  isDistanceGated?: boolean;
  attempts?: number;
  charConfidences?: number[];
  scaleUsed?: string;
  bestGuessPlate?: string;
  processedAt: number;
  isDualRow?: boolean;
  ocrModel?: string;
  vehicleClass?: string;
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
  state?: 'tentative' | 'confirmed' | 'lost' | 'removed';
  age?: number;
  hits?: number;
  speed?: number;
  footpoint?: Point;
}

export interface FrameAnalysisResult {
  timestamp: number;
  videoTime: number;
  isNightMode: boolean;
  averageLuminance: number; // 0 to 255
  objects: TrackedObject[];
  rawDetectionsCount: number;
  weapons?: PossibleWeaponEntity[];
}

export interface PossibleWeaponEntity {
  id: string;
  subclass: 'firearm' | 'bladed_weapon' | 'blunt_object' | 'unknown';
  confidence: number; // 0.0 to 1.0
  bbox: BoundingBox;
  nearestPersonTrackId?: number;
  label: string; // e.g. "weapon candidate near person #10"
  cropDataUrl?: string;
  isConsecutiveConfirmed: boolean;
  consecutiveHits: number;
  isFriendlyZoneSuppressed: boolean;
  suppressionReason?: string;
  verificationStatus: 'Needs operator verification' | 'AI-verified, needs operator confirmation' | 'Marked false positive';
  detectedAt: number;
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
  entityCropUrl?: string;
  anprPlate?: string;
  anprConfidence?: number;
  ruleType?: 'zone_entry' | 'zone_loitering' | 'wrong_direction' | 'watchlist_plate' | 'possible_weapon';
  weaponCandidate?: PossibleWeaponEntity;
  verificationStatus?: 'Needs operator verification' | 'AI-verified, needs operator confirmation' | 'Marked false positive';
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
  wsUrl?: string;
  aiSourceId?: string;
  weaponDetectionEnabled?: boolean;
}

export type PlateStatus = 'Valid format' | 'Low confidence - needs review' | 'Unreadable' | 'Plate not legible at this distance';

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
  isSimulated?: boolean;
  validationStatus?: string;
  formatType?: 'standard' | 'bharat' | 'invalid' | 'distance_gated';
  stateName?: string;
  rtoOffice?: string;
  hasRecord?: boolean;
}

export interface PlateRegistryRecord {
  id: string;
  plateNumber: string;
  status: PlateStatus;
  formatValidationStatus?: string;
  isValidFormat: boolean;
  formatType?: 'standard' | 'bharat' | 'invalid' | 'distance_gated';
  confidence: number;
  cameraId: string;
  cameraName: string;
  timestamp: number;
  videoTime?: number;
  trackId?: number;
  cropUrl?: string; // plate thumbnail
  vehicleThumbnailUrl?: string; // vehicle thumbnail
  charConfidences?: number[];
  scaleUsed?: string;
  attempts?: number;
  isAiAssisted?: boolean;
  bestGuessPlate?: string;
  dossier?: VehicleDossier | null;
  manualCorrection?: string;
  isDemo?: boolean;
  isDualRow?: boolean;
  stateCode?: string;
  stateName?: string;
  rtoCode?: string;
  rtoOffice?: string;
  ocrModel?: string;
  vehicleClass?: string;
  officialLookupStatus?: string;
}

export interface ImageANPRPlateItem {
  plateText: string;
  confidence: number;
  isReadable: boolean;
  isValidFormat: boolean;
  formatType: string;
  validationStatus: string;
  stateCode?: string;
  stateName?: string;
  rtoCode?: string;
  rtoOffice?: string;
  series?: string;
  plateNumber?: string;
  plateCropDataUrl?: string;
  vehicleCropDataUrl?: string;
  vehicleBbox?: { x: number; y: number; width: number; height: number };
  plateBbox?: { x: number; y: number; width: number; height: number };
  vehicleClass?: string;
  charConfidences?: number[];
  isDualRow?: boolean;
  ocrModel?: string;
  scaleUsed?: string;
}

export interface ImageANPRResponse {
  status: string;
  totalVehicles: number;
  platesDetected: number;
  validFormatsCount: number;
  latencyMs: number;
  results: ImageANPRPlateItem[];
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
  source?: 'gemini' | 'fallback';
  reason?: string;
  model?: string;
  isStreaming?: boolean;
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
