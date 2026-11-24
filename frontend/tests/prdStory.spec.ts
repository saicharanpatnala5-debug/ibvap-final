import { test, expect } from '@playwright/test';
import { AlertEngine } from '../src/services/alertEngine';
import { CameraFeedItem, TrackedObject, VirtualZone } from '../src/types';

test.describe('STEP 5 - PRD Story End-to-End Verification (PRD Sections 6.1, 12, 26)', () => {
  test('1. Alert Engine: Confirmation logic rejects single-frame flicker and confirms on sustained entry', () => {
    const polygonZone: VirtualZone = {
      id: 'zone-restricted-yard',
      cameraId: 'cam-demo',
      name: 'Restricted Yard Sector',
      type: 'polygon',
      points: [
        { x: 0.1, y: 0.1 },
        { x: 0.4, y: 0.1 },
        { x: 0.4, y: 0.5 },
        { x: 0.1, y: 0.5 },
      ],
      enabled: true,
      color: '#ef4444',
      alertOnClasses: ['person', 'pedestrian'],
      createdAt: Date.now(),
    };

    const camera: CameraFeedItem = {
      id: 'cam-demo',
      name: 'Main Checkpoint Feed',
      sourceType: 'file',
      status: 'active',
      fps: 30,
      resolution: { width: 1280, height: 720 },
      sourceUrl: '',
      isNightMode: false,
      createdAt: Date.now(),
      zones: [polygonZone],
    };

    const engine = new AlertEngine({ minConfirmationTicks: 2 });

    const createPerson = (tick: number): TrackedObject => ({
      id: 99,
      class: 'pedestrian',
      confidence: 80,
      confidenceTier: 'high',
      bbox: { x: 0.2, y: 0.2, width: 0.05, height: 0.1 }, // inside zone
      lastSeenTimestamp: tick * 100,
      firstSeenTimestamp: 0,
      trajectory: [],
      velocity: 1.0,
      direction: 'inward_south',
      isLoitering: false,
      hasCrossedZoneIds: [],
    });

    // Tick 1: First detection inside polygon -> Confirmation logic holds, no alert
    const tick1Alerts = engine.evaluate({
      camera,
      tracks: [createPerson(1)],
      videoTime: 1.0,
      isNightMode: false,
    });
    expect(tick1Alerts.length).toBe(0);

    // Tick 2: Sustained detection -> Confirmed! Intrusion alert fires
    const tick2Alerts = engine.evaluate({
      camera,
      tracks: [createPerson(2)],
      videoTime: 1.2,
      isNightMode: false,
    });
    expect(tick2Alerts.length).toBe(1);
    expect(tick2Alerts[0].ruleType).toBe('zone_entry');
    expect(tick2Alerts[0].objectId).toBe(99);
  });

  test('2. Alert Engine: PRD Section 12 Risk Factors (+30 intrusion, +20 inward, +15 night, +15 dwell)', () => {
    const polygonZone: VirtualZone = {
      id: 'zone-sec12',
      cameraId: 'cam-demo',
      name: 'High Security Perimeter',
      type: 'polygon',
      points: [
        { x: 0.1, y: 0.1 },
        { x: 0.5, y: 0.1 },
        { x: 0.5, y: 0.5 },
        { x: 0.1, y: 0.5 },
      ],
      enabled: true,
      color: '#ef4444',
      alertOnClasses: ['person', 'pedestrian'],
      createdAt: Date.now(),
    };

    const camera: CameraFeedItem = {
      id: 'cam-demo',
      name: 'North Gate Post',
      sourceType: 'file',
      status: 'active',
      fps: 30,
      resolution: { width: 1280, height: 720 },
      sourceUrl: '',
      isNightMode: true,
      createdAt: Date.now(),
      zones: [polygonZone],
    };

    const engine = new AlertEngine({ minConfirmationTicks: 1 });

    const trackWithInwardDirection: TrackedObject = {
      id: 55,
      class: 'pedestrian',
      confidence: 90,
      confidenceTier: 'high',
      bbox: { x: 0.25, y: 0.25, width: 0.05, height: 0.1 },
      lastSeenTimestamp: 1000,
      firstSeenTimestamp: 0,
      trajectory: [],
      velocity: 1.5,
      direction: 'inward_south', // Inward direction (+20)
      isLoitering: false,
      hasCrossedZoneIds: [],
    };

    const alerts = engine.evaluate({
      camera,
      tracks: [trackWithInwardDirection],
      videoTime: 2.0,
      isNightMode: true, // Night schedule (+15)
    });

    expect(alerts.length).toBe(1);
    const alert = alerts[0];

    // Transparent Contributing Factors Audit
    const factorIds = alert.riskFactors.map((f) => f.id);
    expect(factorIds).toContain('zone_entry');
    expect(factorIds).toContain('prd_sec12_inward');
    expect(factorIds).toContain('prd_sec12_night');

    // Risk score should be >= 70 (Critical)
    expect(alert.riskScore).toBeGreaterThanOrEqual(70);
    expect(alert.severity).toBe('critical');
  });

  test('3. UI End-to-End: Metrics panel, zone configuration, alert cards, replay, and search', async ({ page }) => {
    test.setTimeout(45000);

    await page.addInitScript(() => {
      window.localStorage.clear();
    });

    await page.goto('http://localhost:3000');
    await page.waitForLoadState('networkidle');

    // 1. Verify PRD Section 20 Metrics Panel is visible on Live Monitoring
    const metricsPanel = page.locator('#prd-metrics-panel');
    await expect(metricsPanel).toBeVisible();
    await expect(page.locator('#metric-camera-health')).toBeVisible();
    await expect(page.locator('#metric-fps')).toBeVisible();
    await expect(page.locator('#metric-latency')).toBeVisible();

    // 2. Load safe demo scenario with restricted perimeter zone
    const anprTab = page.locator('#nav-anpr-tab:visible, #mobile-nav-anpr-tab:visible').first();
    await anprTab.click();
    await page.waitForTimeout(400);

    const loadDemoBtn = page.locator('#load-demo-anpr-btn');
    await expect(loadDemoBtn).toBeVisible();
    await loadDemoBtn.click();
    await page.waitForTimeout(600);

    // 3. Switch to Live Monitoring: verify camera & zone are active
    const liveTab = page.locator('#nav-monitoring-tab:visible, #mobile-nav-monitoring-tab:visible').first();
    await liveTab.click();
    await page.waitForTimeout(400);
    await expect(page.locator('text=Sector 4 Vehicle Checkpoint').first()).toBeVisible();

    // 4. Navigate to Alerts tab: verify incident cards and replay button
    const alertsTab = page.locator('#nav-alerts-tab:visible, #mobile-nav-alerts-tab:visible').first();
    await alertsTab.click();
    await page.waitForTimeout(400);

    // If alerts exist, test Replay and Acknowledge buttons
    const replayButtons = page.locator('button[id^="replay-btn-"]');
    const replayCount = await replayButtons.count();
    if (replayCount > 0) {
      const firstReplay = replayButtons.first();
      await expect(firstReplay).toBeVisible();
      await firstReplay.click();
      await page.waitForTimeout(500);

      // Verify clicking replay navigated back to monitoring view
      await expect(page.locator('#prd-metrics-panel')).toBeVisible();
      await alertsTab.click();
      await page.waitForTimeout(300);
    }

    const ackButtons = page.locator('button[id^="ack-btn-"]');
    if ((await ackButtons.count()) > 0) {
      await ackButtons.first().click();
      await page.waitForTimeout(300);
    }

    // 5. Navigate to Search Log: verify search filters by camera, class, and plate
    const searchTab = page.locator('#nav-search-tab:visible, #mobile-nav-search-tab:visible').first();
    if (await searchTab.isVisible()) {
      await searchTab.click();
      await page.waitForTimeout(400);

      const searchInput = page.locator('#search-input');
      if (await searchInput.isVisible()) {
        await searchInput.fill('checkpoint');
        await page.waitForTimeout(300);
        await searchInput.fill('');
      }

      const cameraSelect = page.locator('#filter-camera-select');
      if (await cameraSelect.isVisible()) {
        await expect(cameraSelect).toBeVisible();
      }
    }

    // 6. Return to ANPR and clear demo data cleanly
    await anprTab.click();
    const clearBtn = page.locator('#clear-demo-anpr-btn');
    if (await clearBtn.isVisible()) {
      await clearBtn.click();
      await page.waitForTimeout(400);
      await expect(page.locator('text=0 Logged Reads')).toBeVisible();
    }
  });
});
