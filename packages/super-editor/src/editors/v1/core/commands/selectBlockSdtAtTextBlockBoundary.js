import { TextSelection } from 'prosemirror-state';
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

function isAtTextBlockBoundary($from, direction) {
  const textblockDepth = findAncestorDepth($from, (node) => node.isTextblock);
  if (textblockDepth == null) return null;

  const textblock = $from.node(textblockDepth);
  const textblockPos = $from.before(textblockDepth);
  const boundary =
    direction === 'before'
      ? (findFirstContentCursorPosInNode(textblock, textblockPos) ?? $from.start(textblockDepth))
      : (findLastContentCursorPosInNode(textblock, textblockPos) ?? $from.end(textblockDepth));
  if ($from.pos !== boundary) return null;

  return {
    textblockDepth,
    textblockPos,
  };
}

function selectAdjacentBlockSdtContent(direction) {
  return ({ state, dispatch }) => {
    const { selection } = state;
    if (!selection.empty) return false;

    const boundary = isAtTextBlockBoundary(selection.$from, direction);
    if (!boundary) return false;

    const siblingBoundaryPos =
      direction === 'before' ? boundary.textblockPos : selection.$from.after(boundary.textblockDepth);
    const { node, nodePos } = findSiblingAcrossHiddenMarkers(state.doc, siblingBoundaryPos, direction);
    if (node?.type.name !== 'structuredContentBlock') return false;
    if (node.content.size === 0) return false;

    const contentStart = findFirstContentCursorPosInNode(node, nodePos);
    const contentEnd = findLastContentCursorPosInNode(node, nodePos);
    if (contentStart == null || contentEnd == null) return false;
    if (contentStart >= contentEnd) return false;

    if (dispatch) {
      dispatch(state.tr.setSelection(TextSelection.create(state.doc, contentStart, contentEnd)).scrollIntoView());
    }

    return true;
  };
}

/**
 * Selects previous block SDT content when Backspace is pressed at the start of
 * the following textblock.
 *
 * @returns {import('@core/commands/types').Command}
 */
export const selectBlockSdtBeforeTextBlockStart = () => selectAdjacentBlockSdtContent('before');

/**
 * Selects next block SDT content when Delete is pressed at the end of the
 * preceding textblock.
 *
 * @returns {import('@core/commands/types').Command}
 */
export const selectBlockSdtAfterTextBlockEnd = () => selectAdjacentBlockSdtContent('after');
