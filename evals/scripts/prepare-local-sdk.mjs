#!/usr/bin/env node

/**
 * Prepare local SDK and CLI for eval runs.
 *
 * Ensures evals always run against workspace code (not a published npm package).
 *
 * Full mode (Level 2 — preeval:e2e):
 *   1. Regenerates all artifacts (doc-api → CLI contract → SDK tool catalogs)
 *   2. Builds the SDK and CLI
 *   3. Verifies all outputs exist
 *   4. Verifies @superdoc-dev/sdk resolves from the workspace
 *   5. Verifies the tool surface matches the expected 9 grouped public tools
 *
 * Light mode (Level 1 — preeval / preeval:openai):
 *   1. Regenerates SDK tool catalogs (fast path)
 *   2. Falls back to full bootstrap if doc-api prerequisites are missing
 *   3. Verifies tool catalog JSON files exist
 *   4. Verifies the tool surface matches expectations via catalog JSON
 *
 * Flags:
 *   --light   Run SDK-only generation and catalog verification.
 *             Skips doc-api chain, SDK/CLI builds, and SDK import checks.
 *   --skip    Skip all preparation. For rapid iteration when builds are known-current.
 *             Also available as SKIP_PREPARE=1 env var.
 */

import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '../..');
const EVALS_ROOT = resolve(__dirname, '..');

const SDK_NODE_PKG = resolve(REPO_ROOT, 'packages/sdk/langs/node');
const SDK_TOOLS_DIR = resolve(REPO_ROOT, 'packages/sdk/tools');

const OUTPUTS = {
  docApiContract: resolve(REPO_ROOT, 'packages/document-api/generated/schemas/document-api-contract.json'),
  sdkDist:      resolve(SDK_NODE_PKG, 'dist/index.js'),
  cliDist:      resolve(REPO_ROOT, 'apps/cli/dist/index.js'),
  toolsVercel:  resolve(SDK_TOOLS_DIR, 'tools.vercel.json'),
  toolsOpenai:  resolve(SDK_TOOLS_DIR, 'tools.openai.json'),
  systemPrompt: resolve(SDK_TOOLS_DIR, 'system-prompt.md'),
};

// ---------------------------------------------------------------------------
// Expected tool surface — must match the 9 grouped public tools from the SDK
// ---------------------------------------------------------------------------

const EXPECTED_TOOLS = [
  'superdoc_comment',
  'superdoc_create',
  'superdoc_edit',
  'superdoc_format',
  'superdoc_get_content',
  'superdoc_list',
  'superdoc_mutations',
  'superdoc_search',
  'superdoc_track_changes',
];

// ---------------------------------------------------------------------------
// Logging
// ---------------------------------------------------------------------------

function log(msg) { console.log(`  [prepare] ${msg}`); }
function logHeader(msg) { console.log(`\n  [prepare] ${msg}`); }

