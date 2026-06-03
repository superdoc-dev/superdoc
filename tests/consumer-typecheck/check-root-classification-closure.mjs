#!/usr/bin/env node
/**
 * SD-3212 A1b — root classification closure gate.
 *
 * Reads tests/consumer-typecheck/snapshots/superdoc-root-classification.json
 * and asserts: no `supported-root` or `legacy-root` exported root symbol
 * references an `internal-candidate` root symbol in its public declared
 * type. This catches the failure class where a public/legacy export
 * depends on a supposedly-internal type — exactly the inconsistency that
 * produced the 31-failure dry-run in Phase 4a and that the dependency-
 * closure rule in A1 is meant to prevent.
 *
 * Scope (intentionally narrow for v1, per SD-3212 plan):
 *   - Loads the emitted root .d.ts (via the packed-and-installed fixture).
 *   - For each supported-root and legacy-root exported root symbol, walks
 *     its declared type and collects the names of referenced root-exported
 *     types (bounded recursion with a visited set).
 *   - Fails on any reference whose name is classified internal-candidate.
 *   - Allows manual overrides for DOM globals, ProseMirror upstream
 *     types, generic utility shapes (anything not classified at root).
 *
 * Out of scope for v1:
 *   - Runtime implementation analysis.
 *   - Private field walks.
 *   - Cross-package type origins (we only assert closure within names
 *     that exist at root; non-root types are not subject to the gate).
 *
 * Usage:
 *   node check-root-classification-closure.mjs
 *
 * CI runs this after the consumer-typecheck matrix has packed and
 * installed the fixture.
 */
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { createRequire } from 'node:module';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '../..');
const CLASSIFICATION = resolve(HERE, 'snapshots/superdoc-root-classification.json');
const FIXTURE_SUPERDOC = resolve(HERE, 'node_modules', 'superdoc');

if (!existsSync(FIXTURE_SUPERDOC)) {
  console.error('[SD-3212 a1b] superdoc fixture is not installed.');
  console.error('Run `node tests/consumer-typecheck/typecheck-matrix.mjs` first (packs and installs).');
  process.exit(1);
}
if (!existsSync(CLASSIFICATION)) {
  console.error('[SD-3212 a1b] Classification file not found:', CLASSIFICATION);
  process.exit(1);
}

const req = createRequire(join(FIXTURE_SUPERDOC, 'package.json'));
let ts;
try { ts = req('typescript'); } catch {
  ts = createRequire(join(HERE, 'package.json'))('typescript');
}

const classification = JSON.parse(readFileSync(CLASSIFICATION, 'utf8'));
const bucketByName = Object.fromEntries(classification.rows.map((r) => [r.name, r.bucket]));
const allRootNames = new Set(Object.keys(bucketByName));
const internalCandidates = new Set(classification.rows.filter((r) => r.bucket === 'internal-candidate').map((r) => r.name));

// Manual overrides for known-acceptable references. Each entry MUST include
// a reason string explaining why the closure assertion is intentionally
// skipped for this symbol. Empty reason is a structural error and will
// abort. Use sparingly: the gate exists precisely to surface these.
//
// Adding an entry should land in its own PR with the rationale visible in
// the commit message and the reason string referenceable from grep.
//
// Shape: Map<symbolName, reason>.
const OVERRIDES = new Map([
  // ['ExampleType', 'DOM global re-exposed via X; not a real classification leak (see SD-XXXX).'],
]);

// Validate override shape at startup so we never accept an empty reason.
for (const [name, reason] of OVERRIDES) {
  if (typeof reason !== 'string' || reason.trim().length < 20) {
    console.error(`[SD-3212 a1b] OVERRIDES entry '${name}' must include a reason string of >= 20 chars.`);
    process.exit(2);
  }
}

