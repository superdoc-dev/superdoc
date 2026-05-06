/**
 * Deep type audit (Phase 2 of the public-types initiative).
 *
 * Walks every type reachable from `superdoc`'s public exports in the
 * INSTALLED tarball under this fixture's node_modules. Records every
 * `any` it finds at any depth (members, params, returns, type args).
 *
 * Compares findings against a committed allowlist. Fails CI if:
 *   - a new finding appears that isn't in the allowlist,
 *   - an entry in the allowlist no longer appears (stale → must be removed),
 *   - any unresolved import or compiler diagnostic surfaces,
 *   - any `@superdoc/*` private specifier survived rewriting.
 *
 * Owned vs upstream:
 *   - Owned: the `any` is declared inside `node_modules/superdoc/...`.
 *   - Upstream: declared elsewhere (prosemirror-*, yjs, etc.) — recorded
 *     for visibility but does not block CI on its own.
 *
 * Run:
 *   node deep-type-audit.mjs                # check against allowlist (CI mode)
 *   node deep-type-audit.mjs --pack         # pack+install before checking
 *   node deep-type-audit.mjs --write        # regenerate allowlist from current findings
 *   node deep-type-audit.mjs --report-only  # print findings, never fail
 *
 * The fixture is intentionally outside the pnpm workspace so this audits
 * the customer-visible surface, not workspace symlinks. Install pattern
 * mirrors typecheck-matrix.mjs.
 */

import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, relative, sep, join } from 'node:path';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..');
const require = createRequire(import.meta.url);

const args = new Set(process.argv.slice(2));
const doPack = args.has('--pack');
const doWrite = args.has('--write');
const reportOnly = args.has('--report-only');

// -- Resolve typescript from the fixture's node_modules --------------------
// The fixture pins typescript via package-lock.json; the audit must use
// the same version the matrix uses so behavior matches.
const tsRequire = createRequire(resolve(here, 'package.json'));
const ts = tsRequire('typescript');

// -- Optional pack + install -----------------------------------------------
if (doPack) {
  console.log('[audit] Packing superdoc...');
  execSync('pnpm --filter superdoc run pack:es', { cwd: repoRoot, stdio: 'inherit' });
  console.log('[audit] Installing fixture...');
  execSync(
    'npm install ../../packages/superdoc/superdoc.tgz --no-save --prefer-offline --no-audit --no-fund --silent',
    { cwd: here, stdio: 'inherit' },
  );
}

// -- Resolve the installed superdoc package --------------------------------
const installedRoot = resolve(here, 'node_modules', 'superdoc');
const installedPkgPath = join(installedRoot, 'package.json');
if (!existsSync(installedPkgPath)) {
  console.error(`[audit] superdoc not installed at ${installedRoot}`);
  console.error(`[audit] Run with --pack, or run typecheck-matrix.mjs first.`);
  process.exit(2);
}
const installedPkg = JSON.parse(readFileSync(installedPkgPath, 'utf8'));

// -- Collect public entry points -------------------------------------------
const roots = [];
for (const [subpath, entry] of Object.entries(installedPkg.exports ?? {})) {
  if (typeof entry !== 'object' || !entry.types) continue;
  const abs = resolve(installedRoot, entry.types);
  if (!existsSync(abs)) {
    console.error(`[audit] Missing types entry for ${subpath}: ${abs}`);
    process.exit(3);
  }
  roots.push({ subpath, file: abs });
}

console.log(`[audit] ${roots.length} public entries with types fields:`);
for (const r of roots) console.log(`        ${r.subpath}`);

// -- Build TypeScript program ----------------------------------------------
const compilerOptions = {
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  strict: true,
  noImplicitAny: true,
  skipLibCheck: false,
  declaration: false,
  noEmit: true,
  allowJs: false,
  esModuleInterop: true,
  resolveJsonModule: true,
  jsx: ts.JsxEmit.Preserve,
};

const host = ts.createCompilerHost(compilerOptions, true);
const program = ts.createProgram({
  rootNames: roots.map((r) => r.file),
  options: compilerOptions,
  host,
});
const checker = program.getTypeChecker();

