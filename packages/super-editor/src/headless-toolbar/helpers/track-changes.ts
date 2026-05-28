import {
  collectTrackedChanges,
  isTrackedChangeActionAllowed,
} from '../../editors/v1/extensions/track-changes/permission-helpers.js';
import { resolveStateEditor } from './context.js';
import { isMutationCommandDisabled } from './general.js';
import type { ToolbarContext } from '../types.js';

// SD-3213f: prefer the narrow `superdoc.getComment(id)` method when
// present (SuperDoc instances and adopting host stubs). Fall back to
// the legacy `commentsStore.getComment(id)` reach for custom host stubs
// that pre-date the narrow method.
const lookupCommentByCommentId = (
  superdoc: Record<string, any> | undefined,
  commentId: string,
): Record<string, unknown> | null => {
  if (typeof superdoc?.getComment === 'function') {
    return superdoc.getComment(commentId) ?? null;
  }
  const store = superdoc?.commentsStore;
  if (typeof store?.getComment === 'function') {
    return store.getComment(commentId) ?? null;
  }
  return null;
};

const enrichTrackedChanges = (trackedChanges: Array<Record<string, any>> = [], superdoc?: Record<string, any>) => {
  if (!trackedChanges.length) return trackedChanges;

  return trackedChanges.map((change) => {
    const commentId = change.id;
    if (!commentId) return change;
    const storeComment = lookupCommentByCommentId(superdoc, commentId);
    if (!storeComment) return change;
    const comment =
      typeof (storeComment as { getValues?: () => unknown }).getValues === 'function'
        ? (storeComment as { getValues: () => unknown }).getValues()
        : storeComment;
    return { ...change, comment };
  });
};

export const createTrackChangesSelectionActionStateDeriver =
  (action: 'accept' | 'reject') =>
  ({ context, superdoc }: { context: ToolbarContext | null; superdoc: Record<string, any> }) => {
    if (isMutationCommandDisabled(context)) {
      return {
        active: false,
        disabled: true,
      };
    }

    const editor = resolveStateEditor(context);
    const state = editor?.state;
    const selection = state?.selection;

    if (!editor || !state?.doc || !selection) {
      return {
        active: false,
        disabled: true,
      };
    }

    const trackedChanges = enrichTrackedChanges(
      collectTrackedChanges({
        state,
        from: selection.from,
        to: selection.to,
      }),
      superdoc,
    );

    if (!trackedChanges.length) {
      return {
        active: false,
        disabled: true,
      };
    }

    return {
      active: false,
      disabled: !isTrackedChangeActionAllowed({
        editor,
        action,
        trackedChanges,
      }),
    };
  };
