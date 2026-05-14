#!/usr/bin/env node
/**
 * SD-2953: enforce that every `package.json` `exports` entry carries
 * type information consumers can resolve. Pre-SD-2953 the `./converter`,
 * `./docx-zipper`, and `./file-zipper` subpaths were exported at runtime
 * but had no `types` field, leaving strict TypeScript consumers with
 * TS7016. This audit prevents that regression class from reappearing.
 *
 * For each `exports` entry, one of these must hold:
 *   1. The entry has a `types` field whose target file exists.
 *   2. The entry resolves to an asset file (currently `.css` only).
 *   3. The entry is on `RUNTIME_ONLY_ALLOWLIST` with a documented reason.
 *
 * Anything else fails the build.
 */

const fs = require('node:fs');
const path = require('node:path');

const packageRoot = path.resolve(__dirname, '..');
const packageJson = require(path.join(packageRoot, 'package.json'));

// Subpaths that are deliberately runtime-only with no type contract.
// Each entry must have a documented reason. Empty today; SD-2953 added
// types for the three previously-tolerated runtime-only legacy paths.
const RUNTIME_ONLY_ALLOWLIST = {};

const ASSET_EXTENSIONS = new Set(['.css']);

function entryAllowlistedAsset(value) {
  if (typeof value === 'string') return ASSET_EXTENSIONS.has(path.extname(value));
  return false;
}

function entryHasTypes(value) {
  return collectTypesTargets(value).length > 0;
}

function collectTypesTargets(value) {
  if (typeof value !== 'object' || value === null) return [];
  if (typeof value.types === 'string') return [value.types];
  if (typeof value.types !== 'object' || value.types === null) return [];
  return Object.values(value.types).filter((target) => typeof target === 'string');
}

const violations = [];
for (const [subpath, value] of Object.entries(packageJson.exports || {})) {
  if (subpath === '.') continue; // top-level types are checked via the package.json `types` field
  if (entryAllowlistedAsset(value)) continue;
  if (RUNTIME_ONLY_ALLOWLIST[subpath]) continue;

  if (!entryHasTypes(value)) {
    violations.push({ subpath, reason: 'missing `types` field in conditional exports' });
    continue;
  }
  for (const target of collectTypesTargets(value)) {
    if (!fs.existsSync(path.resolve(packageRoot, target))) {
      violations.push({ subpath, reason: `\`types\` target does not exist: ${target}` });
    }
  }
}

if (violations.length > 0) {
  console.error('[check-export-coverage] package.json exports without resolvable types:');
  for (const { subpath, reason } of violations) {
    console.error(`  - ${subpath}: ${reason}`);
  }
  console.error('Add a `types` field, classify as an asset, or add to RUNTIME_ONLY_ALLOWLIST with a reason.');
  process.exit(1);
}

const totalChecked = Object.keys(packageJson.exports || {}).length;
console.log(`[check-export-coverage] ✓ ${totalChecked} exports entries all carry resolvable types or asset/legacy classification`);
