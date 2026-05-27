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

function findNextNodeAfterHiddenMarkers(doc, pos) {
  let currentPos = pos;
  let node = doc.resolve(currentPos).nodeAfter;

  while (node && isZeroWidthMarker(node)) {
    currentPos += node.nodeSize;
    node = doc.resolve(currentPos).nodeAfter;
  }

  return { node, pos: currentPos };
}

function createSelectionAtContentPos(doc, pos, bias) {
  const $pos = doc.resolve(pos);
  if ($pos.parent.inlineContent) return TextSelection.create(doc, pos);
  if ($pos.nodeAfter && NodeSelection.isSelectable($pos.nodeAfter)) return NodeSelection.create(doc, pos);
  return Selection.near($pos, bias);
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
    const lastContentPos = findLastContentCursorPosInNode(textblock, textblockPos) ?? $from.end(textblockDepth);
    if (lastContentPos !== $from.pos) return false;

    const boundaryPos = $from.after(textblockDepth);
    const { node: nextNode, pos: nextNodePos } = findNextNodeAfterHiddenMarkers(state.doc, boundaryPos);
    if (nextNode?.type.name !== 'structuredContentBlock') return false;

    const targetPos = findFirstContentCursorPosInNode(nextNode, nextNodePos);

    if (dispatch) {
      const targetSelection =
        targetPos != null
          ? createSelectionAtContentPos(state.doc, targetPos, 1)
          : (Selection.findFrom(state.doc.resolve(boundaryPos), 1, true) ??
            Selection.near(state.doc.resolve(boundaryPos), 1));
      dispatch(state.tr.setSelection(targetSelection).scrollIntoView());
    }

    return true;
  };
