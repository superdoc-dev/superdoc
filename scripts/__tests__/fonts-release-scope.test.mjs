import assert from 'node:assert/strict';
import test from 'node:test';
import { fontsExpectedNpmPackages } from '../fonts-release-scope.mjs';

// Which npm names a fonts version is expected to ship under. The rule lives in
// fonts-release-scope.mjs so the recovery and verification steps agree on it.
//
// This file used to also assert the shape of release-fonts.yml. That workflow
// was deleted from the v2 tree before the export cutover, so only the boundary
// module is left to test here. The v1 fonts train still ships from Orbit main,
// which carries its own copy of the workflow.
const expectedPackages = fontsExpectedNpmPackages;


test('pre-migration versions are only expected under the legacy name', () => {
  // The failure this prevents is a startup deadlock, not a slow path: recovery
  // would judge every old tag incomplete, check out that snapshot, and run a
  // publisher that predates the canonical name and cannot create it. The
  // recheck fails identically and recovery never reaches a new release.
  for (const version of ['0.1.0', '0.1.1', '0.2.0']) {
    assert.deepEqual(
      expectedPackages(version),
      ['@superdoc-dev/fonts'],
      `${version} shipped before the scope move and has no canonical counterpart`,
    );
  }
});

test('post-migration versions are expected under both names', () => {
  for (const version of ['0.2.1', '0.3.0', '1.0.0']) {
    assert.deepEqual(expectedPackages(version), ['@superdoc/fonts', '@superdoc-dev/fonts']);
  }
});

test('prerelease suffixes do not change which side of the boundary a version falls on', () => {
  assert.deepEqual(expectedPackages('0.2.0-next.1'), ['@superdoc-dev/fonts']);
  assert.deepEqual(expectedPackages('0.2.1-next.1'), ['@superdoc/fonts', '@superdoc-dev/fonts']);
});

test('version components compare numerically, not lexically', () => {
  // '0.10.0' sorts before '0.2.0' as a string, which would wrongly classify
  // every release after 0.9 as legacy-only.
  assert.deepEqual(expectedPackages('0.10.0'), ['@superdoc/fonts', '@superdoc-dev/fonts']);
});
