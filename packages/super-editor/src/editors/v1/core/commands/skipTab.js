import { TextSelection } from 'prosemirror-state';

/**
 * Moves the cursor across a tab node when inside a run.
 * @param {1|-1} dir Direction to move: forward (1) or backward (-1).
 * @returns {import('@core/commands/types').Command}
 */
export function skipTab(dir) {
  return ({ state, dispatch }) => {
    const tab = state.schema.nodes.tab;
    const run = state.schema.nodes.run;
    const sel = state.selection;
    if (!tab || !sel.empty) return false;
    const $pos = sel.$from;
    if ($pos.parent.type !== run) return false;

    if (dir > 0 && $pos.pos < $pos.end()) return false;
    if (dir < 0 && $pos.pos > $pos.start()) return false;
    const step = dir > 0 ? 1 : -1;
    let $nextPos = state.doc.resolve($pos.pos + step);
    const nextNode = dir > 0 ? $nextPos.nodeAfter : $nextPos.nodeBefore;
    if (!nextNode || nextNode.type !== tab) return false;
    const nextPos =
      dir > 0
        ? Math.min($nextPos.pos + nextNode.nodeSize + 1, state.doc.nodeSize)
        : Math.max(0, $nextPos.pos - nextNode.nodeSize - 1);
    if (dispatch) {
      dispatch(state.tr.setSelection(TextSelection.create(state.doc, nextPos)));
    }
    return true;
  };
}