// -- Compiler diagnostics gate ---------------------------------------------
const diagnostics = [
  ...program.getGlobalDiagnostics(),
  ...program.getOptionsDiagnostics(),
  ...program.getSyntacticDiagnostics(),
  ...program.getSemanticDiagnostics(),
];
if (diagnostics.length > 0) {
  console.error(`[audit] FAIL: ${diagnostics.length} compiler diagnostic(s) on the public surface:`);
  for (const d of diagnostics.slice(0, 30)) {
    const file = d.file ? relative(repoRoot, d.file.fileName) : '<no-file>';
    const pos = d.file && d.start != null
      ? d.file.getLineAndCharacterOfPosition(d.start)
      : { line: -1, character: -1 };
    const msg = ts.flattenDiagnosticMessageText(d.messageText, '\n');
    console.error(`  ${file}:${pos.line + 1}  ${msg}`);
  }
  process.exit(1);
}

// -- Private workspace specifier gate --------------------------------------
// TypeScript diagnostics are not enough here: in the monorepo/CI workspace,
// private packages may be resolvable from the repo root even though they
// would be missing for a real npm consumer. Scan the installed package
// declarations directly so a leaked `@superdoc/*` import cannot pass locally.
const privateSpecifiers = [];
for (const sf of program.getSourceFiles()) {
  if (!sf.fileName.startsWith(installedRoot + sep)) continue;
  const text = sf.getFullText();
  for (const match of text.matchAll(/['"](@superdoc\/[^'"]+)['"]/g)) {
    const pos = sf.getLineAndCharacterOfPosition(match.index ?? 0);
    privateSpecifiers.push({
      specifier: match[1],
      file: locFor(sf).file,
      line: pos.line + 1,
    });
  }
}
if (privateSpecifiers.length > 0) {
  console.error(`[audit] FAIL: ${privateSpecifiers.length} private @superdoc/* specifier(s) in installed declarations:`);
  for (const leak of privateSpecifiers.slice(0, 30)) {
    console.error(`  ${leak.file}:${leak.line}  ${leak.specifier}`);
  }
  if (privateSpecifiers.length > 30) {
    console.error(`  ... and ${privateSpecifiers.length - 30} more`);
  }
  process.exit(1);
}

// -- Walker ----------------------------------------------------------------
const findings = [];
let visited;
let currentSubpath;
const MAX_DEPTH = 8;

