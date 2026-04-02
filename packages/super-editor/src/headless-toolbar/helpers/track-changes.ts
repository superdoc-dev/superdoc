import {
  collectTrackedChanges,
  isTrackedChangeActionAllowed,
} from '../../editors/v1/extensions/track-changes/permission-helpers.js';
import { resolveStateEditor } from './context.js';
import { isCommandDisabled } from './general.js';
import type { ToolbarContext } from '../types.js';

const enrichTrackedChanges = (trackedChanges: Array<Record<string, any>> = [], superdoc?: Record<string, any>) => {
  if (!trackedChanges.length) return trackedChanges;
  const store = superdoc?.commentsStore;
  if (!store?.getComment) return trackedChanges;

  return trackedChanges.map((change) => {
    const commentId = change.id;
    if (!commentId) return change;
    const storeComment = store.getComment(commentId);
    if (!storeComment) return change;
    const comment = typeof storeComment.getValues === 'function' ? storeComment.getValues() : storeComment;
    return { ...change, comment };
  });
};

export const createTrackChangesSelectionActionStateDeriver =
  (action: 'accept' | 'reject') =>
  ({ context, superdoc }: { context: ToolbarContext | null; superdoc: Record<string, any> }) => {
    if (isCommandDisabled(context)) {
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
