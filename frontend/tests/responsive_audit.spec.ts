import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

test.describe('Responsive VMS UI Verification & Visual Proof', () => {
  const screenshotsDir = path.resolve('./docs/ui_screenshots');

  test.beforeAll(() => {
    if (!fs.existsSync(screenshotsDir)) {
      fs.mkdirSync(screenshotsDir, { recursive: true });
    }
  });

  const resolutions = [
    { width: 390, height: 844, name: '390px_mobile' },
    { width: 768, height: 1024, name: '768px_tablet' },
    { width: 1280, height: 800, name: '1280px_standard' },
    { width: 1552, height: 950, name: '1552px_reported_bug_width' },
    { width: 1920, height: 1080, name: '1920px_command_center' },
  ];

  for (const res of resolutions) {
    test(`Verify layout and capture screenshot at ${res.width}x${res.height} (${res.name})`, async ({ page }) => {
      await page.setViewportSize({ width: res.width, height: res.height });
      await page.addInitScript(() => {
        window.localStorage.clear();
      });

      await page.goto('http://localhost:3000');
      await page.waitForTimeout(400);

      // Verify no horizontal document overflow
      const overflowX = await page.evaluate(() => {
        return document.documentElement.scrollWidth > document.documentElement.clientWidth;
      });
      expect(overflowX).toBe(false);

      // Verify Add Camera button is visible and not clipped
      const addBtn = page.locator('#main-add-camera-btn');
      await expect(addBtn).toBeVisible();
      const box = await addBtn.boundingBox();
      expect(box).not.toBeNull();
      if (box) {
        expect(box.x + box.width).toBeLessThanOrEqual(res.width);
        expect(box.x).toBeGreaterThan(0);
      }

      // Capture Live Monitor screenshot
      await page.screenshot({
        path: path.join(screenshotsDir, `live_monitor_${res.name}.png`),
        fullPage: false,
      });

      // Navigate to Vehicle Registry
      const anprTab = page.locator('#nav-anpr-tab:visible, #mobile-nav-anpr-tab:visible').first();
      await anprTab.click();
      await page.waitForTimeout(300);
      await page.screenshot({
        path: path.join(screenshotsDir, `vehicle_registry_${res.name}.png`),
        fullPage: false,
      });

      // Navigate to Alerts
      const alertsTab = page.locator('#nav-alerts-tab:visible, #mobile-nav-alerts-tab:visible').first();
      await alertsTab.click();
      await page.waitForTimeout(300);
      await page.screenshot({
        path: path.join(screenshotsDir, `alerts_panel_${res.name}.png`),
        fullPage: false,
      });
    });
  }
});