#!/usr/bin/env node

/**
 * Consolidated Python SDK build pipeline.
 *
 * Runs the full 6-step pipeline: prepare tools, build companion wheels,
 * verify companions, build main wheel, verify main wheel, smoke test.
 *
 * Usage:
 *   node build-python-sdk.mjs
 *   node build-python-sdk.mjs --skip-smoke-test
 *
 * Prerequisites (checked at startup, fail-fast):
 *   - packages/sdk/tools/catalog.json exists (tools generated)
 *   - All companion packages have a staged CLI binary
 */

import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, lstatSync, mkdtempSync, readdirSync, rmSync, symlinkSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { PYTHON_CLI_PLATFORM_TARGETS } from './python-embedded-cli-targets.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../../../');

const PYTHON_SDK_DIR = path.join(REPO_ROOT, 'packages/sdk/langs/python');
const TOOLS_SOURCE = path.join(REPO_ROOT, 'packages/sdk/tools');
const TOOLS_DEST = path.join(PYTHON_SDK_DIR, 'superdoc', 'tools');
const CATALOG_PATH = path.join(TOOLS_SOURCE, 'catalog.json');
const PYTHON_PLATFORMS_ROOT = path.join(PYTHON_SDK_DIR, 'platforms');

const skipSmokeTest = process.argv.slice(2).includes('--skip-smoke-test');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function step(number, label) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`  Step ${number}/6: ${label}`);
  console.log(`${'='.repeat(60)}\n`);
}

function run(command, args, { cwd = REPO_ROOT } = {}) {
  execFileSync(command, args, { cwd, stdio: 'inherit', env: process.env });
}

// ---------------------------------------------------------------------------
// Prerequisites
// ---------------------------------------------------------------------------

function checkPrerequisites() {
  if (!existsSync(CATALOG_PATH)) {
    throw new Error(
      `Prerequisite failed: ${path.relative(REPO_ROOT, CATALOG_PATH)} not found.\n` +
      `Run "pnpm run generate:all" first to generate SDK tool artifacts.`
    );
  }

  const missing = PYTHON_CLI_PLATFORM_TARGETS.filter((target) => {
    const binDir = path.join(PYTHON_PLATFORMS_ROOT, target.companionPypiName, target.companionModuleName, 'bin');
    try {
      const entries = readdirSync(binDir);
      return !entries.some((e) => e === target.binaryName);
    } catch {
      return true;
    }
  });

  if (missing.length > 0) {
    throw new Error(
      `Prerequisite failed: staged CLI binary missing for ${missing.length} target(s):\n` +
      missing.map((t) => `  - ${t.id} (${t.companionPypiName})`).join('\n') + '\n' +
      `Run the CLI build + stage steps first:\n` +
      `  pnpm --prefix apps/cli run build:native:all\n` +
      `  pnpm --prefix apps/cli run build:stage\n` +
      `  node packages/sdk/scripts/stage-python-companion-cli.mjs`
    );
  }
}

// ---------------------------------------------------------------------------
// Steps
// ---------------------------------------------------------------------------

function prepareTools() {
  step(1, 'Prepare Python SDK tools');

  rmSync(TOOLS_DEST, { recursive: true, force: true });
  cpSync(TOOLS_SOURCE, TOOLS_DEST, { recursive: true });

  // Remove Python package marker — not needed inside the SDK package
  const initPy = path.join(TOOLS_DEST, '__init__.py');
  rmSync(initPy, { force: true });

  // Verify catalog.json was copied
  if (!existsSync(path.join(TOOLS_DEST, 'catalog.json'))) {
    throw new Error('Failed to copy catalog.json into Python SDK tools directory.');
  }

  console.log('Tools prepared.');
}

function buildCompanionWheels() {
  step(2, 'Build companion Python wheels');
  run('node', [path.join(__dirname, 'build-python-companion-wheels.mjs')]);
}

