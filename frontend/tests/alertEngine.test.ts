import { describe, it, expect, beforeEach } from 'vitest';
import { AlertEngine, addOperatorWatchlistEntry, clearOperatorWatchlist } from '../src/services/alertEngine';
import { CameraFeedItem, TrackedObject, VirtualZone } from '../src/types';

describe('AlertEngine Unit Tests (Deliverable 6)', () => {
  let engine: AlertEngine;
  let mockCamera: CameraFeedItem;
  let mockPolygonZone: VirtualZone;

  beforeEach(() => {
    clearOperatorWatchlist();
    engine = new AlertEngine({ loiterDwellThresholdSec: 30.0 });

    mockPolygonZone = {
      id: 'zone-alpha',
      cameraId: 'cam-01',
      name: 'North Perimeter Sector',
      type: 'polygon',
      points: [
        { x: 0.1, y: 0.1 },
        { x: 0.4, y: 0.1 },
        { x: 0.4, y: 0.5 },
        { x: 0.1, y: 0.5 },
      ],
      enabled: true,
      color: '#ef4444',
      alertOnClasses: ['pedestrian', 'person', 'car'],
      createdAt: Date.now(),
    };

    mockCamera = {
      id: 'cam-01',
      name: 'Gate 3 Cam',
      sourceType: 'file',
      status: 'active',
      fps: 30,
      resolution: { width: 1280, height: 720 },
      sourceUrl: '',
      isNightMode: false,
      createdAt: Date.now(),
      zones: [mockPolygonZone],
    };
  });

  const createTrack = (overrides: Partial<TrackedObject> = {}): TrackedObject => ({
    id: 42,
    class: 'pedestrian',
    confidence: 85,
    confidenceTier: 'high',
    bbox: { x: 0.2, y: 0.2, width: 0.05, height: 0.1 }, // footpoint at (0.225, 0.3) -> inside zone
    lastSeenTimestamp: 1000,
    firstSeenTimestamp: 0,
    trajectory: [],
    velocity: 2.0,
    direction: 'North',
    isLoitering: false,
    hasCrossedZoneIds: [],
    ...overrides,
  });

  it('1. triggers restricted zone entry intrusion alert when confirmed track enters polygon', () => {
    const track = createTrack();
    const alerts = engine.evaluate({
      camera: mockCamera,
      tracks: [track],
      videoTime: 1.0,
      isNightMode: false,
    });

    expect(alerts.length).toBe(1);
    expect(alerts[0].ruleType).toBe('zone_entry');
    expect(alerts[0].severity).toBe('critical');
    expect(alerts[0].zoneId).toBe('zone-alpha');
    expect(alerts[0].objectId).toBe(42);
    expect(alerts[0].auditTrail.length).toBeGreaterThan(0);
  });

  it('2. accumulates dwell time and fires loitering alert once threshold is reached', () => {
    const track = createTrack();

    // t = 1.0s: first entry
    let alerts = engine.evaluate({
      camera: mockCamera,
      tracks: [track],
      videoTime: 1.0,
      isNightMode: false,
    });
    // First evaluation triggers zone_entry
    expect(alerts.some((a) => a.ruleType === 'zone_entry')).toBe(true);
    expect(alerts.some((a) => a.ruleType === 'zone_loitering')).toBe(false);

    // t = 15.0s: 14s dwell -> under 30s threshold -> no loitering alert
    alerts = engine.evaluate({
      camera: mockCamera,
      tracks: [track],
      videoTime: 15.0,
      isNightMode: false,
    });
    expect(alerts.some((a) => a.ruleType === 'zone_loitering')).toBe(false);

    // t = 32.0s: 31s dwell -> reaches >= 30s threshold -> loitering alert fires
    alerts = engine.evaluate({
      camera: mockCamera,
      tracks: [track],
      videoTime: 32.0,
      isNightMode: false,
    });
    const loiterAlert = alerts.find((a) => a.ruleType === 'zone_loitering');
    expect(loiterAlert).toBeDefined();
    expect(loiterAlert?.severity).toBe('medium');
    expect(loiterAlert?.objectId).toBe(42);
  });

  it('3. strictly forbids loitering alerts for non-pedestrians (vehicles never loiter)', () => {
    const carTrack = createTrack({ id: 99, class: 'car' });

    // Simulate car stationary in zone for 45 seconds
    for (let t = 1.0; t <= 45.0; t += 5.0) {
      const alerts = engine.evaluate({
        camera: mockCamera,
        tracks: [carTrack],
        videoTime: t,
        isNightMode: false,
      });
      expect(alerts.some((a) => a.ruleType === 'zone_loitering')).toBe(false);
    }
  });

  it('4. enforces cooldown: same track does not produce duplicate alerts within 10s', () => {
    const track = createTrack();

    // t = 1.0s: initial trigger
    let alerts = engine.evaluate({
      camera: mockCamera,
      tracks: [track],
      videoTime: 1.0,
      isNightMode: false,
    });
    expect(alerts.length).toBe(1);

    // t = 4.0s: 3s later (inside 10s cooldown) -> suppressed
    alerts = engine.evaluate({
      camera: mockCamera,
      tracks: [track],
      videoTime: 4.0,
      isNightMode: false,
    });
    expect(alerts.length).toBe(0);

    // t = 12.0s: 11s later (outside 10s cooldown) -> fires again
    alerts = engine.evaluate({
      camera: mockCamera,
      tracks: [track],
      videoTime: 12.0,
      isNightMode: false,
    });
    expect(alerts.length).toBe(1);
  });

  it('5. enforces camera rate limit: maximum 5 alerts per rolling 60s window', () => {
    // Generate 5 distinct tracks triggering zone entry
    for (let i = 1; i <= 5; i++) {
      const t = createTrack({ id: 100 + i });
      const alerts = engine.evaluate({
        camera: mockCamera,
        tracks: [t],
        videoTime: 1.0 + i * 0.5,
        isNightMode: false,
      });
      expect(alerts.length).toBe(1);
    }

    // 6th track within the same 60s window must be rate-capped
    const sixthTrack = createTrack({ id: 106 });
    const alerts = engine.evaluate({
      camera: mockCamera,
      tracks: [sixthTrack],
      videoTime: 5.0,
      isNightMode: false,
    });
    expect(alerts.length).toBe(0);
  });

  it('6. ignores unconfirmed/low-confidence tracks (< 65%)', () => {
    const noisyTrack = createTrack({ confidence: 55 });
    const alerts = engine.evaluate({
      camera: mockCamera,
      tracks: [noisyTrack],
      videoTime: 1.0,
      isNightMode: false,
    });
    expect(alerts.length).toBe(0);
  });

  it('7. zero behavioral alerts when camera has no configured zones', () => {
    const camNoZones = { ...mockCamera, zones: [] };
    const track = createTrack();
    const alerts = engine.evaluate({
      camera: camNoZones,
      tracks: [track],
      videoTime: 1.0,
      isNightMode: false,
    });
    expect(alerts.length).toBe(0);
  });

  it('8. triggers watchlist plate match with critical severity', () => {
    addOperatorWatchlistEntry('DL01AB1234', 'Flagged Stolen Vehicle');
    const trackWithPlate = createTrack({
      id: 77,
      class: 'car',
      anpr: {
        plateText: 'DL01AB1234', // In OPERATOR_WATCHLIST
        confidence: 94,
        isReadable: true,
        isValidFormat: true,
        processedAt: Date.now(),
      },
    });

    const alerts = engine.evaluate({
      camera: mockCamera,
      tracks: [trackWithPlate],
      videoTime: 2.0,
      isNightMode: false,
    });

    const watchlistAlert = alerts.find((a) => a.ruleType === 'watchlist_plate');
    expect(watchlistAlert).toBeDefined();
    expect(watchlistAlert?.severity).toBe('critical');
    expect(watchlistAlert?.anprPlate).toBe('DL01AB1234');
  });

  it('9. supports configurable loitering dwell threshold (e.g. 5.0s for demo profile)', () => {
    const demoZone: VirtualZone = {
      ...mockPolygonZone,
      id: 'zone-demo',
      dwellThresholdSec: 5.0, // Configurable demo dwell threshold
    };
    const demoCam = { ...mockCamera, zones: [demoZone] };
    const track = createTrack({ id: 88 });

    // t = 0.5s: first seen
    engine.evaluate({
      camera: demoCam,
      tracks: [track],
      videoTime: 0.5,
      isNightMode: false,
    });

    // t = 3.0s: 2.5s dwell -> under 5s -> no alert
    let alerts = engine.evaluate({
      camera: demoCam,
      tracks: [track],
      videoTime: 3.0,
      isNightMode: false,
    });
    expect(alerts.some((a) => a.ruleType === 'zone_loitering')).toBe(false);

    // t = 5.8s: 5.3s dwell -> exceeds 5.0s -> fires loitering alert
    alerts = engine.evaluate({
      camera: demoCam,
      tracks: [track],
      videoTime: 5.8,
      isNightMode: false,
    });
    const loiter = alerts.find((a) => a.ruleType === 'zone_loitering');
    expect(loiter).toBeDefined();
    expect(loiter?.objectId).toBe(88);
  });
});
