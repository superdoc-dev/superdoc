import { splitRunAtCursor } from '@extensions/run/commands/split-run.js';
import { TextSelection } from 'prosemirror-state';

export const insertTabCharacter = ({ tr, state, dispatch }) => {
  const { from } = tr.selection;
  const tabText = state.schema.text('\t');

  tr = tr.replaceSelectionWith(tabText);
  tr = tr.setSelection(TextSelection.create(tr.doc, from + 1));

  if (dispatch) dispatch(tr);
  return true;
};

export const insertTabNode =
  () =>
  ({ tr, state, dispatch }) => {
    let newPos = tr.selection.from;
    const tabNode = state.schema?.nodes?.tab?.create();

    // If tab node isn't defined, fallback to tab character
    if (!tabNode) return insertTabCharacter({ tr, state, dispatch });

    // Move selection out of run node if inside one
    const { from } = tr.selection;
    const $pos = tr.doc.resolve(from);
    if ($pos.parent.type === state.schema.nodes.run) {
      if (from === $pos.end()) {
        // At end of run, move after it
        newPos = $pos.end() + 1;
      } else if (from === $pos.start()) {
        // At start of run, move before it
        newPos = $pos.start() - 1;
      } else {
        // In middle of run, split it at the cursor
        splitRunAtCursor()({ tr, state });
        newPos = tr.selection.from;
      }
    }
    tr.insert(newPos, tabNode);
    tr = tr.setSelection(TextSelection.create(tr.doc, newPos + tabNode.nodeSize));
    if (dispatch) dispatch(tr);
    return true;
  };