function isAnyType(t) {
  if (!t || !(t.flags & ts.TypeFlags.Any)) return false;
  return t.intrinsicName === 'any';
}
function inOwnedDist(decl) {
  if (!decl) return false;
  return decl.getSourceFile().fileName.startsWith(installedRoot + sep);
}
function locFor(decl) {
  if (!decl) return { file: '<unknown>', line: 0 };
  const sf = decl.getSourceFile();
  const lc = sf.getLineAndCharacterOfPosition(decl.getStart());
  // Make file paths stable: rooted at fixture node_modules so they don't
  // change when the repo path changes.
  const fileName = sf.fileName;
  const rel = fileName.startsWith(here + sep)
    ? relative(here, fileName).split(sep).join('/')
    : fileName;
  return { file: rel, line: lc.line + 1 };
}
function snippetFor(decl) {
  if (!decl) return '';
  return decl.getText().split('\n')[0].slice(0, 200).trim();
}
function record(kind, symbolPath, decl) {
  // Only record findings whose declaration is inside SuperDoc's own
  // installed package. Upstream (vue, prosemirror, yjs, pinia internals)
  // contains thousands of `any` we do not own and cannot fix; recording
  // them here would make the allowlist unmaintainable and the gate
  // useless. The audit's job is to lock in *owned* surface quality.
  // If we ever need an upstream view, add a `--include-upstream` flag.
  if (!inOwnedDist(decl)) return;
  // Skip TypeScript's #private representation (legitimately inaccessible).
  if (symbolPath.includes('#private') || symbolPath.endsWith('.#private')) return;
  const { file, line } = locFor(decl);
  const snippet = snippetFor(decl);
  findings.push({
    subpath: currentSubpath,
    symbolPath,
    kind,
    file,
    line,
    snippet,
    owner: 'owned',
  });
}
function walkType(type, symbolPath, depth, originDecl) {
  if (depth > MAX_DEPTH) return;
  if (!type) return;
  const id = type.id;
  if (id != null) {
    if (visited.has(id)) return;
    visited.add(id);
  }
  if (isAnyType(type)) {
    record('type', symbolPath, originDecl);
    return;
  }
  if (type.flags & ts.TypeFlags.UnionOrIntersection) {
    for (const t of type.types) walkType(t, symbolPath, depth + 1, originDecl);
    return;
  }
  if (checker.isArrayType && checker.isArrayType(type)) {
    const args = checker.getTypeArguments(type);
    for (const t of args) walkType(t, symbolPath + '[]', depth + 1, originDecl);
    return;
  }
  const typeArgs = type.aliasTypeArguments || (type.typeArguments ?? []);
  for (let i = 0; i < typeArgs.length; i++) {
    walkType(typeArgs[i], symbolPath + `<${i}>`, depth + 1, originDecl);
  }
  const callSigs = type.getCallSignatures ? type.getCallSignatures() : [];
  for (const sig of callSigs) {
    for (const param of sig.getParameters()) {
      const decl = param.valueDeclaration ?? param.declarations?.[0];
      const pType = decl
        ? checker.getTypeOfSymbolAtLocation(param, decl)
        : checker.getDeclaredTypeOfSymbol(param);
      const sub = `${symbolPath}(${param.getName()})`;
      if (isAnyType(pType)) record('param', sub, decl ?? originDecl);
      else walkType(pType, sub, depth + 1, decl ?? originDecl);
    }
    const ret = sig.getReturnType();
    const retPath = `${symbolPath}=>return`;
    if (isAnyType(ret)) record('return', retPath, sig.getDeclaration?.() ?? originDecl);
    else walkType(ret, retPath, depth + 1, sig.getDeclaration?.() ?? originDecl);
  }
  const props = type.getProperties ? type.getProperties() : [];
  for (const prop of props) {
    const decl = prop.valueDeclaration ?? prop.declarations?.[0];
    if (!decl) continue;
    // Skip private/protected class members (not consumer-reachable).
    const mods = ts.getCombinedModifierFlags(decl);
    if (mods & (ts.ModifierFlags.Private | ts.ModifierFlags.Protected)) continue;
    const pType = checker.getTypeOfSymbolAtLocation(prop, decl);
    const sub = `${symbolPath}.${prop.getName()}`;
    if (isAnyType(pType)) record('property', sub, decl);
    else walkType(pType, sub, depth + 1, decl);
  }
}
function walkExport(symbol, exportName, originDecl) {
  const decl = symbol.valueDeclaration ?? symbol.declarations?.[0] ?? originDecl;
  let type;
  try {
    type = checker.getDeclaredTypeOfSymbol(symbol);
    if (!type || ((type.flags & ts.TypeFlags.Any) && type.intrinsicName !== 'any')) {
      type = checker.getTypeOfSymbolAtLocation(symbol, decl);
    }
  } catch {
    type = checker.getTypeOfSymbolAtLocation(symbol, decl);
  }
  if (isAnyType(type)) {
    record('export', exportName, decl);
    return;
  }
  walkType(type, exportName, 0, decl);
}

// -- Run -------------------------------------------------------------------
for (const root of roots) {
  currentSubpath = root.subpath;
  visited = new Set();
  const sf = program.getSourceFile(root.file);
  if (!sf) {
    console.warn(`[audit] ⚠ Could not load source file: ${root.file}`);
    continue;
  }
  const moduleSymbol = checker.getSymbolAtLocation(sf);
  if (!moduleSymbol) continue;
  const exports = checker.getExportsOfModule(moduleSymbol);
  for (const exp of exports) walkExport(exp, exp.getName(), exp.declarations?.[0]);
}

// -- Allowlist comparison --------------------------------------------------
//
// Stable key: kind|file|symbolPath|snippet. Excludes line number (so
// reformatting doesn't churn the allowlist) and excludes subpath (so the
// same source `any` reached from multiple entry points dedupes to one
// entry).
function keyOf(f) {
  return [f.kind, f.file, f.symbolPath, f.snippet].join('|');
}
const distinctFindings = new Map();
for (const f of findings) {
  const k = keyOf(f);
  if (!distinctFindings.has(k)) distinctFindings.set(k, f);
}

