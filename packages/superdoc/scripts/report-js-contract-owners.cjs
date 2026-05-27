#!/usr/bin/env node
/**
 * Report which `.js` files own emitted public `.d.ts` files across the
 * `superdoc` and `@superdoc/super-editor` packages (SD-673, audit-only).
 *
 * Walks every typed `exports` entry in each package, follows
 * relative-import / self-package edges through the emitted declaration
 * forest, and identifies the source owner of each reachable `.d.ts` via
 * its companion `.d.ts.map` sourcemap. JS-owned public declarations are
 * cross-referenced with the `check-jsdoc.cjs` state (CHECKED_FILES,
 * `// @ts-check`, allowlist, debt snapshot) to surface owners that are
 * UNACCOUNTED — public surface backed by JS source with no `@ts-check`
 * directive and no entry in any of the existing tracking lists.
 *
 * **Report-only findings.** The UNACCOUNTED count never fails the
 * script — the inventory is survey input for follow-up types-only
 * extraction work. A future PR can promote a strict sub-check that
 * fails on net-new UNACCOUNTED entries.
 *
 * **Structural failures DO fail (exit 1).** A missing dist tree or
 * unreadable package.json prevents the audit from producing a
 * meaningful inventory; in that case the script exits non-zero so a
 * broken input pipeline is distinguishable from a clean "zero
 * unaccounted" run. Requires `pnpm build` to have run first.
 * `pnpm run type-check` is NOT a substitute: it writes superdoc
 * declarations to `dist-types/` (per
 * `packages/superdoc/tsconfig.types.json`), while this audit walks
 * `packages/superdoc/dist/` (the consumer-visible tree).
 *
 * Sources of truth this script consumes:
 *   - `packages/superdoc/package.json` and
 *     `packages/super-editor/package.json` for typed exports
 *   - `packages/superdoc/scripts/jsdoc-debt-snapshot.json`
 *   - `packages/superdoc/scripts/jsdoc-allowlist.cjs`
 *   - `packages/superdoc/scripts/jsdoc-checked-files.cjs` — the same
 *     shared module `check-jsdoc.cjs` reads. Zero duplication; the
 *     two consumers cannot drift.
 *
 * Note on scope: the existing `check-jsdoc.cjs` ratchet walks from
 * `superdoc`'s entry points and reaches into super-editor JS via
 * implementation imports — its `128 / 102` numbers already include
 * super-editor JS owners. This script additionally walks super-editor's
 * OWN public exports independently, so super-editor JS files reached
 * only via super-editor's own publishings (not via superdoc's walk)
 * show up here even when they don't show up in the superdoc-side
 * ratchet.
 */

const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..', '..', '..');
const superdocRoot = path.resolve(repoRoot, 'packages/superdoc');
const superEditorRoot = path.resolve(repoRoot, 'packages/super-editor');

// ─── check-jsdoc state ───────────────────────────────────────────────

const DEBT_SNAPSHOT_PATH = path.join(superdocRoot, 'scripts/jsdoc-debt-snapshot.json');
const ALLOWLIST_PATH = path.join(superdocRoot, 'scripts/jsdoc-allowlist.cjs');

// Shared with `check-jsdoc.cjs`. Edits to the curated set go in the
// shared module so both consumers stay in sync; this script does not
// own the list.
const { CHECKED_FILES } = require('./jsdoc-checked-files.cjs');

function loadDebtSnapshot() {
  if (!fs.existsSync(DEBT_SNAPSHOT_PATH)) return new Set();
  try {
    const json = JSON.parse(fs.readFileSync(DEBT_SNAPSHOT_PATH, 'utf8'));
    // check-jsdoc.cjs writes the debt list under `knownUngated`. Older
    // fallback keys are accepted in case the snapshot format moves.
    return new Set(json.knownUngated ?? json.knownDebt ?? json.files ?? []);
  } catch {
    return new Set();
  }
}

