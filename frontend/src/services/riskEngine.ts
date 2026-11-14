import {
  AlertAuditEntry,
  AlertIncident,
  AlertSeverity,
  CameraFeedItem,
  RiskFactor,
  TrackedObject,
  VirtualZone,
} from '../types';

export function calculateRiskScore(params: {
  object: TrackedObject;
  camera: CameraFeedItem;
  crossedZone?: VirtualZone;
  crossingType?: 'boundary_crossing' | 'polygon_intrusion';
  isNightMode: boolean;
  isWatchlist?: boolean;
}): { score: number; severity: AlertSeverity; factors: RiskFactor[] } {
  const { object, crossedZone, isNightMode, isWatchlist } = params;
  const factors: RiskFactor[] = [];
  let totalScore = 0;

  // 1. Zone violation factor
  if (crossedZone) {
    const isPolygon = crossedZone.type === 'polygon';
    const zoneScore = isPolygon ? 40 : 35;
    totalScore += zoneScore;
    factors.push({
      id: 'zone_violation',
      label: isPolygon ? 'Restricted Polygon Intrusion' : 'Virtual Fence Crossing',
      score: zoneScore,
      description: `Object crossed configured ${crossedZone.name} perimeter boundary`,
    });
  }

  // 2. Night / low-light context factor
  if (isNightMode) {
    const nightScore = 15;
    totalScore += nightScore;
    factors.push({
      id: 'night_context',
      label: 'Low-Light / Night Context',
      score: nightScore,
      description: 'Activity detected under low ambient luminance / night schedule',
    });
  }

  // 3. Loitering factor
  if (object.isLoitering) {
    const loiterScore = 20;
    totalScore += loiterScore;
    factors.push({
      id: 'loitering',
      label: 'Stationary Loitering',
      score: loiterScore,
      description: `Subject lingering in monitored area with minimal displacement (>8s)`,
    });
  }

  // 4. Vehicle in perimeter / pedestrian restriction
  const isVehicle = ['car', 'truck', 'bus', 'motorcycle'].includes(object.class);
  if (isVehicle && crossedZone && crossedZone.alertOnClasses.includes(object.class)) {
    const vehScore = 15;
    totalScore += vehScore;
    factors.push({
      id: 'vehicle_zone',
      label: 'Motorized Vehicle in Restricted Zone',
      score: vehScore,
      description: `${object.class.toUpperCase()} movement detected inside restricted sector`,
    });
  }

  // 5. Watchlist match
  if (isWatchlist) {
    const watchScore = 25;
    totalScore += watchScore;
    factors.push({
      id: 'watchlist_match',
      label: 'Security Watchlist Match',
      score: watchScore,
      description: `Detected plate '${object.anpr?.plateText}' matches security alert list`,
    });
  } else if (isVehicle && object.anpr && !object.anpr.isReadable) {
    // Unreadable / concealed plate
    const unreadScore = 10;
    totalScore += unreadScore;
    factors.push({
      id: 'unreadable_plate',
      label: 'Unverified / Obscured Plate',
      score: unreadScore,
      description: 'Vehicle plate could not be verified by optical recognition',
    });
  }

  // 6. High velocity
  if (object.velocity > 45) {
    const speedScore = 15;
    totalScore += speedScore;
    factors.push({
      id: 'high_velocity',
      label: 'Rapid Traversal Velocity',
      score: speedScore,
      description: `Target moving at elevated speed (~${object.velocity} px/s)`,
    });
  }

  // Baseline presence if no factors
  if (factors.length === 0) {
    totalScore = 10;
    factors.push({
      id: 'baseline_detection',
      label: 'Standard Ingestion Detection',
      score: 10,
      description: `Verified ${object.class} tracking in camera feed`,
    });
  }

  // Cap at 100
  const finalScore = Math.min(100, totalScore);

  let severity: AlertSeverity = 'normal';
  if (finalScore >= 70) severity = 'critical';
  else if (finalScore >= 50) severity = 'high';
  else if (finalScore >= 30) severity = 'medium';
  else if (finalScore >= 15) severity = 'low';

  return {
    score: finalScore,
    severity,
    factors,
  };
}

export function createAlertIncident(params: {
  camera: CameraFeedItem;
  object: TrackedObject;
  videoTime: number;
  crossedZone?: VirtualZone;
  crossingType?: 'boundary_crossing' | 'polygon_intrusion';
  isNightMode: boolean;
  snapshotUrl?: string;
  isWatchlist?: boolean;
}): AlertIncident {
  const { camera, object, videoTime, crossedZone, crossingType, isNightMode, snapshotUrl, isWatchlist } = params;
  const { score, severity, factors } = calculateRiskScore({
    object,
    camera,
    crossedZone,
    crossingType,
    isNightMode,
    isWatchlist,
  });

  const now = Date.now();
  let title = `${object.class.toUpperCase()} #${object.id} Detection`;
  if (crossedZone) {
    title = `${crossedZone.name}: ${crossedZone.type === 'polygon' ? 'Intrusion' : 'Line Crossing'}`;
  } else if (object.isLoitering) {
    title = `Loitering Alert: ${object.class.toUpperCase()} #${object.id}`;
  } else if (isWatchlist) {
    title = `Watchlist Flag: ${object.anpr?.plateText}`;
  }

  const initialAudit: AlertAuditEntry = {
    id: `audit-${now}-${Math.random().toString(36).substring(2, 6)}`,
    action: 'generated',
    actor: 'IBVAP Detection Engine',
    timestamp: now,
    note: `Triggered with ${severity.toUpperCase()} severity (Score: ${score}/100)`,
  };

  return {
    id: `alert-${now}-${object.id}-${Math.random().toString(36).substring(2, 7)}`,
    cameraId: camera.id,
    cameraName: camera.name,
    timestamp: now,
    videoTime,
    title,
    severity,
    riskScore: score,
    riskFactors: factors,
    objectClass: object.class,
    objectId: object.id,
    confidence: object.confidence,
    snapshotUrl,
    anprPlate: object.anpr?.plateText,
    anprConfidence: object.anpr?.confidence,
    zoneId: crossedZone?.id,
    zoneName: crossedZone?.name,
    status: 'active',
    auditTrail: [initialAudit],
    direction: object.direction,
    speed: `${object.velocity} px/s`,
  };
}
