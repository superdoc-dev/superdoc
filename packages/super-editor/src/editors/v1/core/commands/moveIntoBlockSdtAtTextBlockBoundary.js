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

function findSiblingAcrossHiddenMarkers(doc, pos, direction) {
  let currentPos = pos;
  let node = direction === 'before' ? doc.resolve(currentPos).nodeBefore : doc.resolve(currentPos).nodeAfter;

  while (node && isZeroWidthMarker(node)) {
    currentPos += direction === 'before' ? -node.nodeSize : node.nodeSize;
    node = direction === 'before' ? doc.resolve(currentPos).nodeBefore : doc.resolve(currentPos).nodeAfter;
  }

  return {
    node,
    nodePos: direction === 'before' && node ? currentPos - node.nodeSize : currentPos,
  };
}

function createSelectionAtContentPos(doc, pos, bias) {
  const $pos = doc.resolve(pos);
  if ($pos.parent.inlineContent) return TextSelection.create(doc, pos);
  if ($pos.nodeAfter && NodeSelection.isSelectable($pos.nodeAfter)) return NodeSelection.create(doc, pos);
  return Selection.near($pos, bias);
}

function moveIntoAdjacentBlockSdt(direction) {
  return ({ state, dispatch }) => {
    const { selection } = state;
    if (!selection.empty) return false;

    const { $from } = selection;
    const textblockDepth = findAncestorDepth($from, (node) => node.isTextblock);
    if (textblockDepth == null) return false;

    const textblock = $from.node(textblockDepth);
    const textblockPos = $from.before(textblockDepth);

    const atTextblockBoundary =
      direction === 'before'
        ? (findFirstContentCursorPosInNode(textblock, textblockPos) ?? $from.start(textblockDepth))
        : (findLastContentCursorPosInNode(textblock, textblockPos) ?? $from.end(textblockDepth));
    if (atTextblockBoundary !== $from.pos) return false;

    const siblingBoundaryPos = direction === 'before' ? textblockPos : $from.after(textblockDepth);
    const { node, nodePos } = findSiblingAcrossHiddenMarkers(state.doc, siblingBoundaryPos, direction);
    if (node?.type.name !== 'structuredContentBlock') return false;

    const targetPos =
      direction === 'before'
        ? findLastContentCursorPosInNode(node, nodePos)
        : findFirstContentCursorPosInNode(node, nodePos);
    if (targetPos == null) return false;

    if (dispatch) {
      const targetSelection = createSelectionAtContentPos(state.doc, targetPos, direction === 'before' ? -1 : 1);
      dispatch(state.tr.setSelection(targetSelection).scrollIntoView());
    }

    return true;
  };
}

/**
 * Moves the caret into the previous block SDT when Backspace is pressed at the
 * start of the following textblock.
 *
 * @returns {import('@core/commands/types').Command}
 */
export const moveIntoBlockSdtBeforeTextBlockStart = () => moveIntoAdjacentBlockSdt('before');

/**
 * Moves the caret into the next block SDT when Delete is pressed at the end of
 * the preceding textblock.
 *
 * @returns {import('@core/commands/types').Command}
 */
export const moveIntoBlockSdtAfterTextBlockEnd = () => moveIntoAdjacentBlockSdt('after');
