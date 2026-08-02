// Dist-tag resolution for stable releases and release recovery.
//
// Lives in its own module because release-local-stable.mjs runs the release
// loop at import time and so cannot be imported by a test. The rule below is
// the one that decides which npm dist-tag a recovered publish lands on, which
// makes it worth testing directly rather than by inspection.
//
// `superdoc` is published to one npm package name by two release lines. V2
// owns `latest` and `next`; V1 is maintenance-only under `legacy`. Recovery
// derives its tag from the version string, not from the semantic-release
// channel, so a package whose stable releases do not belong on `latest` must
// say so via `stableDistTag` on its descriptor. Without that, a resumed V1
// publish would put a V1 version back on `latest`.

// npm dist-tag for a package version, given that package's descriptor.
//
// Prereleases always land on `next`. Stable versions land on the package's
// `stableDistTag` when it declares one, and on `latest` otherwise.
export function getDistTagForVersion(version, pkg = null) {
  if (version.includes('-next.')) return 'next';
  return pkg?.stableDistTag ?? 'latest';
}
