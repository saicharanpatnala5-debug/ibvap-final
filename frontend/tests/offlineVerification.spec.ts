import { test, expect } from '@playwright/test';

test('Verify zero external network requests during demo scenario', async ({ page }) => {
  const externalRequests: string[] = [];

  page.on('request', (req) => {
    const url = req.url();
    const isLocal =
      url.startsWith('http://localhost') ||
      url.startsWith('http://127.0.0.1') ||
      url.startsWith('data:') ||
      url.startsWith('blob:');

    if (!isLocal) {
      externalRequests.push(url);
    }
  });

  await page.addInitScript(() => {
    window.localStorage.clear();
  });

  // Navigate to app
  await page.goto('http://localhost:3000');
  await page.waitForTimeout(800);

  // Click Load Demo Scenario
  const loadScenarioBtn = page.locator('#load-demo-scenario-btn');
  if (await loadScenarioBtn.isVisible()) {
    await loadScenarioBtn.click();
  }
  await page.waitForTimeout(1000);

  // Visit every nav tab
  await page.locator('#nav-anpr-tab').click();
  await page.waitForTimeout(600);

  await page.locator('#nav-alerts-tab').click();
  await page.waitForTimeout(600);

  await page.locator('#nav-search-tab').click();
  await page.waitForTimeout(600);

  await page.locator('#nav-command-tab').click();
  await page.waitForTimeout(600);

  const topologyTab = page.locator('#nav-topology-tab');
  if (await topologyTab.isVisible()) {
    await topologyTab.click();
    await page.waitForTimeout(600);
  }

  await page.locator('#nav-monitoring-tab').click();
  await page.waitForTimeout(600);

  console.log(`[Offline Audit] Total external requests captured: ${externalRequests.length}`);
  if (externalRequests.length > 0) {
    console.log('[Offline Audit] External requests found:', externalRequests);
  }

  // We want to list and document them
  expect(externalRequests).toEqual([]);
});
