/**
 * SuperDoc public facade: ui entry.
 *
 * SD-3183 under SD-3178 (Phase 3 of SD-3175). Largest supported-surface
 * facade entry. Mirrors the 70-name surface today reachable via the
 * `superdoc/ui` subpath: 3 runtime values + 67 types.
 *
 * Classification per SD-3147: 49 public + 21 legacy/public-compat. All
 * 70 re-exported through the facade — tier distinction is documentation
 * posture, not facade inclusion.
 *
 * Strategy: re-export through the narrow `@superdoc/super-editor/ui`
 * subpath rather than the broad `@superdoc/super-editor` root. SD-2803
 * created that subpath specifically so consumers of `superdoc/ui` do
 * not drag the editor root/main barrel — Vue components, the SuperDoc
 * app shell, and other top-level UI infrastructure. The bundle still
 * pulls SuperConverter, jszip, xml-js, and similar shared chunks
 * because the UI controller depends on them transitively; what the
 * narrow path avoids is the *app-shell* / root-barrel chunk.
 *
 * Rules for this file:
 *   - AIDEV-NOTE: Named exports only. No `export *`.
 *   - AIDEV-NOTE: Re-export source MUST stay `@superdoc/super-editor/ui`,
 *     NOT `@superdoc/super-editor`. Routing through the root barrel
 *     regresses the strategic UI bundle shape by pulling the app-shell
 *     chunk (Vue components, SuperDoc app, etc.) — that's the
 *     regression of SD-2803. `packages/superdoc/scripts/audit-bundle.cjs`
 *     enforces this on the emitted `dist/public/ui.es.js` by rejecting
 *     side-effect imports of the root/main barrel chunks. It does NOT
 *     and cannot claim the bundle is shared-chunk-free — SuperConverter,
 *     jszip, and xml-js chunks are pulled by both `dist/ui.es.js` and
 *     `dist/public/ui.es.js` because the UI controller depends on them.
 *   - AIDEV-NOTE: Adding or removing an export here updates the
 *     `expectedNames` for the `ui` entry in `FACADE_ENTRIES` inside
 *     `packages/superdoc/scripts/verify-public-facade-emit.cjs` in the
 *     same PR. The verifier postbuild fails on drift.
 *   - This entry does not re-export `Editor` or `EditorCommands`, so
 *     the verifier skips the command-signature probe.
 */
export {
  BUILT_IN_COMMAND_IDS,
  createSuperDocUI,
  shallowEqual,
} from '@superdoc/super-editor/ui';

export type {
  CommandHandle,
  CommandsHandle,
  CommentAddress,
  CommentInfo,
  CommentsHandle,
  CommentsListQuery,
  CommentsListResult,
  CommentsSlice,
  ContentControlViewportAddress,
  ContentControlsHandle,
  ContentControlsSlice,
  ContextMenuContribution,
  ContextMenuItem,
  ContextMenuWhenInput,
  CustomCommandHandle,
  CustomCommandHandleState,
  CustomCommandRegistration,
  CustomCommandRegistrationResult,
  DocumentExportInput,
  DocumentHandle,
  DocumentSlice,
  DynamicCommandHandle,
  EntityAddress,
  EqualityFn,
  Receipt,
  ScrollIntoViewInput,
  ScrollIntoViewOutput,
  SelectionAnchorRectOptions,
  SelectionCapture,
  SelectionHandle,
  SelectionInfo,
  SelectionPoint,
  SelectionRestoreResult,
  SelectionSlice,
  SelectionTarget,
  SelectorFn,
  Subscribable,
  SuperDocEditorLike,
  SuperDocLike,
  SuperDocUI,
  SuperDocUIOptions,
  SuperDocUIScope,
  SuperDocUIState,
  TextAddress,
  TextSegment,
  TextTarget,
  ToolbarCommandHandleState,
  ToolbarHandle,
  ToolbarSnapshotSlice,
  TrackChangeInfo,
  TrackChangesHandle,
  TrackChangesItem,
  TrackChangesListResult,
  TrackChangesSlice,
  TrackedChangeAddress,
  UIToolbarCommandState,
  ViewportContext,
  ViewportContextAtInput,
  ViewportEntityAddress,
  ViewportEntityAtInput,
  ViewportEntityHit,
  ViewportGetRectInput,
  ViewportHandle,
  ViewportPositionAtInput,
  ViewportPositionHit,
  ViewportRect,
  ViewportRectResult,
} from '@superdoc/super-editor/ui';
