import { defineConfig, devices } from '@playwright/test';
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// EXAMPLE can be:
//   "react", "vue", "vanilla", "cdn", "angular"  (getting-started)
//   "collaboration/superdoc-yjs", "collaboration/hocuspocus", etc.
const example = process.env.EXAMPLE || 'react';

// Resolve example path — getting-started examples use short names
const isGettingStarted = !example.includes('/');
const examplePath = isGettingStarted
  ? `../getting-started/${example}`
  : `../${example}`;

// Collaboration examples that use concurrently (server + client).
// These run `npm run dev` which starts both processes — don't append --port.
const useConcurrently = [
  'collaboration/hocuspocus',
  'collaboration/superdoc-yjs',
];

// Port mapping — must match vite.config or server defaults
const portMap: Record<string, number> = {
  cdn: 3000,
  'collaboration/hocuspocus': 3000,
};
const port = portMap[example] ?? 5173;

// Detect package manager: use pnpm if the example has no local node_modules
// (pnpm hoists to workspace root), otherwise use npm (CI installs per-example)
const exampleAbsPath = resolve(__dirname, examplePath);
const hasLocalNodeModules = existsSync(resolve(exampleAbsPath, 'node_modules', '.bin'));
const run = hasLocalNodeModules ? `npm run --prefix ${examplePath}` : `pnpm --dir ${examplePath} run`;

// Start command
const isCdn = example === 'cdn';
const command = isCdn
  ? `npx serve ${examplePath} -l ${port}`
  : useConcurrently.includes(example)
    ? `${run} dev`
    : `${run} dev -- --port ${port}`;

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
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
});
