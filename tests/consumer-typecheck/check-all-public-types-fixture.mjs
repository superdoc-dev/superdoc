#!/usr/bin/env node
/**
 * SD-3213a replacement gate for the retired SD-2860 source-sync check.
 *
 * After the SD-3212 PR C root facade flip, the canonical root contract
 * lives in `packages/superdoc/src/public/index.ts`, locked by
 * `tests/consumer-typecheck/snapshots/superdoc-root-exports.json` and
 * classified at
 * `tests/consumer-typecheck/snapshots/superdoc-root-classification.json`.
 *
 * The SD-2842 matrix scenarios exercise `tests/consumer-typecheck/src/
 * all-public-types.ts` to catch type-only exports collapsing to `any`.
 * Without a forcing function, a future PR can add a new type-only root
 * export (update src/public/index.ts + classification + root snapshot)
 * and pass all other gates while never adding an AssertNotAny<NewType>
 * assertion. The any-collapse coverage silently shrinks relative to the
 * actual public type surface.
 *
 * This script closes that gap by deriving the expected assertion set
 * from the classification artifact instead of the retired legacy typedef
 * block in `packages/superdoc/src/index.js`:
 *
 *   - Expected = classification rows where `inDts` is true and both
 *     runtime presence flags (`inEsm`, `inCjs`) are false. That is the
 *     set of type-only root exports — irrespective of bucket. Type-only
 *     `legacy-root` and `internal-candidate` symbols stay covered because
 *     they are still reachable from the published root and consumers
 *     can still import them (until a future major removes them).
 *   - Actual = `const _real_X: AssertNotAny<X> = ...` assertions found
 *     in `src/all-public-types.ts`.
 *   - Fail on missing OR extra; the failure message names each diff
 *     symbol and points contributors at the fix.
 *
 * Modes:
 *   node check-all-public-types-fixture.mjs            (== --check)
 *   node check-all-public-types-fixture.mjs --check
 */
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const CLASSIFICATION = resolve(HERE, 'snapshots/superdoc-root-classification.json');
const FIXTURE = resolve(HERE, 'src/all-public-types.ts');

if (!existsSync(CLASSIFICATION)) {
  console.error('[SD-3213a] Classification file not found:', CLASSIFICATION);
  process.exit(2);
}
if (!existsSync(FIXTURE)) {
  console.error('[SD-3213a] Fixture file not found:', FIXTURE);
  process.exit(2);
}

const classification = JSON.parse(readFileSync(CLASSIFICATION, 'utf8'));
const expected = new Set(
  classification.rows
    .filter((r) => r.inDts === true && r.inEsm === false && r.inCjs === false)
    .map((r) => r.name),
);

const fixture = readFileSync(FIXTURE, 'utf8');
const actual = new Set();
for (const m of fixture.matchAll(/^const _real_([A-Za-z][A-Za-z0-9_]*)\s*:/gm)) {
  actual.add(m[1]);
}

const missing = [...expected].filter((n) => !actual.has(n)).sort();
const extra = [...actual].filter((n) => !expected.has(n)).sort();

console.log(`[SD-3213a] Expected type-only root exports: ${expected.size}`);
console.log(`[SD-3213a] Actual AssertNotAny assertions:  ${actual.size}`);

if (missing.length === 0 && extra.length === 0) {
  console.log('[SD-3213a] OK — all-public-types.ts covers every type-only root export.');
  process.exit(0);
}

if (missing.length) {
  console.error('');
  console.error(`[SD-3213a] FAIL — ${missing.length} type-only root export(s) are missing AssertNotAny<T> coverage:`);
  for (const n of missing) console.error(`  - ${n}`);
  console.error('');
  console.error('Add a corresponding entry to tests/consumer-typecheck/src/all-public-types.ts:');
  console.error("  - import { <Name> } from 'superdoc';   (or import type { ... } with the others)");
  console.error('  - const _real_<Name>: AssertNotAny<<Name>> = true;');
}

if (extra.length) {
  console.error('');
  console.error(`[SD-3213a] FAIL — ${extra.length} assertion(s) in all-public-types.ts have no corresponding type-only root export in the classification:`);
  for (const n of extra) console.error(`  - ${n}`);
  console.error('');
  console.error('Either the symbol was renamed/removed at root (update or remove the assertion),');
  console.error('or it is a runtime value rather than a type-only export (move to the appropriate runtime assertion).');
}

process.exit(1);
