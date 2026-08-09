import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { auditTarball } from '../audit-publish-artifact.mjs';
import { verifyPublishedPackage, verifyPublishedPair } from '../verify-published-package.mjs';

const require = createRequire(import.meta.url);
const { KNOWN_ARTIFACT_VIOLATIONS } = require('../publish-fonts.cjs');

// The fonts release most recently published under the legacy name. Immutable,
// so it is a stable fixture for both the install checks and the artifact
// baseline.
const FONTS_MIRROR = '@superdoc-dev/fonts';
const FONTS_VERSION = '0.2.0';
const REGISTRY = process.env.NPM_CONFIG_REGISTRY || 'https://registry.npmjs.org';
const silent = { log() {} };

// These tests hit the real registry. This version is published and immutable,
// so it is a stable fixture for both the verifier's guarantees and the fonts
// artifact baseline.
const FIXTURE = { packageName: FONTS_MIRROR, version: FONTS_VERSION };

test('a check that neither imports nor opts into install-only is rejected', () => {
  // An install that never imports proves the tarball downloaded, nothing more.
  assert.throws(
    () => verifyPublishedPackage({ ...FIXTURE, logger: silent }),
    /pass importCheck .* or installOnly/u,
  );
});

test('a pair whose two names are equal is rejected', () => {
  // Runs no install: the guard must reject before either verification starts.
  // Otherwise a typo verifies the canonical package twice and reports a green
  // pair while the mirror, the whole reason the pair exists, goes untested.
  assert.throws(
    () =>
      verifyPublishedPair({
        canonicalName: FIXTURE.packageName,
        mirrorName: FIXTURE.packageName,
        version: FIXTURE.version,
        installOnly: true,
        logger: silent,
      }),
    /names must differ/u,
  );
});

test('a pair whose import check omits the placeholder is rejected', () => {
  assert.throws(
    () =>
      verifyPublishedPair({
        canonicalName: '@superdoc/fonts',
        mirrorName: FIXTURE.packageName,
        version: FIXTURE.version,
        importCheck: "await import('@superdoc/fonts');",
        logger: silent,
      }),
    /__PACKAGE__/u,
  );
});

test('secret-bearing variables are absent from the installed package environment', () => {
  // Scope: this asserts the environment scrub only. It is not a proof of
  // isolation, and should not be read as one: on Linux a child can still reach
  // the parent's secrets through /proc/<ppid>/environ, and a persisted git
  // credential lives on disk rather than in the environment. Those are handled
  // by running the verifier from a credential-free job with
  // persist-credentials: false, which no unit test can assert.
  //
  // What this does prove is that the allowlist has not silently widened to
  // admit a secret, which is the regression most likely to happen here.
  const previous = {
    NPM_TOKEN: process.env.NPM_TOKEN,
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
  };
  process.env.NPM_TOKEN = 'canary-npm-token';
  process.env.ANTHROPIC_API_KEY = 'canary-anthropic-key';

  try {
    const { output } = verifyPublishedPackage({
      ...FIXTURE,
      importCheck:
        "console.log(JSON.stringify(Object.keys(process.env).filter((k) => /TOKEN|KEY|SECRET|PASSWORD/i.test(k))));",
      logger: silent,
    });

    assert.deepEqual(JSON.parse(output), []);
  } finally {
    process.env.NPM_TOKEN = previous.NPM_TOKEN;
    process.env.ANTHROPIC_API_KEY = previous.ANTHROPIC_API_KEY;
    if (previous.NPM_TOKEN === undefined) delete process.env.NPM_TOKEN;
    if (previous.ANTHROPIC_API_KEY === undefined) delete process.env.ANTHROPIC_API_KEY;
  }
});

test('home directories are redirected, not just HOME', () => {
  // USERPROFILE matters as much as HOME: it is what Windows resolves `~` and
  // per-user npm config from, so leaving it pointed at the real profile would
  // hand installed code the caller's npmrc.
  const { output } = verifyPublishedPackage({
    ...FIXTURE,
    importCheck:
      "console.log(JSON.stringify({ home: process.env.HOME, userProfile: process.env.USERPROFILE }));",
    logger: silent,
  });

  const { home, userProfile } = JSON.parse(output);
  assert.match(home, /superdoc-verify-home-/u);
  assert.match(userProfile, /superdoc-verify-home-/u);
  assert.notEqual(home, process.env.HOME);
});

test('a package that fails to import fails the check', () => {
  assert.throws(() =>
    verifyPublishedPackage({
      ...FIXTURE,
      importCheck: "await import('@superdoc-dev/fonts/does-not-exist');",
      logger: silent,
    }),
  );
});

test('a working package passes and reports its resolved version', () => {
  const result = verifyPublishedPackage({
    ...FIXTURE,
    importCheck: "const m = await import('@superdoc-dev/fonts'); console.log(Object.keys(m).length);",
    logger: silent,
  });

  assert.equal(result.version, '0.2.0');
  assert.ok(Number(result.output) > 0, 'expected the package to export something');
});

test('install-only mode is allowed when opted into explicitly', () => {
  const result = verifyPublishedPackage({ ...FIXTURE, installOnly: true, logger: silent });
  assert.equal(result.version, '0.2.0');
  assert.equal(result.output, '');
});

test('the fonts artifact baseline still matches the published package', () => {
  // The hermetic baseline tests use a synthetic tarball. This one pins that
  // baseline to reality: if the real package's contents drift, the exemption
  // list is wrong and the next release would either fail confusingly or carry a
  // stale entry.
  const dir = mkdtempSync(path.join(os.tmpdir(), 'fonts-baseline-real-'));

  try {
    // Pin the registry. Without it the pack follows whatever mirror or proxy the
    // environment configures, so the baseline could be compared against an
    // artifact that is not the published one, or fail for reasons unrelated to
    // the package.
    execFileSync(
      'npm',
      ['pack', `${FONTS_MIRROR}@${FONTS_VERSION}`, '--registry', REGISTRY, '--silent'],
      { cwd: dir, stdio: ['ignore', 'pipe', 'pipe'] },
    );
    const [tarball] = readdirSync(dir).filter((entry) => entry.endsWith('.tgz'));
    assert.ok(tarball, 'expected npm pack to produce a tarball');

    const { violations } = auditTarball(path.join(dir, tarball));
    assert.deepEqual(
      [...violations].sort(),
      [...KNOWN_ARTIFACT_VIOLATIONS].sort(),
      'the published fonts artifact no longer matches KNOWN_ARTIFACT_VIOLATIONS in publish-fonts.cjs',
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
