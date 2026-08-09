/**
 * Handwritten source must stay inside the formatter's reach.
 *
 * `.prettierignore` carried a bare `public` line. Prettier matches a pattern
 * with no slash against every path segment, so it did not exclude a root asset
 * directory, it excluded every directory named `public` at any depth. That took
 * `packages/superdoc/src/public/` with it: the typed public API surface,
 * silently outside `format`, `format:check`, and the pre-commit hook.
 *
 * The failure is invisible by construction. Ignored files are skipped, not
 * reported, so the only symptom is formatting drift nobody is told about.
 *
 * This drops a deliberately misformatted probe into each directory that must
 * stay covered and asserts `vp fmt --check` fails and names it. Running the
 * real command is what makes the guard trustworthy: it exercises the `fmt`
 * block in vite.config.ts, Oxfmt's own ignore resolution, and `.gitignore`
 * together, instead of reimplementing any of them. Reimplementing the ignore
 * semantics is how the original bug hid, and Oxfmt exposes no supported API for
 * asking whether a path is ignored.
 *
 * Run:
 *   node --test scripts/__tests__/format-coverage.test.mjs
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

/**
 * Directories whose handwritten sources must remain formattable.
 *
 * Keep this list to product source that a contributor edits by hand. Generated
 * output belongs in `fmt.ignorePatterns`, owned by its generator, and adding it
 * here would assert the opposite.
 */
const MUST_BE_COVERED = ['packages/superdoc/src/public'];

/**
 * Misformatted on purpose: extra blank lines and padded operators. Oxfmt has to
 * want to rewrite this, or the probe proves nothing about coverage.
 */
const MISFORMATTED_SOURCE = 'export const   probe:number    =   1;\n\n\n\n';

for (const dir of MUST_BE_COVERED) {
  test(`vp fmt covers ${dir}`, () => {
    const probeDir = mkdtempSync(join(REPO_ROOT, dir, 'fmt-coverage-'));
    const probe = join(probeDir, 'probe.ts');
    try {
      writeFileSync(probe, MISFORMATTED_SOURCE, 'utf8');
      const rel = relative(REPO_ROOT, probe);

      const result = spawnSync('pnpm', ['exec', 'vp', 'fmt', '--check', rel], {
        cwd: REPO_ROOT,
        encoding: 'utf8',
      });
      const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;

      // Exit code alone does not separate the two failures: an excluded path
      // also exits non-zero, with "Expected at least one target file". Check
      // that phrase first so an exclusion reports as an exclusion.
      assert.doesNotMatch(
        output,
        /Expected at least one target file/,
        `vp fmt --check matched no file for a probe inside ${dir}, so that directory is excluded from ` +
          `the formatter. Check fmt.ignorePatterns in vite.config.ts and .gitignore.\n${output}`,
      );
      assert.notStrictEqual(
        result.status,
        0,
        `vp fmt --check passed on a deliberately misformatted file in ${dir}. The probe reached Oxfmt ` +
          `but was reported clean, so the formatter is not enforcing this directory.\n${output}`,
      );
      assert.match(
        output,
        /probe\.ts/,
        `vp fmt --check failed without naming the probe in ${dir}, so the failure is unrelated to ` +
          `coverage.\n${output}`,
      );
    } finally {
      rmSync(probeDir, { recursive: true, force: true });
    }
  });
}
