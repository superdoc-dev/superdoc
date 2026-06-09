#!/usr/bin/env node
/**
 * Public-method fixture coverage gate.
 *
 * Strict-zero obligation gate over public SuperDoc methods + getters.
 * For each public member, the gate computes what fixture coverage is
 * meaningful (`parameters`, `returns`, or `call`) and fails on any
 * unmet obligation. There is no debt snapshot, no `--write`, and no
 * grandfathering.
 *
 * Obligations (per member, computed from the AST):
 *
 *   - **method with >=1 parameter** → requires `parameters` coverage
 *   - **method with non-void return** → requires `returns` coverage
 *   - **getter** → requires `returns` coverage
 *   - **zero-param method that returns void / Promise<void>** → requires
 *     `call` coverage (otherwise renaming the method would silently slip
 *     past)
 *
 * Satisfaction patterns (scanned across every `.ts` / `.cts` / `.mts`
 * file under `tests/consumer-typecheck/src/`):
 *
 *   - `parameters` → `Parameters<SuperDoc['name']>`
 *   - `returns` (method) → `ReturnType<SuperDoc['name']>`
 *   - `returns` (getter) → `SuperDoc['name']` (bare indexed access) or
 *      `typeof (superdoc|sd).name`
 *   - `call` → `(superdoc|sd).name(`
 *
 * Call sites do NOT satisfy parameter or return obligations on their
 * own (TypeScript would accept a wrong-typed argument if the consumer
 * matched the signature). This is the central distinction from a
 * "mentioned somewhere" gate: the gate must catch the
 * `search(text: string)` regression class, where a call site
 * `sd.search('hello')` shipped while `Parameters<SuperDoc['search']>`
 * was never asserted.
 *
 * Allowlist: `tests/consumer-typecheck/public-method-coverage-allowlist.cjs`.
 * Use only for members that are intentionally not consumer-callable
 * (e.g. internal lifecycle relays that escaped `private` for runtime
 * reasons). Each entry requires (a) a key that matches an actual public
 * member of `SuperDoc`, and (b) a non-empty string reason. The gate
 * validates both. The allowlist is the only escape hatch — there is
 * no grandfathered debt snapshot.
 *
 * Wrapper stage: `public-method-coverage` in `scripts/check-public-contract.mjs`.
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..', '..');
const SUPERDOC_TS = resolve(REPO_ROOT, 'packages/superdoc/src/core/SuperDoc.ts');
const FIXTURE_DIR = resolve(REPO_ROOT, 'tests/consumer-typecheck/src');
const ALLOWLIST_PATH = resolve(HERE, 'public-method-coverage-allowlist.cjs');

const require = createRequire(import.meta.url);
const ts = require('typescript');

// --write was used during the ratchet phase to refresh a grandfathered
// debt snapshot. Strict-zero mode rejects it loudly so contributors
// don't accidentally re-introduce grandfathering.
if (process.argv.includes('--write')) {
  console.error(
    '[public-method-coverage] --write is no longer supported. The gate is\n' +
      'strict zero — every unmet obligation must be satisfied by a consumer\n' +
      'fixture or moved to public-method-coverage-allowlist.cjs (with a\n' +
      'one-line reason). No grandfathered snapshot.',
  );
  process.exit(2);
}

const EVENT_EMITTER_MEMBERS = new Set([
  'on', 'off', 'once', 'emit',
  'addListener', 'removeListener', 'removeAllListeners',
  'listeners', 'listenerCount', 'eventNames',
  'prependListener', 'prependOnceListener', 'rawListeners',
]);

function loadAllowlist() {
  if (!existsSync(ALLOWLIST_PATH)) return {};
  const mod = require(ALLOWLIST_PATH);
  if (typeof mod !== 'object' || mod === null) return {};
  return mod;
}

/** Enumerate public members and compute their obligations. */
function enumerateObligations() {
  const src = readFileSync(SUPERDOC_TS, 'utf8');
  const sf = ts.createSourceFile(SUPERDOC_TS, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);

  let cls = null;
  for (const stmt of sf.statements) {
    if (ts.isClassDeclaration(stmt) && stmt.name?.text === 'SuperDoc') {
      cls = stmt;
      break;
    }
  }
  if (!cls) {
    console.error(`[public-method-coverage] could not find SuperDoc class in ${SUPERDOC_TS}`);
    process.exit(1);
  }

  const members = [];
  for (const m of cls.members) {
    if (!ts.isMethodDeclaration(m) && !ts.isGetAccessorDeclaration(m)) continue;
    if (!m.name || !ts.isIdentifier(m.name)) continue;

    const name = m.name.text;
    const mods = m.modifiers ?? [];
    if (mods.some((mod) => mod.kind === ts.SyntaxKind.PrivateKeyword)) continue;
    if (mods.some((mod) => mod.kind === ts.SyntaxKind.StaticKeyword)) continue;
    if (ts.getJSDocTags(m).some((tag) => tag.tagName?.text === 'internal')) continue;
    if (EVENT_EMITTER_MEMBERS.has(name)) continue;

    const isGetter = ts.isGetAccessorDeclaration(m);
    const hasParams = !isGetter && (m.parameters?.length ?? 0) > 0;

    // Return-type meaningfulness: meaningful unless explicitly declared void
    // / Promise<void>. Undeclared returns are treated as meaningful (i.e.
    // the gate prefers requiring an assertion over silently letting it pass).
    let returnsMeaningful = true;
    if (!isGetter && m.type) {
      const rtText = m.type.getText(sf).trim();
      if (rtText === 'void' || rtText === 'Promise<void>') returnsMeaningful = false;
    }

    const obligations = [];
    if (isGetter) {
      obligations.push('returns');
    } else {
      if (hasParams) obligations.push('parameters');
      if (returnsMeaningful) obligations.push('returns');
      if (!hasParams && !returnsMeaningful) obligations.push('call');
    }

    members.push({ name, kind: isGetter ? 'getter' : 'method', obligations });
  }
  return members;
}

