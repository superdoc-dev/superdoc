import { Selection, TextSelection } from 'prosemirror-state';
import { findFirstContentCursorPosInNode, findLastTextPosInNode } from './helpers/textPositions.js';

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
    const firstContentPos = findFirstContentCursorPosInNode(textblock, textblockPos) ?? $from.start(textblockDepth);
    if (firstContentPos !== $from.pos) return false;

    const boundary = state.doc.resolve(textblockPos);
    const previousNode = boundary.nodeBefore;
    if (previousNode?.type.name !== 'structuredContentBlock') return false;

    const previousNodePos = textblockPos - previousNode.nodeSize;
    const targetPos = findLastTextPosInNode(previousNode, previousNodePos);

    if (dispatch) {
      const targetSelection =
        targetPos != null
          ? TextSelection.create(state.doc, targetPos)
          : (Selection.findFrom(state.doc.resolve(textblockPos), -1, true) ??
            Selection.near(state.doc.resolve(textblockPos), -1));
      dispatch(state.tr.setSelection(targetSelection).scrollIntoView());
    }

    return true;
  };
