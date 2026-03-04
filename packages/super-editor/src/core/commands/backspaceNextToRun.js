import { Selection } from 'prosemirror-state';
import { findPreviousTextDeleteRange } from './findPreviousTextDeleteRange.js';

/**
 * Backspaces a single character when the cursor sits adjacent to a run boundary.
 * Deletes the last character of the previous run (or the previous sibling run) without removing the whole run node.
 * @returns {import('@core/commands/types').Command}
 */
export const backspaceNextToRun =
  () =>
  ({ state, tr, dispatch }) => {
    const sel = state.selection;
    if (!sel.empty) return false;

    const runType = state.schema.nodes.run;
    const $pos = sel.$from;
    if ($pos.nodeBefore?.type !== runType && $pos.pos !== $pos.start()) return false;

    if ($pos.nodeBefore) {
      if ($pos.nodeBefore.content.size === 0) return false;
    } else {
      const prevNode = state.doc.resolve($pos.start() - 1).nodeBefore;
      if (prevNode?.type !== runType || prevNode.content.size === 0) return false;
    }

    // Constrain the text scan to the adjacent run so we never delete
    // text from a previous paragraph or an unrelated run.
    let runContentStart;
    if ($pos.nodeBefore) {
      runContentStart = $pos.pos - $pos.nodeBefore.nodeSize + 1;
    } else {
      const prevNode = state.doc.resolve($pos.start() - 1).nodeBefore;
      runContentStart = $pos.start() - 1 - prevNode.nodeSize + 1;
    }

    const deleteRange = findPreviousTextDeleteRange(state.doc, $pos.pos, runContentStart);
    if (!deleteRange) return false;

    tr.delete(deleteRange.from, deleteRange.to).setSelection(Selection.near(tr.doc.resolve(deleteRange.from)));
    if (dispatch) {
      dispatch(tr.scrollIntoView());
    }
    return true;
  };
