#!/usr/bin/env node
/**
 * Finish a fonts release that stopped partway.
 *
 * semantic-release creates the `fonts-v*` tag before its publish plugin runs,
 * so any failure inside the publish leaves a tag at HEAD. A rerun then no-ops
 * the release step, and the workflow goes green over an incomplete release.
 * Three states are reachable that way, in publish order:
 *
 *   1. canonical published, mirror not
 *   2. both published, deprecation not applied
 *   3. nothing published (the tag landed, the publish never started)
 *
 * Rather than repairing each state separately, this delegates to the publisher.
 * `publishWithMirror` is already resumable by design: it packs first, compares
 * an existing version against the tarball in hand, short-circuits a matching
 * one to a dist-tag repair, publishes a missing one, and reapplies the mirror
 * deprecation at the end. That covers all three states, and it fails closed on
 * a version that exists but was built from different bytes.
 *
 * The check before delegating is deliberately conservative: it only skips when
 * the whole release is provably complete, meaning the canonical version exists
 * AND the mirror is published AND deprecated. Anything else, including a version
 * npm cannot currently read, runs the publisher. A transient 404 during registry
 * propagation therefore costs one idempotent republish rather than silently
 * leaving a release unfinished.
 *
 * AIDEV-NOTE: All three conditions are load-bearing. Reading only the mirror
 * would call a release complete while the canonical half is missing, and this is
 * the only credentialed step that can create it - the verifier that runs next
 * requires both names and is blocking, so the run would fail with nothing having
 * tried to repair it.
 */
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const {
  CANONICAL_PACKAGE_NAME,
  LEGACY_PACKAGE_NAME,
  publishFontsPackage,
} = require('./publish-fonts.cjs');

const rootDir = path.resolve(__dirname, '..');

const defaultRegistry = () => process.env.NPM_CONFIG_REGISTRY || 'https://registry.npmjs.org';

const defaultEffects = {
  runCapture: (command, args) =>
    execFileSync(command, args, { cwd: rootDir, encoding: 'utf8' }).trim(),
  publish: publishFontsPackage,
};

/**
 * Read one field of a published version.
 *
 * Returns null when the version is not readable for any reason, including a
 * 404, an auth failure, or a network error. Callers must treat null as
 * "unknown", never as "absent": npm returns byte-identical 404 text for a
 * package that does not exist and one the caller cannot see, and a version
 * published seconds ago can 404 while the registry propagates.
 */
const viewField = (spec, field, effects) => {
  try {
    return effects.runCapture('npm', ['view', spec, field, '--registry', defaultRegistry()]);
  } catch {
    return null;
  }
};

const resumeFontsRelease = ({
  version,
  distTag = 'latest',
  canonicalName = CANONICAL_PACKAGE_NAME,
  mirrorName = LEGACY_PACKAGE_NAME,
  build = true,
  effects = defaultEffects,
  logger = console,
} = {}) => {
  if (!version) throw new Error('version is required');

  const spec = `${mirrorName}@${version}`;
  const published = viewField(spec, 'version', effects);
  const deprecated = published === null ? null : viewField(spec, 'deprecated', effects);

  // A release is two packages, so the mirror alone cannot prove it is finished.
  // The publisher goes canonical first, which makes a deprecated mirror over a
  // missing canonical unlikely rather than impossible - an unpublish, a partial
  // registry state, or a mirror published by the pre-migration publisher all
  // produce it. Skipping there would leave the only credentialed step that can
  // create the canonical half doing nothing, and hand a repairable release to a
  // blocking verifier that requires both names.
  const canonicalSpec = `${canonicalName}@${version}`;
  const canonicalPublished = viewField(canonicalSpec, 'version', effects);

  // All three must be affirmatively true to skip. A null on any side means the
  // registry did not answer, which is not evidence that the work is done.
  if (canonicalPublished && published && deprecated) {
    logger.log(`${canonicalSpec} and ${spec} are published and the mirror is deprecated; the release is complete.`);
    return { resumed: false, reason: 'already-complete' };
  }

  logger.log(
    published === null || canonicalPublished === null
      ? `${canonicalSpec} or ${spec} could not be read; resuming the publish to be sure it is complete.`
      : `${version} is incomplete (canonical: ${Boolean(canonicalPublished)}, mirror: ${Boolean(published)}, deprecated: ${Boolean(deprecated)}); resuming the publish.`,
  );

  // Idempotent: matching versions short-circuit to a dist-tag repair, missing
  // ones publish, and the deprecation is reapplied either way.
  //
  // `version` is passed, not just used for the lookup above: the publisher packs
  // the current checkout, which can hold a different version than the tag that
  // sent us here. Binding it turns that into a hard failure instead of a publish
  // or retag of the wrong release. See `assertPackedVersion`.
  effects.publish({ distTag, version, build, logger });

  return {
    resumed: true,
    reason: published === null || canonicalPublished === null ? 'unreadable' : 'incomplete',
  };
};

module.exports = { resumeFontsRelease, viewField };

if (require.main === module) {
  const flag = (name) => {
    const index = process.argv.indexOf(name);
    return index === -1 ? undefined : process.argv[index + 1];
  };

  try {
    resumeFontsRelease({ version: flag('--version'), distTag: flag('--dist-tag') || 'latest' });
  } catch (error) {
    console.error(error.message || error);
    process.exitCode = 1;
  }
}
