import { Selection } from 'prosemirror-state';

function isSdtContentFullyLocked(node) {
  return node.attrs.lockMode === 'sdtContentLocked';
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
    const lockMode = sdtNode.attrs.lockMode;
    // Wrapper deletion is blocked for sdtLocked / sdtContentLocked (see createStructuredContentLockPlugin).
    // For sdtLocked, content edits must still work — returning true here consumed Delete without
    // dispatching, so the first character of the first paragraph was undeletable at this caret.
    if (lockMode === 'sdtLocked') return false;
    if (isSdtContentFullyLocked(sdtNode)) return true;

    if (dispatch) {
      const from = $from.before(sdtDepth);
      const tr = state.tr.delete(from, from + sdtNode.nodeSize);
      const selectionPos = Math.min(from, tr.doc.content.size);
      dispatch(tr.setSelection(Selection.near(tr.doc.resolve(selectionPos), -1)).scrollIntoView());
    }

    return true;
  };
