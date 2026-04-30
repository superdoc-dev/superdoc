#!/usr/bin/env node
/**
 * SD-2860: keep `tests/consumer-typecheck/src/all-public-types.ts` in sync with
 * the public type surface that `superdoc` actually exports.
 *
 * Without this, a developer can add a new `@typedef` line to
 * `packages/superdoc/src/index.js` (or land a new public export some other
 * way that flows through the typedef block) and the regression net does not
 * cover the new type. The matrix passes, the type collapses to `any` for
 * customers, and we find out from a customer report.
 *
 * The source of truth is the JSDoc `@typedef {import('...').<Name>} <Name>`
 * block in `packages/superdoc/src/index.js`. Each line declares one public
 * type. The script reads that block, reads the assertion list in
 * `all-public-types.ts`, and:
 *
 *   - default mode (`--check`): exits non-zero if the two lists differ, with
 *     a clear message listing what is missing or extra and how to fix it.
 *   - `--write`: regenerates the test file from the source list. Fast path
 *     for a developer who added a new public export and just wants to wire
 *     up the assertion.
 *
 * The script is intentionally low-tech (regex on the source), not a TS
 * compiler API call. The typedef block has a stable shape and adding more
 * sources of truth (direct `export type` constructs, etc.) is a follow-up
 * if/when they appear.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');

const SOURCE_FILE = path.join(repoRoot, 'packages/superdoc/src/index.js');
const TEST_FILE = path.join(__dirname, 'src/all-public-types.ts');

const args = process.argv.slice(2);
const mode = args.includes('--write') ? 'write' : 'check';

if (!fs.existsSync(SOURCE_FILE)) {
  console.error(`[check-public-types] source file not found: ${SOURCE_FILE}`);
  process.exit(1);
}
if (!fs.existsSync(TEST_FILE)) {
  console.error(`[check-public-types] test file not found: ${TEST_FILE}`);
  process.exit(1);
}

// Parse the @typedef block. Each line looks like:
//   * @typedef {import('@superdoc/super-editor').EditorState} EditorState
// We capture the trailing identifier (the typedef name).
const sourceContent = fs.readFileSync(SOURCE_FILE, 'utf8');
const TYPEDEF_RE = /@typedef\s+\{import\(['"][^'"]+['"]\)\.[A-Za-z0-9_]+\}\s+([A-Za-z0-9_]+)/g;
const sourceTypes = new Set();
for (const match of sourceContent.matchAll(TYPEDEF_RE)) {
  sourceTypes.add(match[1]);
}

// Parse the test file. Anchor on `const _real_` so doc-comment placeholders
// like the literal `_real_X` reference inside the leading comment block do
// not contaminate the list.
const testContent = fs.readFileSync(TEST_FILE, 'utf8');
const ASSERTION_RE = /^const\s+_real_[A-Za-z0-9_]+:\s*AssertNotAny<([A-Za-z0-9_]+)>/gm;
const testTypes = new Set();
for (const match of testContent.matchAll(ASSERTION_RE)) {
  testTypes.add(match[1]);
}

const missingFromTest = [...sourceTypes].filter((t) => !testTypes.has(t)).sort();
const extraInTest = [...testTypes].filter((t) => !sourceTypes.has(t)).sort();

console.log('[check-public-types] superdoc public-type surface');
console.log('='.repeat(72));
console.log(`Source: ${path.relative(repoRoot, SOURCE_FILE)}`);
console.log(`        ${sourceTypes.size} typedef${sourceTypes.size === 1 ? '' : 's'}`);
console.log(`Test:   ${path.relative(repoRoot, TEST_FILE)}`);
console.log(`        ${testTypes.size} assertion${testTypes.size === 1 ? '' : 's'}`);
console.log();

if (missingFromTest.length === 0 && extraInTest.length === 0) {
  console.log('OK    Test list matches the public-type surface.');
  // In `--write` mode, fall through to the regeneration block. The file may
  // be in semantic sync (every typedef has an assertion) but stale on
  // formatting or comments; `--write` is the explicit "force regenerate"
  // path, not "regenerate only when names diverged."
  if (mode !== 'write') {
    process.exit(0);
  }
}

if (missingFromTest.length > 0) {
  console.log(`FAIL  ${missingFromTest.length} public type${missingFromTest.length === 1 ? '' : 's'} missing from the test:`);
  for (const name of missingFromTest) {
    console.log(`        ${name}`);
  }
}
if (extraInTest.length > 0) {
  if (missingFromTest.length > 0) console.log();
  console.log(`FAIL  ${extraInTest.length} type${extraInTest.length === 1 ? '' : 's'} in the test but not in the source typedef block:`);
  for (const name of extraInTest) {
    console.log(`        ${name}`);
  }
  console.log('      Either add the missing @typedef line, or remove the assertion.');
}

if (mode !== 'write') {
  console.log();
  console.log('Run with --write to regenerate the test file from the typedef block,');
  console.log('or add the missing assertions manually. See the script header for details.');
  process.exit(1);
}

// `--write` mode: regenerate the test file from the source list.
const sortedNames = [...sourceTypes].sort();

// Preserve the file header and the IsAny / AssertNotAny helpers; rewrite the
// import block and the assertion list. Anchor on the existing structure.
const header = `/**
 * Consumer typecheck: every public type from superdoc must resolve to
 * a real interface, not collapse to \`any\`, and not be missing.
 *
 * Each \`AssertNotAny<T>\` resolves to \`never\` when T is \`any\`, so the
 * \`const _real_X: AssertNotAny<X> = true\` lines fail to compile if X
 * has collapsed. A missing export shows up as TS2305 on the import.
 *
 * THIS FILE IS GENERATED from the JSDoc @typedef block in
 * packages/superdoc/src/index.js. Edit the typedef block (or run
 *   node tests/consumer-typecheck/check-public-types.mjs --write
 * from the repo root, or \`npm run check:types:write\` from inside
 * tests/consumer-typecheck) and commit both. SD-2860's check script enforces
 * that the two stay in sync; a missing assertion fails CI with a message
 * pointing at this script.
 */
import type {
${sortedNames.map((n) => `  ${n},`).join('\n')}
} from 'superdoc';

// Helper: IsAny<T> resolves to \`true\` when T is \`any\`, otherwise false.
type IsAny<T> = 0 extends 1 & T ? true : false;
type AssertNotAny<T> = IsAny<T> extends true ? never : true;

// One assertion per type. If T is \`any\`, AssertNotAny<T> is \`never\` and
// the line below fails to compile with "Type 'true' is not assignable
// to type 'never'". If T is real, it compiles silently.
${sortedNames.map((n) => `const _real_${n}: AssertNotAny<${n}> = true;`).join('\n')}
`;

fs.writeFileSync(TEST_FILE, header);
console.log();
console.log(`Wrote ${sortedNames.length} assertions to ${path.relative(repoRoot, TEST_FILE)}.`);
process.exit(0);