function loadAllowlist() {
  if (!fs.existsSync(ALLOWLIST_PATH)) return new Set();
  try {
    delete require.cache[require.resolve(ALLOWLIST_PATH)];
    const mod = require(ALLOWLIST_PATH);
    if (typeof mod !== 'object' || mod === null) return new Set();
    return new Set(Object.keys(mod));
  } catch {
    return new Set();
  }
}

const TS_CHECK_DIRECTIVE_RE = /^\s*\/\/\s*@ts-check\b/m;
function hasTsCheckDirective(absPath) {
  if (!absPath.endsWith('.js')) return false;
  try {
    // 4 KiB head is enough for a leading license/doc block before the
    // directive; matches check-jsdoc.cjs's window.
    const fd = fs.openSync(absPath, 'r');
    const buf = Buffer.alloc(4096);
    const n = fs.readSync(fd, buf, 0, 4096, 0);
    fs.closeSync(fd);
    return TS_CHECK_DIRECTIVE_RE.test(buf.toString('utf8', 0, n));
  } catch {
    return false;
  }
}

// ─── per-package reachability walker ─────────────────────────────────

/**
 * For one package: walk `package.json.exports` typed entries, follow
 * relative + self-package specifiers transitively through the dist
 * declaration forest, and return every reachable `.d.ts` file (absolute
 * paths).
 *
 * The walker mirrors `report-declaration-reachability.cjs` — keeping it
 * inlined here avoids forcing both scripts to depend on a shared helper
 * for a first audit pass. If we promote either to a strict gate, the
 * walker is the right thing to extract into `scripts/lib/`.
 */
