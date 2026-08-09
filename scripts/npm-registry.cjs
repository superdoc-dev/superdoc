#!/usr/bin/env node
//
// npm-registry.cjs - shared registry primitives for the publish scripts.
//
// Both the single-name publisher and the dual-name mirror publisher need to ask
// the same questions: does this version exist, and what does npm think it was
// built from. Keeping one implementation means a fix to the not-found detection
// or the lookup shape applies to every publish path at once.

const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const { readFileSync } = require('node:fs');
const path = require('node:path');

const rootDir = path.resolve(__dirname, '..');
const defaultRegistry = () => process.env.NPM_CONFIG_REGISTRY || 'https://registry.npmjs.org';

/**
 * Default side-effecting operations, injected so publish sequences can be
 * tested without a registry.
 */
const defaultEffects = {
  run: (command, args, cwd = rootDir) => execFileSync(command, args, { stdio: 'inherit', cwd }),
  runCapture: (command, args, cwd = rootDir) =>
    execFileSync(command, args, { cwd, encoding: 'utf8' }).trim(),
};

/**
 * A registry lookup that failed because the package or version does not exist,
 * as opposed to a network or auth failure. The distinction matters: the first
 * means "not published yet, go ahead", the second must not be swallowed.
 */
const isVersionLookupNotFoundError = (error) => {
  const details = [error?.stderr, error?.stdout, error?.message].filter(Boolean).join('\n');

  // Auth and transport failures must never read as "not published". Treating a
  // 401, a 403, or a DNS failure as absence would let a publish proceed on the
  // belief that the version is free.
  if (/\bE40[13]\b|\bEAI_AGAIN\b|\bENOTFOUND\b|\bETIMEDOUT\b|\bECONNRESET\b/i.test(details)) {
    return false;
  }

  // AIDEV-NOTE: A 404 cannot be narrowed further. npm returns byte-identical
  // text for a package that does not exist and one the caller cannot see, both
  // ending in "could not be found or you do not have permission to access it",
  // deliberately, so the registry does not leak the existence of private
  // packages. Any attempt to classify on that wording rejects genuinely
  // unpublished packages, which is what a first publish looks like.
  //
  // The safety net is elsewhere: publishing a version that already exists is a
  // hard error at the registry, and every mirror publish re-checks. What this
  // must not do is misread an auth or network failure, which the guard above
  // covers.
  return /\bE404\b|Not found|not found|No match found/i.test(details);
};

const viewField = (effects, packageName, version, field) => {
  try {
    const value = effects.runCapture(
      'npm',
      ['view', `${packageName}@${version}`, field, '--registry', defaultRegistry()],
      rootDir,
    );
    const trimmed = value ? value.trim() : '';
    // npm prints nothing for a field a version does not carry. Treat the
    // stringified-undefined sentinel as absent too: a caller comparing a
    // checksum must never mistake it for a real value, because that turns a
    // legitimate resume into a hard failure.
    if (!trimmed || trimmed === 'undefined' || trimmed === 'null') return null;
    return trimmed;
  } catch (error) {
    if (isVersionLookupNotFoundError(error)) return null;
    throw error;
  }
};

const makeRegistryLookup =
  (effects = defaultEffects) =>
  (packageName, version) =>
    viewField(effects, packageName, version, 'version') !== null;

/**
 * npm's recorded checksums for a published version.
 *
 * `dist.integrity` is the modern sha512 field; `dist.shasum` is the legacy sha1
 * every version carries. Older packages predate integrity, so both are read and
 * whichever exists is used for comparison.
 */
const makeChecksumLookup =
  (effects = defaultEffects) =>
  (packageName, version) => ({
    integrity: viewField(effects, packageName, version, 'dist.integrity'),
    shasum: viewField(effects, packageName, version, 'dist.shasum'),
  });

const tarballIntegrity = (tarballPath) =>
  `sha512-${createHash('sha512').update(readFileSync(tarballPath)).digest('base64')}`;

const tarballShasum = (tarballPath) =>
  createHash('sha1').update(readFileSync(tarballPath)).digest('hex');

module.exports = {
  defaultEffects,
  defaultRegistry,
  isVersionLookupNotFoundError,
  makeChecksumLookup,
  makeRegistryLookup,
  rootDir,
  tarballIntegrity,
  tarballShasum,
};
