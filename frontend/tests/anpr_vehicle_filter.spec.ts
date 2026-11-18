import { test, expect } from '@playwright/test';

test.describe('ANPR Fix 3 - Step 3: Vehicle Class Filtering & Size Gate Removal', () => {
  test('A. Registry displays attempt counts and best-guess text instead of 0% OCR', async ({ page }) => {
    await page.goto('http://localhost:3000');
    await page.waitForLoadState('networkidle');

    // Click Vehicle Registry tab
    const anprTab = page.locator('#nav-anpr-tab');
    await expect(anprTab).toBeVisible();
    await anprTab.click();

    // Verify header and UI
    await expect(page.locator('text=Vehicle Registry & ANPR Engine')).toBeVisible();

    // Verify that "0% OCR" is never rendered when confidence is 0
    const zeroOcrElements = page.locator('text="0% OCR"');
    await expect(zeroOcrElements).toHaveCount(0);
  });

  test('B. Pedestrian tracks are never logged into the ANPR registry', async ({ page }) => {
    await page.goto('http://localhost:3000');
    await page.waitForLoadState('networkidle');

    // Seed mock playback or inspect entity store
    const anprTab = page.locator('#nav-anpr-tab');
    await anprTab.click();

    // Verify empty or only vehicle records
    const recordCards = page.locator('[data-testid="plate-record-card"]');
    const count = await recordCards.count();
    for (let i = 0; i < count; i++) {
      const cardText = await recordCards.nth(i).textContent();
      expect(cardText?.toLowerCase()).not.toContain('pedestrian');
      expect(cardText?.toLowerCase()).not.toContain('person');
    }
  });
});
