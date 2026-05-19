#!/usr/bin/env node

/**
 * Validates the packed SuperDoc package shape with external npm-package
 * linters. This runs against the tarball produced by `pack:es`, not the source
 * workspace manifest, because the source manifest intentionally keeps the
 * `source` condition for local development while the packed manifest strips it.
 */

import { execFileSync, execSync, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..');
const tarballPath = join(repoRoot, 'packages', 'superdoc', 'superdoc.tgz');
const doPack = process.argv.includes('--pack');
const knownAttwInternalCrash = "Cannot read properties of undefined (reading 'filename')";

function run(command) {
  execSync(command, {
    cwd: repoRoot,
    stdio: 'inherit',
  });
}

function runArgs(command, args) {
  execFileSync(command, args, {
    cwd: repoRoot,
    stdio: 'inherit',
  });
}

function runAttw(args) {
  const result = spawnSync('pnpm', args, {
    cwd: repoRoot,
    encoding: 'utf8',
  });

  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);

  if (result.status === 0) return true;

  if (result.error) {
    throw result.error;
  }

  const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
  if (result.status === 3 && output.includes(knownAttwInternalCrash)) {
    console.warn(`[package-shape] WARN: arethetypeswrong crashed with a known internal error: ${knownAttwInternalCrash}`);
    console.warn('[package-shape] WARN: continuing after packed-manifest checks and publint passed.');
    return false;
  }

  throw new Error(`Command failed: pnpm ${args.join(' ')}`);
}

function readPackedManifest() {
  const manifestJson = execFileSync('tar', ['-xOf', tarballPath, 'package/package.json'], {
    cwd: repoRoot,
    encoding: 'utf8',
  });

  return JSON.parse(manifestJson);
}

function hasSourceCondition(value) {
  if (!value || typeof value !== 'object') return false;
  if (Object.prototype.hasOwnProperty.call(value, 'source')) return true;

  return Object.values(value).some(hasSourceCondition);
}

function getCjsEntrypoints(exportsMap) {
  return Object.entries(exportsMap).flatMap(([entrypoint, value]) => {
    if (value && typeof value === 'object' && Object.prototype.hasOwnProperty.call(value, 'require')) {
      return [entrypoint];
    }

    return [];
  });
}

if (doPack) {
  run('pnpm --filter superdoc run pack:es');
}

if (!existsSync(tarballPath)) {
  console.error(`[package-shape] Missing ${tarballPath}`);
  console.error('[package-shape] Run the consumer matrix first, or pass --pack.');
  process.exit(1);
}

const packedManifest = readPackedManifest();
const cjsEntrypoints = getCjsEntrypoints(packedManifest.exports ?? {});

if (hasSourceCondition(packedManifest.exports)) {
  console.error('[package-shape] Packed manifest still contains exports.source conditions');
  process.exit(1);
}

for (const cdnField of ['unpkg', 'jsdelivr']) {
  if (Object.prototype.hasOwnProperty.call(packedManifest, cdnField)) {
    console.error(`[package-shape] Packed manifest still contains ${cdnField}`);
    process.exit(1);
  }
}

if (cjsEntrypoints.length === 0) {
  console.error('[package-shape] Packed manifest does not advertise any CJS entrypoints');
  process.exit(1);
}

console.log('[package-shape] Running publint against packed tarball');
run(`pnpm dlx publint run ${tarballPath} --strict`);

console.log(`[package-shape] Running arethetypeswrong for CJS entrypoints: ${cjsEntrypoints.join(', ')}`);
const attwPassed = runAttw(['dlx', '@arethetypeswrong/cli', tarballPath, '--entrypoints', ...cjsEntrypoints, '--format', 'table']);

if (attwPassed) {
  console.log('[package-shape] ✓ Packed package shape is valid');
} else {
  console.log('[package-shape] ✓ Packed manifest and publint gates passed; ATTW skipped after known internal crash');
}
