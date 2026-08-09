import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const { isVersionLookupNotFoundError } = require('../npm-registry.cjs');

const asError = (stderr) => ({ stderr });

test('a version that does not exist reads as not found', () => {
  assert.equal(
    isVersionLookupNotFoundError(
      asError('npm error code E404\nnpm error 404 No match found for version 99.0.0'),
    ),
    true,
  );
});

test('a package that does not exist reads as not found', () => {
  assert.equal(
    isVersionLookupNotFoundError(
      asError('npm error code E404\nnpm error 404 Not Found - GET https://registry.npmjs.org/@x/y'),
    ),
    true,
  );
});

test('a 404 for an unpublished package reads as not found', () => {
  // npm returns byte-identical text for "does not exist" and "you cannot see
  // it", both ending in the permission wording, so the registry does not leak
  // private package existence. Classifying on that phrase would reject a
  // genuinely unpublished package, which is exactly what a first publish is.
  assert.equal(
    isVersionLookupNotFoundError(
      asError(
        'npm error code E404\nnpm error 404 The requested resource could not be found or you do not have permission to access it.',
      ),
    ),
    true,
  );
});

test('auth failures never read as not found', () => {
  for (const stderr of [
    'npm error code E401 Unauthorized',
    'npm error code E403 Forbidden',
    'npm error 403 Forbidden - GET https://registry.npmjs.org/@x/y',
  ]) {
    assert.equal(isVersionLookupNotFoundError(asError(stderr)), false, stderr);
  }
});

test('transport failures never read as not found', () => {
  for (const stderr of [
    'getaddrinfo ENOTFOUND registry.npmjs.org',
    'npm error network ETIMEDOUT',
    'npm error network EAI_AGAIN',
    'socket hang up ECONNRESET',
  ]) {
    assert.equal(isVersionLookupNotFoundError(asError(stderr)), false, stderr);
  }
});

test('an unrecognised failure is not treated as absence', () => {
  // Fail closed: an error we cannot classify must stop the publish rather than
  // imply the version is free.
  assert.equal(isVersionLookupNotFoundError(asError('something unexpected went wrong')), false);
});

test('publishPackage can be driven without touching a registry', () => {
  // The single-name publisher binds its lookup once for the common path. A
  // caller that passes effects must be able to intercept both the lookup and
  // the commands, the same way the dual-name flow does, or this path can only
  // be exercised against the real registry.
  const { publishPackage } = require('../npm-publish-package.cjs');
  const calls = [];

  publishPackage({
    packageDir: 'packages/fonts',
    tag: 'next',
    logger: { log() {} },
    effects: {
      run: (command, args) => calls.push([command, ...args.slice(0, 2)]),
      runCapture: () => '0.0.0',
    },
  });

  assert.ok(calls.length > 0, 'expected the injected runner to be used');
  assert.ok(
    calls.every(([command]) => command === 'pnpm'),
    'every command should go through the injected runner',
  );
});
