#!/usr/bin/env node

import { execFile } from 'node:child_process';
import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { PYTHON_CLI_PLATFORM_TARGETS } from './python-embedded-cli-targets.mjs';

const execFileAsync = promisify(execFile);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../../../');
const PYTHON_DIST_DIR = path.join(REPO_ROOT, 'packages/sdk/langs/python/dist');
const COMPANION_DIST_DIR = path.join(REPO_ROOT, 'packages/sdk/langs/python/companion-dist');

const MAX_ROOT_WHEEL_SIZE_BYTES = 5 * 1e6;       // 5 MB
const MAX_COMPANION_WHEEL_SIZE_BYTES = 90 * 1e6;  // 90 MB

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function listWheelEntries(wheelPath) {
  const python = 'import json, sys, zipfile; print(json.dumps(zipfile.ZipFile(sys.argv[1]).namelist()))';
  const { stdout } = await execFileAsync('python3', ['-c', python, wheelPath], {
    cwd: REPO_ROOT,
    env: process.env,
  });
  return JSON.parse(stdout);
}

async function readWheelMetadata(wheelPath) {
  const python = [
    'import sys, zipfile',
    'z = zipfile.ZipFile(sys.argv[1])',
    'meta = [n for n in z.namelist() if n.endswith(".dist-info/METADATA")]',
    'print(z.read(meta[0]).decode() if meta else "")',
  ].join('; ');
  const { stdout } = await execFileAsync('python3', ['-c', python, wheelPath], {
    cwd: REPO_ROOT,
    env: process.env,
  });
  return stdout;
}

async function findWheels(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  return entries
    .filter((e) => e.isFile() && e.name.endsWith('.whl'))
    .map((e) => path.join(dir, e.name))
    .sort();
}

function resolveRootVerifyOptions(optionsOrTargets) {
  if (Array.isArray(optionsOrTargets)) {
    return {
      targets: optionsOrTargets,
      wheelPath: null,
      distDir: PYTHON_DIST_DIR,
    };
  }

  if (!optionsOrTargets) {
    return {
      targets: PYTHON_CLI_PLATFORM_TARGETS,
      wheelPath: null,
      distDir: PYTHON_DIST_DIR,
    };
  }

  if (typeof optionsOrTargets !== 'object') {
    throw new TypeError('verifyRootWheel expects a targets array or an options object');
  }

  const { targets = PYTHON_CLI_PLATFORM_TARGETS, wheelPath = null, distDir = PYTHON_DIST_DIR } = optionsOrTargets;
  return { targets, wheelPath, distDir };
}

// ---------------------------------------------------------------------------
// Root wheel verification
// ---------------------------------------------------------------------------

export async function verifyRootWheel(optionsOrTargets) {
  const { targets, wheelPath, distDir } = resolveRootVerifyOptions(optionsOrTargets);
  let resolvedWheelPath = wheelPath ? path.resolve(wheelPath) : null;

  if (!resolvedWheelPath) {
    const wheels = await findWheels(distDir);
    if (wheels.length === 0) {
      throw new Error(`No wheel found in ${distDir}`);
    }
    resolvedWheelPath = wheels[wheels.length - 1];
  }

  const errors = [];

  // Size check
  const wheelStat = await stat(resolvedWheelPath);
  if (wheelStat.size > MAX_ROOT_WHEEL_SIZE_BYTES) {
    errors.push(`Root wheel is ${(wheelStat.size / 1e6).toFixed(1)} MB (max ${MAX_ROOT_WHEEL_SIZE_BYTES / 1e6} MB)`);
  }

  // No binary entries
  const entries = await listWheelEntries(resolvedWheelPath);
  const binaryPatterns = ['_vendor/cli/', '/bin/superdoc'];
  for (const entry of entries) {
    if (binaryPatterns.some((p) => entry.includes(p))) {
      errors.push(`Root wheel contains binary entry: ${entry}`);
    }
  }

  // Marker dependencies in METADATA — verify package name, exact version pin, and marker expression
  const metadata = await readWheelMetadata(resolvedWheelPath);
  for (const target of targets) {
    if (!metadata.includes(target.companionPypiName)) {
      errors.push(`Root wheel METADATA missing dependency on ${target.companionPypiName}`);
      continue;
    }

    // Find the Requires-Dist line for this companion
    const depLine = metadata.split('\n').find((line) => line.includes(target.companionPypiName));
    if (!depLine) {
      errors.push(`Root wheel METADATA missing Requires-Dist line for ${target.companionPypiName}`);
      continue;
    }

    // Verify exact version pin (==X.Y.Z or ==X.Y.ZaN etc.)
    const pinMatch = depLine.match(new RegExp(`${target.companionPypiName.replace(/-/g, '[-_]')}\\s*==\\s*([^;\\s]+)`));
    if (!pinMatch) {
      errors.push(`${target.id}: missing ==<version> pin in: ${depLine.trim()}`);
    }

    // Verify marker expression contains the expected platform_system and platform_machine conditions
    if (!depLine.includes('platform_system')) {
      errors.push(`${target.id}: missing platform_system marker in: ${depLine.trim()}`);
    }
    if (!depLine.includes('platform_machine')) {
      errors.push(`${target.id}: missing platform_machine marker in: ${depLine.trim()}`);
    }
  }

  if (errors.length > 0) {
    throw new Error(`Root wheel verification failed:\n  - ${errors.join('\n  - ')}`);
  }

  console.log(`Root wheel OK: ${path.basename(resolvedWheelPath)} (${(wheelStat.size / 1e6).toFixed(1)} MB)`);
  return resolvedWheelPath;
}

