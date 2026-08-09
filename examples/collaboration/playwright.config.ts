import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  workers: 1,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:4181',
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      command: 'tsx server.ts',
      port: 1234,
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      command: 'pnpm run build && pnpm run preview --host 127.0.0.1 --port 4181 --strictPort',
      url: 'http://127.0.0.1:4181',
      reuseExistingServer: false,
      timeout: 180_000,
    },
  ],
});
