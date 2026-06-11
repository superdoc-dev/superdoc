// @ts-check
/**
 * Collect every WHOLE `table` node fully bracketed by `[from, to)` in `doc`
 * (the table node starts at/after `from` and ends at/before `to`). A table that
 * merely OVERLAPS the range — a partial row/column change, or a row added to an
 * existing table — is skipped. A nested table inside a captured table is not
 * descended into: it belongs to the same whole-table operation, not a separate
 * one.
 *
 * Single owner of the "is this range a clean whole-table operation" walk, shared
 * by the structural insert/delete authoring paths (`replaceStep`) and the row
 * stamper (`stampTableRows`).
 *
 * @param {{ doc: import('prosemirror-model').Node, from: number, to: number }} options
 * @returns {Array<{ pos: number, node: import('prosemirror-model').Node, from: number, to: number }>}
 */
export const collectWholeTablesInRange = ({ doc, from, to }) => {
  if (!doc || typeof from !== 'number' || typeof to !== 'number' || to <= from) return [];

  const boundedFrom = Math.max(0, from);
  const boundedTo = Math.min(doc.content.size, to);
  if (boundedTo <= boundedFrom) return [];

  /** @type {Array<{ pos: number, node: import('prosemirror-model').Node, from: number, to: number }>} */
  const tables = [];
  doc.nodesBetween(boundedFrom, boundedTo, (node, pos) => {
    if (node.type?.name !== 'table') return true;
    if (pos >= boundedFrom && pos + node.nodeSize <= boundedTo) {
      tables.push({ pos, node, from: pos, to: pos + node.nodeSize });
      return false; // don't descend into a captured table
    }
    return true;
  });
  return tables;
};
