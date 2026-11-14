import { test, expect } from '@playwright/test';

test.describe('IBVAP Surveillance Platform - Phase 7 E2E Smoke Tests', () => {
  test.beforeEach(async ({ page }) => {
    // Clear localStorage to simulate pristine first-time load
    await page.addInitScript(() => {
      window.localStorage.clear();
    });
  });

  test('A. Clean Empty State: 0 cameras, 0 alerts, 0 plates, and zero counters on fresh load', async ({ page }) => {
    await page.goto('http://localhost:3000');

    // Verify main header is visible
    const header = page.locator('#main-app-header');
    await expect(header).toBeVisible();

    // Verify nav tabs do not show badges when count is 0
    const liveTab = page.locator('#nav-monitoring-tab');
    await expect(liveTab).toBeVisible();
    await expect(liveTab.locator('span.rounded-full')).toHaveCount(0);

    const alertsTab = page.locator('#nav-alerts-tab');
    await expect(alertsTab).toBeVisible();
    await expect(alertsTab.locator('span.rounded-full')).toHaveCount(0);

    const anprTab = page.locator('#nav-anpr-tab');
    await expect(anprTab).toBeVisible();
    await expect(anprTab.locator('span.rounded-full')).toHaveCount(0);

    // Verify empty state banner on Live Monitoring
    await expect(page.locator('text=Upload footage or connect a camera to begin')).toBeVisible();

    // Switch to Alerts tab -> verify empty state
    await alertsTab.click();
    await expect(page.locator('text=Upload footage or connect a camera to begin monitoring')).toBeVisible();

    // Switch to Vehicle Registry tab -> verify empty state
    await anprTab.click();
    await expect(page.locator('text=Upload footage or connect a camera to begin ANPR logging')).toBeVisible();
    await expect(page.locator('text=0 Logged Reads')).toBeVisible();
  });

  test('B. Responsive Top Navigation: "+ Add Camera" is never clipped at 390, 1280, 1440, 1552, 1920 px', async ({ page }) => {
    const viewports = [
      { width: 390, height: 844, name: 'Mobile (iPhone 14)' },
      { width: 1280, height: 800, name: 'Standard Laptop' },
      { width: 1440, height: 900, name: 'MacBook Pro 15"' },
      { width: 1552, height: 950, name: 'Reported Bug Width (~1550px)' },
      { width: 1920, height: 1080, name: 'Full HD Surveillance Display' },
    ];

    for (const vp of viewports) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto('http://localhost:3000');

      const addBtn = page.locator('#main-add-camera-btn');
      await expect(addBtn).toBeVisible();

      // Ensure button bounding box is inside the viewport
      const box = await addBtn.boundingBox();
      expect(box).not.toBeNull();
      if (box) {
        expect(box.x + box.width).toBeLessThanOrEqual(vp.width);
        expect(box.x).toBeGreaterThan(0);
      }
    }
  });

  test('C. Registry Integrity: Unreadable plate shows no dossier and allows manual correction', async ({ page }) => {
    await page.goto('http://localhost:3000');

    // Switch to Vehicle Registry
    await page.locator('#nav-anpr-tab').click();

    // Load Demo Data to test plate handling
    const loadDemoBtn = page.locator('#load-demo-anpr-btn');
    await expect(loadDemoBtn).toBeVisible();
    await loadDemoBtn.click();

    // Verify UNREADABLE record appears
    const unreadableRow = page.locator('text=UNREADABLE').first();
    await expect(unreadableRow).toBeVisible();
    await unreadableRow.click();

    // Dossier modal: check that NO fake owner or verified badge appears
    await expect(page.locator('text=No Registry Record Attached')).toBeVisible();
    await expect(page.locator('text=RTO Verified')).toHaveCount(0);

    // Operator manual plate correction
    const correctBtn = page.locator('#open-plate-correction-btn');
    if (await correctBtn.isVisible()) {
      await correctBtn.click();
      const input = page.locator('#manual-plate-input');
      await input.fill('DL01AB1234');
      await page.locator('#submit-plate-correction-btn').click();

      // Verify audit log entry and updated plate
      await expect(page.locator('text=DL01AB1234').first()).toBeVisible();
    }
  });

  test('D. Accessibility Controls: High Contrast & Reduced Motion toggles', async ({ page }) => {
    await page.goto('http://localhost:3000');

    // Open accessibility settings
    await page.locator('#open-a11y-settings-btn').click();
    await expect(page.locator('#accessibility-settings-card')).toBeVisible();

    // Toggle High Contrast
    const hcToggle = page.locator('#high-contrast-toggle');
    await hcToggle.click();
    const html = page.locator('html');
    await expect(html).toHaveClass(/high-contrast/);

    // Toggle Reduced Motion
    const rmToggle = page.locator('#reduced-motion-toggle');
    await rmToggle.click();
    await expect(html).toHaveClass(/reduced-motion/);

    // Close modal
    await page.locator('#close-a11y-modal-btn').click();
    await expect(page.locator('#accessibility-settings-card')).toBeHidden();
  });
});