function walkPackage(packageRoot) {
  const packageJson = JSON.parse(fs.readFileSync(path.join(packageRoot, 'package.json'), 'utf8'));
  const packageName = packageJson.name;
  const exportsMap = packageJson.exports || {};
  const distRoot = path.join(packageRoot, 'dist');
  if (!fs.existsSync(distRoot)) {
    return { error: `dist/ missing for ${packageName}; build it first` };
  }

  function collectTypesTargets(value) {
    if (typeof value !== 'object' || value === null) return [];
    if (typeof value.types === 'string') return [value.types];
    if (typeof value.types !== 'object' || value.types === null) return [];
    return Object.values(value.types).filter((t) => typeof t === 'string');
  }

  // Self-package resolver: `./super-editor` → dist .d.ts target.
  const selfPackageTypeMap = new Map();
  for (const [subpath, value] of Object.entries(exportsMap)) {
    const [target] = collectTypesTargets(value);
    if (!target) continue;
    selfPackageTypeMap.set(subpath, path.resolve(packageRoot, target));
  }

  const typedExports = [];
  const missingTargets = [];
  for (const [subpath, value] of Object.entries(exportsMap)) {
    for (const targetPath of collectTypesTargets(value)) {
      const target = path.resolve(packageRoot, targetPath);
      if (!fs.existsSync(target)) {
        missingTargets.push(targetPath);
        continue;
      }
      typedExports.push({ subpath, target });
    }
  }

  if (typedExports.length === 0) {
    // Distinguish "no typed exports declared" from "typed exports declared
    // but dist not built" so a missing-dist run gives an actionable hint.
    if (missingTargets.length > 0) {
      return {
        error: `dist incomplete for ${packageName}: ${missingTargets.length} typed export target(s) missing on disk; run \`pnpm build\` first`,
      };
    }
    return { error: `no typed exports in ${packageName}` };
  }

  function resolveRelative(spec, fromFile) {
    const base = path.resolve(path.dirname(fromFile), spec);
    if ((base.endsWith('.d.ts') || base.endsWith('.d.cts')) && fs.existsSync(base)) return base;
    for (const dropExt of ['.js', '.ts']) {
      if (base.endsWith(dropExt)) {
        for (const ext of ['.d.ts', '.d.cts']) {
          const cand = base.slice(0, -dropExt.length) + ext;
          if (fs.existsSync(cand)) return cand;
        }
      }
    }
    const indexCand = path.join(base, 'index.d.ts');
    if (fs.existsSync(indexCand)) return indexCand;
    const dtsCand = `${base}.d.ts`;
    if (fs.existsSync(dtsCand)) return dtsCand;
    return null;
  }

  function resolveSelfPackage(spec) {
    if (!spec.startsWith(packageName)) return null;
    const remainder = spec.slice(packageName.length);
    const subpath = remainder === '' ? '.' : `.${remainder}`;
    return selfPackageTypeMap.get(subpath) || null;
  }

  function resolveSpecifier(spec, fromFile) {
    if (spec.startsWith('.')) return resolveRelative(spec, fromFile);
    if (spec.startsWith(packageName)) return resolveSelfPackage(spec);
    return null;
  }

  const SPECIFIER_RE = /(?:from\s+|import\(\s*)['"]([^'"]+)['"]/g;
  const visited = new Set();
  const queue = typedExports.map((e) => e.target);
  for (const start of queue) visited.add(start);

  while (queue.length > 0) {
    const file = queue.shift();
    let content;
    try {
      content = fs.readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    for (const match of content.matchAll(SPECIFIER_RE)) {
      const resolved = resolveSpecifier(match[1], file);
      if (!resolved || visited.has(resolved)) continue;
      visited.add(resolved);
      queue.push(resolved);
    }
  }

  return {
    packageName,
    distRoot,
    typedExports,
    reachable: [...visited].filter((f) => f.endsWith('.d.ts') || f.endsWith('.d.cts')),
  };
}

// ─── d.ts → source owner via sourcemap ───────────────────────────────

/**
 * Resolve a reachable `.d.ts` to its source path (repo-relative) by
 * reading the companion `.d.ts.map` sourcemap. Returns `null` when no
 * sourcemap exists or it doesn't resolve to an in-repo source (e.g.
 * declarations re-exported from a third-party type package).
 */
function resolveSourceOwner(dtsAbs) {
  const mapPath = `${dtsAbs}.map`;
  if (!fs.existsSync(mapPath)) return { source: null, reason: 'no-sourcemap' };
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(mapPath, 'utf8'));
  } catch (err) {
    return { source: null, reason: `unreadable-sourcemap: ${err.message}` };
  }
  const sources = Array.isArray(parsed.sources) ? parsed.sources : [];
  if (sources.length === 0) return { source: null, reason: 'empty-sources' };
  // sources[0] is relative to sourceRoot (often empty); resolve from the map's directory.
  const sourceRoot = typeof parsed.sourceRoot === 'string' ? parsed.sourceRoot : '';
  const sourceAbs = path.resolve(path.dirname(mapPath), sourceRoot, sources[0]);
  // Guard against sources outside the repo (e.g. .pnpm-installed types
  // re-emitted; we only care about in-repo owners).
  const rel = path.relative(repoRoot, sourceAbs);
  if (rel.startsWith('..')) return { source: null, reason: 'out-of-repo' };
  return { source: rel.split(path.sep).join('/'), reason: null };
}

// ─── classification ──────────────────────────────────────────────────

function classify(source, checkedSet, allowlistSet, debtSet) {
  if (!source.endsWith('.js')) return 'ts-owned';
  if (checkedSet.has(source)) return 'checked-files';
  if (allowlistSet.has(source)) return 'allowlisted';
  if (debtSet.has(source)) return 'tracked-debt';
  const abs = path.join(repoRoot, source);
  if (hasTsCheckDirective(abs)) return 'has-ts-check';
  return 'unaccounted';
}

// ─── main ────────────────────────────────────────────────────────────

const checkedSet = new Set(CHECKED_FILES);
const allowlistSet = loadAllowlist();
const debtSet = loadDebtSnapshot();

const HR = '='.repeat(72);
console.log('[report-js-contract-owners] JS contract-owner audit (SD-673, report-only)');
console.log(HR);

// Structural-failure tracking: missing dist or unreadable package
// inputs exit non-zero so an audit run that produced no real inventory
// is distinguishable from one that genuinely found zero unaccounted
// owners. "Report-only" applies to findings (UNACCOUNTED count never
// fails); it does not apply to a broken input pipeline.
let structuralFailure = false;