function fail(msg) {
  console.error(`\n  [prepare] FAILED: ${msg}\n`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Build steps
// ---------------------------------------------------------------------------

function exec(label, command) {
  log(label);
  try {
    execSync(command, { cwd: REPO_ROOT, stdio: 'inherit' });
  } catch {
    fail(`"${label}" failed. Fix the error above and retry.`);
  }
}

function regenerateAll() {
  exec(
    'Regenerating all artifacts (doc-api → CLI contract → SDK tools)...',
    'pnpm run generate:all',
  );
}

function regenerateToolCatalogs() {
  exec(
    'Regenerating SDK tool catalogs...',
    'pnpm --filter @superdoc-dev/sdk-workspace run generate',
  );
}

function level1NeedsBootstrap() {
  return !existsSync(OUTPUTS.docApiContract);
}

function prepareLevel1Artifacts() {
  if (!level1NeedsBootstrap()) {
    regenerateToolCatalogs();
    return;
  }

  log(
    'Document API contract is missing, so Level 1 is falling back to full bootstrap once.',
  );
  regenerateAll();
}

function buildSdk() {
  exec('Building local SDK...', 'pnpm --filter @superdoc-dev/sdk run build');
}

function buildCli() {
  exec('Building local CLI...', 'pnpm --filter @superdoc-dev/cli run build');
}

// ---------------------------------------------------------------------------
// Verification steps
// ---------------------------------------------------------------------------

function assertExists(label, path) {
  if (!existsSync(path)) {
    fail(
      `Expected ${label} at:\n    ${path}\n` +
      `  But file does not exist. Did the build succeed?`,
    );
  }
}

function verifyOutputs({ includeSdk, includeCli }) {
  log('Verifying build outputs...');
  assertExists('Vercel tool catalog', OUTPUTS.toolsVercel);
  assertExists('OpenAI tool catalog', OUTPUTS.toolsOpenai);
  assertExists('System prompt', OUTPUTS.systemPrompt);
  if (includeSdk) assertExists('SDK dist', OUTPUTS.sdkDist);
  if (includeCli) assertExists('CLI dist', OUTPUTS.cliDist);
}

function verifySdkResolvesFromWorkspace() {
  log('Verifying SDK resolves from workspace (not npm)...');

  const require = createRequire(resolve(EVALS_ROOT, 'package.json'));
  let resolvedPath;
  try {
    resolvedPath = realpathSync(require.resolve('@superdoc-dev/sdk'));
  } catch (err) {
    fail(
      `Cannot resolve @superdoc-dev/sdk from evals/.\n` +
      `  Error: ${err.message}\n` +
      `  Fix: run "pnpm install" from the repo root.`,
    );
  }

  if (!resolvedPath.startsWith(SDK_NODE_PKG)) {
    fail(
      `@superdoc-dev/sdk resolved to npm instead of the workspace!\n` +
      `  Resolved: ${resolvedPath}\n` +
      `  Expected: under ${SDK_NODE_PKG}/\n` +
      `  Fix: ensure evals/package.json has "workspace:*" and run "pnpm install".`,
    );
  }

  log(`  SDK path: ${resolvedPath}`);
}

/**
 * Verify the tool surface matches expectations.
 *
 * In full mode, imports the SDK and calls chooseTools() — the same path the
 * provider uses at runtime. In light mode, reads the JSON catalog directly
 * (no SDK import required).
 */
async function verifyToolSurface(light) {
  log('Verifying tool surface...');

  const toolNames = light
    ? readToolNamesFromCatalog()
    : await readToolNamesFromSdk();

  const expected = [...EXPECTED_TOOLS].sort();
  const actual = [...toolNames].sort();
  const missing = expected.filter((n) => !actual.includes(n));
  const extra = actual.filter((n) => !expected.includes(n));

  if (missing.length || extra.length) {
    const lines = [];
    if (missing.length) lines.push(`  Missing:    ${missing.join(', ')}`);
    if (extra.length) lines.push(`  Unexpected: ${extra.join(', ')}`);
    fail(
      `Tool surface mismatch!\n` +
      lines.join('\n') + '\n' +
      `  Expected: [${expected.join(', ')}]\n` +
      `  Got:      [${actual.join(', ')}]\n` +
      `  Fix: check packages/sdk/tools/ generation and SDK chooseTools().`,
    );
  }

  log(`  Tools (${actual.length}): ${actual.join(', ')}`);
}

function readToolNamesFromCatalog() {
  const catalog = JSON.parse(readFileSync(OUTPUTS.toolsOpenai, 'utf8'));
  return catalog.tools.map((t) => t.function?.name).filter(Boolean);
}

async function readToolNamesFromSdk() {
  const sdk = await import('@superdoc-dev/sdk');
  const { tools } = await sdk.chooseTools({ provider: 'vercel' });
  return tools.map((t) => t.function?.name).filter(Boolean);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--skip') || process.env.SKIP_PREPARE === '1') {
    log('Skipping preparation (--skip or SKIP_PREPARE=1).');
    return;
  }

  const light = args.includes('--light');

  logHeader(light ? 'Light prepare (Level 1)...' : 'Full prepare (Level 2)...');

  if (light) {
    // Light: use the fast SDK-only path when bootstrap prerequisites exist.
    // On a cold checkout, fall back to the full generation chain once.
    prepareLevel1Artifacts();
    verifyOutputs({ includeSdk: false, includeCli: false });
    await verifyToolSurface(true);
  } else {
    // Full: regenerate everything (doc-api → CLI → SDK), build, then verify.
    regenerateAll();
    buildSdk();
    buildCli();
    verifyOutputs({ includeSdk: true, includeCli: true });
    verifySdkResolvesFromWorkspace();
    await verifyToolSurface(false);
  }

  logHeader('Local SDK ready for eval.\n');
}

main();
