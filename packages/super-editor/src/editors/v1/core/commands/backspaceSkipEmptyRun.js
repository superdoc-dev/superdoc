import { Selection } from 'prosemirror-state';

/**
 * Backspaces over an empty run to the left of the cursor, deleting the previous character instead.
 * Only triggers when inside a run positioned directly before an empty sibling run.
 * @returns {import('@core/commands/types').Command}
 */
export const backspaceSkipEmptyRun =
  () =>
  ({ state, dispatch }) => {
    const sel = state.selection;
    if (!sel.empty) return false;

    const runType = state.schema.nodes.run;
    const $pos = sel.$from;
    const emptyRun = (n) => n && n.type === runType && n.content.size === 0;

    // Only intervene if:
    // - At the end of a run
    // - The run to the right is empty
    if ($pos.parent.type !== runType || $pos.pos !== $pos.end() || !emptyRun(state.doc.nodeAt($pos.pos + 1))) {
      return false;
    }

    // Find the nearest text position to the left (skips empty runs)
    const leftTextSel = Selection.findFrom($pos, -1, true);
    if (!leftTextSel) return false;

    const pos = leftTextSel.$from.pos;
    if (dispatch) {
      dispatch(state.tr.delete(pos - 1, pos).scrollIntoView());
    }
    return true;
  };
