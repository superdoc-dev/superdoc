import { Selection } from 'prosemirror-state';

/**
 * Deletes while skipping over an empty run to the right of the cursor.
 * When the cursor is at the end of a run and followed by an empty run, removes the next character beyond it.
 * @returns {import('@core/commands/types').Command}
 */
export const deleteSkipEmptyRun =
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
    if ($pos.parent.type === runType && emptyRun(state.doc.nodeAt($pos.end() + 1))) {
      if ($pos.pos === $pos.end()) {
        return deleteFromEndOfRun(state, dispatch, $pos);
      } else if ($pos.pos === $pos.end() - 1) {
        return deleteFromLastCharacter(state, dispatch, $pos);
      }
      return false;
    }

    return false;
  };

function deleteFromEndOfRun(state, dispatch, $pos) {
  // Find the nearest text position to the right (skips empty runs)
  const rightRun = state.doc.nodeAt($pos.pos + 1);
  const $afterRightRunPos = state.doc.resolve($pos.pos + 2 + rightRun.nodeSize);
  const rightTextSel = Selection.findFrom($afterRightRunPos, 1, true);
  if (!rightTextSel) return false;
  const pos = rightTextSel.$from.pos;
  if (dispatch) {
    dispatch(state.tr.delete(pos, pos + 1).scrollIntoView());
  }
  return true;
}

function deleteFromLastCharacter(state, dispatch, $pos) {
  if (dispatch) {
    dispatch(state.tr.delete($pos.pos, $pos.pos + 1).scrollIntoView());
  }
  return true;
}
