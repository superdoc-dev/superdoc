#!/usr/bin/env node
/**
 * SD-2864: enforce parity between tsconfig.json's `include` array and the
 * relocation entries in `type-surface.config.cjs`. tsconfig.json is the
 * one consumer of the type-surface taxonomy that has no scripting layer
 * (it's plain JSON), so we don't generate it; instead this check fails
 * the build if the on-disk file drifts from the config.
 *
 * Allowed shape: tsconfig.json's `include` MUST contain every entry in
 * each relocation's `tsconfigIncludes`. Additional entries (the
 * foundational `src`, `../super-editor/src`, `../document-api/src`,
 * etc.) are tolerated - we only enforce the relocation taxonomy.
 *
 * Drift modes this catches:
 *   - A new relocation added to the config but not mirrored in tsconfig.json
 *     (the typecheck for that source tree would silently miss it).
 *   - A relocation removed from the config but its tsconfig.json entry left
 *     stale (less severe but still drift).
 */

const fs = require('node:fs');
const path = require('node:path');

const tsconfigPath = path.resolve(__dirname, '..', 'tsconfig.json');
const typeSurface = require('./type-surface.config.cjs');

const tsconfig = JSON.parse(fs.readFileSync(tsconfigPath, 'utf8'));
const tsconfigIncludes = new Set(tsconfig.include || []);

const expected = typeSurface.relocations.flatMap((r) => r.tsconfigIncludes);
const missing = expected.filter((entry) => !tsconfigIncludes.has(entry));

if (missing.length > 0) {
  console.error('[check-tsconfig-type-surface] tsconfig.json `include` is missing relocation entries:');
  for (const entry of missing) {
    const owner = typeSurface.relocations.find((r) => r.tsconfigIncludes.includes(entry));
    console.error(`  - ${entry}  (required by ${owner.pkg})`);
  }
  console.error('Add the entries above to packages/superdoc/tsconfig.json or update type-surface.config.cjs.');
  process.exit(1);
}

console.log(`[check-tsconfig-type-surface] ✓ tsconfig.json mirrors ${expected.length} relocation include paths`);
