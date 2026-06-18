/**
 * SD-3400: paragraph-style preservation for note story sessions.
 *
 * Several ProseMirror base commands (createParagraphNear, liftEmptyBlock,
 * joinBackward/joinForward via deleteBarrier) can produce paragraphs with
 * default attributes. Inside a footnote/endnote session that drops the
 * FootnoteText/EndnoteText style, so the paragraph renders at the document
 * default size instead of the note size. These helpers re-stamp the source
 * paragraph's `paragraphProperties` onto the affected paragraph after the
 * base command runs, in the same transaction.
 */

/** Depth of the nearest paragraph ancestor at a resolved position, or null. */
export function findParagraphDepth($pos) {
  for (let depth = $pos.depth; depth >= 1; depth -= 1) {
    if ($pos.node(depth).type.name === 'paragraph') return depth;
  }
  return null;
}

/**
 * Wraps a dispatch so that, after the base command builds its transaction,
 * the paragraph holding the selection gets `sourceProps` re-stamped when the
 * command left it without a styleId. No-op when sourceProps carries no
 * styleId or the paragraph kept its own.
 */
export function restoreParagraphPropertiesAfterDispatch(dispatch, sourceProps) {
  if (!sourceProps?.styleId) return dispatch;

  return (tr) => {
    const $head = tr.selection.$head;
    const depth = findParagraphDepth($head);
    if (depth) {
      const paragraph = $head.node(depth);
      if (paragraph.attrs?.paragraphProperties?.styleId == null) {
        const pos = $head.before(depth);
        tr.setNodeMarkup(pos, undefined, { ...paragraph.attrs, paragraphProperties: sourceProps });
      }
    }
    dispatch(tr);
  };
}
