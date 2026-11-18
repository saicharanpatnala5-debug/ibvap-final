import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

test.describe('COPILOT EMERGENCY FIX - End-to-End Proof Suite', () => {
  test('1. Mocked Gemini Server: Counting, Image Grounding, History Follow-up, Track Crop & Streaming', async ({ page }) => {
    const receivedRequests: any[] = [];

    // Intercept /api/health to simulate Online state with gemini-3.8-flash
    await page.route('**/api/health', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          status: 'UP',
          model: 'gemini-3.8-flash',
          geminiReachable: true,
          hasGeminiKey: true,
          lastErrorCode: null,
          uptimeSeconds: 120,
        }),
      });
    });

    // Intercept /api/ai/chat with SSE streaming
    await page.route('**/api/ai/chat*', async (route) => {
      const body = route.request().postDataJSON();
      receivedRequests.push(body);

      const msg = (body?.message || '').toLowerCase();
      let replyChunks: string[] = [];

      if (msg.includes('how many') || msg.includes('count')) {
        replyChunks = [
          'Looking at the decoded surveillance frame: ',
          'At 4.3s: 1 car, 1 auto-rickshaw (2 vehicles), 0 pedestrians. ',
          'Clip total: 4 vehicles, 1 pedestrian across 5 tracks.',
        ];
      } else if (msg.includes('explain') || msg.includes('scene') || msg.includes('footage')) {
        replyChunks = [
          'Analyzing live optical snapshot: ',
          'Urban road checkpoint with mixed traffic. ',
          'A three-wheeled auto-rickshaw and sedan are navigating the lane.',
        ];
      } else if (msg.includes('which vehicle') || msg.includes('faster') || msg.includes('follow-up')) {
        replyChunks = [
          'Based on previous observation and velocity telemetry: ',
          'The two-wheeler on the right is moving faster than the auto-rickshaw.',
        ];
      } else if (msg.includes('track #') || body?.attachedCrop) {
        replyChunks = [
          'Inspecting isolated crop for Track #',
          `${body.attachedTrackId || '101'}: `,
          'This vehicle is a commercial three-wheeler auto-rickshaw moving eastbound.',
        ];
      } else {
        replyChunks = ['Affirmative. Optical and telemetry grounding active.'];
      }

      // Build SSE body with real chunking
      let sseData = '';
      for (const chunk of replyChunks) {
        sseData += `data: ${JSON.stringify({ text: chunk })}\n\n`;
      }
      sseData += `data: ${JSON.stringify({ done: true, model: 'gemini-3.8-flash', source: 'gemini' })}\n\n`;

      await route.fulfill({
        status: 200,
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        },
        body: sseData,
      });
    });

    // Clean storage & navigate
    await page.addInitScript(() => {
      window.localStorage.clear();
      window.sessionStorage.clear();
    });

    await page.goto('http://localhost:3000');
    await page.waitForTimeout(600);

    // Load demo scenario
    const loadScenarioBtn = page.locator('#load-demo-scenario-btn');
    if (await loadScenarioBtn.isVisible()) {
      await loadScenarioBtn.click();
      await page.waitForTimeout(1500);
    }

    // Switch to AI Command Center (Copilot)
    await page.locator('#nav-command-tab').click();
    await page.waitForTimeout(800);

    // Verify online badge
    const badge = page.locator('#copilot-status-badge');
    await expect(badge).toBeVisible();
    await expect(badge).toContainText('Online');

    // A. Query 1: Counting with Visible-Now and Clip-Total
    const input = page.locator('#ai-command-input');
    const submitBtn = page.locator('#ai-command-submit-btn');

    await input.fill('How many vehicles and pedestrians were detected?');
    await submitBtn.click();

    // Verify latest AI message appears and contains both counts
    const aiBubbles = page.locator('#ai-command-center-container [data-testid="chat-bubble-ai"]');
    await expect(aiBubbles.last()).toContainText('At 4.3s: 1 car, 1 auto-rickshaw (2 vehicles), 0 pedestrians', { timeout: 8000 });
    await expect(aiBubbles.last()).toContainText('Clip total: 4 vehicles, 1 pedestrian across 5 tracks');

    // Verify request 1 payload
    expect(receivedRequests.length).toBeGreaterThan(0);
    const req1 = receivedRequests[0];
    expect(req1.message).toBe('How many vehicles and pedestrians were detected?');
    expect(req1.context).toBeDefined();

    // B. Query 2: Explain Footage (Verifies image payload > 0 bytes & compact telemetry)
    await input.fill("Explain what's going on in the footage");
    await submitBtn.click();

    await expect(aiBubbles.last()).toContainText('Analyzing live optical snapshot', { timeout: 8000 });
    const req2 = receivedRequests[1];
    expect(req2.message).toBe("Explain what's going on in the footage");
    // Ensure frameBase64 is sent and is a valid image data URL
    expect(typeof req2.frameBase64).toBe('string');
    expect(req2.frameBase64.length).toBeGreaterThan(100);
    expect(req2.context).toBeDefined();

    // C. Query 3: Follow-up question (Verifies multi-turn history)
    await input.fill('Which vehicle is faster?');
    await submitBtn.click();

    await expect(aiBubbles.last()).toContainText('two-wheeler on the right is moving faster', { timeout: 8000 });
    const req3 = receivedRequests[2];
    expect(req3.history).toBeDefined();
    expect(Array.isArray(req3.history)).toBe(true);
    expect(req3.history.length).toBeGreaterThanOrEqual(2);
    // Prior user message should be in history
    const historyTexts = req3.history.map((h: any) => h.text);
    expect(historyTexts.some((t: string) => t.includes('Explain'))).toBe(true);

    // Save screenshot of online streaming copilot
    await page.screenshot({ path: 'test-results/copilot_online_streaming.png' });

    // D. "Ask about this vehicle" from Live Monitor
    await page.locator('#nav-monitoring-tab').click();
    await page.waitForTimeout(600);

    const askAiBtn = page.locator('[id^="ask-about-track-"]').first();
    if (await askAiBtn.isVisible()) {
      await askAiBtn.click();
      await page.waitForTimeout(800);

      // App should automatically switch back to Copilot tab
      await expect(page.locator('#ai-command-center-container')).toBeVisible();
      // Should have triggered query with crop
      await expect(aiBubbles.last()).toContainText('Inspecting isolated crop', { timeout: 8000 });

      const lastReq = receivedRequests[receivedRequests.length - 1];
      expect(lastReq.attachedCrop || lastReq.attachedTrackId).toBeDefined();
    }
  });

  test('2. Offline Fallback & In-App Key Management Modal Flow', async ({ page }) => {
    // Intercept /api/health to simulate Offline mode (no key)
    let isKeyConfigured = false;

    await page.route('**/api/health', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          status: 'UP',
          model: 'gemini-3.8-flash',
          geminiReachable: isKeyConfigured,
          hasGeminiKey: isKeyConfigured,
          lastErrorCode: isKeyConfigured ? null : 'NO_API_KEY',
          uptimeSeconds: 150,
        }),
      });
    });

    // Intercept /api/ai/set-key
    await page.route('**/api/ai/set-key', async (route) => {
      isKeyConfigured = true;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          model: 'gemini-3.8-flash',
          savedToDisk: false,
        }),
      });
    });

    // Intercept /api/ai/remove-key
    await page.route('**/api/ai/remove-key', async (route) => {
      isKeyConfigured = false;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true }),
      });
    });

    // Intercept /api/ai/chat returning offline fallback
    await page.route('**/api/ai/chat*', async (route) => {
      const fallbackText =
        'Offline mode: tracker data only. To enable visual understanding, set your Gemini API key.\n\n- At 4.3s: 1 car, 1 auto-rickshaw (2 vehicles), 0 pedestrians.\n- Clip total: 4 vehicles, 1 pedestrian across 5 tracks.';

      const sseData = `data: ${JSON.stringify({ text: fallbackText, done: true, source: 'fallback', reason: 'NO_API_KEY' })}\n\n`;
      await route.fulfill({
        status: 200,
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        },
        body: sseData,
      });
    });

    await page.addInitScript(() => {
      window.localStorage.clear();
      window.sessionStorage.clear();
    });

    await page.goto('http://localhost:3000');
    await page.waitForTimeout(600);

    // Switch to Copilot tab
    await page.locator('#nav-command-tab').click();
    await page.waitForTimeout(500);

    // Verify offline badge
    const badge = page.locator('#copilot-status-badge');
    await expect(badge).toBeVisible();
    await expect(badge).toContainText('Offline mode');

    // Send query in offline mode
    const input = page.locator('#ai-command-input');
    await input.fill('How many vehicles and pedestrians were detected?');
    await page.locator('#ai-command-submit-btn').click();

    const aiBubbles = page.locator('#ai-command-center-container [data-testid="chat-bubble-ai"]');
    await expect(aiBubbles.last()).toContainText('Offline mode: tracker data only', { timeout: 8000 });
    await expect(aiBubbles.last()).toContainText('At 4.3s: 1 car, 1 auto-rickshaw');

    // Verify prominent "Set API key" button inside fallback bubble
    const bubbleSetKeyBtn = page.locator('#copilot-fallback-set-key-btn');
    await expect(bubbleSetKeyBtn).toBeVisible();

    await page.screenshot({ path: 'test-results/copilot_offline_fallback.png' });

    // Click "Set API key" to open modal
    await bubbleSetKeyBtn.click();

    // Verify modal is visible
    const modal = page.locator('#gemini-key-modal');
    await expect(modal).toBeVisible();
    await expect(modal).toContainText('Gemini API Key Configuration');

    // Fill in key and save
    const keyInput = page.locator('#gemini-api-key-input, #gemini-key-input, [data-testid="gemini-key-input"]').first();
    await keyInput.fill('AIzaSyTestKeyValidFormatForModalVerification123');

    const saveBtn = page.locator('#save-gemini-key-btn');
    await saveBtn.click();

    // Modal should close
    await expect(modal).not.toBeVisible({ timeout: 5000 });

    // Badge should switch to Online without page reload
    await expect(badge).toContainText('Online', { timeout: 5000 });
    console.log('[Copilot E2E] Key modal successfully switched badge to Online!');

    await page.screenshot({ path: 'test-results/copilot_key_modal.png' });
  });

  test('3. Real Gemini Key Verification (Conditional)', async ({ page }) => {
    // Check if real key is configured in gateway/.env or process.env
    const gatewayEnvPath = path.resolve(process.cwd(), '../gateway/.env');
    let hasRealKey = false;

    if (fs.existsSync(gatewayEnvPath)) {
      const content = fs.readFileSync(gatewayEnvPath, 'utf-8');
      const match = content.match(/GEMINI_API_KEY=(.+)/);
      if (match && match[1].trim() && !match[1].includes('your_key') && !match[1].includes('your_api_key')) {
        hasRealKey = true;
      }
    }

    if (!hasRealKey && process.env.GEMINI_API_KEY && !process.env.GEMINI_API_KEY.includes('your_key')) {
      hasRealKey = true;
    }

    if (!hasRealKey) {
      console.log('NOTICE: No real GEMINI_API_KEY provided in gateway/.env or process.env.');
      console.log('Skipping real API network turn gracefully. Live Gemini was not verified in this run.');
      return;
    }

    console.log('Real GEMINI_API_KEY detected! Performing 1 live verification turn against Gateway...');
    await page.goto('http://localhost:3000');
    await page.locator('#nav-command-tab').click();
    await page.waitForTimeout(1000);

    const input = page.locator('#ai-command-input');
    await input.fill('What is the primary activity observed in the scene?');
    await page.locator('#ai-command-submit-btn').click();

    const aiBubbles = page.locator('#ai-command-center-container [data-testid="chat-bubble-ai"]');
    await expect(aiBubbles.last()).toBeVisible({ timeout: 15000 });
    const replyText = await aiBubbles.last().innerText();
    console.log('[Live Gemini Turn Output]:', replyText);
    expect(replyText.length).toBeGreaterThan(20);
  });
});
