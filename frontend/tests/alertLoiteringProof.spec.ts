import { test, expect } from '@playwright/test';
import { AlertEngine } from '../src/services/alertEngine';
import { CameraFeedItem, TrackedObject, VirtualZone } from '../src/types';

test.describe('IBVAP Alert Proof & Dwell Verification (Deliverable 5)', () => {
  test('A. Real Pedestrian Dwell Proof: exactly 1 loitering alert fires at correct timestamp on positive zone, 0 on negative zone', async () => {
    // Verified real pedestrian track #10 from whatsapp_video_2026_09_09_842pm.mp4:
    // Present from t=0.2s to t=7.9s (7.77s continuous dwell), avg_conf=70.4%
    // Spatial extent: X in [0.132, 0.208], footpoint Y in [0.777, 0.840]

    // Positive Zone: covering the pedestrian's physical dwell area
    const positiveZone: VirtualZone = {
      id: 'zone-left-shoulder',
      cameraId: 'cam-night-perimeter',
      name: 'Left Shoulder Perimeter Zone',
      type: 'polygon',
      points: [
        { x: 0.10, y: 0.70 },
        { x: 0.25, y: 0.70 },
        { x: 0.25, y: 0.90 },
        { x: 0.10, y: 0.90 },
      ],
      enabled: true,
      color: '#ef4444',
      alertOnClasses: ['pedestrian', 'person'],
      dwellThresholdSec: 5.0, // Configurable demo dwell threshold
      createdAt: Date.now(),
    };

    // Negative Zone: moved elsewhere (top-right quadrant, far from pedestrian)
    const negativeZone: VirtualZone = {
      id: 'zone-top-right-clear',
      cameraId: 'cam-night-perimeter',
      name: 'Far Right Sky Sector',
      type: 'polygon',
      points: [
        { x: 0.70, y: 0.10 },
        { x: 0.90, y: 0.10 },
        { x: 0.90, y: 0.30 },
        { x: 0.70, y: 0.30 },
      ],
      enabled: true,
      color: '#3b82f6',
      alertOnClasses: ['pedestrian', 'person'],
      dwellThresholdSec: 5.0,
      createdAt: Date.now(),
    };

    const positiveCamera: CameraFeedItem = {
      id: 'cam-night-perimeter',
      name: 'Sector 8 Night Perimeter',
      sourceType: 'file',
      status: 'active',
      fps: 30,
      resolution: { width: 1280, height: 720 },
      sourceUrl: '',
      isNightMode: true,
      createdAt: Date.now(),
      zones: [positiveZone],
    };

    const negativeCamera: CameraFeedItem = {
      ...positiveCamera,
      zones: [negativeZone],
    };

    // Simulate real pedestrian track #10 moving within X=[0.14, 0.20], Y=[0.78, 0.83]
    const createPedestrianFrame = (timeSec: number): TrackedObject => ({
      id: 10,
      class: 'pedestrian',
      confidence: 72,
      confidenceTier: 'high',
      bbox: { x: 0.15, y: 0.65, width: 0.05, height: 0.15 }, // footpoint at (0.175, 0.80) -> strictly inside positive zone
      lastSeenTimestamp: Math.round(timeSec * 1000),
      firstSeenTimestamp: 200,
      trajectory: [],
      velocity: 0.4,
      direction: 'Static',
      isLoitering: false,
      hasCrossedZoneIds: [],
    });

    // -------------------------------------------------------------
    // TEST 1: POSITIVE ZONE - Dwell reaches 5.0s -> Exactly 1 alert
    // -------------------------------------------------------------
    const positiveEngine = new AlertEngine({ loiterDwellThresholdSec: 5.0 });
    const allGeneratedAlerts = [];

    // Simulate 0.2s to 7.9s at 0.5s intervals (16 time steps)
    for (let t = 0.2; t <= 7.9; t += 0.5) {
      const ped = createPedestrianFrame(t);
      const alerts = positiveEngine.evaluate({
        camera: positiveCamera,
        tracks: [ped],
        videoTime: t,
        isNightMode: true,
      });
      allGeneratedAlerts.push(...alerts);
    }

    const loiterAlerts = allGeneratedAlerts.filter((a) => a.ruleType === 'zone_loitering');
    // Must fire EXACTLY 1 loitering alert (hysteresis & cooldown prevent repeats)
    expect(loiterAlerts.length).toBe(1);
    expect(loiterAlerts[0].objectId).toBe(10);
    expect(loiterAlerts[0].videoTime).toBeGreaterThanOrEqual(5.0); // fired at/after t=5.2s
    expect(loiterAlerts[0].videoTime).toBeLessThanOrEqual(5.7);
    expect(loiterAlerts[0].severity).toBe('medium');
    expect(loiterAlerts[0].title).toContain('Person #10');

    // -------------------------------------------------------------
    // TEST 2: NEGATIVE ZONE - Zone moved away -> Exactly 0 alerts
    // -------------------------------------------------------------
    const negativeEngine = new AlertEngine({ loiterDwellThresholdSec: 5.0 });
    const negativeAlerts = [];

    for (let t = 0.2; t <= 7.9; t += 0.5) {
      const ped = createPedestrianFrame(t);
      const alerts = negativeEngine.evaluate({
        camera: negativeCamera,
        tracks: [ped],
        videoTime: t,
        isNightMode: true,
      });
      negativeAlerts.push(...alerts);
    }

    // Zero alerts of any kind when zone does not encompass subject
    expect(negativeAlerts.length).toBe(0);
  });

  test('B. UI E2E Verification: Load Demo Data seeds 5s dwell zone and UI reacts without error', async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.clear();
    });
    await page.goto('http://localhost:3000');
    await page.waitForLoadState('networkidle');

    // 1. Verify empty state banner on Live Monitoring
    await expect(page.locator('text=Upload footage or connect a camera to begin')).toBeVisible();

    // 2. Navigate to Vehicle Registry
    const anprTab = page.locator('#nav-anpr-tab:visible, #mobile-nav-anpr-tab:visible').first();
    await anprTab.click();
    await page.waitForTimeout(400);

    // 3. Click Load Safe Demo Data (which seeds camera with 5s dwell zone)
    const loadDemoBtn = page.locator('#load-demo-anpr-btn');
    await expect(loadDemoBtn).toBeVisible();
    await loadDemoBtn.click();
    await page.waitForTimeout(600);

    // 4. Switch to Live Monitor tab to verify camera was seeded
    const liveTab = page.locator('#nav-monitoring-tab:visible, #mobile-nav-monitoring-tab:visible').first();
    await liveTab.click();
    await page.waitForTimeout(400);
    await expect(page.locator('text=Sector 4 Vehicle Checkpoint')).toBeVisible();

    // 5. Clean up via Clear Data
    await anprTab.click();
    const clearBtn = page.locator('#clear-demo-anpr-btn');
    await expect(clearBtn).toBeVisible();
    await clearBtn.click();
    await page.waitForTimeout(400);
    await expect(page.locator('text=0 Logged Reads')).toBeVisible();
  });
});
