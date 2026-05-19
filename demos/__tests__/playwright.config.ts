import { defineConfig, devices } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// DEMO env var: "custom-ui", "grading-papers", "slack-redlining", etc.
// Default points at a curated source demo that survives the SD-2928 reorg.
// `demos/react` is now a README-only shim, so the prior default would fail
// when running this suite locally without an explicit DEMO override.
const demo = process.env.DEMO || 'custom-ui';

// Resolve the demo's working directory via the manifest. Old paths under
// demos/<name>/ may now be shim READMEs; manifest sourcePath is the source
// of truth post-SD-3217.
const manifestPath = resolve(__dirname, '../manifest.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Array<{
  id: string;
  sourcePath?: string | null;
  sourceRepo?: string;
}>;
const entry = manifest.find((e) => e.id === demo);
const sourcePath = entry?.sourceRepo === 'superdoc-dev/superdoc' ? entry?.sourcePath : null;
if (!sourcePath) {
  throw new Error(`DEMO="${demo}" not found in demos/manifest.json or is not a local demo`);
}
const repoRoot = resolve(__dirname, '../..');
const demoPath = relative(__dirname, resolve(repoRoot, sourcePath));

// Port mapping for non-Vite demos (these use their framework's default port)
const portMap: Record<string, number> = {
  cdn: 8080,
  'grading-papers': 3000,
  'nextjs-ssr': 3000,
  'custom-ui': 5189,
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
    timeout: 120_000,
    reuseExistingServer: !process.env.CI,
  },
  use: {
    baseURL: `http://localhost:${port}`,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
