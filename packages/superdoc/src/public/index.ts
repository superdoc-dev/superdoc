/**
 * SuperDoc public facade: root entry.
 *
 * SD-3178 + SD-3185 (Phase 3 of SD-3175). The path-as-contract source of
 * truth for `superdoc` consumers: anything exported here is part of the
 * public contract: either supported public API or explicitly documented
 * legacy compatibility. Anything outside is implementation detail. Phase
 * 4 (the contract switch) flips `package.json#exports` to point at the
 * emitted declarations under this tree.
 *
 * Surface organization:
 *
 *   1. **Configuration and lifecycle.** `SuperDoc` class + its `Config`.
 *      Editor instance type (`Editor`) plus the Document API surface
 *      reachable as `editor.doc.*`.
 *   2. **Document API (recommended programmatic surface).** `DocumentApi`
 *      and the supporting selection / address / range / bookmark / block
 *      / protection types already typed by today's `superdoc` root entry.
 *      Per `packages/superdoc/AGENTS.md` and the `@deprecated` tags on
 *      `editor.commands` in `Editor.ts`: this is the supported way to
 *      read and mutate document content programmatically.
 *
 *      Caveat: Document API does not cover every legacy editor command
 *      1:1 today. Field annotations, document section management, AI
 *      marks, search-session UI state, and several format/diff helpers
 *      exist as runtime commands without a direct Document API analogue.
 *      The legacy command surface is being audited against the Document
 *      API in a separate ticket; consumers reaching for those features
 *      should expect to keep using `editor.commands.*` for now.
 *   3. **Legacy compat — typed for backward compat, not advertised.**
 *      `EditorCommands` and the command-augmentation infrastructure
 *      type the deprecated `editor.commands.*` surface. They remain
 *      exported so existing TS consumers keep compiling; new code should
 *      use `editor.doc.*` (Document API).
 *
 * Rules for this file:
 *   - AIDEV-NOTE: Named exports only. No `export *` from implementation
 *     barrels. `export *` re-introduces the leak this facade exists to
 *     close — see SD-3175 (path-as-contract umbrella) for context.
 *   - Explicit `.js` source specifiers (the dts plugin emits `.js`
 *     specifiers; source consistency keeps the two aligned).
 *   - AIDEV-NOTE: Adding or removing an export here is a deliberate
 *     public-API decision. In the same PR, update the `expectedNames`
 *     for the `root (./index)` entry in `FACADE_ENTRIES` inside
 *     `packages/superdoc/scripts/verify-public-facade-emit.cjs` and
 *     link to SD-3175 (or a child ticket) for reviewer sign-off.
 *     Skipping the expectedNames update fails the postbuild gate.
 *   - AIDEV-NOTE: Document API additions are encouraged (it is the
 *     supported programmatic contract). Editor-command additions are
 *     not — that surface is deprecated. New entries that type the
 *     `editor.commands.*` surface should be flagged in review.
 */

// (1) Configuration and lifecycle.
export { SuperDoc } from '../core/SuperDoc.js';
export type { Config } from '../core/types/index.js';
export { Editor } from '@superdoc/super-editor';

// (2) Document API — the recommended programmatic surface (`editor.doc.*`).
// This set mirrors the JSDoc `@typedef` block in `packages/superdoc/src/index.js`
// and is already covered by `tests/consumer-typecheck/src/all-public-types.ts`.
// It is not surface growth; it is preserving the current root type contract
// in the new path-as-contract facade.
export type {
  DocumentApi,
  SelectionApi,
  SelectionInfo,
  SelectionCurrentInput,
  ScrollIntoViewInput,
  ScrollIntoViewOutput,
  ResolveRangeOutput,
  TextTarget,
  TextAddress,
  TextSegment,
  EntityAddress,
  BlocksListResult,
  BookmarkInfo,
  BookmarkAddress,
  BlockNavigationAddress,
  CommentAddress,
  TrackedChangeAddress,
  NavigableAddress,
  StoryLocator,
  DocumentProtectionState,
} from '@superdoc/super-editor';

// (3) Legacy command-augmentation infrastructure — typed for backward
// compat, not advertised.
/**
 * @deprecated Editor commands are deprecated and will be removed in a
 * future version. Use the Document API via `editor.doc.*` for
 * programmatic document reads and mutations. See
 * `packages/superdoc/AGENTS.md` and the `@deprecated` tags on
 * `editor.commands` in `Editor.ts` (lines 1411, 1597, 1605).
 */
export type { EditorCommands } from '@superdoc/super-editor';
