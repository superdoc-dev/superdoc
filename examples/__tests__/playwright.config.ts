import { defineConfig, devices } from '@playwright/test';

const example = process.env.EXAMPLE || 'react';
const isCdn = example === 'cdn';
const port = isCdn ? 3000 : 5173;

export default defineConfig({
  testDir: '.',
  retries: 1,
  timeout: 30_000,
  webServer: {
    command: isCdn
      ? `npx serve ../${example} -l ${port}`
      : `npm run --prefix ../${example} dev -- --port ${port}`,
    url: `http://localhost:${port}`,
    timeout: 30_000,
    reuseExistingServer: !process.env.CI,
  },
  use: {
    baseURL: `http://localhost:${port}`,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
});
