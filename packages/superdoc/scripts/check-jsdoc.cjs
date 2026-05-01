#!/usr/bin/env node
/**
 * SD-2863: per-file checkJs gate for the public-contract surface.
 *
 * Why this exists in this shape (and not as a plain `tsc -p tsconfig.checkjs.json`):
 *
 * The codebase uses `customConditions: ["source"]`, which makes TypeScript
 * resolve `import { Editor } from '@superdoc/super-editor'` to the source
 * `.js`/`.ts` files of the workspace package. With `// @ts-check` enabled on
 * any file in this package, TS follows those imports and type-checks the
 * super-editor source too — about 6500 errors. Those errors are real (they
 * are the broader SD-2863 work) but they are not what this PR is trying to
 * gate. The gate here is "files in CHECKED_FILES must stay clean."
 *
 * The script:
 *
 *   1. Runs `tsc --noEmit -p packages/superdoc/tsconfig.json`. Because each
 *      file in CHECKED_FILES has `// @ts-check`, TS reports errors on those
 *      files even though the project-wide `checkJs` is `false`.
 *   2. Filters the tsc output to errors whose path matches an entry in
 *      CHECKED_FILES.
 *   3. Exits non-zero if any matched the filter; exits zero if not.
 *
 * Adding a new file to the gate:
 *
 *   1. Add `// @ts-check` as the first line of the file.
 *   2. Add the file's path (relative to `packages/superdoc/`) to
 *      CHECKED_FILES below.
 *   3. Run `node packages/superdoc/scripts/check-jsdoc.cjs` and fix what
 *      surfaces.
 *
 * The intent is for CHECKED_FILES to grow over time as the team ratchets
 * checkJs across the public-contract surface. SD-2863 lands the pattern;
 * follow-up tickets land the additional files.
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const CHECKED_FILES = [
  'src/helpers/schema-introspection.js',
];

const packageDir = path.resolve(__dirname, '..');
const repoRoot = path.resolve(packageDir, '..', '..');

const tscBin = path.join(repoRoot, 'node_modules', '.bin', 'tsc');
const tsconfigPath = path.join(packageDir, 'tsconfig.json');

// Pre-flight: every file in CHECKED_FILES must opt into `// @ts-check`.
// The project's tsconfig sets `checkJs: false`, so a JS file without the
// directive is not type-checked at all. Without this guard, removing or
// forgetting the directive on a listed file makes the gate silently stop
// covering it — the script keeps reporting OK even though the file has
// drifted.
const missingDirective = [];
const missingFiles = [];
for (const rel of CHECKED_FILES) {
  const abs = path.join(packageDir, rel);
  if (!fs.existsSync(abs)) {
    missingFiles.push(rel);
    continue;
  }
  // The directive only takes effect when it precedes any non-comment
  // statement, so it lives near the top. 4 KiB is plenty of margin for
  // a leading license/doc block.
  const head = fs.readFileSync(abs, 'utf8').slice(0, 4096);
  if (!/^\s*\/\/\s*@ts-check\b/m.test(head)) {
    missingDirective.push(rel);
  }
}

if (missingFiles.length > 0) {
  console.error('[check-jsdoc] gated files do not exist:');
  for (const f of missingFiles) console.error(`  - ${f}`);
  process.exit(1);
}
if (missingDirective.length > 0) {
  console.error('[check-jsdoc] gated files are missing the `// @ts-check` directive:');
  for (const f of missingDirective) console.error(`  - ${f}`);
  console.error('Each gated file must opt into checkJs explicitly.');
  console.error('Add `// @ts-check` as the first non-blank line, then re-run.');
  process.exit(1);
}

const result = spawnSync(tscBin, ['--noEmit', '-p', tsconfigPath], {
  encoding: 'utf8',
  cwd: repoRoot,
});

// Fail fast if tsc itself could not be spawned (ENOENT on the binary,
// EACCES, etc.). Without this guard, a missing `tsc` leaves
// `result.error` set, empty stdout/stderr, and the rest of the script
// would happily report "OK" because it found zero parseable errors.
if (result.error) {
  console.error(`[check-jsdoc] failed to invoke tsc at ${tscBin}: ${result.error.message}`);
  process.exit(1);
}

// Killed by a signal (SIGKILL/OOM/SIGTERM) mid-run. spawnSync sets
// `result.status` to null in that case and may leave partial output
// containing parseable diagnostics, which would otherwise sneak past
// the structural-failure check below.
if (result.signal !== null) {
  console.error(`[check-jsdoc] tsc was killed by signal: ${result.signal}`);
  process.exit(1);
}

const output = `${result.stdout || ''}${result.stderr || ''}`;

// Match each `path/to/file(line,col): error TSxxxx: ...` row. tsc emits
// paths relative to the cwd we ran from (repoRoot).
const allErrors = output
  .split('\n')
  .filter((line) => /\.[jt]sx?\(\d+,\d+\):\s+error\s+TS\d+:/.test(line));

// Catch the structural-failure mode: tsc exited non-zero but produced no
// parseable diagnostics. That means the failure is something like a
// missing tsconfig, an internal compiler crash, or a config error,
// rather than a normal type-check fail; the gate cannot reason about it.
if (result.status !== 0 && allErrors.length === 0) {
  console.error('[check-jsdoc] tsc exited with a non-zero status but produced no parseable diagnostics.');
  console.error(`Status: ${result.status}`);
  console.error(`Output:\n${output || '(empty)'}`);
  process.exit(1);
}

const checkedAbsolute = CHECKED_FILES.map((rel) => path.join(packageDir, rel));

const isCheckedError = (line) => {
  const match = line.match(/^([^(]+)\(\d+,\d+\):/);
  if (!match) return false;
  const filePath = path.resolve(repoRoot, match[1]);
  return checkedAbsolute.includes(filePath);
};

const checkedErrors = allErrors.filter(isCheckedError);

console.log('[check-jsdoc] SD-2863 public-contract checkJs gate');
console.log('='.repeat(72));
console.log(`Files under gate: ${CHECKED_FILES.length}`);
for (const f of CHECKED_FILES) {
  console.log(`  - ${f}`);
}
console.log();

if (checkedErrors.length === 0) {
  console.log(`OK    ${CHECKED_FILES.length} gated file${CHECKED_FILES.length === 1 ? '' : 's'} clean.`);
  console.log(`      (${allErrors.length} non-gated error${allErrors.length === 1 ? '' : 's'} in the wider tsc run, ignored — see SD-2863 follow-up tickets.)`);
  process.exit(0);
}

console.log(`FAIL  ${checkedErrors.length} error${checkedErrors.length === 1 ? '' : 's'} in gated files:`);
for (const line of checkedErrors) {
  console.log(`        ${line}`);
}
console.log();
console.log('Each error means a public-contract JSDoc has drifted from the implementation.');
console.log('Fix the type or the code so they match. Adding `// @ts-ignore` is not the answer.');
process.exit(1);
