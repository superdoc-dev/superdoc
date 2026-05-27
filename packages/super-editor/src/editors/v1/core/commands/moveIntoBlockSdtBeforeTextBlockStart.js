import { TextSelection } from 'prosemirror-state';
import { findFirstTextPosInNode, findLastTextPosInNode } from './helpers/textPositions.js';

function findAncestorDepth($pos, predicate) {
  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    if (predicate($pos.node(depth))) return depth;
  }
  return null;
}

/**
 * Moves the caret into the previous block SDT when Backspace is pressed at the
 * start of the following textblock.
 *
 * @returns {import('@core/commands/types').Command}
 */
export const moveIntoBlockSdtBeforeTextBlockStart =
  () =>
  ({ state, dispatch }) => {
    const { selection } = state;
    if (!selection.empty) return false;

    const { $from } = selection;
    const textblockDepth = findAncestorDepth($from, (node) => node.isTextblock);
    if (textblockDepth == null) return false;

    const textblock = $from.node(textblockDepth);
    const textblockPos = $from.before(textblockDepth);
    const firstTextPos = findFirstTextPosInNode(textblock, textblockPos);
    if (firstTextPos !== $from.pos) return false;

    const boundary = state.doc.resolve(textblockPos);
    const previousNode = boundary.nodeBefore;
    if (previousNode?.type.name !== 'structuredContentBlock') return false;

    const previousNodePos = textblockPos - previousNode.nodeSize;
    const targetPos = findLastTextPosInNode(previousNode, previousNodePos);
    if (targetPos == null) return false;

    if (dispatch) {
      dispatch(state.tr.setSelection(TextSelection.create(state.doc, targetPos)).scrollIntoView());
    }

    return true;
  };
