import { NodeSelection, Selection, TextSelection } from 'prosemirror-state';
import {
  findFirstContentCursorPosInNode,
  findLastContentCursorPosInNode,
  isZeroWidthMarker,
} from './helpers/textPositions.js';

function findAncestorDepth($pos, predicate) {
  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    if (predicate($pos.node(depth))) return depth;
  }
  return null;
}

function findPreviousNodeBeforeHiddenMarkers(doc, pos) {
  let currentPos = pos;
  let node = doc.resolve(currentPos).nodeBefore;

  while (node && isZeroWidthMarker(node)) {
    currentPos -= node.nodeSize;
    node = doc.resolve(currentPos).nodeBefore;
  }

  return { node, boundaryPos: currentPos };
}

function createSelectionAtContentPos(doc, pos, bias) {
  const $pos = doc.resolve(pos);
  if ($pos.parent.inlineContent) return TextSelection.create(doc, pos);
  if ($pos.nodeAfter && NodeSelection.isSelectable($pos.nodeAfter)) return NodeSelection.create(doc, pos);
  return Selection.near($pos, bias);
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

    const { node: previousNode, boundaryPos } = findPreviousNodeBeforeHiddenMarkers(state.doc, textblockPos);
    if (previousNode?.type.name !== 'structuredContentBlock') return false;

    const previousNodePos = boundaryPos - previousNode.nodeSize;
    const targetPos = findLastContentCursorPosInNode(previousNode, previousNodePos);

    if (dispatch) {
      const targetSelection =
        targetPos != null
          ? createSelectionAtContentPos(state.doc, targetPos, -1)
          : (Selection.findFrom(state.doc.resolve(textblockPos), -1, true) ??
            Selection.near(state.doc.resolve(textblockPos), -1));
      dispatch(state.tr.setSelection(targetSelection).scrollIntoView());
    }

    return true;
  };
