/**
 * `superdoc/ui` — browser-only UI controller for SuperDoc.
 *
 * The architectural counterpart to the Document API contract:
 *
 *   - `editor.doc.*` — request/response operations, runs server + client
 *   - `createSuperDocUI({ superdoc })` — browser-only state controller
 *
 * Domain namespaces (`ui.toolbar`, `ui.commands`, `ui.comments`,
 * `ui.trackChanges`, `ui.viewport`, `ui.selection`, `ui.fonts`) are filed as
 * sibling tickets under SD-2667 and layer on top of the `ui.select`
 * substrate exported here.
 *
 * Source lives in `packages/super-editor/src/ui/`; the public sub-entry
 * is `superdoc/ui` (re-exported from `packages/superdoc/src/ui.js`),
 * mirroring the `superdoc/headless-toolbar` pattern.
 */

export { createSuperDocUI } from './create-super-doc-ui.js';
export { shallowEqual } from './equality.js';
export { BUILT_IN_COMMAND_IDS } from '../headless-toolbar/types.js';
export type { PublicToolbarItemId } from '../headless-toolbar/types.js';

// Re-export the document-side shapes the controller surfaces so
// consumers can type their components without reaching into the
// `@superdoc/document-api` package directly. The set tracks what
// `ui.*` actually returns / accepts: address shapes for the selection
// slice and entity targets, list-result shapes for the comments and
// track-changes snapshots, and the receipt union for action methods.
// Add a new export here when a controller method's return type or
// argument type pulls in another doc-api shape.
export type {
  // Address / target shapes for selection + viewport + entity ops.
  // `state.selection.target` returns TextTarget; .selectionTarget
  // returns SelectionTarget; viewport.getRect / scrollIntoView take
  // EntityAddress / ScrollIntoViewInput.
  TextTarget,
  TextSegment,
  TextAddress,
  SelectionTarget,
  SelectionPoint,
  EntityAddress,
  CommentAddress,
  TrackedChangeAddress,
  // The full SelectionInfo projection. The controller mirrors a
  // subset of this onto state.selection, but consumers integrating
  // with editor.doc.selection.current() directly may want the full
  // shape for typing custom resolvers.
  SelectionInfo,

  // Comments slice items and action shapes. `state.comments.items`
  // is `CommentsListResult['items']`; consumers iterating over it can
  // type the element parameter as `CommentInfo`. Query / result /
  // create / patch shapes are useful for sidebars that drive the
  // doc-api directly via `editor.doc.comments.*`.
  CommentInfo,
  CommentsListQuery,
  CommentsListResult,

  // Track-changes slice items. `TrackChangeInfo` is the per-item shape
  // exposed on `state.trackChanges.items[].change`; the result wrapper
  // carries pagination + total.
  TrackChangeInfo,
  TrackChangesListResult,

  // Receipt union returned by every doc-api mutation routed through
  // ui.comments / ui.trackChanges action methods (createFromSelection,
  // resolve, reopen, delete, accept, reject, acceptAll, rejectAll).
  Receipt,

  // Viewport scroll API shapes. ui.viewport.scrollIntoView /
  // ui.comments.scrollTo / ui.trackChanges.scrollTo return / accept
  // these.
  ScrollIntoViewInput,
  ScrollIntoViewOutput,
} from '@superdoc/document-api';

export type {
  // Substrate
  EqualityFn,
  FontFamilyOption,
  FontSizeOption,
  SelectorFn,
  Subscribable,

  // Host shapes (structural)
  SuperDocEditorLike,
  SuperDocLike,

  // Controller
  SuperDocUI,
  SuperDocUIOptions,
  SuperDocUIScope,
  SuperDocUIState,

  // Selection
  SelectionAnchorRectOptions,
  SelectionCapture,
  SelectionHandle,
  SelectionRestoreResult,
  SelectionSlice,

  // Toolbar + commands
  CommandHandle,
  CommandsHandle,
  ContextMenuContribution,
  ContextMenuItem,
  ContextMenuWhenInput,
  CustomCommandHandle,
  CustomCommandHandleState,
  CustomCommandRegistration,
  CustomCommandRegistrationResult,
  DynamicCommandHandle,
  FontsHandle,
  FontsSlice,
  ToolbarCommandHandleState,
  ToolbarHandle,
  ToolbarSnapshotSlice,
  UIToolbarCommandState,

  // Comments
  CommentAnchorCapture,
  CommentsHandle,
  CommentsSlice,

  // Track changes
  TrackChangesHandle,
  TrackChangesItem,
  TrackChangePointHit,
  TrackChangesSlice,

  // Content controls (SD-3157)
  ContentControlsHandle,
  ContentControlsSlice,

  // Anchored metadata (SD-3204)
  MetadataHandle,

  // Viewport
  ContentControlViewportAddress,
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

  // Document
  DocumentExportInput,
  DocumentHandle,
  DocumentSlice,
  ZoomHandle,
  ZoomMode,
  ZoomSlice,
  ZoomViewportMetrics,
} from './types.js';