const sections = [];
for (const [label, root] of [
  ['superdoc', superdocRoot],
  ['@superdoc/super-editor', superEditorRoot],
]) {
  const result = walkPackage(root);
  if (result.error) {
    console.log(`SKIP  ${label}: ${result.error}`);
    sections.push({ label, error: result.error });
    structuralFailure = true;
    continue;
  }

  // Aggregate per-source classifications. A single source can back many
  // .d.ts files; deduplicate so the report counts owners, not emit
  // duplicates.
  const ownerToCategory = new Map();
  const noOwner = [];
  for (const dts of result.reachable) {
    const { source, reason } = resolveSourceOwner(dts);
    if (!source) {
      noOwner.push({ dts: path.relative(result.distRoot, dts), reason });
      continue;
    }
    const category = classify(source, checkedSet, allowlistSet, debtSet);
    // Once a source is classified, don't downgrade if another .d.ts
    // resolves to the same source; the category is a property of the
    // source itself.
    if (!ownerToCategory.has(source)) ownerToCategory.set(source, category);
  }

  const byCategory = new Map();
  for (const [, cat] of ownerToCategory) {
    byCategory.set(cat, (byCategory.get(cat) || 0) + 1);
  }

  sections.push({
    label,
    typedExports: result.typedExports.length,
    reachableDts: result.reachable.length,
    distinctOwners: ownerToCategory.size,
    byCategory,
    noOwner,
    ownerToCategory,
  });
}

for (const s of sections) {
  console.log('');
  console.log(`### ${s.label}`);
  console.log('-'.repeat(72));
  if (s.error) {
    console.log(`(skipped: ${s.error})`);
    continue;
  }
  console.log(`Typed exports walked:        ${s.typedExports}`);
  console.log(`Reachable .d.ts files:       ${s.reachableDts}`);
  console.log(`Distinct source owners:      ${s.distinctOwners}`);
  console.log('');

  const order = ['ts-owned', 'checked-files', 'has-ts-check', 'allowlisted', 'tracked-debt', 'unaccounted'];
  console.log('Source owners by classification:');
  for (const cat of order) {
    const n = s.byCategory.get(cat) || 0;
    console.log(`  ${cat.padEnd(20)} ${String(n).padStart(5)}`);
  }

  const unaccounted = [...s.ownerToCategory.entries()]
    .filter(([, cat]) => cat === 'unaccounted')
    .map(([file]) => file)
    .sort();
  if (unaccounted.length > 0) {
    console.log('');
    console.log(`Unaccounted .js owners (${unaccounted.length}) — public-surface JS source with no`);
    console.log(`@ts-check directive and no entry in CHECKED_FILES, allowlist, or debt snapshot:`);
    for (const f of unaccounted.slice(0, 30)) console.log(`  - ${f}`);
    if (unaccounted.length > 30) console.log(`  ... and ${unaccounted.length - 30} more.`);
  }

  if (s.noOwner.length > 0) {
    console.log('');
    console.log(`No-owner .d.ts (${s.noOwner.length}) — reachable declarations whose source could not`);
    console.log(`be resolved (missing sourcemap, empty sources, or out-of-repo):`);
    const byReason = new Map();
    for (const { reason } of s.noOwner) byReason.set(reason, (byReason.get(reason) || 0) + 1);
    for (const [reason, count] of [...byReason.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`  ${reason}: ${count}`);
    }
  }
}

console.log('');
console.log(HR);
console.log(
  'Report-only. The UNACCOUNTED count never fails. Use the inventory to\n' +
    'choose targets for types-only extraction or `@ts-check` adoption.\n' +
    'Once UNACCOUNTED stabilizes at zero per package, a follow-up PR can\n' +
    'promote this to a strict no-growth ratchet.',
);

if (structuralFailure) {
  console.log('');
  console.log('FAIL  one or more packages skipped (missing dist or unreadable input).');
  console.log('      Run `pnpm build` and retry. (`pnpm run type-check` is not a');
  console.log('      substitute: superdoc declarations go to dist-types/, not dist/.)');
  console.log('      The audit cannot produce a meaningful inventory with partial inputs.');
  process.exit(1);
}
process.exit(0);
