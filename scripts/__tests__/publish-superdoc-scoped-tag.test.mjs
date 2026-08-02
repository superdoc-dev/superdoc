import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const { scopedTagFor } = require('../publish-superdoc.cjs');

// `superdoc` and `@harbour-enterprises/superdoc` ship from the same tarball but
// do not share a tag namespace. The unscoped name is contended: V2 owns
// `latest` and `next` there, so V1 stable releases publish to `legacy`. The
// scoped mirror is V1-only — nothing else advances it — so applying `legacy`
// to it as well would leave its `latest` frozen and quietly stop default
// installs from updating.

test('a V1 stable release keeps the scoped mirror on latest', () => {
  assert.equal(scopedTagFor('legacy'), 'latest');
});

test('tags without contention pass through unchanged', () => {
  // Previews and prereleases must mean the same thing under both names.
  assert.equal(scopedTagFor('pr-1207'), 'pr-1207');
  assert.equal(scopedTagFor('next'), 'next');
  assert.equal(scopedTagFor('latest'), 'latest');
});

test('only the V1 stable channel is remapped', () => {
  // A guard against broadening the rule into "anything unrecognised -> latest",
  // which would silently redirect a maintenance tag onto the default channel.
  for (const tag of ['beta', 'alpha', 'canary', '1.45.x']) {
    assert.equal(scopedTagFor(tag), tag);
  }
});

test('the CLI entrypoint loads without a temporal dead zone', async () => {
  // scopedTagFor is referenced by parseArgs, which runs before module.exports
  // is evaluated. Declaring it below that point throws
  // "Cannot access 'scopedTagFor' before initialization" on every direct
  // invocation — the path release recovery uses.
  const { readFileSync } = await import('node:fs');
  const source = readFileSync(
    new URL('../publish-superdoc.cjs', import.meta.url),
    'utf8',
  );
  assert.ok(
    source.indexOf('const scopedTagFor') < source.indexOf('const parseArgs'),
    'scopedTagFor must be initialized before parseArgs references it',
  );
});
