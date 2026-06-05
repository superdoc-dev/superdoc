// @ts-check
/**
 * Structural tracked-change enumerator for whole-table insert/delete.
 *
 * A whole inserted/deleted table is encoded in OOXML as `<w:ins>`/`<w:del>`
 * inside every row's `<w:trPr>`. Real Word documents assign a DISTINCT `w:id`
 * per row (e.g. a 3-row inserted table carries 3 different `w:id`s, all
 * inserts). The importer lands each marker on `tableRow.attrs.trackChange`
 * (see `core/super-converter/v3/handlers/w/tr/row-track-change.js`). Unlike
 * inline tracked text, structural row revisions are NOT marks — they live on
 * row node attributes, so the inline-mark enumerators (`getTrackChanges`,
 * `enumerateTrackedMarkSpans`) never see them.
 *
 * This module is the single owner of structural-row discovery. It walks the PM
 * document, finds `table` nodes whose rows carry `trackChange`, and groups them
 * at the TABLE level by SIDE (NOT by id, because ids legitimately differ per
 * row).
 *
 * Whole-table rule (spec TC-OPS-003):
 *   A table is a WHOLE-TABLE insert/delete iff EVERY row of the table carries a
 *   `trackChange` AND every tracked row shares the SAME side (all `rowInsert`
 *   or all `rowDelete`). Ids MAY differ. Only then do we emit ONE decidable
 *   structural change (`table-insert`/`table-delete`) covering the table.
 *
 *   If only SOME rows are tracked, OR the sides are mixed within one table, it
 *   is NOT a whole-table change (row-level structural is out of scope).
 *   We still SURFACE such a shape (so it is never silently dropped) but flag it
 *   `wholeTable: false` / `decidable: false`. The decision engine fails such a
 *   shape closed (CAPABILITY_UNAVAILABLE) and NEVER routes it through the
 *   whole-table removal path — the table is never removed.
 */

/**
 * @typedef {Object} StructuralRowRef
 * @property {number} pos       Absolute PM position of the row node.
 * @property {number} from      Same as `pos` (row start).
 * @property {number} to        Row end (`pos + node.nodeSize`).
 * @property {import('prosemirror-model').Node} node
 */

/**
 * @typedef {Object} StructuralChange
 * @property {string} id                 Logical (and public) change id (stable per table+side).
 * @property {string} revisionId         Representative revision id (first row's id; ids may differ).
 * @property {'insertion'|'deletion'} side
 * @property {'table-insert'|'table-delete'} subtype
 * @property {number} tableFrom          Table node start.
 * @property {number} tableTo            Table node end.
 * @property {number} tablePos           Table node start (alias of tableFrom).
 * @property {boolean} wholeTable        True when every row of the table is tracked and shares one side.
 * @property {boolean} decidable         True only for whole-table changes; false fails closed on decide.
 * @property {string} [undecidableReason] Why a non-whole-table shape is not decidable.
 * @property {Array<StructuralRowRef>} rows
 * @property {string} author
 * @property {string} authorEmail
 * @property {string} authorImage
 * @property {string} date
 * @property {string} importedAuthor
 * @property {string} sourceId
 * @property {string} revisionGroupId
 */

/**
 * Enumerate structural row changes (whole-table insert/delete) in the doc.
 *
 * Tolerates a missing/partial state and returns `[]` instead of throwing, to
 * match the inline enumerators' bootstrap-safety contract.
 *
 * @param {import('prosemirror-state').EditorState | { doc?: import('prosemirror-model').Node } | null | undefined} state
 * @returns {Array<StructuralChange>}
 */
export const enumerateStructuralRowChanges = (state) => {
  const doc = state?.doc;
  if (!doc) return [];

  /** @type {Array<StructuralChange>} */
  const out = [];

  try {
    doc.descendants((node, pos) => {
      if (node.type?.name !== 'table') return undefined;
      collectTableStructuralChanges({ table: node, tablePos: pos, out });
      // Keep walking so a nested table inside a (possibly non-tracked) cell is
      // still discovered as its own independent change.
      return true;
    });
  } catch {
    return out;
  }

  return out;
};

/**
 * @param {{ table: import('prosemirror-model').Node, tablePos: number, out: Array<StructuralChange> }} input
 */
