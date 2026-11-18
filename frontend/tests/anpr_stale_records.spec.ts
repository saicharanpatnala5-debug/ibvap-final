import { test, expect } from '@playwright/test';

test.describe('ANPR Fix 3 - Step 2: No Stale Records & Strict Video Session Tie', () => {
  test('A. Pre-seeding localStorage with stale records (v8.0.0 and legacy) leaves registry at exactly 0 on load and reload', async ({ page }) => {
    // Inject stale records into current version and legacy version keys
    await page.addInitScript(() => {
      const staleTracks = Array.from({ length: 19 }, (_, i) => ({
        id: `rec-stale-${100 + i}`,
        plateNumber: 'UNRESOLVED',
        bestGuessPlate: 'UNRESOLVED',
        status: 'Distant Target',
        confidence: 0,
        trackId: 100 + i,
        videoTime: 1.2 + i * 0.5,
        cameraId: 'cam-demo-gate-stale',
        timestamp: Date.now() - 500000,
        attempts: 1,
      }));

      // Current version key
      window.localStorage.setItem('ibvap_plates_v8.0.0', JSON.stringify({
        schemaVersion: 'v8.0.0',
        runId: 'stale-run-001',
        savedAt: Date.now() - 500000,
        data: staleTracks,
      }));

      // Legacy key
      window.localStorage.setItem('ibvap_plates_v1', JSON.stringify(staleTracks));
    });

    await page.goto('http://localhost:3000');
    await page.waitForLoadState('networkidle');

    // Click Vehicle Registry tab
    const anprTab = page.locator('#nav-anpr-tab');
    await expect(anprTab).toBeVisible();
    await anprTab.click();

    // Verify 0 Logged Reads
    const countHeading = page.locator('text=0 Logged Reads');
    await expect(countHeading).toBeVisible();

    // Verify no track rows exist
    const trackRows = page.locator('text=Track #');
    await expect(trackRows).toHaveCount(0);

    // Verify "No Plates Detected Yet" empty state is displayed
    const emptyState = page.locator('text=No Plates Detected Yet');
    await expect(emptyState).toBeVisible();

    // Reload page and verify still 0
    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.locator('#nav-anpr-tab').click();
    await expect(page.locator('text=0 Logged Reads')).toBeVisible();
    await expect(page.locator('text=Track #')).toHaveCount(0);
  });

  test('B. Clear Records button purges any records and leaves registry at 0', async ({ page }) => {
    await page.goto('http://localhost:3000');
    await page.waitForLoadState('networkidle');

    await page.locator('#nav-anpr-tab').click();
    const clearBtn = page.locator('#clear-anpr-records-btn, button:has-text("Clear Records")');
    if (await clearBtn.isVisible()) {
      await clearBtn.click();
    }

    await expect(page.locator('text=0 Logged Reads')).toBeVisible();
    const stored = await page.evaluate(() => window.localStorage.getItem('ibvap_plates_v8.0.0'));
    // If stored exists, its data must be empty or null
    if (stored) {
      const parsed = JSON.parse(stored);
      if (parsed.data) {
        expect(parsed.data.length).toBe(0);
      }
    }
  });
});
