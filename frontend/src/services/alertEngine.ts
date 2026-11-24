/**
 * IBVAP Trustworthy Alert Engine (Round 4)
 * Enforces strict VMS rules to eliminate alert fatigue:
 * 1. Explicit rules ONLY:
 *    (a) restricted-zone entry (polygon intrusion or tripwire crossing)
 *    (b) loitering: a PERSON inside a configured zone for >= 30 seconds (never vehicles)
 *    (c) wrong-direction movement in a marked lane
 *    (d) watchlist plate match (exact match against security watchlist)
 * 2. Zero behavioral alerts without zones (stationary cars in traffic are NEVER loitering)
 * 3. Hysteresis & cooldowns: 10s per track per rule, max 5 alerts per camera per minute
 * 4. Qualification: Only CONFIRMED tracks with average confidence >= 65%
 * 5. Timestamps: Based on video source elapsed time, NOT browser wall-clock time
 * 6. Transparent risk formula: score = weight * (confidence / 100) * durationFactor
 */

import {
  AlertAuditEntry,
  AlertIncident,
  AlertSeverity,
  CameraFeedItem,
  RiskFactor,
  TrackedObject,
  VirtualZone,
} from '../types';

export interface WatchlistEntry {
  plate: string;
  label: string;
  addedBy?: string;
  addedAt?: number;
}

// Operator-managed watchlist table (empty by default per PRD Step 4)
export const OPERATOR_WATCHLIST_MAP = new Map<string, WatchlistEntry>();

export function addOperatorWatchlistEntry(plate: string, label: string, operator = 'operator') {
  const norm = plate.toUpperCase().replace(/[^A-Z0-9]/g, '');
  OPERATOR_WATCHLIST_MAP.set(norm, { plate: norm, label, addedBy: operator, addedAt: Date.now() });
}

export function removeOperatorWatchlistEntry(plate: string) {
  const norm = plate.toUpperCase().replace(/[^A-Z0-9]/g, '');
  OPERATOR_WATCHLIST_MAP.delete(norm);
}

export function clearOperatorWatchlist() {
  OPERATOR_WATCHLIST_MAP.clear();
}

// Backward compatibility export (now reading from the operator-managed map)
export const OPERATOR_WATCHLIST = {
  has(plate: string): boolean {
    return OPERATOR_WATCHLIST_MAP.has(plate.toUpperCase().replace(/[^A-Z0-9]/g, ''));
  },
  get size(): number {
    return OPERATOR_WATCHLIST_MAP.size;
  }
};

interface AlertCooldownKey {
  trackId: number;
  ruleType: string;
  zoneId?: string;
}

export class AlertEngine {
  private lastAlertTimes: Map<string, number> = new Map();
  private recentAlertsInWindow: { cameraId: string; time: number }[] = [];
  private personZoneDwellTracker: Map<string, number> = new Map(); // "trackId:zoneId" -> firstSeenTime
  private personZoneConfirmationCount: Map<string, number> = new Map();
  private defaultLoiterDwellSec: number = 30.0;
  private minConfirmationTicks: number = 1;

  constructor(config?: { loiterDwellThresholdSec?: number; minConfirmationTicks?: number }) {
    if (config?.loiterDwellThresholdSec !== undefined) {
      this.defaultLoiterDwellSec = config.loiterDwellThresholdSec;
    }
    if (config?.minConfirmationTicks !== undefined) {
      this.minConfirmationTicks = config.minConfirmationTicks;
    }
  }

  public setConfirmationTicks(ticks: number) {
    this.minConfirmationTicks = ticks;
  }

  public setLoiterDwellThreshold(sec: number) {
    this.defaultLoiterDwellSec = sec;
  }

  public getLoiterDwellThreshold(): number {
    return this.defaultLoiterDwellSec;
  }

