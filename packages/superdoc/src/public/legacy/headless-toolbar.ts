/**
 * SuperDoc public facade: legacy headless-toolbar entry.
 *
 * SD-3179 under SD-3178 (Phase 3 of SD-3175). This file mirrors the
 * 16-name surface today reachable as the pair of
 * `packages/superdoc/src/headless-toolbar.js` (3 runtime values) and
 * `packages/superdoc/src/headless-toolbar.d.ts` (13 hand-maintained type
 * re-exports). Combining them into a single `.ts` source lets the dts
 * pipeline emit both `.d.ts` and `.d.cts` from one place.
 *
 * Classification: **legacy public compatibility surface.** The
 * `superdoc/headless-toolbar` subpath is kept exported and typed so
 * existing consumers continue to compile. It is not the recommended
 * path for new custom UI integrations. New work should use
 * `superdoc/ui` and `superdoc/ui/react` instead.
 *
 * Rules for this file:
 *   - AIDEV-NOTE: Named exports only. No `export *` from
 *     `@superdoc/super-editor`. Growing this list ships a new public
 *     symbol through a legacy compat path, which violates the
 *     no-growth posture this entry is classified under in
 *     `docs/architecture/package-boundaries.md` Decision 4.
 *   - AIDEV-NOTE: Adding or removing an export here updates the
 *     The postbuild gate `verify-public-facade-emit.cjs` parses this file
 *     and verifies that the emitted declarations expose exactly these
 *     named exports. No second hand-maintained list to keep in sync.
 *     same PR. Skipping that step fails the postbuild gate.
 *   - This entry does not re-export `Editor` or `EditorCommands`, so
 *     the verifier skips the command-signature probe here. The root
 *     entry (`../index.ts`) keeps that probe.
 *   - Source still imports from the broad `@superdoc/super-editor`
 *     entry. Tightening the type edge to the deeper
 *     `super-editor/src/headless-toolbar/index.js` is not a priority
 *     for a legacy frozen surface; the goal here is correct types,
 *     not minimal graph.
 */
export {
  createHeadlessToolbar,
  headlessToolbarConstants,
  headlessToolbarHelpers,
} from '@superdoc/super-editor';

export type {
  CreateHeadlessToolbarOptions,
  HeadlessToolbarController,
  HeadlessToolbarSurface,
  HeadlessToolbarSuperdocHost,
  PublicToolbarItemId,
  ToolbarCommandState,
  ToolbarCommandStates,
  ToolbarContext,
  ToolbarExecuteFn,
  ToolbarPayloadMap,
  ToolbarSnapshot,
  ToolbarTarget,
  ToolbarValueMap,
} from '@superdoc/super-editor';
