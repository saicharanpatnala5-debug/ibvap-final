import { test, expect } from '@playwright/test';
import path from 'path';

test.describe('IBVAP Surveillance Platform - End-to-End Walkthrough', () => {
  test('Complete platform walkthrough with clean empty state, registry inspection, copilot, and demo data', async ({ browser }) => {
    test.setTimeout(60000);
    // Launch context with video recording
    const videoDir = path.resolve('./samples/debug_videos');
    const context = await browser.newContext({
      recordVideo: {
        dir: videoDir,
        size: { width: 1280, height: 720 },
      },
      viewport: { width: 1280, height: 720 },
    });

    const page = await context.newPage();

    // 1. Pristine clean first-load
    await page.addInitScript(() => {
      window.localStorage.clear();
    });
    await page.goto('http://localhost:3000');

    // Verify empty state counters and banners
    await expect(page.locator('#main-app-header')).toBeVisible();
    await expect(page.locator('text=Upload footage or connect a camera to begin')).toBeVisible();

    // 2. Navigate to Alerts Feed
    const alertsTab = page.locator('#nav-alerts-tab');
    await alertsTab.click();
    await page.waitForTimeout(500);
    await expect(page.locator('text=Upload footage or connect a camera to begin monitoring')).toBeVisible();

    // 3. Navigate to Vehicle Registry
    const anprTab = page.locator('#nav-anpr-tab');
    await anprTab.click();
    await page.waitForTimeout(500);
    await expect(page.locator('text=0 Logged Reads')).toBeVisible();

    // 4. Load Safe Demo Data for operator walkthrough
    const loadDemoBtn = page.locator('#load-demo-anpr-btn');
    await expect(loadDemoBtn).toBeVisible();
    await loadDemoBtn.click();
    await page.waitForTimeout(600);

    // Verify unreadable plate has NO fake dossier attached
    const unreadableCard = page.locator('text=UNREADABLE').first();
    await expect(unreadableCard).toBeVisible();
    await unreadableCard.click();
    await page.waitForTimeout(400);

    await expect(page.locator('text=No Registry Record Attached').first()).toBeVisible();
    await expect(page.locator('text=RTO Verified')).toHaveCount(0);

    // Operator manual plate correction
    const correctBtn = page.locator('#open-plate-correction-btn');
    if (await correctBtn.isVisible()) {
      await correctBtn.click();
      await page.waitForTimeout(300);
      const input = page.locator('#manual-plate-input');
      await input.fill('DL01AB1234');
      await page.locator('#submit-plate-correction-btn').click();
      await page.waitForTimeout(400);
      await expect(page.locator('text=DL01AB1234').first()).toBeVisible();
    }

    // 5. Navigate back to Live Monitoring
    await page.locator('#nav-monitoring-tab').click();
    await page.waitForTimeout(600);

    // 6. Test Accessibility Modal
    const a11yBtn = page.locator('#open-a11y-settings-btn');
    if (await a11yBtn.isVisible()) {
      await a11yBtn.click();
      await page.waitForTimeout(400);
      const hcToggle = page.locator('#high-contrast-toggle');
      if (await hcToggle.isVisible()) {
        await hcToggle.click();
        await page.waitForTimeout(300);
        await hcToggle.click(); // revert
      }
      const closeA11y = page.locator('#close-a11y-modal-btn');
      if (await closeA11y.isVisible()) {
        await closeA11y.click();
      }
    }

    // 7. Clear Demo Data to return to clean state
    await page.locator('#nav-anpr-tab').click();
    await page.waitForTimeout(400);
    const clearDemoBtn = page.locator('#clear-demo-anpr-btn');
    if (await clearDemoBtn.isVisible()) {
      await clearDemoBtn.click();
      await page.waitForTimeout(400);
      await expect(page.locator('text=0 Logged Reads')).toBeVisible();
    }

    await page.close();
    await context.close();
  });
});