const collectTableStructuralChanges = ({ table, tablePos, out }) => {
  const tableFrom = tablePos;
  const tableTo = tablePos + table.nodeSize;

  /** @type {Array<{ ref: StructuralRowRef, side: 'insertion'|'deletion', tc: Record<string, any> }>} */
  const trackedRows = [];
  let totalRows = 0;

  // Row children are direct children of the table node; their absolute position
  // is `tablePos + 1 + offsetWithinTable`.
  let offset = 1;
  table.forEach((child) => {
    const childFrom = tablePos + offset;
    offset += child.nodeSize;
    if (child.type?.name !== 'tableRow') return;
    totalRows += 1;
    const tc = child.attrs?.trackChange;
    if (!tc || (tc.type !== 'rowInsert' && tc.type !== 'rowDelete')) return;
    const side = tc.type === 'rowInsert' ? 'insertion' : 'deletion';
    trackedRows.push({
      ref: { pos: childFrom, from: childFrom, to: childFrom + child.nodeSize, node: child },
      side,
      tc,
    });
  });

  if (trackedRows.length === 0) return;

  const sides = new Set(trackedRows.map((r) => r.side));
  const everyRowTracked = trackedRows.length === totalRows && totalRows > 0;
  const singleSide = sides.size === 1;
  const wholeTable = everyRowTracked && singleSide;

  if (wholeTable) {
    const side = /** @type {'insertion'|'deletion'} */ (trackedRows[0].side);
    const primary = trackedRows[0].tc;
    const representativeRevisionId = stringOf(primary.id) || stringOf(primary.sourceId);
    // A stable public id derived from the first row's sourceId (Word w:id) so it
    // survives import → export → reopen; falls back to the table position when
    // there is no source id (native, freshly authored). Table-scoped so two
    // tracked tables that happen to share a Word id never collapse.
    const publicId = stringOf(primary.sourceId) || representativeRevisionId || `table:${tableFrom}:${side}`;
    out.push({
      id: publicId,
      revisionId: representativeRevisionId,
      side,
      subtype: side === 'insertion' ? 'table-insert' : 'table-delete',
      tableFrom,
      tableTo,
      tablePos,
      wholeTable: true,
      decidable: true,
      rows: trackedRows.map((r) => r.ref),
      author: stringOf(primary.author),
      authorEmail: stringOf(primary.authorEmail),
      authorImage: stringOf(primary.authorImage),
      date: stringOf(primary.date),
      importedAuthor: stringOf(primary.importedAuthor),
      sourceId: stringOf(primary.sourceId),
      revisionGroupId: stringOf(primary.revisionGroupId) || representativeRevisionId || publicId,
    });
    return;
  }

  // NOT a whole-table change: either a partial subset of rows is tracked, or
  // the sides are mixed within one table. Surface it (so it is never silently
  // dropped) but mark it undecidable so the decision engine fails it closed and
  // NEVER removes the table. We emit ONE entry per table here (not per id), with
  // a side chosen only for display purposes when uniform, else the first row's.
  const side = /** @type {'insertion'|'deletion'} */ (trackedRows[0].side);
  const primary = trackedRows[0].tc;
  const representativeRevisionId = stringOf(primary.id) || stringOf(primary.sourceId);
  const reason = !everyRowTracked ? 'partial-rows' : 'mixed-sides';
  out.push({
    id: stringOf(primary.sourceId) || representativeRevisionId || `table:${tableFrom}:${side}`,
    revisionId: representativeRevisionId,
    side,
    subtype: side === 'insertion' ? 'table-insert' : 'table-delete',
    tableFrom,
    tableTo,
    tablePos,
    wholeTable: false,
    decidable: false,
    undecidableReason: reason,
    rows: trackedRows.map((r) => r.ref),
    author: stringOf(primary.author),
    authorEmail: stringOf(primary.authorEmail),
    authorImage: stringOf(primary.authorImage),
    date: stringOf(primary.date),
    importedAuthor: stringOf(primary.importedAuthor),
    sourceId: stringOf(primary.sourceId),
    revisionGroupId: stringOf(primary.revisionGroupId) || representativeRevisionId,
  });
};

const stringOf = (value) => (typeof value === 'string' ? value : value == null ? '' : String(value));
