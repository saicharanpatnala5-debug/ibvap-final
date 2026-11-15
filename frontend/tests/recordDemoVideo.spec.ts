import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

test.use({
  video: {
    mode: 'on',
    size: { width: 1280, height: 720 },
  },
  viewport: { width: 1280, height: 720 },
});

test.describe('IBVAP Full Platform Demo Walkthrough & Video Recording', () => {

  test('Execute full 5-minute operator demo walkthrough and record video', async ({ page }) => {
    // 1. Initial Clean Load
    await page.addInitScript(() => {
      window.localStorage.clear();
    });
    await page.goto('http://localhost:3000');
    await page.waitForTimeout(600);

    // Verify empty state
    await expect(page.locator('#camera-empty-state')).toBeVisible();

    // 2. Load Demo Scenario
    const loadScenarioBtn = page.locator('#load-demo-scenario-btn');
    if (await loadScenarioBtn.isVisible()) {
      await loadScenarioBtn.click();
    } else {
      const loadDataBtn = page.locator('#load-demo-anpr-btn, #load-demo-data-btn').first();
      await loadDataBtn.click();
    }
    await page.waitForTimeout(1000);

    // 3. Inspect Live Monitor with loaded camera & zone
    await expect(page.locator('#nav-monitoring-tab')).toBeVisible();
    await page.waitForTimeout(1200);

    // 4. Navigate to Vehicle Registry
    await page.locator('#nav-anpr-tab').click();
    await page.waitForTimeout(1000);

    // 5. Correct an unreadable plate
    const correctBtn = page.locator('button:has-text("Correct Plate")').first();
    if (await correctBtn.isVisible()) {
      await correctBtn.click();
      await page.waitForTimeout(400);
      const input = page.locator('input[placeholder*="DL01AB1234"], input[type="text"]').last();
      if (await input.isVisible()) {
        await input.fill('DL01AB1234');
        await page.waitForTimeout(400);
        const saveBtn = page.locator('button:has-text("Save"), button:has-text("Confirm")').first();
        if (await saveBtn.isVisible()) {
          await saveBtn.click();
        }
      }
    }
    await page.waitForTimeout(1000);

    // 6. Navigate to Alerts Panel
    await page.locator('#nav-alerts-tab').click();
    await page.waitForTimeout(1000);

    // 7. Navigate to Forensics
    await page.locator('#nav-search-tab').click();
    await page.waitForTimeout(800);

    // 8. Navigate to AI Copilot
    await page.locator('#nav-command-tab').click();
    await page.waitForTimeout(1000);

    // 9. Reset Platform to Clean State
    const resetBtn = page.locator('#reset-platform-btn');
    if (await resetBtn.isVisible()) {
      await resetBtn.click();
      await page.waitForTimeout(600);
    }

    // Return to Live Monitor and verify clean state
    await page.locator('#nav-monitoring-tab').click();
    await page.waitForTimeout(800);
    await expect(page.locator('#camera-empty-state')).toBeVisible();
  });

  test.afterEach(async ({ page }, testInfo) => {
    const video = page.video();
    if (video) {
      const videoPath = await video.path();
      const targetDir = path.resolve(process.cwd(), '../docs/demo_video');
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }
      const targetPath = path.join(targetDir, 'backup_walkthrough.webm');
      try {
        await page.close(); // Closes page to flush video
        if (fs.existsSync(videoPath)) {
          fs.copyFileSync(videoPath, targetPath);
          console.log(`[Demo Video] Walkthrough video saved to: ${targetPath}`);
        }
      } catch (err) {
        console.warn('[Demo Video] Could not copy video:', err);
      }
    }
  });
});
