/**
 * Insert a table node at an absolute document position.
 *
 * Supports deterministic block id assignment and operation-scoped
 * tracked-change conversion via transaction meta.
 *
 * @param {{ pos: number; rows: number; columns: number; sdBlockId?: string; tracked?: boolean }} options
 * @returns {import('./types/index.js').Command}
 */
export const insertTableAt =
  ({ pos, rows, columns, sdBlockId, tracked }) =>
  ({ state, dispatch }) => {
    const tableType = state.schema.nodes.table;
    const tableRowType = state.schema.nodes.tableRow;
    const tableCellType = state.schema.nodes.tableCell;
    if (!tableType || !tableRowType || !tableCellType) return false;
    if (!Number.isInteger(pos) || pos < 0 || pos > state.doc.content.size) return false;
    if (!Number.isInteger(rows) || rows < 1) return false;
    if (!Number.isInteger(columns) || columns < 1) return false;

    try {
      const cellNodes = [];
      for (let c = 0; c < columns; c++) {
        const cell = tableCellType.createAndFill();
        if (!cell) return false;
        cellNodes.push(cell);
      }

      const rowNodes = [];
      for (let r = 0; r < rows; r++) {
        const row = tableRowType.createChecked(null, cellNodes);
        rowNodes.push(row);
      }

      const tableAttrs = sdBlockId ? { sdBlockId } : undefined;
      const tableNode = tableType.createChecked(tableAttrs, rowNodes);

      const tr = state.tr.insert(pos, tableNode);
      if (!dispatch) return true;
      tr.setMeta('inputType', 'programmatic');
      if (tracked === true) tr.setMeta('forceTrackChanges', true);
      else if (tracked === false) tr.setMeta('skipTrackChanges', true);
      dispatch(tr);
      return true;
    } catch {
      return false;
    }
  };
