import assert from 'node:assert/strict';
import test from 'node:test';

import { getDistTagForVersion } from '../release-dist-tags.mjs';

// The superdoc descriptor as release-local-stable.mjs declares it. V1 is the
// maintenance line for `superdoc`, so its stable releases land on `legacy`.
const SUPERDOC = { name: 'superdoc', stableDistTag: 'legacy' };
// A package with no override, which keeps the conventional `latest`.
const REACT = { name: 'react' };

test('a superdoc stable version resolves to legacy, never latest', () => {
  assert.equal(getDistTagForVersion('1.45.1', SUPERDOC), 'legacy');
  assert.equal(getDistTagForVersion('1.46.0', SUPERDOC), 'legacy');
  assert.equal(getDistTagForVersion('2.0.0', SUPERDOC), 'legacy');
});

test('a package without an override keeps latest', () => {
  assert.equal(getDistTagForVersion('1.16.1', REACT), 'latest');
  assert.equal(getDistTagForVersion('1.16.1', null), 'latest');
  assert.equal(getDistTagForVersion('1.16.1'), 'latest');
});

test('prereleases resolve to next regardless of the package', () => {
  assert.equal(getDistTagForVersion('1.45.1-next.2', SUPERDOC), 'next');
  assert.equal(getDistTagForVersion('2.4.0-next.10', REACT), 'next');
  assert.equal(getDistTagForVersion('2.4.0-next.10'), 'next');
});

test('the recovery path cannot restore a V1 stable version to latest', () => {
  // 1.45.1 is the release that took `latest` from V2 on 2026-07-30. A resumed
  // publish of that exact version must not repeat it.
  assert.notEqual(getDistTagForVersion('1.45.1', SUPERDOC), 'latest');
  assert.notEqual(getDistTagForVersion('1.45.1', SUPERDOC), 'next');
});
