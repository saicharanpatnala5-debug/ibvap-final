import { test, expect } from '@playwright/test';

test.describe('Awiros Indian ANPR-OCR & Statutory Registry Integration', () => {
  test('1. Health check includes all 4 services with awiros-service on port 8001', async ({ page }) => {
    const res = await page.request.get('http://localhost:3000/api/health');
    expect(res.ok()).toBe(true);
    const health = await res.json();
    expect(health.status).toBe('ok');
    expect(health.gateway).toBe('online');
    expect(health.services.gateway.status).toBe('online');
    expect(health.services.aiService.status).toBe('ok');
    expect(health.services.coreService.status).toBe('ok');
    expect(health.services.awirosService.status).toBe('ok');
    expect(health.services.awirosService.model).toBe('Awiros/anpr-ocr');
    expect(health.services.awirosService.engine).toContain('PaddlePaddle PP-OCRv5');
  });

  test('2. Parivahan / VAHAN statutory integration returns compliant responses', async ({ page }) => {
    // A. Seeded demo vehicle
    const demoRes = await page.request.get('http://localhost:3000/api/registry/vahan/KA01M4449');
    expect(demoRes.ok()).toBe(true);
    const demoData = await demoRes.json();
    expect(demoData.lookupStatus).toBe('DEMO_SCENARIO_RECORD');
    expect(demoData.dossier.plateNumber).toBe('KA01M4449');
    expect(demoData.dossier.isSimulatedDemo).toBe(true);

    // B. Unconfigured arbitrary plate - must disclose statutory DPDP Act compliance without fabricating owner data
    const unconfRes = await page.request.get('http://localhost:3000/api/registry/vahan/DL99ZZ9999');
    expect(unconfRes.ok()).toBe(true);
    const unconfData = await unconfRes.json();
    expect(unconfData.lookupStatus).toBe('OFFICIAL_API_CREDENTIALS_REQUIRED');
    expect(unconfData.dossier).toBeNull();
    expect(unconfData.message).toContain('DPDP Act 2023');
  });

  test('3. Vehicle Registry UI displays Image Upload ANPR button, CSV/JSON exports, and layout badges', async ({ page }) => {
    await page.goto('http://localhost:3000');
    await page.waitForLoadState('networkidle');

    // Navigate to Vehicle Registry
    const anprTab = page.locator('#nav-anpr-tab');
    await expect(anprTab).toBeVisible();
    await anprTab.click();

    // Verify Title & MoRTH badge
    await expect(page.locator('text=Vehicle Registry & ANPR Engine')).toBeVisible();
    await expect(page.locator('text=MoRTH / Indian Standard')).toBeVisible();

    // Verify Upload Image ANPR button
    const uploadBtn = page.locator('#upload-image-anpr-btn');
    await expect(uploadBtn).toBeVisible();

    // Click Upload Image ANPR button and verify modal opens
    await uploadBtn.click();
    const modal = page.locator('#image-anpr-modal');
    await expect(modal).toBeVisible();
    await expect(page.locator('text=Static Image ANPR & Plate Inspection')).toBeVisible();

    // Close modal
    await page.locator('#image-anpr-modal button:has-text("Close")').click();
    await expect(modal).not.toBeVisible();

    // Load Demo Data to check layout and State/RTO badges
    const loadDemoBtn = page.locator('#load-demo-data-btn');
    if (await loadDemoBtn.isVisible()) {
      await loadDemoBtn.click();
    }

    // Verify Export buttons appear
    const exportCsv = page.locator('#export-csv-btn');
    const exportJson = page.locator('#export-json-btn');
    await expect(exportCsv).toBeVisible();
    await expect(exportJson).toBeVisible();

    // Verify Awiros model badge
    const modelBadge = page.locator('text=Awiros ANPR-OCR');
    await expect(modelBadge.first()).toBeVisible();

    // Take screenshot of verified Vehicle Registry UI
    await page.screenshot({ path: 'tests/proofs/anpr_awiros_registry_proof.png', fullPage: true });
  });
});
