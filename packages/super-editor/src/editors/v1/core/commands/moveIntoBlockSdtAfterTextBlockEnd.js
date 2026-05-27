import { Selection, TextSelection } from 'prosemirror-state';
import { findFirstTextPosInNode, findLastTextPosInNode } from './helpers/textPositions.js';

function findAncestorDepth($pos, predicate) {
  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    if (predicate($pos.node(depth))) return depth;
  }
  return null;
}

/**
 * Moves the caret into the next block SDT when Delete is pressed at the end of
 * the preceding textblock.
 *
 * @returns {import('@core/commands/types').Command}
 */
export const moveIntoBlockSdtAfterTextBlockEnd =
  () =>
  ({ state, dispatch }) => {
    const { selection } = state;
    if (!selection.empty) return false;

    const { $from } = selection;
    const textblockDepth = findAncestorDepth($from, (node) => node.isTextblock);
    if (textblockDepth == null) return false;

    const textblock = $from.node(textblockDepth);
    const textblockPos = $from.before(textblockDepth);
    const lastTextPos = findLastTextPosInNode(textblock, textblockPos) ?? $from.end(textblockDepth);
    if (lastTextPos !== $from.pos) return false;

    const boundaryPos = $from.after(textblockDepth);
    const boundary = state.doc.resolve(boundaryPos);
    const nextNode = boundary.nodeAfter;
    if (nextNode?.type.name !== 'structuredContentBlock') return false;

    const targetPos = findFirstTextPosInNode(nextNode, boundaryPos);

    if (dispatch) {
      const targetSelection =
        targetPos != null
          ? TextSelection.create(state.doc, targetPos)
          : (Selection.findFrom(state.doc.resolve(boundaryPos), 1, true) ??
            Selection.near(state.doc.resolve(boundaryPos), 1));
      dispatch(state.tr.setSelection(targetSelection).scrollIntoView());
    }

    return true;
  };
