import { test, expect } from '@playwright/test';

test.describe('STEP 1 - AI Copilot Chatbot End-to-End Verification', () => {
  test('A. Real UI in Offline Mode: verifies status badge, asks 5 grounded questions, and checks non-empty grounded answers', async ({ page }) => {
    // 1. Load application with clean storage
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

    // 3. Switch to AI Copilot tab
    await page.locator('#nav-command-tab').click();
    await page.waitForTimeout(800);

    // 4. Verify copilot status badge is visible
    const statusBadge = page.locator('#copilot-status-badge');
    await expect(statusBadge).toBeVisible();
    const statusText = await statusBadge.innerText();
    expect(statusText.length).toBeGreaterThan(0);
    console.log('[Copilot E2E] Detected Copilot Status:', statusText);

    // Helper to send query and wait for assistant reply
    async function sendQuery(query: string): Promise<string> {
      const prevCount = await page.locator('#ai-command-center-container [data-testid="chat-bubble-ai"]').count();
      const input = page.locator('#ai-command-input');
      await input.fill(query);
      await page.locator('#ai-command-submit-btn').click();

      // Wait for assistant reply count to increment
      await expect(page.locator('#ai-command-center-container [data-testid="chat-bubble-ai"]')).toHaveCount(prevCount + 1, { timeout: 10000 });

      // Get latest assistant message
      const latestMsg = page.locator('#ai-command-center-container [data-testid="chat-bubble-ai"]').last();
      const latestText = await latestMsg.innerText();
      return latestText;
    }

    // Question 1: Scene Explanation
    const q1Answer = await sendQuery("Explain what's going on in the footage");
    expect(q1Answer.length).toBeGreaterThan(40);
    expect(q1Answer.toLowerCase()).toMatch(/scene|observed|pedestrian|vehicle|target/);

    // Question 2: Entity Counts by Class
    const q2Answer = await sendQuery('How many vehicles and pedestrians were detected?');
    expect(q2Answer.length).toBeGreaterThan(40);
    expect(q2Answer.toLowerCase()).toMatch(/pedestrian|vehicle|car|auto-rickshaw/);

    // Question 3: License Plates Read & Review
    const q3Answer = await sendQuery('Show license plates read and needing review');
    expect(q3Answer.length).toBeGreaterThan(40);
    expect(q3Answer.toLowerCase()).toMatch(/plate|anpr|ka01kw4498|review/);

    // Question 4: Why Alert Fired
    const q4Answer = await sendQuery('Why did the loitering alert fire?');
    expect(q4Answer.length).toBeGreaterThan(40);
    expect(q4Answer.toLowerCase()).toMatch(/trigger|loiter|dwell|zone|threat/);

    // Question 5: Zone Activity
    const q5Answer = await sendQuery('Which zone had security activity?');
    expect(q5Answer.length).toBeGreaterThan(40);
    expect(q5Answer.toLowerCase()).toMatch(/zone|restricted perimeter shoulder|violation/);

    // Verify Retry button presence on AI response
    const retryButtons = page.locator('button:has-text("Retry")');
    const retryCount = await retryButtons.count();
    expect(retryCount).toBeGreaterThan(0);
  });

  test('B. Mocked Gemini Server: verifies UI correctly renders Gemini API responses and attribution badge', async ({ page }) => {
    // Intercept /api/ai/chat with mock Gemini response
    await page.route('**/api/ai/chat', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          text: '### 🛡️ TACTICAL AI COPILOT REPORT\nVisual reconnaissance confirmed target perimeter traversal under active illumination.\n- **Threat Index**: 12/100 (Nominal)\n- **Recommendation**: Maintain passive sensor monitoring.',
          source: 'gemini',
          model: 'gemini-3.8-flash',
          timestamp: Date.now(),
        }),
      });
    });

    await page.goto('http://localhost:3000');
    await page.locator('#nav-command-tab').click();
    await page.waitForTimeout(600);

    const input = page.locator('#ai-command-input');
    await input.fill('Perform forensic multi-modal risk assessment');
    await page.locator('#ai-command-submit-btn').click();
    await page.waitForTimeout(1000);

    // Verify response text and Gemini attribution badge
    const responseContainer = page.locator('#ai-command-center-container');
    await expect(responseContainer).toContainText('TACTICAL AI COPILOT REPORT');
    await expect(responseContainer).toContainText('Gemini AI (gemini-3.8-flash)');
  });
});
