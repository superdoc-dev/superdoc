#!/usr/bin/env node
/**
 * Public-method fixture coverage gate.
 *
 * Obligation-based ratchet over public SuperDoc methods + getters.
 * For each public member, the gate computes what fixture coverage is
 * meaningful (`parameters`, `returns`, or `call`) and fails when any
 * required obligation is unmet AND the member is not on the debt
 * snapshot.
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
 * "mentioned somewhere" ratchet: the gate must catch the
 * `search(text: string)` regression class, where a call site
 * `sd.search('hello')` shipped while `Parameters<SuperDoc['search']>`
 * was never asserted.
 *
 * Two failure modes:
 *
 *   1. RATCHET — A NEW unmet obligation lands (member added, fixture
 *      removed, or migration narrows a signature) and the obligation
 *      is not on the debt snapshot.
 *   2. SNAPSHOT DRIFT — A snapshot entry is stale (the obligation it
 *      records is now satisfied). The contributor must run `--write`
 *      to lock the win.
 *
 * Refresh the snapshot after intentional changes:
 *   node tests/consumer-typecheck/check-public-method-coverage.mjs --write
 *
 * Allowlist: `tests/consumer-typecheck/public-method-coverage-allowlist.cjs`.
 * Use only for members that are intentionally not consumer-callable
 * (e.g. internal lifecycle relays that escaped `private` for runtime
 * reasons). Each entry requires (a) a key that matches an actual public
 * member of `SuperDoc`, and (b) a non-empty string reason. The gate
 * validates both.
 *
 * Wrapper stage: `public-method-coverage` in `scripts/check-public-contract.mjs`.
 */

import { readFileSync, readdirSync, existsSync, writeFileSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..', '..');
const SUPERDOC_TS = resolve(REPO_ROOT, 'packages/superdoc/src/core/SuperDoc.ts');
const FIXTURE_DIR = resolve(REPO_ROOT, 'tests/consumer-typecheck/src');
const ALLOWLIST_PATH = resolve(HERE, 'public-method-coverage-allowlist.cjs');
const SNAPSHOT_PATH = resolve(HERE, 'public-method-coverage-debt-snapshot.json');

const require = createRequire(import.meta.url);
const ts = require('typescript');

const flags = new Set(process.argv.slice(2));
const writeMode = flags.has('--write');

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

function loadSnapshot() {
  if (!existsSync(SNAPSHOT_PATH)) return [];
  const raw = JSON.parse(readFileSync(SNAPSHOT_PATH, 'utf8'));
  if (!Array.isArray(raw.knownUnmet)) {
    console.error(`[public-method-coverage] invalid snapshot at ${SNAPSHOT_PATH} (missing "knownUnmet" array)`);
    process.exit(1);
  }
  return raw.knownUnmet.slice().sort();
}

function writeSnapshot(entries) {
  const payload = {
    $comment:
      'Auto-managed by tests/consumer-typecheck/check-public-method-coverage.mjs. ' +
      'Each entry is "memberName:obligation" where obligation is one of ' +
      'parameters | returns | call. Refresh with --write after adding fixtures.',
    knownUnmet: entries.slice().sort(),
  };
  writeFileSync(SNAPSHOT_PATH, JSON.stringify(payload, null, 2) + '\n');
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

if (writeMode) {
  writeSnapshot(unmetNow);
  console.log(
    `[public-method-coverage] wrote ${SNAPSHOT_PATH.replace(REPO_ROOT + '/', '')} (${unmetNow.length} entries).`,
  );
  process.exit(0);
}

const snapshot = loadSnapshot();
const snapshotSet = new Set(snapshot);
const unmetSet = new Set(unmetNow);

const newUnmet = unmetNow.filter((e) => !snapshotSet.has(e));
const stale = snapshot.filter((e) => !unmetSet.has(e));

const totalObligations = members.reduce((n, m) => n + m.obligations.length, 0);

const HR = '='.repeat(72);
console.log('[public-method-coverage] SuperDoc public-surface fixture coverage');
console.log(HR);
console.log(`Members inspected:           ${members.length}`);
console.log(`  Methods (non-EventEmitter): ${members.filter((m) => m.kind === 'method').length}`);
console.log(`  Getters:                    ${members.filter((m) => m.kind === 'getter').length}`);
console.log(`Total obligations:            ${totalObligations}`);
console.log(`Allowlisted members:          ${allowlistKeys.size}`);
console.log(`Tracked as known debt:        ${unmetNow.length - newUnmet.length}`);
console.log(`Snapshot at:                  ${SNAPSHOT_PATH.replace(REPO_ROOT + '/', '')}`);
console.log('');

const failures = [];
if (allowlistFailures.length > 0) {
  failures.push('public-method-coverage-allowlist contract violations:');
  for (const f of allowlistFailures) failures.push(f);
}
if (newUnmet.length > 0) {
  if (failures.length > 0) failures.push('');
  failures.push(`${newUnmet.length} NEW unmet obligation(s):`);
  for (const e of newUnmet) failures.push(`  + ${e}`);
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
if (stale.length > 0) {
  if (failures.length > 0) failures.push('');
  failures.push(`${stale.length} stale entry/entries in the debt snapshot (obligation now satisfied):`);
  for (const e of stale) failures.push(`  - ${e}`);
  failures.push('');
  failures.push(
    `Run \`node tests/consumer-typecheck/check-public-method-coverage.mjs --write\``,
  );
  failures.push(`to refresh the snapshot and lock in the win.`);
}

if (failures.length > 0) {
  console.log('FAIL  fixture coverage drift:');
  for (const line of failures) console.log(line);
  process.exit(1);
}

console.log(
  `OK    ${totalObligations} obligation(s) across ${members.length - allowlistKeys.size} members; ${unmetNow.length} tracked as known debt; ratchet snapshot in sync.`,
);
process.exit(0);
