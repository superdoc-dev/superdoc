import { defineConfig, devices } from '@playwright/test';
import testConfig from './test-config.js';

export default defineConfig({
  testMatch: '**/*.spec.js',

  // Run all tests in parallel.
  fullyParallel: true,

  // Fail the build on CI if you accidentally left test.only in the source code.
  forbidOnly: !!process.env.CI,

  // Retry on CI only.
  retries: process.env.CI ? 2 : 0,

  // Opt out of parallel tests on CI.
  workers: process.env.CI ? 1 : undefined,

  // Reporter to use
  reporter: 'html',

  use: {
    // Base URL to use in actions like `await page.goto('/')`.
    baseURL: 'http://localhost:5173',

    // Collect trace when retrying the failed test.
    trace: 'on-first-retry',
  },
  // Configure projects for major browsers.
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  // Open every example in a separate server
  webServer: testConfig.packages.map((packagePath, i) => {
    return {
      command: `pnpm run --prefix ../${packagePath} dev --port ${5173 + i}`,
      url: `http://localhost:${5173 + i}`,
      reuseExistingServer: !process.env.CI,
      timeout: 120 * 1000, // 2 minutes timeout for server startup
    }
  })
});
