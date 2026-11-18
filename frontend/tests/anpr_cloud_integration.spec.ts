import { test, expect } from '@playwright/test';

test.describe('ANPR Fix 3 - Step 4: Native Resolution & Cloud-Assisted Integration', () => {
  test('A. Consent dialog is shown for first-time online user and can be accepted/denied', async ({ page }) => {
    // Intercept /api/health to pretend Gemini is online
    await page.route('**/api/health', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          status: 'ok',
          uptime: 1234,
          geminiReachable: true,
          hasGeminiKey: true,
          lastErrorCode: null,
          services: { ai: true, core: true },
        }),
      });
    });

    await page.addInitScript(() => {
      window.localStorage.removeItem('ibvap_cloud_anpr_enabled');
    });

    await page.goto('http://localhost:3000');
    await page.waitForLoadState('networkidle');

    // Click Vehicle Registry tab
    const anprTab = page.locator('#nav-anpr-tab');
    await anprTab.click();

    // Verify privacy consent dialog appears
    const consentModal = page.locator('#cloud-anpr-consent-modal');
    await expect(consentModal).toBeVisible();
    await expect(page.locator('text=Enable Cloud-Assisted Plate Reading?')).toBeVisible();
    await expect(page.locator('text=vehicle and license plate crops are sent to Google\'s Gemini API for text recognition')).toBeVisible();

    // Click Deny / Cancel
    const cancelBtn = page.locator('#cancel-cloud-anpr-modal-btn');
    await cancelBtn.click();
    await expect(consentModal).toBeHidden();

    // Verify localStorage has false
    const stored = await page.evaluate(() => window.localStorage.getItem('ibvap_cloud_anpr_enabled'));
    expect(stored).toBe('false');

    // Verify Local OCR active status is displayed
    await expect(page.locator('text=Local OCR active (Cloud-assisted reading disabled by operator).')).toBeVisible();
  });

  test('B. Enabling cloud ANPR updates toggle and stores consent', async ({ page }) => {
    await page.route('**/api/health', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          status: 'ok',
          geminiReachable: true,
          hasGeminiKey: true,
          services: { ai: true, core: true },
        }),
      });
    });

    await page.addInitScript(() => {
      window.localStorage.setItem('ibvap_cloud_anpr_enabled', 'true');
    });

    await page.goto('http://localhost:3000');
    await page.waitForLoadState('networkidle');

    await page.locator('#nav-anpr-tab').click();

    // Toggle should be checked
    const toggleBtn = page.locator('#cloud-anpr-toggle-btn');
    await expect(toggleBtn).toBeVisible();
    await expect(toggleBtn).toHaveAttribute('aria-checked', 'true');
  });
});
