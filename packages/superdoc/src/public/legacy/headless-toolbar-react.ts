/**
 * SuperDoc public facade: legacy headless-toolbar React framework helper.
 *
 * SD-3207 under SD-3178 (Phase 3 of SD-3175). Mirrors the existing
 * `packages/superdoc/src/headless-toolbar-react.js` re-export under the
 * path-as-contract facade. Phase 4 (the contract switch) flips
 * `package.json#exports` `./headless-toolbar/react` to point at the
 * emitted declarations under this tree.
 *
 * Classification: **legacy public compatibility surface.** Paired with
 * `legacy/headless-toolbar.ts`; same posture. New custom UI integrations
 * should use `superdoc/ui/react` (the strategic typed React binding).
 * See `docs/architecture/package-boundaries.md` Decision 4.
 *
 * Rules for this file:
 *   - AIDEV-NOTE: Named exports only. Growing this list ships a new
 *     public symbol through a legacy compat path, which violates the
 *     no-growth posture on this entry. The corresponding snapshot is
 *     `tests/consumer-typecheck/snapshots/superdoc-headless-toolbar-react.txt`.
 *   - AIDEV-NOTE: Adding or removing an export here updates the
 *     `expectedNames` for the `legacy/headless-toolbar-react` entry in
 *     `FACADE_ENTRIES` inside
 *     `packages/superdoc/scripts/verify-public-facade-emit.cjs` in the
 *     same PR. Skipping that step fails the postbuild gate.
 *   - This entry does not re-export `Editor` or `EditorCommands`, so
 *     the verifier skips the command-signature probe here.
 */

export { useHeadlessToolbar } from '@superdoc/super-editor/headless-toolbar/react';
