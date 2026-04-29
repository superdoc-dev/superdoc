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

export type {
  CommentsHandle,
  CommentsSlice,
  EqualityFn,
  ReviewHandle,
  ReviewItem,
  ReviewSlice,
  SelectorFn,
  SelectionSlice,
  Subscribable,
  SuperDocEditorLike,
  SuperDocLike,
  SuperDocUI,
  SuperDocUIOptions,
  SuperDocUIState,
} from './types.js';
