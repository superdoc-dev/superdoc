import { Selection } from 'prosemirror-state';

const WRAPPER_LOCKED_MODES = new Set(['sdtLocked', 'sdtContentLocked']);

function findAncestorDepth($pos, predicate) {
  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    if (predicate($pos.node(depth))) return depth;
  }
  return null;
}

function hasDeletableContentBeforePosition(doc, from, to) {
  let hasContent = false;
  doc.nodesBetween(from, to, (node) => {
    if ((node.isText && node.text?.length) || node.isAtom || node.isLeaf) {
      hasContent = true;
      return false;
    }
    return true;
  });
  return hasContent;
}

function findStructuredContentBlockBeforeLogicalStart(doc, $from, textblockDepth) {
  for (let depth = textblockDepth; depth > 0; depth -= 1) {
    if (hasDeletableContentBeforePosition(doc, $from.start(depth), $from.pos)) {
      return null;
    }

    const boundaryPos = $from.before(depth);
    const previousNode = doc.resolve(boundaryPos).nodeBefore;
    if (previousNode?.type.name === 'structuredContentBlock') {
      return {
        node: previousNode,
        pos: boundaryPos - previousNode.nodeSize,
      };
    }
  }

  return null;
}

/**
 * Enters a block SDT immediately before the current paragraph when Backspace
 * is pressed at the paragraph's logical start.
 *
 * Run-based paragraphs put the caret inside the first run, so PM's stock
 * selectNodeBackward does not recognize the structural boundary.
 *
 * @returns {import('@core/commands/types').Command}
 */
export const selectBlockSdtBeforeTextBlockStart =
  () =>
  ({ state, dispatch }) => {
    const { selection } = state;
    if (!selection.empty) return false;

    const { $from } = selection;
    const textblockDepth = findAncestorDepth($from, (node) => node.isTextblock);
    if (textblockDepth == null) return false;

    const previousSdt = findStructuredContentBlockBeforeLogicalStart(state.doc, $from, textblockDepth);
    if (!previousSdt) return false;

    if (WRAPPER_LOCKED_MODES.has(previousSdt.node.attrs.lockMode)) {
      return true;
    }

    if (dispatch) {
      const contentEnd = previousSdt.pos + previousSdt.node.nodeSize - 1;
      const nextSelection = Selection.near(state.doc.resolve(contentEnd), -1);
      dispatch(state.tr.setSelection(nextSelection).scrollIntoView());
    }

    return true;
  };
