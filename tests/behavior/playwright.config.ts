import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  testIgnore: '**/legacy/**',
  fullyParallel: true,
  workers: process.env.CI ? '50%' : 8,
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  reporter: 'list',

  use: {
    viewport: { width: 1600, height: 1200 },
    trace: process.env.TRACE === '1' ? 'on' : 'off',
    screenshot: process.env.SCREENSHOTS === '1' ? 'on' : 'off',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
  ],

  // CI: shard across runners with --shard=1/3, --shard=2/3, --shard=3/3
  webServer: {
    command: 'pnpm exec vite --config harness/vite.config.ts harness/',
    port: 9990,
    reuseExistingServer: !process.env.CI,
  },
});
