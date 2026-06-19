/**
 * SuperDoc public facade: ui-react entry.
 *
 * SD-3182 under SD-3178 (Phase 3 of SD-3175). First supported-surface
 * facade entry (after the legacy mirrors in SD-3179 / SD-3180). Mirrors
 * the named surface reachable via the `superdoc/ui/react` subpath.
 *
 * Classification per SD-3147 is enforced by the public-surface metadata.
 * `useSuperDocContentControls` is preserved for compatibility.
 *
 * Strategy: re-export through the narrow `@superdoc/super-editor/ui/react`
 * subpath rather than the broad `@superdoc/super-editor` root, matching the
 * SD-3179 / SD-3180 narrow-import pattern. Keeps emitted bundles narrow.
 *
 * Rules for this file:
 *   - AIDEV-NOTE: Named exports only. No `export *`. The supported-surface
 *     contract is the explicit list below plus the SD-3147 classification.
 *   - AIDEV-NOTE: The postbuild gate `verify-public-facade-emit.cjs` parses this file
 *     and verifies that the emitted declarations expose exactly these
 *     named exports. The verifier postbuild fails on drift.
 *   - This entry does not re-export `Editor` or `EditorCommands`, so the
 *     verifier skips the command-signature probe.
 */
export {
  SuperDocUIProvider,
  useSuperDocUI,
  useSuperDocHost,
  useSetSuperDoc,
  useSuperDocSlice,
  useSuperDocSelection,
  useSuperDocComments,
  useSuperDocContentControls,
  useSuperDocTrackChanges,
  useSuperDocToolbar,
  useSuperDocCommand,
  useSuperDocDocument,
  useSuperDocFontOptions,
  useSuperDocFontSizeOptions,
  useSuperDocZoom,
} from '@superdoc/super-editor/ui/react';

export type { SuperDocHost } from '@superdoc/super-editor/ui/react';
