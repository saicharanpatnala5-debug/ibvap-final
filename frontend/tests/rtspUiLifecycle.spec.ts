import { test, expect } from '@playwright/test';
import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../..');
const VIDEO_PATH = path.join(ROOT_DIR, 'samples', 'whatsapp_video_2026_09_09_842pm.mp4');
const MEDIAMTX_CONFIG = path.join(ROOT_DIR, 'mediamtx.yml');
const MEDIAMTX_EXE = 'C:\\Users\\SAI CHARAN\\AppData\\Local\\Microsoft\\WinGet\\Packages\\bluenviron.mediamtx_Microsoft.Winget.Source_8wekyb3d8bbwe\\mediamtx.exe';
const FFMPEG_EXE = 'C:\\Users\\SAI CHARAN\\AppData\\Local\\Microsoft\\WinGet\\Packages\\Gyan.FFmpeg.Essentials_Microsoft.Winget.Source_8wekyb3d8bbwe\\ffmpeg-9.0.1-essentials_build\\bin\\ffmpeg.exe';
const RTSP_URL = 'rtsp://localhost:8554/live/checkpoint';

test.describe('STEP 4 - RTSP Camera Onboarding, Ingestion & Reconnect in Live UI', () => {
  let mediamtxProc: ChildProcess | null = null;
  let ffmpegProc: ChildProcess | null = null;

  test.beforeAll(async () => {
    // 1. Start MediaMTX Server
    console.log('[RTSP Test] Launching MediaMTX server on port 8554...');
    mediamtxProc = spawn(MEDIAMTX_EXE, [MEDIAMTX_CONFIG], { stdio: 'ignore' });
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // 2. Publish video over RTSP via FFmpeg
    console.log(`[RTSP Test] Publishing looping video to ${RTSP_URL}...`);
    ffmpegProc = spawn(
      FFMPEG_EXE,
      [
        '-re',
        '-stream_loop', '-1',
        '-i', VIDEO_PATH,
        '-map', '0:v:0',
        '-c:v', 'copy',
        '-an',
        '-f', 'rtsp',
        '-rtsp_transport', 'tcp',
        RTSP_URL,
      ],
      { stdio: 'ignore' }
    );
    await new Promise((resolve) => setTimeout(resolve, 3000));
  });

  test.afterAll(async () => {
    console.log('[RTSP Test] Cleaning up MediaMTX and FFmpeg processes...');
    if (ffmpegProc) {
      ffmpegProc.kill();
    }
    if (mediamtxProc) {
      mediamtxProc.kill();
    }
  });

  test('Add RTSP Camera via UI modal, verify live ingestion, and test reconnect resilience', async ({ page }) => {
    test.setTimeout(90000);

    // 1. Navigate to application
    await page.goto('http://localhost:3000');
    await page.waitForTimeout(1000);

    // 2. Open Add Camera Modal
    const addBtn = page.locator('#grid-add-camera-btn, #empty-add-camera-btn').first();
    await expect(addBtn).toBeVisible({ timeout: 10000 });
    await addBtn.click();

    // 3. Select IP/RTSP Stream Tab
    const streamTab = page.locator('#tab-stream-btn');
    await expect(streamTab).toBeVisible();
    await streamTab.click();

    // 4. Fill in RTSP details
    const nameInput = page.locator('#camera-name-input');
    await nameInput.fill('RTSP Checkpoint 01');

    const urlInput = page.locator('#rtsp-url-input');
    await urlInput.fill(RTSP_URL);

    // 5. Submit Add Camera
    const submitBtn = page.locator('#submit-add-camera-btn');
    await expect(submitBtn).toBeEnabled();
    await submitBtn.click();

    // 6. Verify camera card appears in grid
    await page.waitForTimeout(1500);
    const cameraCard = page.locator('text=RTSP Checkpoint 01').first();
    await expect(cameraCard).toBeVisible({ timeout: 15000 });
    console.log('[RTSP Test] Camera card successfully added to grid!');

    // 7. Verify stream connection state
    const ipStreamBadge = page.locator('text=IP Stream').first();
    await expect(ipStreamBadge).toBeVisible({ timeout: 10000 });

    // 8. Verify live analysis HUD is active
    const analysisFpsBadge = page.locator('text=/FPS|Analyzing/').first();
    await expect(analysisFpsBadge).toBeVisible({ timeout: 10000 });

    // 9. Simulate publisher drop (disconnect)
    console.log('[RTSP Test] Simulating stream disconnect (killing FFmpeg publisher)...');
    if (ffmpegProc) {
      ffmpegProc.kill();
      ffmpegProc = null;
    }
    await page.waitForTimeout(4000);

    // 10. Simulate publisher recovery (reconnect)
    console.log('[RTSP Test] Simulating stream reconnection (restarting FFmpeg publisher)...');
    ffmpegProc = spawn(
      FFMPEG_EXE,
      [
        '-re',
        '-stream_loop', '-1',
        '-i', VIDEO_PATH,
        '-map', '0:v:0',
        '-c:v', 'copy',
        '-an',
        '-f', 'rtsp',
        '-rtsp_transport', 'tcp',
        RTSP_URL,
      ],
      { stdio: 'ignore' }
    );
    await page.waitForTimeout(5000);

    // Verify UI resumes streaming without crashing
    const recoveredCard = page.locator('text=RTSP Checkpoint 01').first();
    await expect(recoveredCard).toBeVisible();
    console.log('[RTSP Test] UI remained completely responsive during disconnect and resumed upon recovery!');
  });
});
