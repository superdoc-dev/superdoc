import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const { resumeFontsRelease } = require('../resume-fonts-release.cjs');
const { CANONICAL_PACKAGE_NAME, LEGACY_PACKAGE_NAME } = require('../publish-fonts.cjs');

const silent = { log() {} };

/**
 * Fake registry plus a publisher spy.
 *
 * `deprecated: ''` is npm's answer for a version that is published but carries
 * no notice, which is one of the incomplete states this script exists to
 * finish. `failWith` makes `npm view` throw, standing in for a 404 during
 * propagation, an auth failure, or a network error. `published` and
 * `canonicalPublished` are separate so the two halves of a release can be in
 * different states, which is the whole point of checking both.
 */
const makeEffects = ({
  published = true,
  canonicalPublished = true,
  deprecated = 'moved',
  failWith = null,
} = {}) => {
  const publishes = [];
  const lookups = [];

  return {
    publishes,
    lookups,
    publish: (options) => {
      publishes.push(options);
    },
    runCapture: (command, args) => {
      const spec = args[1];
      lookups.push(spec);

      if (failWith) {
        const error = new Error(failWith);
        error.stderr = failWith;
        throw error;
      }

      const missing = () => {
        const error = new Error('E404 Not found');
        error.stderr = 'npm error code E404';
        throw error;
      };

      const isCanonical = spec.startsWith(`${CANONICAL_PACKAGE_NAME}@`);
      if (isCanonical && !canonicalPublished) missing();
      if (!isCanonical && !published) missing();

      return args[2] === 'deprecated' ? deprecated : '0.2.1';
    },
  };
};

test('a published and deprecated mirror is left alone', () => {
  // The healthy path. This runs on every manual release, not just failed ones,
  // so it must not repack and republish a finished release each time.
  const effects = makeEffects({ published: true, deprecated: 'moved to @superdoc/fonts' });

  const result = resumeFontsRelease({ version: '0.2.1', effects, logger: silent });

  assert.equal(result.resumed, false);
  assert.equal(result.reason, 'already-complete');
  assert.deepEqual(effects.publishes, []);
});

test('a published mirror with no deprecation notice is resumed', () => {
  const effects = makeEffects({ published: true, deprecated: '' });

  const result = resumeFontsRelease({ version: '0.2.1', distTag: 'next', effects, logger: silent });

  assert.equal(result.resumed, true);
  assert.equal(effects.publishes.length, 1);
  assert.equal(effects.publishes[0].distTag, 'next');
});

test('a missing mirror is republished rather than reported as nothing to do', () => {
  // The canonical half can land and the mirror half fail. Treating the absent
  // mirror as "nothing to repair" would leave the canonical package visible
  // with no compatibility mirror and no step that ever creates one.
  const effects = makeEffects({ published: false });

  const result = resumeFontsRelease({ version: '0.2.1', effects, logger: silent });

  assert.equal(result.resumed, true);
  assert.equal(effects.publishes.length, 1);
});

test('an unreadable mirror is resumed rather than assumed complete', () => {
  // A 404 during registry propagation, a 401/403, and a DNS failure are
  // indistinguishable from each other in npm's output, and none of them is
  // evidence that the release finished. Resuming costs an idempotent
  // republish; skipping would leave the mirror unfinished until someone
  // noticed by hand.
  for (const failure of ['npm error code E404', 'npm error code E403', 'npm error code EAI_AGAIN']) {
    const effects = makeEffects({ failWith: failure });

    const result = resumeFontsRelease({ version: '0.2.1', effects, logger: silent });

    assert.equal(result.resumed, true, `${failure} should resume`);
    assert.equal(result.reason, 'unreadable');
    assert.equal(effects.publishes.length, 1);
  }
});

test('both package names come from the publisher rather than being restated', () => {
  const effects = makeEffects({ deprecated: 'moved' });

  resumeFontsRelease({ version: '0.2.1', effects, logger: silent });

  const allowed = new Set([`${LEGACY_PACKAGE_NAME}@0.2.1`, `${CANONICAL_PACKAGE_NAME}@0.2.1`]);
  assert.ok(
    effects.lookups.every((spec) => allowed.has(spec)),
    `expected lookups only against the publisher's two names, saw ${effects.lookups.join(', ')}`,
  );
  assert.ok(
    effects.lookups.includes(`${CANONICAL_PACKAGE_NAME}@0.2.1`),
    'the canonical half must be checked, not just the mirror',
  );
});

test('a deprecated mirror over a missing canonical half is resumed', () => {
  // The mirror alone cannot prove a two-package release is finished. This is the
  // only credentialed step that can create the canonical half, and the verifier
  // that runs next requires both names and is blocking, so treating this as
  // complete fails the run with nothing having tried to repair it.
  const effects = makeEffects({
    published: true,
    deprecated: 'moved to @superdoc/fonts',
    canonicalPublished: false,
  });

  const result = resumeFontsRelease({ version: '0.2.1', effects, logger: silent });

  assert.equal(result.resumed, true);
  assert.equal(effects.publishes.length, 1);
  assert.equal(effects.publishes[0].version, '0.2.1');
});

test('a missing version is rejected', () => {
  assert.throws(() => resumeFontsRelease({ logger: silent }), /version is required/u);
});

test('the resumed publish is bound to the version being repaired', () => {
  // The owning release-fonts.yml (Orbit main's copy; this tree no longer carries
  // one) can fall back to an older reachable `fonts-v*` tag when
  // the branch has advanced, and prerelease bumps are never committed, so the
  // checkout's manifest and the tag can name different versions. Passing the
  // version through is what lets the publisher refuse the mismatch instead of
  // publishing or retagging whatever it happened to pack.
  const effects = makeEffects({ published: true, deprecated: '' });

  resumeFontsRelease({ version: '0.2.1', distTag: 'next', effects, logger: silent });

  assert.equal(effects.publishes.length, 1);
  assert.equal(effects.publishes[0].version, '0.2.1');
});
