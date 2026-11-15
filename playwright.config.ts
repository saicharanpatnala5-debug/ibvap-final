import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './frontend/tests',
  testMatch: '**/*.spec.ts',
  timeout: 30000,
  fullyParallel: true,
  retries: 0,
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
