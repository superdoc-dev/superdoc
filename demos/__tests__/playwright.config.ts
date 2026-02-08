import { defineConfig, devices } from '@playwright/test';
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// DEMO env var: "react", "vue", "cdn", "nextjs-ssr", etc.
const demo = process.env.DEMO || 'react';

// Demos are flat: demos/<name>/
const demoPath = `../${demo}`;

// Port mapping for non-Vite demos (these use their framework's default port)
const portMap: Record<string, number> = {
  cdn: 8080,
  'grading-papers': 3000,
  'nextjs-ssr': 3000,
};
const port = portMap[demo] ?? 5173;

// Detect package manager: use npm if demo has local node_modules, pnpm otherwise
const demoAbsPath = resolve(__dirname, demoPath);
const hasLocalNodeModules = existsSync(resolve(demoAbsPath, 'node_modules', '.bin'));
const run = hasLocalNodeModules ? `npm run --prefix ${demoPath}` : `pnpm --dir ${demoPath} run`;

// Vite demos accept --port; mapped demos use their default port
const command = portMap[demo] ? `${run} dev` : `${run} dev -- --port ${port}`;

export default defineConfig({
  testDir: '.',
  retries: 1,
  timeout: 30_000,
  webServer: {
    command,
    url: `http://localhost:${port}`,
    timeout: 30_000,
    reuseExistingServer: !process.env.CI,
  },
  use: {
    baseURL: `http://localhost:${port}`,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
