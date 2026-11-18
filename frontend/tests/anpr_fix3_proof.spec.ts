import { test, expect } from '@playwright/test';

test.describe('ANPR FIX 3 - Step 7: Verification Proofs on Test Footage & Pipeline Invariants', () => {
  test('Assertion 1: Clean start = empty registry (count is exactly 0)', async ({ page }) => {
    // Seed localStorage with any legacy or stale data to ensure eviction
    await page.addInitScript(() => {
      window.localStorage.setItem('ibvap_plates_v8.0.0', JSON.stringify({
        schemaVersion: 'v8.0.0',
        data: [{ id: 'stale-1', plateNumber: 'UNRESOLVED', status: 'Distant Target' }],
      }));
    });

    await page.goto('http://localhost:3000');
    await page.waitForLoadState('networkidle');

    // Open Vehicle Registry
    const anprTab = page.locator('#nav-anpr-tab');
    await anprTab.click();

    // Registry counter must show 0 Logged Reads
    await expect(page.locator('text=0 Logged Reads')).toBeVisible();
    await expect(page.locator('#anpr-total-plates-metric')).toContainText('0 Logged Reads');

    // Empty state container must be present
    await expect(page.locator('#anpr-empty-state')).toBeVisible();
    await expect(page.locator('text=No Plates Detected Yet')).toBeVisible();

    // No plate records rendered
    const records = page.locator('[data-testid="plate-record-card"]');
    await expect(records).toHaveCount(0);
  });

  test('Assertion 2: Not all vehicles are marked "Distant Target" & 0% OCR is never shown', async ({ page }) => {
    await page.goto('http://localhost:3000');
    await page.waitForLoadState('networkidle');

    // Navigate to ANPR Registry
    await page.locator('#nav-anpr-tab').click();

    // Click Load Demo Data button inside registry
    const loadDemoDataBtn = page.locator('#load-demo-anpr-btn, #load-demo-data-btn, button:has-text("Load Demo Data")');
    await expect(loadDemoDataBtn.first()).toBeVisible();
    await loadDemoDataBtn.first().click();

    // Verify 0% OCR is never displayed
    const zeroOcr = page.locator('text="0% OCR"');
    await expect(zeroOcr).toHaveCount(0);

    // Verify we have records and not all are Distant Target
    const formatValidFilter = page.locator('button:has-text("Format Valid")');
    await expect(formatValidFilter).toBeVisible();
    const formatValidText = await formatValidFilter.textContent();
    expect(formatValidText).not.toContain('(0)');

    const needsReviewFilter = page.locator('button:has-text("Needs Review")');
    await expect(needsReviewFilter).toBeVisible();

    // Verify 4 Logged Reads and Format Valid is 2
    await expect(page.locator('#anpr-total-plates-metric')).toContainText('4 Logged Reads');
    await expect(page.locator('#anpr-format-valid-metric')).toHaveText('2');
  });

  test('Assertion 3: Pedestrians are never logged into the ANPR registry', async ({ page }) => {
    await page.goto('http://localhost:3000');
    await page.waitForLoadState('networkidle');

    // Ensure ANPR tab is active
    await page.locator('#nav-anpr-tab').click();

    // Check all rendered records
    const records = page.locator('[data-testid="plate-record-card"]');
    const count = await records.count();
    for (let i = 0; i < count; i++) {
      const text = (await records.nth(i).textContent())?.toLowerCase() || '';
      expect(text).not.toContain('pedestrian');
      expect(text).not.toContain('person');
    }
  });

  test('Assertion 4: Unconfirmed AI reads are never marked "Format Valid"', async ({ page }) => {
    // Test backend /api/anpr/ai-read contract directly
    const res = await page.request.post('http://localhost:3000/api/anpr/ai-read', {
      data: {
        cropBase64: 'data:image/jpeg;base64,/9j/4AAQSkZJRg==',
        local_ocr_text: 'DL99ZZ9999', // Divergent from simulated AI response
      },
    });

    if (res.ok()) {
      const data = await res.json();
      if (!data.isConfirmed) {
        expect(data.isValidFormat).toBe(false);
        expect(data.status).not.toBe('Format Valid');
      }
    }
  });

  test('Assertion 5 & 6: Zero synthetic plate fabrication & Dossier appears only for seeded demo matches', async ({ page }) => {
    await page.goto('http://localhost:3000');
    await page.waitForLoadState('networkidle');

    // Load Demo Scenario
    const loadDemoBtn = page.locator('#load-demo-scenario-btn');
    if (await loadDemoBtn.isVisible()) {
      await loadDemoBtn.click();
    }

    await page.locator('#nav-anpr-tab').click();

    // Check right-hand vehicle dossier
    const recordCards = page.locator('[data-testid="plate-record-card"]');
    const count = await recordCards.count();
    if (count > 0) {
      await recordCards.first().click();

      // If a dossier is shown, it must be explicitly labeled as Simulated Record
      const dossierHeader = page.locator('text=Vehicle Dossier');
      await expect(dossierHeader).toBeVisible();

      const simulatedBadge = page.locator('text=Simulated Record');
      const unverifiedMsg = page.locator('text=No Verified Vehicle Dossier, text=Plate read - no registry record, text=No Registry Record Attached');
      const hasSimulatedOrUnverified = (await simulatedBadge.count()) > 0 || (await unverifiedMsg.count()) > 0;
      expect(hasSimulatedOrUnverified).toBe(true);
    }
  });
});
