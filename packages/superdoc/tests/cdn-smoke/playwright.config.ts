import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  timeout: 15_000,
  webServer: {
    command: 'npx serve ../.. -l 3333 --no-clipboard',
    url: 'http://localhost:3333',
    timeout: 10_000,
  },
  use: {
    baseURL: 'http://localhost:3333',
  },
  projects: [{ name: 'chromium', use: { channel: 'chrome' } }],
});