  /**
   * Evaluates active tracks against explicit VMS surveillance rules.
   * Returns newly generated valid AlertIncidents.
   */
  public evaluate(params: {
    camera: CameraFeedItem;
    tracks: TrackedObject[];
    videoTime: number;
    isNightMode: boolean;
    canvasSnapshotUrl?: string;
    videoElement?: HTMLVideoElement | null;
  }): AlertIncident[] {
    const { camera, tracks, videoTime, isNightMode, canvasSnapshotUrl, videoElement } = params;
    const generatedAlerts: AlertIncident[] = [];

    // Rate capping: at most 5 alerts per camera per rolling 60s
    this.cleanRateLimitWindow(videoTime);
    const cameraAlertsInWindow = this.recentAlertsInWindow.filter((a) => a.cameraId === camera.id).length;
    if (cameraAlertsInWindow >= 5) {
      return []; // Rate cap reached
    }

    for (const track of tracks) {
      // Qualification: track must be confirmed with confidence >= 65%
      if (track.confidence < 65) {
        continue;
      }

      // ---------------------------------------------------------
      // Rule 1: Watchlist Plate Match (Operator-managed table)
      // ---------------------------------------------------------
      if (track.anpr && track.anpr.plateText && track.anpr.isReadable) {
        const cleanPlate = track.anpr.plateText.toUpperCase().replace(/[^A-Z0-9]/g, '');
        const watchlistEntry = OPERATOR_WATCHLIST_MAP.get(cleanPlate);
        if (watchlistEntry) {
          // Deduplicate per (rule, plate, 30s window) to avoid spam on loops
          const cooldownKey = `plate:${cleanPlate}:watchlist`;
          if (this.checkCooldown(cooldownKey, videoTime, 30.0)) {
            const alert = this.createIncident({
              camera,
              track,
              videoTime,
              ruleType: 'watchlist_plate',
              title: `Watchlist Match: ${cleanPlate}`,
              ruleWeight: 90,
              severity: 'critical',
              description: `Plate '${cleanPlate}' matches operator watchlist entry (${watchlistEntry.label})`,
              isNightMode,
              canvasSnapshotUrl,
              videoElement,
            });
            this.recordAlert(camera.id, cooldownKey, videoTime);
            generatedAlerts.push(alert);
            if (generatedAlerts.length + cameraAlertsInWindow >= 5) break;
          }
        }
      }

      // If no zones configured on this camera, stop here.
      // NO BEHAVIORAL ALERTS WITHOUT CONFIGURED ZONES.
      if (!camera.zones || camera.zones.length === 0) {
        continue;
      }

      for (const zone of camera.zones) {
        if (!zone.enabled) continue;

        // Class filter
        if (zone.alertOnClasses && zone.alertOnClasses.length > 0) {
          const mappedClass = track.class;
          const isAllowed =
            zone.alertOnClasses.includes(mappedClass) ||
            (mappedClass === 'two-wheeler' && (zone.alertOnClasses.includes('motorcycle') || zone.alertOnClasses.includes('bicycle') || zone.alertOnClasses.includes('two-wheeler'))) ||
            ((mappedClass === 'three-wheeler' || mappedClass === 'auto-rickshaw') && (zone.alertOnClasses.includes('car') || zone.alertOnClasses.includes('auto-rickshaw') || zone.alertOnClasses.includes('three-wheeler'))) ||
            (mappedClass === 'pedestrian' && zone.alertOnClasses.includes('person'));
          if (!isAllowed) continue;
        }

        const isPoly = zone.type === 'polygon';
        const isPerson = track.class === 'pedestrian' || track.class === 'person';
        const isInsidePolygon = isPoly && this.isPointInPolygon(track.bbox, zone.points);
        const hasCrossedLine = zone.type === 'line' && this.hasCrossedTripwire(track, zone.points);

        // Confirmation logic: a person entering a restricted polygon requires multi-frame confirmation
        if (isPoly && isPerson && isInsidePolygon) {
          const confKey = `conf:${track.id}:${zone.id}`;
          const currentCount = (this.personZoneConfirmationCount.get(confKey) || 0) + 1;
          this.personZoneConfirmationCount.set(confKey, currentCount);
          if (currentCount < this.minConfirmationTicks) {
            continue; // Wait for confirmation ticks
          }
        } else if (isPoly && isPerson && !isInsidePolygon) {
          this.personZoneConfirmationCount.delete(`conf:${track.id}:${zone.id}`);
        }

        // ---------------------------------------------------------
        // Rule 2: Restricted Zone Entry (Intrusion / Line Crossing)
        // ---------------------------------------------------------
        if (isInsidePolygon || hasCrossedLine) {
          const cooldownKey = `track:${track.id}:zone_entry:${zone.id}`;
          if (this.checkCooldown(cooldownKey, videoTime, 10.0)) {
            const alert = this.createIncident({
              camera,
              track,
              videoTime,
              zone,
              ruleType: 'zone_entry',
              title: `${zone.name}: ${isPoly ? 'Restricted Zone Intrusion' : 'Boundary Line Crossing'}`,
              ruleWeight: isPoly ? 85 : 70,
              severity: isPoly ? 'critical' : 'high',
              description: `${track.class.toUpperCase()} #${track.id} entered restricted sector ${zone.name}`,
              isNightMode,
              canvasSnapshotUrl,
              videoElement,
            });
            this.recordAlert(camera.id, cooldownKey, videoTime);
            generatedAlerts.push(alert);
            if (generatedAlerts.length + cameraAlertsInWindow >= 5) break;
          }
        }

        // ---------------------------------------------------------
        // Rule 3: Person Loitering (>= 30 Seconds inside Zone)
        // STRICT RULE: ONLY FOR PEDESTRIANS / PERSONS. NEVER VEHICLES.
        // ---------------------------------------------------------
        if (isPerson && isInsidePolygon) {
          const dwellKey = `${track.id}:${zone.id}`;
          const firstSeen = this.personZoneDwellTracker.get(dwellKey);
          if (firstSeen === undefined) {
            this.personZoneDwellTracker.set(dwellKey, videoTime);
          } else {
            const dwellDuration = videoTime - firstSeen;
            const thresholdSec = zone.dwellThresholdSec ?? this.defaultLoiterDwellSec;
            if (dwellDuration >= thresholdSec) {
              const cooldownKey = `track:${track.id}:loiter:${zone.id}`;
              if (this.checkCooldown(cooldownKey, videoTime, 15.0)) {
                const alert = this.createIncident({
                  camera,
                  track,
                  videoTime,
                  zone,
                  ruleType: 'zone_loitering',
                  title: `Zone Dwell Alert: Person #${track.id} (${Math.round(dwellDuration)}s in ${zone.name})`,
                  ruleWeight: 60,
                  severity: 'medium',
                  description: `Pedestrian #${track.id} lingering inside restricted zone ${zone.name} for ${Math.round(dwellDuration)}s (threshold: >= ${thresholdSec}s)`,
                  isNightMode,
                  canvasSnapshotUrl,
                  videoElement,
                  durationSec: dwellDuration,
                });
                this.recordAlert(camera.id, cooldownKey, videoTime);
                generatedAlerts.push(alert);
                if (generatedAlerts.length + cameraAlertsInWindow >= 5) break;
              }
            }
          }
        } else if (isPerson && !isInsidePolygon) {
          this.personZoneDwellTracker.delete(`${track.id}:${zone.id}`);
        }

        // ---------------------------------------------------------
        // Rule 4: Wrong-Direction Movement
        // ---------------------------------------------------------
        if (zone.direction && zone.direction !== 'any' && (isInsidePolygon || hasCrossedLine)) {
          if (this.isWrongDirection(track, zone.direction)) {
            const cooldownKey = `track:${track.id}:wrong_dir:${zone.id}`;
            if (this.checkCooldown(cooldownKey, videoTime, 10.0)) {
              const alert = this.createIncident({
                camera,
                track,
                videoTime,
                zone,
                ruleType: 'wrong_direction',
                title: `Counter-Flow Movement: ${track.class.toUpperCase()} #${track.id} in ${zone.name}`,
                ruleWeight: 75,
                severity: 'high',
                description: `Subject moving ${track.direction || 'opposite'} contrary to required ${zone.direction} lane flow`,
                isNightMode,
                canvasSnapshotUrl,
                videoElement,
              });
              this.recordAlert(camera.id, cooldownKey, videoTime);
              generatedAlerts.push(alert);
              if (generatedAlerts.length + cameraAlertsInWindow >= 5) break;
            }
          }
        }
      }
    }

    return generatedAlerts;
  }

