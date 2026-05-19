#!/usr/bin/env node
/**
 * SD-3212 (Phase 4b PR A0): no-growth gate + evidence inventory for the
 * `superdoc` ROOT entry.
 *
 * The root entry currently resolves through four package.json#exports fields,
 * which can diverge:
 *   - types.import → dist/superdoc/src/index.d.ts
 *   - types.require → dist/superdoc/src/index.d.cts
 *   - import → dist/superdoc.es.js
 *   - require → dist/superdoc.cjs
 *
 * This snapshot locks the exported-name set of each of the four sources
 * against drift. Cross-source mismatches are surfaced as evidence rows in
 * the companion report but are NOT a drift blocker on their own; the four
 * name sets each have their own committed baseline.
 *
 * The companion `.md` report adds evidence columns (consumer fixtures,
 * JSDoc typedefs, docs/examples mentions, package-boundaries.md) so the
 * downstream classification pass (PR A1) has the data in one place.
 *
 * Modes:
 *   node snapshot-superdoc-root-exports.mjs --write
 *   node snapshot-superdoc-root-exports.mjs --check
 *
 * Requires the fixture to be packed-and-installed first. CI runs this
 * after `typecheck-matrix.mjs`, which already packs and installs.
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join, relative } from 'node:path';
import { createRequire } from 'node:module';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '../..');
const SNAPSHOT_DIR = resolve(HERE, 'snapshots');
const FIXTURE_SUPERDOC = resolve(HERE, 'node_modules', 'superdoc');
const SNAPSHOT_JSON = join(SNAPSHOT_DIR, 'superdoc-root-exports.json');
const SNAPSHOT_MD = join(SNAPSHOT_DIR, 'superdoc-root-exports.md');

const args = process.argv.slice(2);
const mode = args.includes('--write') ? 'write' : args.includes('--check') ? 'check' : null;
if (!mode) {
  console.error('Usage: snapshot-superdoc-root-exports.mjs --write | --check');
  process.exit(2);
}

if (!existsSync(FIXTURE_SUPERDOC)) {
  console.error('[SD-3212] superdoc is not installed in the fixture.');
  console.error('Run `node tests/consumer-typecheck/typecheck-matrix.mjs` first (packs and installs).');
  process.exit(1);
}

// Use the typescript installed in the fixture so the version matches.
const req = createRequire(join(FIXTURE_SUPERDOC, 'package.json'));
let ts;
try { ts = req('typescript'); } catch {
  ts = createRequire(join(HERE, 'package.json'))('typescript');
}

const superdocPkg = JSON.parse(readFileSync(join(FIXTURE_SUPERDOC, 'package.json'), 'utf8'));
const rootExport = superdocPkg.exports?.['.'];
if (!rootExport || typeof rootExport !== 'object') {
  console.error('[SD-3212] No root export found in installed superdoc package.json#exports');
  process.exit(1);
}

// -----------------------------------------------------------------------
// Resolve the four source paths from package.json#exports['.']
// -----------------------------------------------------------------------
function resolveRootSources(rootExport) {
  const out = { 'types.import': null, 'types.require': null, import: null, require: null };
  if (rootExport.types && typeof rootExport.types === 'object') {
    out['types.import'] = rootExport.types.import ?? rootExport.types.default ?? null;
    out['types.require'] = rootExport.types.require ?? null;
  } else if (typeof rootExport.types === 'string') {
    out['types.import'] = rootExport.types;
  }
  out.import = rootExport.import ?? null;
  out.require = rootExport.require ?? null;
  return out;
}

// -----------------------------------------------------------------------
// Extract named exports
// -----------------------------------------------------------------------
function enumerateDtsExports(entryFile) {
  const program = ts.createProgram({
    rootNames: [entryFile],
    options: {
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ESNext,
      noEmit: true,
      skipLibCheck: true,
      allowJs: false,
      declaration: false,
    },
  });
  const checker = program.getTypeChecker();
  const source = program.getSourceFile(entryFile);
  if (!source) throw new Error('Cannot load: ' + entryFile);
  const symbol = checker.getSymbolAtLocation(source) ?? source.symbol;
  if (!symbol) return [];
  return [...new Set(checker.getExportsOfModule(symbol).map((e) => e.getName()))].sort();
}

// Vite/Rollup ESM bundle output has a clean `export { a, b as c, ... };`
// block. Parse all such blocks and collect the EXPORTED (right-hand) names.
function enumerateEsmBundleExports(entryFile) {
  const src = readFileSync(entryFile, 'utf8');
  const names = new Set();
  // Match `export { ... };` blocks. The block can span multiple lines.
  // Inside, each spec is `local` or `local as exported`.
  const blockRe = /export\s*\{([\s\S]*?)\}\s*;?/g;
  let m;
  while ((m = blockRe.exec(src))) {
    const body = m[1];
    for (const rawSpec of body.split(',')) {
      const spec = rawSpec.trim().replace(/\s+/g, ' ').replace(/^type\s+/, '');
      if (!spec) continue;
      const asMatch = spec.match(/^\S+\s+as\s+(\S+)$/);
      const name = asMatch ? asMatch[1] : spec;
      if (/^[$A-Z_a-z][$\w]*$/.test(name)) names.add(name);
    }
  }
  // Also `export default ...` shows up as `default` export.
  if (/^[ \t]*export\s+default\s+/m.test(src)) names.add('default');
  return [...names].sort();
}

// CJS bundle output looks like one of:
//   module.exports = { Foo, Bar: ... };
//   Object.defineProperty(exports, "Foo", { ... });
//   exports.Foo = ...;
// Parse all three styles.
function enumerateCjsBundleExports(entryFile) {
  const src = readFileSync(entryFile, 'utf8');
  const names = new Set();
  // module.exports = { ... } — capture the keys (top-level only)
  const moduleExportsRe = /module\.exports\s*=\s*\{([\s\S]*?)\}\s*;/g;
  let m;
  while ((m = moduleExportsRe.exec(src))) {
    const body = m[1];
    // Match top-level keys: `name` or `name:` or `"name":`
    const keyRe = /(?:^|,)\s*(?:get\s+)?["']?([$A-Z_a-z][$\w]*)["']?\s*(?::|[,}\n])/g;
    let km;
    while ((km = keyRe.exec(body))) {
      names.add(km[1]);
    }
  }
  // Object.defineProperty(exports, "Foo", ...) or (module.exports, "Foo", ...)
  const defPropRe = /Object\.defineProperty\((?:module\.)?exports\s*,\s*["']([$A-Z_a-z][$\w]*)["']/g;
  while ((m = defPropRe.exec(src))) names.add(m[1]);
  // exports.Foo = ... (top-level assignment)
  const expAssignRe = /(?:^|;|\n)\s*exports\.([$A-Z_a-z][$\w]*)\s*=/g;
  while ((m = expAssignRe.exec(src))) names.add(m[1]);
  return [...names].sort();
}

// -----------------------------------------------------------------------
// Collect evidence cross-references
// -----------------------------------------------------------------------
function walkFiles(dir, exts, out = [], skip = new Set(['node_modules', 'dist', '.git', '.tmp', 'tmp'])) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (skip.has(entry.name)) continue;
    const p = join(dir, entry.name);
    if (entry.isDirectory()) walkFiles(p, exts, out, skip);
    else if (exts.some((ext) => entry.name.endsWith(ext))) out.push(p);
  }
  return out;
}

function countFixtureImports(allNames) {
  const fixtureDir = resolve(HERE, 'src');
  const files = walkFiles(fixtureDir, ['.ts', '.tsx', '.cts', '.mts']);
  const counts = new Map(allNames.map((n) => [n, 0]));
  const importBlockRe = /import\s+(?:type\s+)?\{([^}]+)\}\s*from\s+['"]superdoc['"]/g;
  for (const file of files) {
    const src = readFileSync(file, 'utf8');
    let m;
    while ((m = importBlockRe.exec(src))) {
      const block = m[1].replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
      for (const rawSpec of block.split(',')) {
        const spec = rawSpec.trim().replace(/^type\s+/, '');
        const name = spec.split(/\s+as\s+/)[0].trim();
        if (counts.has(name)) counts.set(name, counts.get(name) + 1);
      }
    }
  }
  return counts;
}

function readJsdocTypedefs() {
  const indexJs = resolve(REPO_ROOT, 'packages/superdoc/src/index.js');
  if (!existsSync(indexJs)) return new Set();
  const src = readFileSync(indexJs, 'utf8');
  const set = new Set();
  const re = /@typedef\s+\{[^}]+\}\s+([$A-Z_a-z][$\w]*)/g;
  let m;
  while ((m = re.exec(src))) set.add(m[1]);
  return set;
}

function countMentionsIn(rootDir, allNames, exts) {
  const counts = new Map(allNames.map((n) => [n, 0]));
  if (!existsSync(rootDir)) return counts;
  const files = walkFiles(rootDir, exts);
  // Build one big regex with all names to do a single pass per file.
  // For ergonomic file size we chunk into batches of 200.
  for (let i = 0; i < allNames.length; i += 200) {
    const batch = allNames.slice(i, i + 200).filter((n) => /^[$A-Z_a-z][$\w]*$/.test(n));
    if (!batch.length) continue;
    const re = new RegExp('\\b(' + batch.join('|') + ')\\b', 'g');
    for (const f of files) {
      const src = readFileSync(f, 'utf8');
      let m;
      while ((m = re.exec(src))) counts.set(m[1], counts.get(m[1]) + 1);
    }
  }
  return counts;
}

function inPackageBoundaries(allNames) {
  const file = resolve(REPO_ROOT, 'docs/architecture/package-boundaries.md');
  if (!existsSync(file)) return new Set();
  const src = readFileSync(file, 'utf8');
  const set = new Set();
  for (const n of allNames) {
    if (new RegExp('\\b' + n + '\\b').test(src)) set.add(n);
  }
  return set;
}

// -----------------------------------------------------------------------
// Build the report
// -----------------------------------------------------------------------
const sources = resolveRootSources(rootExport);
const enumerated = {};
for (const [key, relPath] of Object.entries(sources)) {
  if (!relPath) {
    enumerated[key] = { path: null, names: [], error: 'not declared in package.json#exports' };
    continue;
  }
  const abs = resolve(FIXTURE_SUPERDOC, relPath);
  if (!existsSync(abs)) {
    enumerated[key] = { path: relPath, names: [], error: 'file missing' };
    continue;
  }
  try {
    if (key === 'types.import' || key === 'types.require') {
      enumerated[key] = { path: relPath, names: enumerateDtsExports(abs), error: null };
    } else if (key === 'import') {
      enumerated[key] = { path: relPath, names: enumerateEsmBundleExports(abs), error: null };
    } else if (key === 'require') {
      enumerated[key] = { path: relPath, names: enumerateCjsBundleExports(abs), error: null };
    }
  } catch (err) {
    enumerated[key] = { path: relPath, names: [], error: err.message };
  }
}

const allNames = [...new Set([
  ...enumerated['types.import'].names,
  ...enumerated['types.require'].names,
  ...enumerated['import'].names,
  ...enumerated['require'].names,
])].sort();

const inDts = new Set(enumerated['types.import'].names);
const inDcts = new Set(enumerated['types.require'].names);
const inEsm = new Set(enumerated['import'].names);
const inCjs = new Set(enumerated['require'].names);

const fixtureCounts = countFixtureImports(allNames);
const jsdocSet = readJsdocTypedefs();
const docCounts = countMentionsIn(resolve(REPO_ROOT, 'apps/docs'), allNames, ['.md', '.mdx', '.ts', '.tsx']);
const exampleCounts = countMentionsIn(resolve(REPO_ROOT, 'examples'), allNames, ['.js', '.ts', '.tsx', '.vue', '.md']);
const demoCounts = countMentionsIn(resolve(REPO_ROOT, 'demos'), allNames, ['.js', '.ts', '.tsx', '.vue', '.md']);
const inBoundaries = inPackageBoundaries(allNames);

const snapshot = {
  generatedAt: new Date().toISOString(),
  ticket: 'SD-3212 PR A0',
  package: 'superdoc',
  rootExport,
  sources: {
    'types.import': enumerated['types.import'],
    'types.require': enumerated['types.require'],
    import: enumerated['import'],
    require: enumerated['require'],
  },
  counts: {
    'types.import': enumerated['types.import'].names.length,
    'types.require': enumerated['types.require'].names.length,
    import: enumerated['import'].names.length,
    require: enumerated['require'].names.length,
    union: allNames.length,
  },
  divergences: {
    typesImportVsRequire: {
      onlyInImport: enumerated['types.import'].names.filter((n) => !inDcts.has(n)),
      onlyInRequire: enumerated['types.require'].names.filter((n) => !inDts.has(n)),
    },
    esmVsCjs: {
      onlyInEsm: enumerated['import'].names.filter((n) => !inCjs.has(n)),
      onlyInCjs: enumerated['require'].names.filter((n) => !inEsm.has(n)),
    },
    typesVsRuntime: {
      typedOnly: allNames.filter((n) => (inDts.has(n) || inDcts.has(n)) && !inEsm.has(n) && !inCjs.has(n)),
      runtimeOnly: allNames.filter((n) => !inDts.has(n) && !inDcts.has(n) && (inEsm.has(n) || inCjs.has(n))),
    },
  },
};

// -----------------------------------------------------------------------
// Drift gate
// -----------------------------------------------------------------------
function compareLocked(actualSnapshot) {
  if (!existsSync(SNAPSHOT_JSON)) {
    return { ok: false, reason: `Snapshot does not exist at ${relative(REPO_ROOT, SNAPSHOT_JSON)}. Run --write.` };
  }
  const committed = JSON.parse(readFileSync(SNAPSHOT_JSON, 'utf8'));
  const violations = [];
  for (const key of ['types.import', 'types.require', 'import', 'require']) {
    const a = (actualSnapshot.sources[key]?.names || []).join(',');
    const c = (committed.sources?.[key]?.names || []).join(',');
    if (a !== c) {
      const aSet = new Set(actualSnapshot.sources[key]?.names || []);
      const cSet = new Set(committed.sources?.[key]?.names || []);
      const added = [...aSet].filter((n) => !cSet.has(n)).sort();
      const removed = [...cSet].filter((n) => !aSet.has(n)).sort();
      violations.push({ source: key, added, removed });
    }
  }
  return { ok: violations.length === 0, violations };
}

// -----------------------------------------------------------------------
// Markdown report (regenerated on --write; not a drift gate)
// -----------------------------------------------------------------------
function tick(v) { return v ? '✓' : ' '; }
function renderMarkdown() {
  const lines = [];
  lines.push('# superdoc root export inventory (SD-3212 PR A0)');
  lines.push('');
  lines.push(`Generated: ${snapshot.generatedAt}`);
  lines.push(`Source: packed and installed \`tests/consumer-typecheck/node_modules/superdoc\``);
  lines.push('');
  lines.push('## Counts');
  lines.push('');
  lines.push('| Source | Path | Count |');
  lines.push('|---|---|---|');
  for (const key of ['types.import', 'types.require', 'import', 'require']) {
    const s = snapshot.sources[key];
    lines.push(`| ${key} | \`${s.path || '(missing)'}\` | ${s.names.length} |`);
  }
  lines.push(`| **union** |  | **${snapshot.counts.union}** |`);
  lines.push('');
  lines.push('## Divergences');
  lines.push('');
  const d = snapshot.divergences;
  lines.push(`- types.import only (not in types.require): ${d.typesImportVsRequire.onlyInImport.length}`);
  lines.push(`- types.require only (not in types.import): ${d.typesImportVsRequire.onlyInRequire.length}`);
  lines.push(`- ESM only (not in CJS): ${d.esmVsCjs.onlyInEsm.length}`);
  lines.push(`- CJS only (not in ESM): ${d.esmVsCjs.onlyInCjs.length}`);
  lines.push(`- typed but no runtime export (phantom risk): ${d.typesVsRuntime.typedOnly.length}`);
  lines.push(`- runtime export but not typed (silent shadow on root): ${d.typesVsRuntime.runtimeOnly.length}`);
  lines.push('');
  if (d.typesVsRuntime.runtimeOnly.length > 0) {
    lines.push('### Runtime-only names (no type)');
    lines.push('');
    for (const n of d.typesVsRuntime.runtimeOnly) lines.push(`- \`${n}\``);
    lines.push('');
  }
  if (d.typesVsRuntime.typedOnly.length > 0) {
    lines.push('### Type-only names (no runtime)');
    lines.push('');
    for (const n of d.typesVsRuntime.typedOnly) lines.push(`- \`${n}\``);
    lines.push('');
  }
  lines.push('## Evidence table');
  lines.push('');
  lines.push('| Name | dts | dcts | esm | cjs | fixtures | jsdoc | docs | examples | demos | boundaries |');
  lines.push('|---|---|---|---|---|---|---|---|---|---|---|');
  for (const n of allNames) {
    lines.push(
      `| \`${n}\` | ${tick(inDts.has(n))} | ${tick(inDcts.has(n))} | ${tick(inEsm.has(n))} | ${tick(inCjs.has(n))} | ` +
      `${fixtureCounts.get(n) || 0} | ${tick(jsdocSet.has(n))} | ${docCounts.get(n) || 0} | ${exampleCounts.get(n) || 0} | ` +
      `${demoCounts.get(n) || 0} | ${tick(inBoundaries.has(n))} |`,
    );
  }
  return lines.join('\n') + '\n';
}

// -----------------------------------------------------------------------
// Main
// -----------------------------------------------------------------------
if (mode === 'write') {
  writeFileSync(SNAPSHOT_JSON, JSON.stringify(snapshot, null, 2) + '\n');
  writeFileSync(SNAPSHOT_MD, renderMarkdown());
  console.log(`[SD-3212] Wrote ${relative(REPO_ROOT, SNAPSHOT_JSON)}`);
  console.log(`[SD-3212] Wrote ${relative(REPO_ROOT, SNAPSHOT_MD)}`);
  console.log('Counts:');
  for (const key of ['types.import', 'types.require', 'import', 'require']) {
    console.log(`  ${key}: ${snapshot.sources[key].names.length}`);
  }
  console.log(`  union: ${snapshot.counts.union}`);
  process.exit(0);
} else {
  const result = compareLocked(snapshot);
  if (result.reason) {
    console.error(`[SD-3212] ${result.reason}`);
    process.exit(1);
  }
  if (!result.ok) {
    console.error('[SD-3212] Root export drift detected:');
    for (const v of result.violations) {
      console.error(`  source: ${v.source}`);
      if (v.added.length) console.error(`    + added: ${v.added.join(', ')}`);
      if (v.removed.length) console.error(`    - removed: ${v.removed.join(', ')}`);
    }
    console.error('');
    console.error('If this change is intentional, run --write and commit the updated snapshot.');
    process.exit(1);
  }
  console.log('[SD-3212] Root exports match the committed snapshot.');
  process.exit(0);
}
