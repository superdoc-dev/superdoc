#!/usr/bin/env node
/**
 * Single script with two modes for the SuperDoc public-contract tier
 * metadata defined in `packages/superdoc/scripts/type-surface.config.cjs`
 * (`publicContract`):
 *
 *   - default (no flags): print the tiers as a human-readable report.
 *     Exit 0 regardless of drift. Use this when reading the contract,
 *     comparing tiers, or auditing what is currently published.
 *
 *   - `--check`: run the pure validator over the same data and fail
 *     non-zero on any invariant violation. This is the enforcing gate
 *     that runs as stage 2 of `check:public:superdoc` (after the
 *     validator's own unit tests).
 *
 * Both modes read the same two inputs (`type-surface.config.cjs` and
 * `packages/superdoc/package.json`). The validator is pure and exported
 * so it can be unit-tested without filesystem or process state.
 *
 * Invariants enforced by `--check` (cheap; only reads package.json and
 * the JS config, no build-output traversal):
 *
 *   1. Every `package.json#exports` subpath has a `publicContract`
 *      entry. A new subpath added without a contract entry is a
 *      regression: the report says "internal by definition" and the
 *      consumer-facing tier promise is silently empty.
 *   2. Every `publicContract` subpath actually exists in
 *      `package.json#exports`. Stale entries lie about what's published.
 *   3. No subpath appears in more than one tier. The metadata is a
 *      partition.
 *   4. Each entry's `tier` field matches the bucket it lives in.
 *      A `{ subpath: '.', tier: 'legacy' }` entry placed inside
 *      `publicContract.supported` would otherwise lie about its
 *      classification.
 *   5. Routing rules:
 *      - `supported` subpaths must resolve types under
 *        `dist/superdoc/src/public/` AND NOT under
 *        `dist/superdoc/src/public/legacy/`. Supported APIs route
 *        through the curated public facade.
 *      - `legacy` subpaths must resolve types under
 *        `dist/superdoc/src/public/legacy/`.
 *      - `legacyRaw` subpaths must NOT resolve under
 *        `dist/superdoc/src/public/`. That's the whole point of the
 *        legacy-raw bucket: an un-curated dist path.
 *      - `asset` subpaths have no type field requirement.
 *   6. `legacyRaw` may only contain `./super-editor`. Any other
 *      legacy-raw entry is a regression: the team explicitly accepted
 *      `./super-editor` as the one un-curated bucket pending SD-3256
 *      Phase 3; everything else must route through
 *      `src/public/legacy/**`.
 *
 * Usage:
 *   pnpm report:public:superdoc            # print the report
 *   pnpm exec node scripts/report-public-contract.mjs --check   # gate
 *
 * Tracking: SD-3256 (taxonomy) / SD-673 (enforcement consolidation).
 */

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const PUBLIC_DIR_PREFIX = './dist/superdoc/src/public/';
export const PUBLIC_LEGACY_PREFIX = './dist/superdoc/src/public/legacy/';
export const LEGACY_RAW_ALLOWED = new Set(['./super-editor']);

/**
 * Maps bucket-key to the kebab-case tier value carried on each entry.
 * Kept separate from the JS object-key (`legacyRaw`) because the data
 * uses `legacy-raw` for the entry-level `tier` field.
 */
const BUCKET_TO_TIER = {
  supported: 'supported',
  legacy: 'legacy',
  legacyRaw: 'legacy-raw',
  asset: 'asset',
  deprecated: 'deprecated',
};

/**
 * Pull every types path out of an exports entry. Returns a deduped
 * array of candidate paths so routing rules can be validated against
 * each conditional target (otherwise a divergent `types.require` could
 * route through the wrong directory and the gate would miss it).
 * Accepts the conditional shapes the SuperDoc package uses: a string,
 * or an object with `types: '...'` / `types: { import: '...', require: '...' }`.
 */
export function resolveTypesPaths(entry) {
  if (typeof entry === 'string') return [entry];
  if (entry && typeof entry === 'object') {
    const t = entry.types;
    if (typeof t === 'string') return [t];
    if (t && typeof t === 'object') {
      const out = [];
      if (typeof t.import === 'string') out.push(t.import);
      if (typeof t.require === 'string' && !out.includes(t.require)) out.push(t.require);
      return out;
    }
  }
  return [];
}

