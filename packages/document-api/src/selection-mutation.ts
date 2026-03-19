/**
 * Selection-based mutation adapter — the single execution interface for
 * `delete`, `replace` (text path), and `format.apply` in the new
 * SelectionTarget / ref model.
 *
 * This replaces the WriteAdapter for delete/replace and the legacy format
 * adapter for format.apply. All three operations route through the plan engine.
 */

import type { SelectionTarget, DeleteBehavior } from './types/address.js';
import type { TextMutationReceipt } from './types/receipt.js';
import type { MutationOptions } from './types/mutation-plan.types.js';
import type { InlineRunPatch } from './format/inline-run-patch.js';
import type { StoryLocator } from './types/story.types.js';

// ---------------------------------------------------------------------------
// Adapter request types
// ---------------------------------------------------------------------------

export type SelectionDeleteRequest = {
  kind: 'delete';
  target?: SelectionTarget;
  ref?: string;
  behavior: DeleteBehavior;
  /** Story locator threaded from the operation input's `in` field. */
  in?: StoryLocator;
};

export type SelectionReplaceRequest = {
  kind: 'replace';
  target?: SelectionTarget;
  ref?: string;
  text: string;
  /** Story locator threaded from the operation input's `in` field. */
  in?: StoryLocator;
};

export type SelectionFormatRequest = {
  kind: 'format';
  target?: SelectionTarget;
  ref?: string;
  inline: InlineRunPatch;
  /** Story locator threaded from the operation input's `in` field. */
  in?: StoryLocator;
};

export type SelectionMutationRequest = SelectionDeleteRequest | SelectionReplaceRequest | SelectionFormatRequest;

// ---------------------------------------------------------------------------
// Adapter interface
// ---------------------------------------------------------------------------

/**
 * Adapter that the super-editor plan engine implements for selection-based
 * mutations. All three core mutation ops (delete, replace-text, format.apply)
 * go through this single interface.
 */
export interface SelectionMutationAdapter {
  execute(request: SelectionMutationRequest, options?: MutationOptions): TextMutationReceipt;
}
