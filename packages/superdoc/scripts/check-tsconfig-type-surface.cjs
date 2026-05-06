#!/usr/bin/env node
/**
 * SD-2864: enforce parity between tsconfig.json's `include` array and
 * `type-surface.config.cjs`. tsconfig.json is the one consumer of the
 * type-surface taxonomy that has no scripting layer (it's plain JSON),
 * so we don't generate it; this check fails the build if the on-disk
 * file drifts from the config in either direction.
 *
 * Expected shape: tsconfig.json's `include` MUST equal exactly the
 * union of `baseTsconfigIncludes` (foundational sources) and
 * `relocations[*].tsconfigIncludes` (per-relocation paths). No more,
 * no less.
 *
 * Drift modes this catches:
 *   - A new relocation added to the config but not mirrored in
 *     tsconfig.json (typecheck for that source tree silently misses it).
 *   - A relocation removed from the config but its tsconfig.json entry
 *     left stale (entry would compile against source the type-surface
 *     no longer claims to manage; undermines single-source-of-truth).
 *   - Foundational base entries dropped from tsconfig.json by mistake.
 *
 * If foundational entries beyond the current three are needed (e.g. a
 * future public package source root), add them to `baseTsconfigIncludes`
 * in type-surface.config.cjs rather than carrying them only in
 * tsconfig.json.
 */

const fs = require('node:fs');
const path = require('node:path');

const tsconfigPath = path.resolve(__dirname, '..', 'tsconfig.json');
const typeSurface = require('./type-surface.config.cjs');

const tsconfig = JSON.parse(fs.readFileSync(tsconfigPath, 'utf8'));
const tsconfigIncludes = new Set(tsconfig.include || []);

const relocationIncludes = typeSurface.relocations.flatMap((r) => r.tsconfigIncludes);
const expected = new Set([...typeSurface.baseTsconfigIncludes, ...relocationIncludes]);

const missing = [...expected].filter((entry) => !tsconfigIncludes.has(entry));
const stale = [...tsconfigIncludes].filter((entry) => !expected.has(entry));

let failed = false;

if (missing.length > 0) {
  failed = true;
  console.error('[check-tsconfig-type-surface] tsconfig.json `include` is missing entries required by type-surface.config.cjs:');
  for (const entry of missing) {
    const owner = typeSurface.relocations.find((r) => r.tsconfigIncludes.includes(entry));
    const reason = owner ? `required by ${owner.pkg}` : 'foundational base include';
    console.error(`  - ${entry}  (${reason})`);
  }
}

if (stale.length > 0) {
  failed = true;
  console.error('[check-tsconfig-type-surface] tsconfig.json `include` has entries not declared in type-surface.config.cjs:');
  for (const entry of stale) {
    console.error(`  - ${entry}  (stale - remove from tsconfig.json or add to baseTsconfigIncludes / a relocation)`);
  }
}

if (failed) {
  console.error('Update packages/superdoc/tsconfig.json or packages/superdoc/scripts/type-surface.config.cjs so the two stay in sync.');
  process.exit(1);
}

console.log(`[check-tsconfig-type-surface] ✓ tsconfig.json mirrors ${expected.size} type-surface include paths exactly`);