/**
 * Validate a publicContract + package.json exports map. Pure: takes
 * the data, returns an array of failure messages. No I/O, no exit.
 * Empty array means everything is in order.
 *
 * @param {{ supported: any[], legacy: any[], legacyRaw: any[], asset: any[], deprecated: any[] }} publicContract
 * @param {Record<string, unknown>} exportsMap
 * @returns {string[]}
 */
export function validatePublicContract(publicContract, exportsMap) {
  const failures = [];
  const fail = (msg) => failures.push(msg);

  const tiers = [
    ['supported', publicContract.supported ?? []],
    ['legacy', publicContract.legacy ?? []],
    ['legacyRaw', publicContract.legacyRaw ?? []],
    ['asset', publicContract.asset ?? []],
    ['deprecated', publicContract.deprecated ?? []],
  ];

  // 3. Subpath partition.
  // 4. Per-entry `tier` field matches its bucket.
  const subpathTier = new Map();
  for (const [bucket, entries] of tiers) {
    const expectedTierValue = BUCKET_TO_TIER[bucket];
    for (const e of entries) {
      if (subpathTier.has(e.subpath)) {
        fail(
          `subpath "${e.subpath}" appears in multiple tiers: ${subpathTier.get(e.subpath)} and ${bucket}`,
        );
      } else {
        subpathTier.set(e.subpath, bucket);
      }
      if (e.tier !== expectedTierValue) {
        fail(
          `entry "${e.subpath}" in publicContract.${bucket} has tier="${e.tier}"; expected "${expectedTierValue}"`,
        );
      }
    }
  }

  const exportSubpaths = new Set(Object.keys(exportsMap));
  const contractSubpaths = new Set(subpathTier.keys());

  // 1. Every exports subpath has a contract entry.
  for (const s of exportSubpaths) {
    if (!contractSubpaths.has(s)) {
      fail(
        `MISSING contract entry: package.json#exports has "${s}" but it is not in publicContract.* - add to a tier with a routing note.`,
      );
    }
  }

  // 2. Every contract entry exists in exports.
  for (const s of contractSubpaths) {
    if (!exportSubpaths.has(s)) {
      fail(
        `STALE contract entry: publicContract has "${s}" but package.json#exports does not list it - remove from publicContract or restore the export.`,
      );
    }
  }

  // 5. Routing rules per tier. Each conditional types target
  //    (types.import AND types.require) is validated independently
  //    so a divergent CJS path can't slip through unchecked.
  for (const e of publicContract.supported ?? []) {
    if (!exportsMap[e.subpath]) continue;
    const paths = resolveTypesPaths(exportsMap[e.subpath]);
    if (paths.length === 0) {
      fail(`supported "${e.subpath}": no types field on the exports entry`);
      continue;
    }
    for (const t of paths) {
      if (!t.startsWith(PUBLIC_DIR_PREFIX)) {
        fail(
          `supported "${e.subpath}": types resolve to "${t}" - expected to route through ${PUBLIC_DIR_PREFIX}**`,
        );
      } else if (t.startsWith(PUBLIC_LEGACY_PREFIX)) {
        fail(
          `supported "${e.subpath}": types resolve to "${t}" under ${PUBLIC_LEGACY_PREFIX}** - supported entries must not route through the legacy facade`,
        );
      }
    }
  }

  for (const e of publicContract.legacy ?? []) {
    if (!exportsMap[e.subpath]) continue;
    const paths = resolveTypesPaths(exportsMap[e.subpath]);
    if (paths.length === 0) {
      fail(`legacy "${e.subpath}": no types field on the exports entry`);
      continue;
    }
    for (const t of paths) {
      if (!t.startsWith(PUBLIC_LEGACY_PREFIX)) {
        fail(
          `legacy "${e.subpath}": types resolve to "${t}" - expected to route through ${PUBLIC_LEGACY_PREFIX}**`,
        );
      }
    }
  }

  for (const e of publicContract.legacyRaw ?? []) {
    // 6. legacyRaw is restricted to the explicitly accepted set.
    if (!LEGACY_RAW_ALLOWED.has(e.subpath)) {
      fail(
        `legacyRaw "${e.subpath}": not on the accepted list ([${[...LEGACY_RAW_ALLOWED].join(', ')}]). New legacy entries must route through src/public/legacy/** instead.`,
      );
    }
    if (!exportsMap[e.subpath]) continue;
    for (const t of resolveTypesPaths(exportsMap[e.subpath])) {
      if (t.startsWith(PUBLIC_DIR_PREFIX)) {
        fail(
          `legacyRaw "${e.subpath}": types resolve to "${t}" under ${PUBLIC_DIR_PREFIX}** - promote to legacy (route through src/public/legacy/**) instead`,
        );
      }
    }
  }

  // `asset` and `deprecated` carry no routing requirement; they exist so
  // the report has full coverage of every exports subpath.

  return failures;
}

