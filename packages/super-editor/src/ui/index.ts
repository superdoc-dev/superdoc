/**
 * `superdoc/ui` — browser-only UI controller for SuperDoc.
 *
 * The architectural counterpart to the Document API contract:
 *
 *   - `editor.doc.*` — request/response operations, runs server + client
 *   - `createSuperDocUI({ superdoc })` — browser-only state controller
 *
 * Domain namespaces (`ui.toolbar`, `ui.commands`, `ui.comments`,
 * `ui.review`, `ui.viewport`, `ui.selection`) are filed as sibling
 * tickets under SD-2667 and layer on top of the `ui.select` substrate
 * exported here.
 *
 * Source lives in `packages/super-editor/src/ui/`; the public sub-entry
 * is `superdoc/ui` (re-exported from `packages/superdoc/src/ui.js`),
 * mirroring the `superdoc/headless-toolbar` pattern.
 */

export { createSuperDocUI } from './create-super-doc-ui.js';
export { shallowEqual } from './equality.js';

// Re-export the document-side address shapes the controller surfaces
// so consumers can type their components without reaching into the
// `@superdoc/document-api` package directly. The full type re-export
// pass is tracked separately (SD-2815); these are the shapes the
// selection slice exposes today.
export type {
  TextTarget,
  TextSegment,
  TextAddress,
  SelectionTarget,
  SelectionPoint,
  EntityAddress,
} from '@superdoc/document-api';

export type {
  // Substrate
  EqualityFn,
  SelectorFn,
  Subscribable,

  // Host shapes (structural)
  SuperDocEditorLike,
  SuperDocLike,

  // Controller
  SuperDocUI,
  SuperDocUIOptions,
  SuperDocUIState,

  // Selection
  SelectionHandle,
  SelectionSlice,

  // Toolbar + commands
  CommandHandle,
  CommandsHandle,
  CustomCommandHandle,
  CustomCommandHandleState,
  CustomCommandRegistration,
  CustomCommandRegistrationResult,
  ToolbarCommandHandleState,
  ToolbarHandle,
  ToolbarSnapshotSlice,
  UIToolbarCommandState,

  // Comments
  CommentsHandle,
  CommentsSlice,

  // Review
  ReviewHandle,
  ReviewItem,
  ReviewSlice,

  // Viewport
  ViewportGetRectInput,
  ViewportHandle,
  ViewportRect,
  ViewportRectResult,
} from './types.js';