// ---------------------------------------------------------------------------
// Companion wheel verification
// ---------------------------------------------------------------------------

export async function verifyCompanionWheels(targets = PYTHON_CLI_PLATFORM_TARGETS) {
  const wheels = await findWheels(COMPANION_DIST_DIR);
  if (wheels.length === 0) {
    throw new Error(`No companion wheels found in ${COMPANION_DIST_DIR}`);
  }

  const errors = [];

  for (const target of targets) {
    const wheel = wheels.find((w) => path.basename(w).startsWith(target.companionModuleName));
    if (!wheel) {
      // Try matching by PyPI name (with hyphens normalized to underscores in wheel filenames)
      const normalizedName = target.companionPypiName.replace(/-/g, '_');
      const altWheel = wheels.find((w) => path.basename(w).startsWith(normalizedName));
      if (!altWheel) {
        errors.push(`Missing companion wheel for ${target.companionPypiName}`);
        continue;
      }
      await verifySingleCompanion(altWheel, target, errors);
    } else {
      await verifySingleCompanion(wheel, target, errors);
    }
  }

  if (errors.length > 0) {
    throw new Error(`Companion wheel verification failed:\n  - ${errors.join('\n  - ')}`);
  }

  console.log(`All ${targets.length} companion wheels verified.`);
}

async function verifySingleCompanion(wheelPath, target, errors) {
  // Size check
  const wheelStat = await stat(wheelPath);
  if (wheelStat.size > MAX_COMPANION_WHEEL_SIZE_BYTES) {
    errors.push(`${target.id}: wheel is ${(wheelStat.size / 1e6).toFixed(1)} MB (max ${MAX_COMPANION_WHEEL_SIZE_BYTES / 1e6} MB)`);
  }

  // Exactly one binary in bin/
  const entries = await listWheelEntries(wheelPath);
  const expectedBinary = `${target.companionModuleName}/bin/${target.binaryName}`;
  const binEntries = entries.filter((e) => e.startsWith(`${target.companionModuleName}/bin/`) && !e.endsWith('/'));
  if (!binEntries.includes(expectedBinary)) {
    errors.push(`${target.id}: missing binary entry ${expectedBinary}`);
  }
  if (binEntries.length !== 1) {
    errors.push(`${target.id}: expected exactly 1 binary in bin/, found ${binEntries.length}: ${binEntries.join(', ')}`);
  }

  console.log(`  ${target.id} OK: ${path.basename(wheelPath)} (${(wheelStat.size / 1e6).toFixed(1)} MB)`);
}

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------

async function main() {
  const argv = process.argv.slice(2);
  const companionsOnly = argv.includes('--companions-only');
  const rootOnly = argv.includes('--root-only');

  if (!companionsOnly) {
    await verifyRootWheel();
  }
  if (!rootOnly) {
    await verifyCompanionWheels();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
