// @ts-check
/**
 * Paragraph-property tracked-change enumerator (w:pPrChange).
 *
 * A tracked paragraph-property revision (numbering attach, alignment change,
 * ...) is recorded on `node.attrs.paragraphProperties.change` — a pPrChange
 * record, NOT a mark (see `updateNumberingProperties` in
 * `core/commands/changeListLevel.js` and the tracked format-paragraph path).
 * The inline-mark enumerators (`getTrackChanges`, `enumerateTrackedMarkSpans`)
 * never see attr-based revisions, exactly like the structural row changes in
 * `structuralRowChanges.js`.
 *
 * Without this walk the change round-trips to Word as `w:pPrChange` but is
 * invisible to `trackChanges.list` and cannot be accepted/rejected via
 * `trackChanges.decide` — even though the operation advertises tracked-mode
 * support. This module is the single owner of pPrChange discovery; the review
 * graph projects each entry into a decidable formatting change and the decision
 * engine reads `change.pprChange` to accept (drop the record, keep the new
 * properties) or reject (restore the former properties).
 *
 * The record shape is:
 *   { id, author, authorEmail, date, paragraphProperties: <former> }
 * where `paragraphProperties` is the pre-change state used to reject.
 */

/**
 * @typedef {Object} PprChange
 * @property {string} id                  Logical (and public) change id.
 * @property {number} from                Block node start (absolute PM position).
 * @property {number} to                  Block node end (`from + node.nodeSize`).
 * @property {string} author
 * @property {string} authorEmail
 * @property {string} authorImage
 * @property {string} date
 * @property {Record<string, any>} formerProperties  Pre-change `paragraphProperties` (used to reject).
 * @property {'paragraph-format'} subtype
 */

/**
 * Enumerate tracked paragraph-property (pPrChange) revisions in the document.
 *
 * Tolerates a missing/partial state and returns `[]` instead of throwing, to
 * match the inline and structural enumerators' bootstrap-safety contract.
 *
 * @param {import('prosemirror-state').EditorState | { doc?: import('prosemirror-model').Node } | null | undefined} state
 * @returns {Array<PprChange>}
 */
export const enumeratePprChanges = (state) => {
  const doc = state?.doc;
  if (!doc) return [];

  /** @type {Array<PprChange>} */
  const out = [];

  try {
    doc.descendants((node, pos) => {
      // pPrChange records live on block-level nodes; skip descending into text.
      if (node.isText) return false;
      const change = node?.attrs?.paragraphProperties?.change;
      // A valid, decidable pPrChange carries a stable id and the former
      // paragraph properties to restore on reject. Anything else (e.g. a
      // transient/malformed record) is ignored rather than surfaced.
      if (change && typeof change.id === 'string' && change.id && change.paragraphProperties) {
        out.push({
          id: change.id,
          from: pos,
          to: pos + node.nodeSize,
          author: change.author || '',
          authorEmail: change.authorEmail || '',
          authorImage: change.authorImage || '',
          date: change.date || '',
          formerProperties: change.paragraphProperties || {},
          subtype: 'paragraph-format',
        });
      }
      return undefined;
    });
  } catch {
    return out;
  }

  return out;
};
