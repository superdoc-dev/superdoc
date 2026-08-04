// @ts-check
/**
 * Paragraph-mark tracked-deletion enumerator (w:pPr/w:rPr/w:del).
 *
 * A whole-block tracked deletion marks the block's runs AND its paragraph
 * MARK. The mark half lives on `node.attrs.markTrackChange`, not on an inline
 * mark, so the inline enumerators never see it — the same blind spot the
 * structural row and pPrChange enumerators exist to cover.
 *
 * For a block that HAD content the runs carry `trackDelete` marks under the
 * same id, so the inline enumerator already produces the change and the mark
 * simply rides along with it. An EMPTY block has no runs to mark, so without
 * this walk the deletion is invisible: `trackChanges.list` reports nothing,
 * there is nothing to accept or reject, and the empty item survives — exactly
 * the symptom whole-block deletion was added to remove.
 *
 * The review graph projects each entry the inline pass did not already claim
 * into a decidable deletion, and the decision engine resolves it with the same
 * `collapseParagraphMark` / `clearParagraphMark` ops used for the content case.
 */

/**
 * @typedef {Object} ParagraphMarkChange
 * @property {string} id       Logical (and public) change id.
 * @property {number} from     Block node start (absolute PM position).
 * @property {number} to       Block node end (`from + node.nodeSize`).
 * @property {string} author
 * @property {string} authorEmail
 * @property {string} authorImage
 * @property {string} date
 * @property {'paragraph-mark-deletion'} subtype
 */

/**
 * Enumerate tracked paragraph-mark deletions in the document.
 *
 * Tolerates a missing/partial state and returns `[]` instead of throwing, to
 * match the inline, structural and pPrChange enumerators' bootstrap-safety
 * contract.
 *
 * @param {import('prosemirror-state').EditorState | { doc?: import('prosemirror-model').Node } | null | undefined} state
 * @returns {Array<ParagraphMarkChange>}
 */
export const enumerateParagraphMarkDeletions = (state) => {
  const doc = state?.doc;
  if (!doc) return [];

  /** @type {Array<ParagraphMarkChange>} */
  const out = [];

  try {
    doc.descendants((node, pos) => {
      // The record lives on block-level nodes; never descend into text.
      if (node.isText) return false;
      const record = node?.attrs?.markTrackChange;
      // Only a deletion record with a stable id is decidable. Anything else
      // (a paragraph-mark INSERTION, a transient or malformed record) is
      // ignored rather than surfaced as a half-formed change.
      if (record && record.type === 'paragraphMarkDelete' && typeof record.id === 'string' && record.id) {
        out.push({
          id: record.id,
          from: pos,
          to: pos + node.nodeSize,
          author: record.author || '',
          authorEmail: record.authorEmail || '',
          authorImage: record.authorImage || '',
          date: record.date || '',
          subtype: 'paragraph-mark-deletion',
        });
      }
      return undefined;
    });
  } catch {
    return out;
  }

  return out;
};
