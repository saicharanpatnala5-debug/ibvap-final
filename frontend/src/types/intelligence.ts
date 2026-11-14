import { AlertSeverity, BoundingBox, EntityAppearance, Point } from './index';
export type { AlertSeverity, BoundingBox, EntityAppearance, Point };

export type RecognizedActivityType =
  | 'walking'
  | 'running'
  | 'entering'
  | 'exiting'
  | 'picking up'
  | 'dropping'
  | 'interacting'
  | 'gathering';

export interface IntelligenceKeyframe {
  timestampSec: number;
  formattedTime: string; // e.g. "00:09"
  bbox: BoundingBox;
  activity?: RecognizedActivityType;
  detail?: string;
  speed?: number;
}

export interface IntelligenceEntity {
  id: string; // e.g. "Person 01", "Vehicle 01"
  rawTrackId: number;
  type: 'person' | 'vehicle' | 'object';
  displayLabel: string;
  appearance: EntityAppearance;
  movementPath: string; // e.g. "Entered (South) → walked towards North → approached Vehicle 01 → exited (West)"
  pathWaypoints: Array<{
    timestampSec: number;
    formattedTime: string;
    description: string;
    point: Point;
  }>;
  primaryActivity: RecognizedActivityType;
  durationSec: number;
  firstSeenSec: number;
  lastSeenSec: number;
  formattedTimeRange: string; // e.g. "00:04 – 00:18"
  direction: string; // e.g. "South to Northwest"
  avgConfidence: number; // e.g. 88
  keyframes: IntelligenceKeyframe[];
  anprPlate?: string;
}

export interface EntityActivityEvent {
  id: string;
  entityId: string;
  entityLabel: string;
  activity: RecognizedActivityType;
  startSec: number;
  endSec: number;
  formattedRange: string;
  confidence: number;
  reason: string;
}

export interface EntityInteraction {
  id: string;
  sourceEntityId: string;
  sourceEntityLabel: string;
  targetEntityId: string;
  targetEntityLabel: string;
  interactionType:
    | 'approached_vehicle'
    | 'interacted_with_vehicle'
    | 'gathered_with_person'
    | 'dropped_item'
    | 'picked_up_item'
    | 'close_proximity';
  startSec: number;
  endSec: number;
  formattedRange: string;
  description: string;
  proximityDistance: number; // Normalized 0..1
  dwellDurationSec: number;
  confidence: number;
  evidenceTimestampSec: number;
}

export interface IntelligenceFlaggedEvent {
  id: string;
  title: string;
  entityId: string;
  entityLabel: string;
  timestampSec: number;
  formattedTime: string;
  severity: AlertSeverity;
  riskScore: number; // 0 to 100
  reason: string;
  thresholdCrossed: string;
  category:
    | 'unusual_loitering'
    | 'restricted_zone_entry'
    | 'vehicle_stopped_restricted'
    | 'object_left_behind'
    | 'rapid_movement'
    | 'suspicious_interaction';
  bbox: BoundingBox;
}

export interface FootageAnalysisResult {
  videoId: string;
  videoName: string;
  durationSec: number;
  analyzedFps: number;
  analyzedFramesCount: number;
  isNightMode: boolean;
  sceneSummary: string;
  entities: IntelligenceEntity[];
  activities: EntityActivityEvent[];
  interactions: EntityInteraction[];
  flaggedEvents: IntelligenceFlaggedEvent[];
  generatedAt: number;
}

export interface ReportEventSequenceItem {
  timestampSec: number;
  formattedTime: string;
  text: string;
  type: 'entry' | 'activity' | 'interaction' | 'alert' | 'exit';
  entityLabel?: string;
}

export interface FootageIncidentReport {
  incidentId: string;
  generatedAt: number;
  locationAndSource: string;
  durationSummary: string;
  entitiesInvolved: Array<{
    id: string;
    label: string;
    type: string;
    appearance: string;
    firstSeenTime: string;
    lastSeenTime: string;
    confidence: number;
  }>;
  sequenceOfEvents: ReportEventSequenceItem[];
  detectedActivities: Array<{
    entityLabel: string;
    activity: RecognizedActivityType;
    timeRange: string;
    timestampSec: number;
    reason: string;
  }>;
  anomalies: Array<{
    timestampSec: number;
    formattedTime: string;
    description: string;
    severity: AlertSeverity;
    riskScore: number;
    threshold: string;
  }>;
  evidenceTimestamps: Array<{
    timestampSec: number;
    formattedTime: string;
    label: string;
    reason: string;
  }>;
  confidenceScores: {
    overallConfidence: number;
    entityTrackingConfidence: number;
    activityConfidence: number;
  };
  finalAISummary: string;
  traceableClaims: Array<{
    claimText: string;
    timestampSec: number;
    formattedTime: string;
  }>;
}

export interface ScopedQueryAnswer {
  id: string;
  query: string;
  answer: string;
  relevantTimestamps: Array<{
    timestampSec: number;
    formattedTime: string;
    label: string;
  }>;
  referencedEntities: string[];
  matchedEvents: string[];
  groundingConfidence: number;
}
