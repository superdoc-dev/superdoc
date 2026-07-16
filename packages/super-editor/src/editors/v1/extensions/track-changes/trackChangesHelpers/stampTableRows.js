// @ts-check
import { v4 as uuidv4 } from 'uuid';
import { collectWholeTablesInRange } from './collectWholeTablesInRange.js';

/**
 * Stamp a structural tracked-change revision (`rowInsert` or `rowDelete`) on
 * every row of any WHOLE table fully contained in `[from, to)`.
 *
 * Structural tracked changes do not live on inline marks: a tracked
 * inserted/deleted table carries `tableRow.attrs.trackChange` on each of its
 * rows — the same shape the importer lands from `<w:ins>`/`<w:del>` inside
 * `<w:trPr>` (see `core/super-converter/v3/handlers/w/tr/row-track-change.js`).
 * `markInsertion`/`markDeletion` (and the overlap compiler) only mark INLINE
 * content and explicitly skip table internals, so a table authored in
 * suggesting mode would otherwise carry no structural markup at all. Stamping
 * the rows lets the existing downstream machinery
 * (`enumerateStructuralRowChanges` → review-model → paint/bubble → export) treat
 * the table as ONE decidable whole-table change.
 *
 * - For an INSERT (`type: 'rowInsert'`) the table node is freshly inserted in
 *   the range; for a tracked DELETE (`type: 'rowDelete'`) the deletion is NOT
 *   applied — the content stays VISIBLE (struck-through) so the table node
 *   remains in the doc.
 * - Only tables fully contained in the range are stamped (table starts at/after
 *   `from`, ends at/before `to`). A row/column-level change or a row inserted
 *   into a pre-existing table merely overlaps the range and is out of scope.
 * - Every row of a given table shares one `revisionGroupId` so the enumerator
 *   groups them as a single change. Word assigns a distinct `w:id` per row, so
 *   each row also gets its own `id`.
 * - An existing `trackChange` is never clobbered (e.g. re-inserted imported
 *   content, or a row already tracked-inserted that is now being deleted).
 *
 * `setNodeMarkup` does not change node size, so row positions stay stable while
 * stamping multiple rows of one table; we still walk fresh per table.
 *
 * @param {object} options
 * @param {'rowInsert'|'rowDelete'} options.type - Revision side to stamp.
 * @param {import('prosemirror-state').Transaction} options.tr - Transaction whose doc contains the table(s).
 * @param {number} options.from - Start of the range (inclusive).
 * @param {number} options.to - End of the range (exclusive).
 * @param {import('../../../core/types/EditorConfig.js').User} options.user - Acting user, attributed on the revision.
 * @param {string} options.date - Revision timestamp (ISO-8601).
 * @returns {boolean} True if at least one row was stamped.
 */
export const stampTableRows = ({ type, tr, from, to, user, date }) => {
  if (type !== 'rowInsert' && type !== 'rowDelete') return false;

  const tables = collectWholeTablesInRange({ doc: tr.doc, from, to });
  if (!tables.length) return false;

  let stamped = false;

  for (const { pos: tablePos, node: tableNode } of tables) {
    // One shared revision identity per table so the enumerator groups all rows
    // as a single whole-table change.
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
      // Don't clobber an existing structural revision.
      if (rowNode.attrs?.trackChange) continue;

      /** @type {import('../../../extensions/table-row/table-row.js').TableRowTrackChange} */
      const trackChange = {
        type,
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
