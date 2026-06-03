// @ts-check
import { v4 as uuidv4 } from 'uuid';

/**
 * Stamp a structural `rowDelete` tracked-change revision on every row of any
 * WHOLE table that sits inside the deleted range `[from, to)`.
 *
 * This is the deletion analog of `stampInsertedTableRows`. A tracked deletion
 * keeps the content VISIBLE (struck-through / red) instead of removing it, so
 * the table node stays in the document and each of its rows carries
 * `tableRow.attrs.trackChange = { type: 'rowDelete', ... }` — the same shape the
 * importer lands from `<w:del>` inside `<w:trPr>` (see
 * `core/super-converter/v3/handlers/w/tr/row-track-change.js`).
 *
 * `markDeletion`/the overlap compiler only mark INLINE content and explicitly
 * skip table internals, so a table the user deleted in suggesting mode would
 * otherwise carry no structural tracked-change markup at all. This stamps the
 * rows so the existing downstream machinery (`enumerateStructuralRowChanges` →
 * review-model → paint/bubble → export) treats the table as ONE decidable
 * whole-table delete. Every row of a given deleted table shares one
 * `revisionGroupId` so the enumerator groups them as a single change.
 *
 * Only tables fully contained in the deleted range are stamped (the table node
 * starts at or after `from` and ends at or before `to`). A partial row/column
 * delete is out of scope and is never touched here.
 *
 * `setNodeMarkup` does not change node size, so row positions stay stable while
 * stamping multiple rows of one table; we still walk fresh per table.
 *
 * @param {object} options
 * @param {import('prosemirror-state').Transaction} options.tr - The transaction whose doc still contains the table(s) (the deletion was NOT applied).
 * @param {number} options.from - Start of the deleted range (inclusive).
 * @param {number} options.to - End of the deleted range (exclusive).
 * @param {import('../../../core/types/EditorConfig.js').User} options.user - Acting user, attributed on the revision.
 * @param {string} options.date - Revision timestamp (ISO-8601).
 * @returns {boolean} True if at least one row was stamped.
 */
export const stampDeletedTableRows = ({ tr, from, to, user, date }) => {
  if (typeof from !== 'number' || typeof to !== 'number' || to <= from) return false;

  const boundedFrom = Math.max(0, from);
  const boundedTo = Math.min(tr.doc.content.size, to);
  if (boundedTo <= boundedFrom) return false;

  /** @type {Array<{ tablePos: number, tableNode: import('prosemirror-model').Node }>} */
  const deletedTables = [];

  tr.doc.nodesBetween(boundedFrom, boundedTo, (node, pos) => {
    if (node.type?.name !== 'table') return true;
    // Only WHOLE tables that are fully inside the deleted range. A table that
    // merely overlaps the range (e.g. a partial row/column delete) is out of
    // scope.
    if (pos >= boundedFrom && pos + node.nodeSize <= boundedTo) {
      deletedTables.push({ tablePos: pos, tableNode: node });
      // Stop descending: a nested table inside this captured table is part of
      // the same whole-table delete, not a separate structural change.
      return false;
    }
    // A partially-overlapping table — keep walking in case a fully-contained
    // table sits deeper.
    return true;
  });

  if (!deletedTables.length) return false;

  let stamped = false;

  for (const { tablePos, tableNode } of deletedTables) {
    // One shared revision identity per deleted table so the enumerator groups
    // all rows as a single whole-table delete. Word assigns a distinct w:id per
    // row, so each row gets its own id; the shared `revisionGroupId` is what
    // ties them together.
    const revisionGroupId = uuidv4();

    // Collect row positions first (positions are stable under setNodeMarkup,
    // but reading the live node before each markup keeps attrs fresh).
    let offset = 1;
    /** @type {Array<number>} */
    const rowPositions = [];
    tableNode.forEach((child) => {
      const childPos = tablePos + offset;
      offset += child.nodeSize;
      if (child.type?.name === 'tableRow') rowPositions.push(childPos);
    });

    for (const rowPos of rowPositions) {
      const rowNode = tr.doc.nodeAt(rowPos);
      if (!rowNode || rowNode.type?.name !== 'tableRow') continue;
      // Don't clobber an existing structural revision (e.g. a row that was
      // already tracked-inserted and is now being deleted — out of scope here).
      if (rowNode.attrs?.trackChange) continue;

      /** @type {import('../../../extensions/table-row/table-row.js').TableRowTrackChange} */
      const trackChange = {
        type: 'rowDelete',
        id: uuidv4(),
        author: user?.name || '',
        authorId: user?.id || '',
        authorEmail: user?.email || '',
        authorImage: user?.image || '',
        date,
        revisionGroupId,
      };

      tr.setNodeMarkup(rowPos, undefined, { ...rowNode.attrs, trackChange });
      stamped = true;
    }
  }

  return stamped;
};
