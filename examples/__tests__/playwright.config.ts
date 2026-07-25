import { defineConfig, devices } from '@playwright/test';
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// EXAMPLE can be:
//   "react", "vue", "vanilla", "cdn", "angular", "astro"  (getting-started)
//   "editor/collaboration/providers/superdoc-yjs", etc.
const example = process.env.EXAMPLE || 'react';

// Resolve example path — getting-started examples use short names
const isGettingStarted = !example.includes('/');
const examplePath = isGettingStarted
  ? `../getting-started/${example}`
  : `../${example}`;

// Examples that use concurrently (server + client).
// These run `npm run dev` which starts both processes — don't append --port.
const useConcurrently = [
  'ai/streaming',
  'editor/collaboration/providers/hocuspocus',
  'editor/collaboration/providers/superdoc-yjs',
];

// Port mapping — must match vite.config or server defaults
const portMap: Record<string, number> = {
  cdn: 3000,
  nuxt: 3000,
  laravel: 8000,
  astro: 4321,
  'editor/collaboration/providers/hocuspocus': 3000,
  'advanced/headless-toolbar/svelte-shadcn': 5190,
  'ai/streaming': 5180,
};
const port = portMap[example] ?? 5173;

// Detect package manager: use pnpm if the example has no local node_modules
// (pnpm hoists to workspace root), otherwise use npm (CI installs per-example)
const exampleAbsPath = resolve(__dirname, examplePath);
const hasLocalNodeModules = existsSync(resolve(exampleAbsPath, 'node_modules', '.bin'));
const run = hasLocalNodeModules ? `npm run --prefix ${examplePath}` : `pnpm --dir ${examplePath} run`;

// Start command — Laravel builds Vite assets first, then serves with PHP only
// (the concurrently approach is unreliable in CI).
let command: string;
switch (example) {
  case 'cdn':
    command = `node ${examplePath}/setup.mjs && npx serve ${examplePath} -l ${port}`;
    break;
  case 'laravel':
    command = `${run} start`;
    break;
  case 'astro':
    command = `${run} dev`;
    break;
  default:
    if (useConcurrently.includes(example)) {
      command = `${run} dev`;
    } else {
      command = `${run} dev -- --port ${port}`;
    }
}

export default defineConfig({
  testDir: '.',
  retries: 1,
  timeout: 30_000,
  webServer: {
    command,
    url: `http://localhost:${port}`,
    timeout: 120_000,
    reuseExistingServer: !process.env.CI,
  },
  use: {
    baseURL: `http://localhost:${port}`,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
});