// Resolve the emitted root .d.ts path from the installed package.json#exports
const pkg = JSON.parse(readFileSync(join(FIXTURE_SUPERDOC, 'package.json'), 'utf8'));
const rootTypes = pkg.exports?.['.']?.types;
const rootDtsRel = typeof rootTypes === 'string' ? rootTypes : rootTypes?.import ?? rootTypes?.default;
if (!rootDtsRel) {
  console.error('[SD-3212 a1b] Could not resolve root types path from installed package.json.');
  process.exit(1);
}
const rootDts = resolve(FIXTURE_SUPERDOC, rootDtsRel);
if (!existsSync(rootDts)) {
  console.error('[SD-3212 a1b] Root .d.ts not found at:', rootDts);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// TS program
// ---------------------------------------------------------------------------
const program = ts.createProgram({
  rootNames: [rootDts],
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
const sf = program.getSourceFile(rootDts);
if (!sf) { console.error('[SD-3212 a1b] Could not load root .d.ts as source file'); process.exit(1); }
const rootSymbol = checker.getSymbolAtLocation(sf) ?? sf.symbol;
if (!rootSymbol) { console.error('[SD-3212 a1b] Root module has no symbol'); process.exit(1); }
const rootExports = checker.getExportsOfModule(rootSymbol);

// ---------------------------------------------------------------------------
// Walk a type and collect referenced root-symbol names (bounded recursion)
// ---------------------------------------------------------------------------
function collectRootReferences(type, visited = new Set(), depth = 0) {
  const refs = new Set();
  if (!type) return refs;
  // Bound the walk; 6 levels is enough to see properties of nested types.
  if (depth > 6) return refs;
  const typeId = type.id ?? null;
  if (typeId != null) {
    if (visited.has(typeId)) return refs;
    visited.add(typeId);
  }
  // Symbol identity: if this type's symbol's name is a root export, record it
  const sym = type.aliasSymbol ?? type.symbol;
  if (sym) {
    const symName = sym.getName();
    if (allRootNames.has(symName)) refs.add(symName);
  }
  // Walk union/intersection members
  if (type.isUnionOrIntersection?.()) {
    for (const sub of type.types || []) {
      for (const r of collectRootReferences(sub, visited, depth + 1)) refs.add(r);
    }
  }
  // Walk type arguments (e.g. Foo<Bar>, Array<X>)
  const typeArgs = checker.getTypeArguments?.(type) ?? [];
  for (const arg of typeArgs) {
    for (const r of collectRootReferences(arg, visited, depth + 1)) refs.add(r);
  }
  // Walk apparent properties (object types, interfaces, classes)
  const props = type.getProperties?.() ?? [];
  for (const p of props) {
    const pType = checker.getTypeOfSymbolAtLocation(p, sf);
    for (const r of collectRootReferences(pType, visited, depth + 1)) refs.add(r);
  }
  // Walk call signatures (functions/methods)
  const callSigs = checker.getSignaturesOfType?.(type, ts.SignatureKind.Call) ?? [];
  for (const cs of callSigs) {
    for (const param of cs.parameters || []) {
      const pType = checker.getTypeOfSymbolAtLocation(param, sf);
      for (const r of collectRootReferences(pType, visited, depth + 1)) refs.add(r);
    }
    const retType = cs.getReturnType?.();
    if (retType) for (const r of collectRootReferences(retType, visited, depth + 1)) refs.add(r);
  }
  // Walk construct signatures (class constructors)
  const ctorSigs = checker.getSignaturesOfType?.(type, ts.SignatureKind.Construct) ?? [];
  for (const cs of ctorSigs) {
    for (const param of cs.parameters || []) {
      const pType = checker.getTypeOfSymbolAtLocation(param, sf);
      for (const r of collectRootReferences(pType, visited, depth + 1)) refs.add(r);
    }
    const retType = cs.getReturnType?.();
    if (retType) for (const r of collectRootReferences(retType, visited, depth + 1)) refs.add(r);
  }
  return refs;
}

// ---------------------------------------------------------------------------
// Run the check
// ---------------------------------------------------------------------------
const violations = [];
let inspected = 0;
let skippedNotInClassification = 0;

for (const exportSym of rootExports) {
  const name = exportSym.getName();
  const bucket = bucketByName[name];
  if (!bucket) { skippedNotInClassification++; continue; }
  if (bucket !== 'supported-root' && bucket !== 'legacy-root') continue;
  inspected++;
  const exportType = checker.getTypeOfSymbolAtLocation(exportSym, sf);
  const refs = collectRootReferences(exportType);
  // The export itself shows up in refs; exclude self.
  refs.delete(name);
  for (const refName of refs) {
    if (internalCandidates.has(refName) && !OVERRIDES.has(refName)) {
      violations.push({ exporter: name, exporterBucket: bucket, references: refName, referencesBucket: 'internal-candidate' });
    }
    // Note overridden references for telemetry/visibility.
    if (internalCandidates.has(refName) && OVERRIDES.has(refName)) {
      console.log(`[SD-3212 a1b] override applied: ${name} (${bucket}) references ${refName} (internal-candidate). Reason: ${OVERRIDES.get(refName)}`);
    }
  }
}

console.log('[SD-3212 a1b] Root exports inspected:', inspected);
console.log('[SD-3212 a1b] Skipped (not in classification snapshot):', skippedNotInClassification);
console.log('[SD-3212 a1b] Violations:', violations.length);
if (violations.length) {
  for (const v of violations) {
    console.error(`  - ${v.exporter} (${v.exporterBucket}) references ${v.references} (internal-candidate)`);
  }
  console.error('');
  console.error('Closure-rule fix options:');
  console.error('  1. Promote the referenced type from internal-candidate to legacy-root in superdoc-root-classification.json.');
  console.error('  2. Tighten the exporter to not reference it.');
  console.error('  3. If the reference is unavoidable and the type is genuinely DOM/upstream/utility-shaped, add a documented override in this script.');
  process.exit(1);
}
console.log('[SD-3212 a1b] OK — no closure violations.');