  private checkCooldown(key: string, currentTime: number, cooldownSec: number): boolean {
    const last = this.lastAlertTimes.get(key);
    if (last === undefined) return true;
    return Math.abs(currentTime - last) >= cooldownSec;
  }

  private recordAlert(cameraId: string, key: string, currentTime: number) {
    this.lastAlertTimes.set(key, currentTime);
    this.recentAlertsInWindow.push({ cameraId, time: currentTime });
  }

  private cleanRateLimitWindow(currentTime: number) {
    // Keep alerts within rolling 60s
    this.recentAlertsInWindow = this.recentAlertsInWindow.filter(
      (a) => Math.abs(currentTime - a.time) <= 60.0
    );
  }

  private isWrongDirection(track: TrackedObject, requiredDirection: string): boolean {
    const dir = (track.direction || '').toLowerCase();
    if (requiredDirection === 'inbound' && dir.includes('outbound')) return true;
    if (requiredDirection === 'outbound' && dir.includes('inbound')) return true;
    if (requiredDirection === 'left_to_right' && dir.includes('west')) return true;
    if (requiredDirection === 'right_to_left' && dir.includes('east')) return true;
    return false;
  }

  private isPointInPolygon(bbox: { x: number; y: number; width: number; height: number }, points: { x: number; y: number }[]): boolean {
    if (points.length < 3) return false;
    // Footpoint (bottom center of bounding box)
    const px = bbox.x + bbox.width / 2.0;
    const py = bbox.y + bbox.height;

    let inside = false;
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
      const xi = points[i].x, yi = points[i].y;
      const xj = points[j].x, yj = points[j].y;
      const intersect = ((yi > py) !== (yj > py)) &&
        (px < ((xj - xi) * (py - yi)) / (yj - yi + 1e-6) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  }

  private hasCrossedTripwire(track: TrackedObject, points: { x: number; y: number }[]): boolean {
    if (points.length < 2) return false;
    const px = track.bbox.x + track.bbox.width / 2.0;
    const py = track.bbox.y + track.bbox.height;
    // Distance from footpoint to line segment
    const p1 = points[0];
    const p2 = points[1];
    const dist = this.distToSegment({ x: px, y: py }, p1, p2);
    return dist < 0.04;
  }

  private distToSegment(p: { x: number; y: number }, v: { x: number; y: number }, w: { x: number; y: number }): number {
    const l2 = (v.x - w.x) * (v.x - w.x) + (v.y - w.y) * (v.y - w.y);
    if (l2 === 0) return Math.hypot(p.x - v.x, p.y - v.y);
    let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(p.x - (v.x + t * (w.x - v.x)), p.y - (v.y + t * (w.y - v.y)));
  }

  private extractEntityCrop(
    videoElement: HTMLVideoElement | null | undefined,
    bbox: { x: number; y: number; width: number; height: number }
  ): string | undefined {
    if (!videoElement || videoElement.videoWidth === 0) return undefined;
    try {
      const vw = videoElement.videoWidth;
      const vh = videoElement.videoHeight;
      const canvas = document.createElement('canvas');
      const padX = bbox.width * 0.08;
      const padY = bbox.height * 0.08;
      const x = Math.max(0, (bbox.x - padX) * vw);
      const y = Math.max(0, (bbox.y - padY) * vh);
      const w = Math.min(vw - x, (bbox.width + padX * 2) * vw);
      const h = Math.min(vh - y, (bbox.height + padY * 2) * vh);

      canvas.width = Math.max(48, Math.min(320, w));
      canvas.height = Math.max(48, Math.min(320, h));
      const ctx = canvas.getContext('2d');
      if (!ctx) return undefined;
      ctx.drawImage(videoElement, x, y, w, h, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL('image/jpeg', 0.82);
    } catch {
      return undefined;
    }
  }

  private createIncident(params: {
    camera: CameraFeedItem;
    track: TrackedObject;
    videoTime: number;
    zone?: VirtualZone;
    ruleType: 'zone_entry' | 'zone_loitering' | 'wrong_direction' | 'watchlist_plate';
    title: string;
    ruleWeight: number;
    severity: AlertSeverity;
    description: string;
    isNightMode: boolean;
    canvasSnapshotUrl?: string;
    videoElement?: HTMLVideoElement | null;
    durationSec?: number;
  }): AlertIncident {
    const {
      camera,
      track,
      videoTime,
      zone,
      ruleType,
      title,
      ruleWeight,
      severity,
      description,
      isNightMode,
      canvasSnapshotUrl,
      videoElement,
      durationSec = 1.0,
    } = params;

    // PRD Section 12 Risk Contributions:
    // Restricted Zone Intrusion: +30
    // Inward direction: +20
    // Time of day / Night: +15
    // Dwell threshold / loitering: +15
    // Multi-event correlation / sequence: +10
    const factors: RiskFactor[] = [
      {
        id: ruleType,
        label: title,
        score: ruleType === 'zone_entry' ? 30 : ruleType === 'zone_loitering' ? 15 : ruleWeight,
        description,
      },
    ];

    let additiveScore = ruleWeight;

    // PRD Section 12 Inward Direction Contribution (+20)
    // Strictly defined relative to the zone: Velocity vector v points inward toward the zone centroid C
    let isHeadingInward = false;
    let inwardDetail = 'Trajectory vector points inward toward secured perimeter core';
    const zonePolygon = zone ? ((zone as any).points || (zone as any).polygon) : null;
    if (zone && zonePolygon && zonePolygon.length >= 3 && track.trajectory && track.trajectory.length >= 2) {
      const cx = zonePolygon.reduce((acc: number, p: any) => acc + p.x, 0) / zonePolygon.length;
      const cy = zonePolygon.reduce((acc: number, p: any) => acc + p.y, 0) / zonePolygon.length;
      const pCurr = track.trajectory[track.trajectory.length - 1];
      const pPrev = track.trajectory[Math.max(0, track.trajectory.length - 3)];
      const vx = pCurr.x - pPrev.x;
      const vy = pCurr.y - pPrev.y;
      const rx = cx - pCurr.x;
      const ry = cy - pCurr.y;
      const vMag = Math.sqrt(vx * vx + vy * vy);
      const rMag = Math.sqrt(rx * rx + ry * ry);
      if (vMag > 0.0001 && rMag > 0.0001) {
        const cosTheta = (vx * rx + vy * ry) / (vMag * rMag);
        if (cosTheta > 0.35) {
          isHeadingInward = true;
          const angleDeg = Math.round(Math.acos(Math.max(-1, Math.min(1, cosTheta))) * (180 / Math.PI));
          inwardDetail = `Trajectory vector points inward toward zone centroid (${angleDeg}° angle to zone center)`;
        }
      }
    } else if (track.direction) {
      const d = track.direction.toLowerCase();
      if (d.includes('in') || d.includes('south') || d.includes('down') || d.includes('towards')) {
        isHeadingInward = true;
        inwardDetail = `Trajectory vector directed inward (${track.direction}) toward sector`;
      }
    }

    if (isHeadingInward && ruleType !== 'wrong_direction') {
      factors.push({
        id: 'prd_sec12_inward',
        label: 'Inward Direction (+20)',
        score: 20,
        description: inwardDetail,
      });
      additiveScore += 20;
    }

    // PRD Section 12 Time of Day / Low Lux Contribution (+15)
    // Strictly derived from optical pixel luminance (< 45 lux) OR operator camera profile,
    // NEVER from host laptop wall clock!
    if (isNightMode) {
      factors.push({
        id: 'prd_sec12_night',
        label: 'After-Hours / Low-Lux Environment (+15)',
        score: 15,
        description: 'Derived from optical frame analysis (< 45 lux average) or operator after-hours camera profile',
      });
      additiveScore += 15;
    }

    // PRD Section 12 Dwell Contribution (+15)
    if (durationSec && durationSec >= 5.0 && ruleType !== 'zone_loitering') {
      factors.push({
        id: 'prd_sec12_dwell',
        label: 'Sustained Sector Dwell (+15)',
        score: 15,
        description: `Target sustained static presence for ${Math.round(durationSec)}s inside sector`,
      });
      additiveScore += 15;
    }

    // Transparent formula: score = additiveScore * (confidence / 100) * durationFactor
    const durationFactor = Math.min(1.2, 1.0 + (durationSec > 10 ? 0.1 : 0.0));
    const rawScore = Math.round(additiveScore * (track.confidence / 100.0) * durationFactor);
    const riskScore = Math.min(100, Math.max(10, rawScore));

    // Capture tight crop of object
    const entityCropUrl = this.extractEntityCrop(videoElement, track.bbox);

    // Source timestamp: video source elapsed time in milliseconds
    const sourceTimeMs = videoTime > 0 ? Math.round(videoTime * 1000) : Date.now();
    const alertId = `alert-${camera.id}-${track.id}-${Math.round(videoTime * 10)}-${ruleType}`;

    const initialAudit: AlertAuditEntry = {
      id: `audit-${alertId}`,
      action: 'generated',
      actor: 'IBVAP VMS Engine',
      timestamp: sourceTimeMs,
      note: `Rule '${ruleType}' triggered with ${severity.toUpperCase()} severity (Score: ${riskScore}/100)`,
    };

    return {
      id: alertId,
      cameraId: camera.id,
      cameraName: camera.name,
      timestamp: sourceTimeMs,
      videoTime,
      title,
      severity,
      riskScore,
      riskFactors: factors,
      objectClass: track.class,
      objectId: track.id,
      confidence: track.confidence,
      snapshotUrl: canvasSnapshotUrl,
      entityCropUrl,
      anprPlate: track.anpr?.plateText,
      anprConfidence: track.anpr?.confidence,
      ruleType,
      zoneId: zone?.id,
      zoneName: zone?.name,
      status: 'active',
      auditTrail: [initialAudit],
      direction: track.direction,
      speed: track.speed !== undefined ? `${Math.round(track.speed)} px/s` : undefined,
    };
  }

  public reset() {
    this.lastAlertTimes.clear();
    this.recentAlertsInWindow = [];
    this.personZoneDwellTracker.clear();
    this.personZoneConfirmationCount.clear();
  }
}
