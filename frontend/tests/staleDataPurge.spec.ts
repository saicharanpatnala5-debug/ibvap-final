import { test, expect } from '@playwright/test';

test.describe('IBVAP Step 1 - Stale Data Eviction & Schema Versioning', () => {
  test('A. Pre-seeding stale legacy data (Track #109, Track #120, 19 alerts) is purged on app load', async ({ page }) => {
    // Inject stale data from earlier rounds into localStorage before loading the page
    await page.addInitScript(() => {
      // 1. Legacy unversioned plates
      window.localStorage.setItem(
        'ibvap_plates_v1',
        JSON.stringify([
          {
            id: 'rec-stale-109',
            plateNumber: 'UNREADABLE',
            status: 'Unreadable',
            confidence: 59,
            trackId: 109,
            videoTime: 11.3,
            cameraId: 'cam-demo-gate',
          },
          {
            id: 'rec-stale-120',
            plateNumber: 'UNREADABLE',
            status: 'Unreadable',
            confidence: 75,
            trackId: 120,
            videoTime: 12.6,
            cameraId: 'cam-demo-gate',
          },
        ])
      );

      // 2. Legacy unversioned alerts (19 alerts)
      const staleAlerts = Array.from({ length: 19 }, (_, i) => ({
        id: `alert-stale-${i}`,
        cameraId: 'cam-demo-gate',
        cameraName: 'Sector 4 Vehicle Checkpoint',
        severity: 'HIGH',
        type: 'ZONE_BREACH',
        description: `Stale legacy breach alert ${i}`,
        timestamp: Date.now() - 100000,
        status: 'open',
      }));
      window.localStorage.setItem('ibvap_alerts_v1', JSON.stringify(staleAlerts));

      // 3. Mismatched version envelope
      window.localStorage.setItem(
        'ibvap_alerts_v8',
        JSON.stringify({
          schemaVersion: 'v7.0.0', // Older version
          runId: 'stale-run-001',
          savedAt: Date.now() - 50000,
          data: staleAlerts,
        })
      );
    });

    await page.goto('http://localhost:3000');

    // Verify pipeline version indicator is unobtrusively displayed
    const versionBadge = page.locator('#pipeline-version-badge');
    await expect(versionBadge).toBeVisible();
    await expect(versionBadge).toHaveText('v8.0.0');

    // Verify alerts badge is NOT 19 (should be 0 or empty)
    const alertsTab = page.locator('#nav-alerts-tab');
    await expect(alertsTab).toBeVisible();
    await expect(alertsTab.locator('span.rounded-full')).toHaveCount(0);

    // Verify Vehicle Registry is empty and does NOT display Track #109 or Track #120
    const anprTab = page.locator('#nav-anpr-tab');
    await anprTab.click();
    await expect(page.locator('text=0 Logged Reads')).toBeVisible();
    await expect(page.locator('text=Track #109')).toHaveCount(0);
    await expect(page.locator('text=Track #120')).toHaveCount(0);

    // Verify in browser storage that legacy keys were purged
    const storedV1Plates = await page.evaluate(() => window.localStorage.getItem('ibvap_plates_v1'));
    expect(storedV1Plates).toBeNull();
    const storedV1Alerts = await page.evaluate(() => window.localStorage.getItem('ibvap_alerts_v1'));
    expect(storedV1Alerts).toBeNull();
  });

  test('B. Reset button clears all browser storage and calls backend clear', async ({ page }) => {
    // Intercept backend call /api/demo/clear
    let clearApiCalled = false;
    await page.route('**/api/demo/clear', async (route) => {
      clearApiCalled = true;
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{"status":"ok"}' });
    });

    await page.goto('http://localhost:3000');

    // First load demo scenario so there is data
    const loadDemoBtn = page.locator('#load-demo-scenario-btn');
    await expect(loadDemoBtn).toBeVisible();
    await loadDemoBtn.click();

    // Now click Reset
    const resetBtn = page.locator('#reset-platform-btn');
    await expect(resetBtn).toBeVisible();
    await resetBtn.click();

    // Verify backend /api/demo/clear was called
    expect(clearApiCalled).toBe(true);

    // Verify UI state is reset to empty
    await expect(page.locator('text=Upload footage or connect a camera to begin')).toBeVisible();

    // Verify localStorage has 0 items or only clean envelopes with empty arrays
    const storedCameras = await page.evaluate(() => window.localStorage.getItem('ibvap_cameras_v8'));
    if (storedCameras) {
      const parsed = JSON.parse(storedCameras);
      expect(parsed.data).toEqual([]);
    }
  });
});
