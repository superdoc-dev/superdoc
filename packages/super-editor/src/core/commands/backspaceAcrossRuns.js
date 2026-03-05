import { Selection } from 'prosemirror-state';
import { findPreviousTextDeleteRange } from './findPreviousTextDeleteRange.js';

/**
 * Fallback backspace for fragmented run structures.
 *
 * Prevents the browser from handling backspace natively inside run-based
 * paragraphs, where the hidden ProseMirror DOM is too fragmented for
 * reliable contenteditable editing. Scans backward across all runs in the
 * containing paragraph to find and delete one character via a PM transaction.
 *
 * Placed after the specialized handlers (backspaceSkipEmptyRun,
 * backspaceNextToRun) in the keymap chain so it only fires when they bail.
 *
 * @returns {import('@core/commands/types').Command}
 */
export const backspaceAcrossRuns =
  () =>
  ({ state, tr, dispatch }) => {
    const sel = state.selection;
    if (!sel.empty) return false;

    const $pos = sel.$from;
    const runType = state.schema.nodes.run;

    const insideRun = $pos.parent.type === runType;
    const betweenRuns = $pos.nodeBefore?.type === runType && !insideRun;

    if (!insideRun && !betweenRuns) return false;

    // Determine the containing paragraph so we can scan its full width.
    const paraDepth = insideRun ? $pos.depth - 1 : $pos.depth;
    const paraStart = $pos.start(paraDepth);

    const deleteRange = findPreviousTextDeleteRange(state.doc, $pos.pos, paraStart);
    if (!deleteRange) return false;

    if (dispatch) {
      tr.delete(deleteRange.from, deleteRange.to);
      tr.setSelection(Selection.near(tr.doc.resolve(deleteRange.from)));
      dispatch(tr.scrollIntoView());
    }
    return true;
  };
