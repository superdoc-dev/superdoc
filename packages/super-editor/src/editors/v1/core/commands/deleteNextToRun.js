import { Selection } from 'prosemirror-state';

/**
 * Deletes a single character in the run immediately after the cursor.
 * Keeps the run node intact and skips empty runs.
 * @returns {import('@core/commands/types').Command}
 */
export const deleteNextToRun =
  () =>
  ({ state, tr, dispatch }) => {
    const sel = state.selection;
    if (!sel.empty) return false;

    const runType = state.schema.nodes.run;
    const $pos = sel.$from;
    if ($pos.nodeAfter?.type !== runType && $pos.pos !== $pos.end()) return false;

    if ($pos.nodeAfter) {
      // Should delete the last character in the run before
      // and not the entire run.
      if ($pos.nodeAfter.content.size === 0) return false;

      tr.delete($pos.pos + 1, $pos.pos + 2).setSelection(Selection.near(tr.doc.resolve($pos.pos + 1)));
      if (dispatch) {
        dispatch(tr.scrollIntoView());
      }
    } else {
      const nextNode = state.doc.resolve($pos.end() + 1).nodeAfter;
      if (nextNode?.type !== runType || nextNode.content.size === 0) return false;
      tr.delete($pos.pos + 2, $pos.pos + 3).setSelection(Selection.near(tr.doc.resolve($pos.pos + 2)));
      if (dispatch) {
        dispatch(tr.scrollIntoView());
      }
    }

    return true;
  };