function verifyCompanionWheels() {
  step(3, 'Verify companion wheels');
  run('node', [path.join(__dirname, 'verify-python-companion-wheels.mjs'), '--companions-only']);
}

function buildMainWheel() {
  step(4, 'Build main Python SDK wheel');

  // Clean previous build artifacts so the verifier doesn't pick up stale wheels
  rmSync(path.join(PYTHON_SDK_DIR, 'dist'), { recursive: true, force: true });
  rmSync(path.join(PYTHON_SDK_DIR, 'build'), { recursive: true, force: true });

  run('python3', ['-m', 'build'], { cwd: PYTHON_SDK_DIR });
}

function verifyMainWheel() {
  step(5, 'Verify main wheel');
  run('node', [path.join(__dirname, 'verify-python-companion-wheels.mjs'), '--root-only']);
}

function smokeTest() {
  if (skipSmokeTest) {
    step(6, 'Smoke test (skipped — --skip-smoke-test)');
    return;
  }

  step(6, 'Smoke test (wheelhouse install + marker resolution)');

  const venvDir = mkdtempSync(path.join(tmpdir(), 'sdk-smoke-'));
  const wheelhouseDir = mkdtempSync(path.join(tmpdir(), 'sdk-wheelhouse-'));

  try {
    // Create venv
    run('python3', ['-m', 'venv', venvDir]);

    // Determine pip/python paths (cross-platform)
    const binDir = process.platform === 'win32' ? 'Scripts' : 'bin';
    const pip = path.join(venvDir, binDir, 'pip');
    const python = path.join(venvDir, binDir, 'python');

    // Copy all wheels to wheelhouse
    const distDir = path.join(PYTHON_SDK_DIR, 'dist');
    const companionDistDir = path.join(PYTHON_SDK_DIR, 'companion-dist');

    for (const dir of [distDir, companionDistDir]) {
      for (const entry of readdirSync(dir)) {
        if (entry.endsWith('.whl')) {
          cpSync(path.join(dir, entry), path.join(wheelhouseDir, entry));
        }
      }
    }

    // Install from wheelhouse (offline)
    run(pip, ['install', 'superdoc-sdk', '--find-links', wheelhouseDir, '--no-index']);

    // Verify import
    run(python, ['-c', 'from superdoc import SuperDocClient; SuperDocClient()']);

    // Verify embedded CLI binary resolution + execution
    run(python, [
      '-c',
      'from superdoc.embedded_cli import resolve_embedded_cli_path; ' +
      'import subprocess; ' +
      'p = resolve_embedded_cli_path(); ' +
      'r = subprocess.run([p, "--help"], capture_output=True, text=True, timeout=10); ' +
      'assert r.returncode == 0, f"CLI exited {r.returncode}: {r.stderr}"; ' +
      'print(f"CLI binary OK: {p}")',
    ]);

    console.log('Smoke test passed.');
  } finally {
    rmSync(venvDir, { recursive: true, force: true });
    rmSync(wheelhouseDir, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  console.log('Python SDK Build Pipeline');
  if (skipSmokeTest) console.log('  --skip-smoke-test: smoke test will be skipped');

  checkPrerequisites();

  // Save symlink state — prepareTools() replaces it with a real copy.
  // Restore on exit so local dev symlinks aren't lost.
  let wasSymlink = false;
  try {
    const stat = lstatSync(TOOLS_DEST);
    wasSymlink = stat.isSymbolicLink();
  } catch { /* doesn't exist — nothing to restore */ }

  try {
    prepareTools();
    buildCompanionWheels();
    verifyCompanionWheels();
    buildMainWheel();
    verifyMainWheel();
    smokeTest();

    console.log('\nPython SDK build pipeline complete.');
  } finally {
    if (wasSymlink) {
      rmSync(TOOLS_DEST, { recursive: true, force: true });
      symlinkSync('../../../tools', TOOLS_DEST);
    }
  }
}

try {
  main();
} catch (error) {
  console.error(`\nPython SDK build pipeline failed: ${error.message}`);
  process.exitCode = 1;
}