/**
 * Recursively walk FIXTURE_DIR and return every `.ts` / `.cts` / `.mts`
 * file path, relative to FIXTURE_DIR. Manual recursion (not
 * `readdirSync(..., { recursive: true })`) so the gate works on any
 * Node version this repo supports without depending on the recursive
 * option being available.
 */
function listFixtureFiles(dir, rel = '') {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const child = join(dir, entry.name);
    const relPath = rel ? `${rel}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      out.push(...listFixtureFiles(child, relPath));
    } else if (entry.isFile() && /\.(c|m)?ts$/.test(entry.name)) {
      out.push(relPath);
    }
  }
  return out;
}

function loadFixtures() {
  const files = listFixtureFiles(FIXTURE_DIR).sort();
  return files
    .map((rel) => `// === ${rel} ===\n${readFileSync(join(FIXTURE_DIR, rel), 'utf8')}`)
    .join('\n');
}

/** Test whether a specific obligation is satisfied by any fixture. */
function isSatisfied(fixtures, name, kind, obligation) {
  const n = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (obligation === 'parameters') {
    return new RegExp(`Parameters<\\s*SuperDoc\\[['"]${n}['"]\\]\\s*>`).test(fixtures);
  }
  if (obligation === 'returns') {
    if (kind === 'method') {
      return new RegExp(`ReturnType<\\s*SuperDoc\\[['"]${n}['"]\\]\\s*>`).test(fixtures);
    }
    // Getter: accept bare indexed access OR typeof on a SuperDoc instance.
    if (new RegExp(`SuperDoc\\[['"]${n}['"]\\](?!\\.)`).test(fixtures)) return true;
    if (new RegExp(`typeof\\s+(?:superdoc|sd)\\.${n}\\b`).test(fixtures)) return true;
    return false;
  }
  if (obligation === 'call') {
    return new RegExp(`(?:superdoc|sd)\\.${n}\\s*\\(`).test(fixtures);
  }
  return false;
}

// ─── Main ────────────────────────────────────────────────────────────

const members = enumerateObligations();
const fixtures = loadFixtures();
const allowlist = loadAllowlist();
const allowlistKeys = new Set(Object.keys(allowlist));
const memberNames = new Set(members.map((m) => m.name));

// Validate allowlist BEFORE applying it.
const allowlistFailures = [];
for (const [k, v] of Object.entries(allowlist)) {
  if (!memberNames.has(k)) {
    allowlistFailures.push(`  - ${k}: not a public member of SuperDoc (typo or stale entry)`);
    continue;
  }
  if (typeof v !== 'string' || v.trim().length === 0) {
    allowlistFailures.push(`  - ${k}: missing or empty reason`);
  }
}

// Compute current unmet obligations (skip allowlisted members entirely).
const unmetNow = [];
for (const m of members) {
  if (allowlistKeys.has(m.name)) continue;
  for (const ob of m.obligations) {
    if (!isSatisfied(fixtures, m.name, m.kind, ob)) {
      unmetNow.push(`${m.name}:${ob}`);
    }
  }
}
unmetNow.sort();

const totalObligations = members.reduce((n, m) => n + m.obligations.length, 0);
const enforcedMembers = members.filter((m) => !allowlistKeys.has(m.name));
const enforcedObligations = enforcedMembers.reduce((n, m) => n + m.obligations.length, 0);

const HR = '='.repeat(72);
console.log('[public-method-coverage] SuperDoc public-surface fixture coverage (strict zero)');
console.log(HR);
console.log(`Members inspected:               ${members.length}`);
console.log(`  Methods (non-EventEmitter):    ${members.filter((m) => m.kind === 'method').length}`);
console.log(`  Getters:                       ${members.filter((m) => m.kind === 'getter').length}`);
console.log(`Allowlisted members:             ${allowlistKeys.size}`);
console.log(`Enforced members:                ${enforcedMembers.length}`);
console.log(`Enforced obligations:            ${enforcedObligations}`);
console.log(`Total obligations (pre-allowlist): ${totalObligations}`);
console.log(`Unmet obligations:               ${unmetNow.length}`);
console.log('');

const failures = [];
if (allowlistFailures.length > 0) {
  failures.push('public-method-coverage-allowlist contract violations:');
  for (const f of allowlistFailures) failures.push(f);
}
if (unmetNow.length > 0) {
  if (failures.length > 0) failures.push('');
  failures.push(`${unmetNow.length} unmet obligation(s):`);
  for (const e of unmetNow) failures.push(`  + ${e}`);
  failures.push('');
  failures.push(`Add a consumer fixture under tests/consumer-typecheck/src/ that asserts the`);
  failures.push(`required shape for each entry above. Obligation key is "memberName:obligation":`);
  failures.push(`  parameters  → Parameters<SuperDoc['name']>`);
  failures.push(`  returns (method) → ReturnType<SuperDoc['name']>`);
  failures.push(`  returns (getter) → SuperDoc['name']  or  typeof sd.name`);
  failures.push(`  call        → sd.name( … )  or  superdoc.name( … )`);
  failures.push(``);
  failures.push(`If the member is intentionally not consumer-callable, add an entry with a`);
  failures.push(`one-line reason to public-method-coverage-allowlist.cjs.`);
}

if (failures.length > 0) {
  console.log('FAIL  fixture coverage gap:');
  for (const line of failures) console.log(line);
  process.exit(1);
}

console.log(
  `OK    ${enforcedObligations} enforced obligation(s) across ${enforcedMembers.length} members; zero unmet.`,
);
process.exit(0);