const allowlistPath = resolve(here, 'deep-type-audit.allowlist.json');
const allowlist = existsSync(allowlistPath)
  ? JSON.parse(readFileSync(allowlistPath, 'utf8'))
  : { version: 1, generatedAt: null, entries: [] };
const allowlistByKey = new Map(allowlist.entries.map((e) => [e.key, e]));

const newFindings = [];
const remainingAllowlist = new Set(allowlistByKey.keys());
for (const [key, f] of distinctFindings) {
  if (allowlistByKey.has(key)) {
    remainingAllowlist.delete(key);
  } else {
    newFindings.push({ key, ...f });
  }
}
const staleAllowlistKeys = [...remainingAllowlist];

// -- Owner classification helper (used when seeding the allowlist) ---------
function classifyOwner(f) {
  if (f.owner === 'upstream') return 'upstream';
  if (f.file.includes('/stores/')) return 'tier-1-pinia';
  if (f.file.includes('super-toolbar')) return 'tier-2-toolbar';
  if (f.file.includes('trackChangesHelpers') || f.file.includes('fieldAnnotationHelpers')) return 'tier-3-helpers';
  if (f.file.endsWith('core/types/index.d.ts')) return 'tier-4-public-contract';
  return 'tier-5-other';
}

// -- Write mode -----------------------------------------------------------
if (doWrite) {
  const sorted = [...distinctFindings.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const next = {
    version: 1,
    generatedAt: new Date().toISOString(),
    entries: sorted.map(([key, f]) => {
      const existing = allowlistByKey.get(key);
      return {
        key,
        kind: f.kind,
        symbolPath: f.symbolPath,
        file: f.file,
        line: f.line, // informational only — not part of key
        snippet: f.snippet,
        owner: existing?.owner ?? classifyOwner(f),
        rationale: existing?.rationale ?? `auto-seeded from inventory`,
      };
    }),
  };
  writeFileSync(allowlistPath, JSON.stringify(next, null, 2) + '\n');
  console.log(`[audit] Wrote allowlist with ${next.entries.length} entries to ${relative(repoRoot, allowlistPath)}`);
  process.exit(0);
}

// -- Report ----------------------------------------------------------------
console.log(``);
console.log(`[audit] Findings: ${distinctFindings.size} distinct (owned, after dedup)`);
console.log(`[audit] Allowlist: ${allowlist.entries.length} entries`);
console.log(`[audit] New (not in allowlist): ${newFindings.length}`);
console.log(`[audit] Stale (in allowlist, no longer present): ${staleAllowlistKeys.length}`);

if (newFindings.length > 0) {
  console.log(``);
  console.log(`[audit] NEW FINDINGS:`);
  for (const f of newFindings.slice(0, 50)) {
    console.log(`  + [${f.owner}] ${f.kind}  ${f.symbolPath}`);
    console.log(`        ${f.file}:${f.line}`);
    console.log(`        ${f.snippet}`);
  }
  if (newFindings.length > 50) console.log(`  ... and ${newFindings.length - 50} more`);
}
if (staleAllowlistKeys.length > 0) {
  console.log(``);
  console.log(`[audit] STALE ALLOWLIST ENTRIES (fix landed; remove from allowlist):`);
  for (const k of staleAllowlistKeys.slice(0, 50)) {
    const e = allowlistByKey.get(k);
    console.log(`  - [${e.owner}] ${e.kind}  ${e.symbolPath}  (${e.file}:${e.line})`);
  }
  if (staleAllowlistKeys.length > 50) console.log(`  ... and ${staleAllowlistKeys.length - 50} more`);
}

if (reportOnly) {
  console.log('\n[audit] --report-only set; not failing.');
  process.exit(0);
}

if (newFindings.length > 0 || staleAllowlistKeys.length > 0) {
  console.log(``);
  console.log(`[audit] FAIL`);
  console.log(`[audit] - To accept new findings (after intentional addition), run: node deep-type-audit.mjs --write`);
  console.log(`[audit] - To remove stale entries (after fix), run: node deep-type-audit.mjs --write`);
  process.exit(1);
}
console.log('[audit] PASS');
