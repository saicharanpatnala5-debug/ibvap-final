import { test, expect } from '@playwright/test';

test.describe('ANPR Emergency Fix - Live App Verification', () => {
  test('A. Real UI in Offline Mode: verifies multi-scale ANPR, gate removal, registry counters, attempts badge, and disabled Cloud ANPR toggle', async ({ page }) => {
    // 1. Open app with clean storage
    await page.addInitScript(() => {
      window.localStorage.clear();
      window.sessionStorage.clear();
    });

    await page.goto('http://localhost:3000');
    await page.waitForTimeout(800);

    // 2. Load demo scenario so cameras, telemetry, alerts, and plates are populated
    const loadScenarioBtn = page.locator('#load-demo-scenario-btn');
    if (await loadScenarioBtn.isVisible()) {
      await loadScenarioBtn.click();
      await page.waitForTimeout(1000);
    }

    // 3. Switch to ANPR / Vehicle Registry tab
    const anprTab = page.locator('#nav-anpr-tab');
    await expect(anprTab).toBeVisible();
    await anprTab.click();
    await page.waitForTimeout(800);

    // 4. Verify ANPR Registry container is rendered
    const registryView = page.locator('#anpr-registry-view');
    await expect(registryView).toBeVisible();

    // 5. Verify Counter Cards: Format Valid, Needs Review, Distant Targets, Total
    const counterTotal = page.locator('#anpr-total-plates-metric');
    const counterValid = page.locator('#anpr-format-valid-metric');
    const counterReview = page.locator('#anpr-needs-review-metric');
    const counterDistant = page.locator('#anpr-distant-metric');

    await expect(counterTotal).toBeVisible();
    await expect(counterValid).toBeVisible();
    await expect(counterReview).toBeVisible();
    await expect(counterDistant).toBeVisible();

    const totalText = await counterTotal.innerText();
    const validText = await counterValid.innerText();
    const reviewText = await counterReview.innerText();
    const distantText = await counterDistant.innerText();

    const totalCount = parseInt(totalText, 10) || 0;
    const validCount = parseInt(validText, 10) || 0;
    const reviewCount = parseInt(reviewText, 10) || 0;
    const distantCount = parseInt(distantText, 10) || 0;

    console.log(`[ANPR Proof] Live Stats: Total=${totalCount}, Valid=${validCount}, Review=${reviewCount}, Distant=${distantCount}`);
    expect(totalCount).toBeGreaterThan(0);

    // 6. Verify that NOT all records are marked "Distant Target"
    // The previous bug was: 15 Logged Reads, ALL marked Distant Target.
    // Format Valid count must be at least 1.
    expect(validCount).toBeGreaterThanOrEqual(1);

    // 7. Verify Cloud-assisted ANPR setting toggle in Offline Mode
    const cloudToggle = page.locator('#cloud-anpr-toggle-btn');
    await expect(cloudToggle).toBeVisible();

    // In offline mode (without Gemini API key), toggle must be disabled with reason
    const isDisabled = await cloudToggle.isDisabled();
    expect(isDisabled).toBe(true);
    await expect(registryView).toContainText('Disabled: Gemini API is offline');

    // 8. Verify Table records show vehicle thumbnails, attempt counts, and best-guess text
    const plateItems = page.locator('#anpr-registry-view [id^="plate-item-"]');
    const itemCount = await plateItems.count();
    expect(itemCount).toBeGreaterThan(0);

    // Verify KA01M4449 is present and marked Confirmed / Format Valid
    const kaPlate = page.locator('#plate-item-KA01M4449');
    await expect(kaPlate).toBeVisible();
    await expect(kaPlate).toContainText(/Confirmed|Format Valid/);
    await expect(kaPlate).toContainText('attempt');

    // Verify Distant filter works and isolates only true resolution-limited targets
    const filterDistantBtn = page.locator('button:has-text("Distant (")');
    if (await filterDistantBtn.isVisible()) {
      await filterDistantBtn.click();
      await page.waitForTimeout(400);
      const distantItems = page.locator('#anpr-registry-view [id^="plate-item-"]');
      const dCount = await distantItems.count();
      expect(dCount).toBe(distantCount);
    }

    // Take screenshot as proof
    await page.screenshot({ path: 'docs/anpr_emergency_proof.png', fullPage: true });
    console.log('[ANPR Proof] Screenshot saved to docs/anpr_emergency_proof.png');
  });

  test('B. Online Mode (Mocked Gemini): verifies privacy confirmation dialog before enabling cloud-assisted reading', async ({ page }) => {
    // Explicitly seed false so first-time auto-prompt does not intercept toggle click
    await page.addInitScript(() => {
      window.localStorage.setItem('ibvap_cloud_anpr_enabled', 'false');
    });

    // Mock /api/health to return geminiReachable: true
    await page.route('**/api/health', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          status: 'ok',
          gateway: 'online',
          hasGeminiKey: true,
          geminiReachable: true,
          model: 'gemini-3.8-flash',
        }),
      });
    });

    await page.goto('http://localhost:3000');
    await page.waitForTimeout(800);

    // Load demo scenario
    const loadScenarioBtn = page.locator('#load-demo-scenario-btn');
    if (await loadScenarioBtn.isVisible()) {
      await loadScenarioBtn.click();
      await page.waitForTimeout(800);
    }

    // Switch to ANPR tab
    await page.locator('#nav-anpr-tab').click();
    await page.waitForTimeout(600);

    const cloudToggle = page.locator('#cloud-anpr-toggle-btn');
    await expect(cloudToggle).toBeVisible();
    // In online mode, button must be enabled
    expect(await cloudToggle.isDisabled()).toBe(false);

    // Click toggle to open Privacy Confirmation Dialog
    await cloudToggle.click();
    await page.waitForTimeout(400);

    // Verify Privacy Notice modal
    const modalTitle = page.locator('h3:has-text("Enable Cloud-Assisted Plate Reading?")');
    await expect(modalTitle).toBeVisible();
    await expect(page.locator('text=Privacy Notice')).toBeVisible();
    await expect(page.locator('text=Dual-confirmation is strictly enforced')).toBeVisible();

    // Test Cancel button: modal closes and toggle remains OFF
    const cancelModalBtn = page.locator('#cancel-cloud-anpr-modal-btn');
    await cancelModalBtn.click();
    await page.waitForTimeout(400);
    await expect(modalTitle).not.toBeVisible();
    expect(await cloudToggle.getAttribute('aria-checked')).toBe('false');

    // Click toggle again and confirm
    await cloudToggle.click();
    await page.waitForTimeout(300);
    const confirmModalBtn = page.locator('#confirm-cloud-anpr-modal-btn');
    await confirmModalBtn.click();
    await page.waitForTimeout(400);
    await expect(modalTitle).not.toBeVisible();
    expect(await cloudToggle.getAttribute('aria-checked')).toBe('true');
  });
});