const HR = '='.repeat(72);

function printReport(publicContract, exportsMap) {
  const exportSubpaths = new Set(Object.keys(exportsMap));
  const contractSubpaths = new Set(
    [
      ...publicContract.supported,
      ...publicContract.legacy,
      ...publicContract.legacyRaw,
      ...publicContract.asset,
      ...publicContract.deprecated,
    ].map((e) => e.subpath),
  );

  const printTier = (name, entries) => {
    console.log('');
    console.log(`## ${name} (${entries.length})`);
    if (entries.length === 0) {
      console.log('  (none)');
      return;
    }
    for (const e of entries) {
      console.log(`  ${e.subpath.padEnd(28)}  ${e.note || ''}`);
    }
  };

  console.log(HR);
  console.log('SuperDoc public type contract');
  console.log(HR);
  console.log('');
  console.log('Tier definitions live in:');
  console.log('  packages/superdoc/scripts/type-surface.config.cjs (publicContract)');
  console.log('');
  console.log(`Total exports in package.json: ${exportSubpaths.size}`);
  console.log(`Total entries in publicContract: ${contractSubpaths.size}`);

  printTier('Supported', publicContract.supported);
  printTier('Legacy (curated through src/public/legacy/**)', publicContract.legacy);
  printTier('Legacy-raw (NOT yet curated; SD-3256 Phase 3 target)', publicContract.legacyRaw);
  printTier('Asset (non-type)', publicContract.asset);
  printTier('Deprecated', publicContract.deprecated);

  const failures = validatePublicContract(publicContract, exportsMap);
  console.log('');
  console.log(HR);
  console.log('Validator status (read-only here; run with --check to gate)');
  console.log(HR);
  if (failures.length === 0) {
    console.log('OK: all tier invariants satisfied.');
  } else {
    console.log(`${failures.length} drift item(s) detected:`);
    for (const f of failures) console.log(`  - ${f}`);
    console.log('');
    console.log('Run `node scripts/report-public-contract.mjs --check` to fail on these.');
  }
  console.log('');
}

function runCheck(publicContract, exportsMap) {
  const failures = validatePublicContract(publicContract, exportsMap);
  if (failures.length === 0) {
    const exportCount = Object.keys(exportsMap).length;
    const contractCount = ['supported', 'legacy', 'legacyRaw', 'asset', 'deprecated'].reduce(
      (n, k) => n + (publicContract[k]?.length ?? 0),
      0,
    );
    console.log(HR);
    console.log('public-contract tier discipline: PASS');
    console.log(HR);
    console.log(`${exportCount} exports / ${contractCount} contract entries.`);
    process.exit(0);
  }

  console.error(HR);
  console.error('public-contract tier discipline: FAIL');
  console.error(HR);
  for (const f of failures) console.error(`  - ${f}`);
  console.error('');
  console.error(
    'Tier definitions: packages/superdoc/scripts/type-surface.config.cjs (publicContract).',
  );
  console.error('Read-only inspection: `pnpm report:public:superdoc` (without --check).');
  process.exit(1);
}

// CLI entry: only runs when invoked as a script (not when imported).
if (import.meta.url === `file://${process.argv[1]}`) {
  const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const require = createRequire(import.meta.url);

  const config = require(resolve(REPO_ROOT, 'packages/superdoc/scripts/type-surface.config.cjs'));
  const pkg = JSON.parse(readFileSync(resolve(REPO_ROOT, 'packages/superdoc/package.json'), 'utf8'));

  const { publicContract } = config;
  if (!publicContract) {
    console.error('FAIL: publicContract not exported from type-surface.config.cjs');
    process.exit(1);
  }

  const exportsMap = pkg.exports || {};
  const args = new Set(process.argv.slice(2));

  if (args.has('--check')) {
    runCheck(publicContract, exportsMap);
  } else {
    printReport(publicContract, exportsMap);
  }
}
