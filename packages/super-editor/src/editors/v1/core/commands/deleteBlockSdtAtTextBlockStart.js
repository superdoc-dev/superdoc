import { Selection } from 'prosemirror-state';

function isSdtWrapperLocked(node) {
  return node.attrs.lockMode === 'sdtLocked' || node.attrs.lockMode === 'sdtContentLocked';
}

function findAncestorDepth($pos, predicate) {
  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    if (predicate($pos.node(depth))) return depth;
  }
  return null;
}

/**
 * Deletes the block SDT wrapper from the start of its first paragraph.
 *
 * @returns {import('@core/commands/types').Command}
 */
export const deleteBlockSdtAtTextBlockStart =
  () =>
  ({ state, dispatch }) => {
    const { selection } = state;
    if (!selection.empty) return false;

    const { $from } = selection;
    const sdtDepth = findAncestorDepth($from, (node) => node.type.name === 'structuredContentBlock');
    if (sdtDepth == null) return false;

    const textblockDepth = findAncestorDepth($from, (node) => node.isTextblock);
    if (textblockDepth !== sdtDepth + 1) return false;
    if ($from.node(textblockDepth).type.name !== 'paragraph') return false;
    if ($from.pos !== $from.start(textblockDepth)) return false;
    if ($from.before(textblockDepth) !== $from.start(sdtDepth)) return false;

    const sdtNode = $from.node(sdtDepth);
    if (isSdtWrapperLocked(sdtNode)) return true;

    if (dispatch) {
      const from = $from.before(sdtDepth);
      const tr = state.tr.delete(from, from + sdtNode.nodeSize);
      const selectionPos = Math.min(from, tr.doc.content.size);
      dispatch(tr.setSelection(Selection.near(tr.doc.resolve(selectionPos), -1)).scrollIntoView());
    }

    return true;
  };
