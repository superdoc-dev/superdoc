/**
 * Hand-maintained allowlist for the SuperDoc JSDoc ratchet
 * (`packages/superdoc/scripts/check-jsdoc.cjs`).
 *
 * The ratchet fails when a NEW public-reachable .js file with JSDoc
 * type annotations lands without `// @ts-check`. The expectation is
 * that new public code opts into checkJs. This allowlist exists for
 * the rare cases where that isn't appropriate:
 *
 *   - Files vendored from third-party sources with their own JSDoc
 *   - Intentionally untyped boundary shims that exist for runtime
 *     reasons (e.g. lazy loader stubs)
 *   - Files where adding `// @ts-check` would force a downstream
 *     refactor that's tracked separately
 *
 * Each entry MUST carry a one-line reason. The key is the repo-relative
 * path; the value is the reason. Empty today — every public JSDoc file
 * is either auto-gated (has `// @ts-check`) or tracked in
 * `jsdoc-debt-snapshot.json` for later opt-in.
 */
module.exports = {
  // 'packages/.../some-vendored-file.js': 'reason this file is exempt',
};
