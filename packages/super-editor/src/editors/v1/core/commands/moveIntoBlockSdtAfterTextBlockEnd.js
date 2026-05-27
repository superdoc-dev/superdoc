import { TextSelection } from 'prosemirror-state';
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
    const lastTextPos = findLastTextPosInNode(textblock, textblockPos);
    if (lastTextPos !== $from.pos) return false;

    const boundaryPos = $from.after(textblockDepth);
    const boundary = state.doc.resolve(boundaryPos);
    const nextNode = boundary.nodeAfter;
    if (nextNode?.type.name !== 'structuredContentBlock') return false;

    const targetPos = findFirstTextPosInNode(nextNode, boundaryPos);
    if (targetPos == null) return false;

    if (dispatch) {
      dispatch(state.tr.setSelection(TextSelection.create(state.doc, targetPos)).scrollIntoView());
    }

    return true;
  };
