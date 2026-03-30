/**
 * Prepare table rows for vertical merge export by inserting merge placeholders.
 * @param {import('prosemirror-model').Node} table
 * @param {object} options
 */
const getColspan = (cell) => {
  const rawColspan = cell?.attrs?.colspan;
  const numericColspan = typeof rawColspan === 'string' ? parseInt(rawColspan, 10) : rawColspan;
  return Number.isFinite(numericColspan) && numericColspan > 0 ? numericColspan : 1;
};

const resolveGridBefore = (row) => {
  const rawGridBefore = row?.attrs?.tableRowProperties?.gridBefore ?? row?.attrs?.gridBefore;
  const numericGridBefore = typeof rawGridBefore === 'string' ? parseInt(rawGridBefore, 10) : rawGridBefore;
  if (!Number.isFinite(numericGridBefore) || numericGridBefore <= 0) return 0;

  const cells = Array.isArray(row.content) ? row.content : [];
  let leadingGridBefore = 0;
  while (leadingGridBefore < cells.length && cells[leadingGridBefore]?.attrs?.__placeholder === 'gridBefore') {
    leadingGridBefore += 1;
  }

  return leadingGridBefore > 0 ? 0 : numericGridBefore;
};

const advanceColumnsForCell = (columnIndex, cell) => columnIndex + getColspan(cell);

const getCellStartColumn = (row, targetCell) => {
  const cells = Array.isArray(row.content) ? row.content : [];
  let columnIndex = resolveGridBefore(row);

  for (const cell of cells) {
    if (cell === targetCell) return columnIndex;
    columnIndex = advanceColumnsForCell(columnIndex, cell);
  }

  return columnIndex;
};

const findCellCoveringColumn = (row, targetColumn) => {
  const cells = Array.isArray(row.content) ? row.content : [];
  let columnIndex = resolveGridBefore(row);

  for (const cell of cells) {
    const colspan = getColspan(cell);
    if (targetColumn >= columnIndex && targetColumn < columnIndex + colspan) {
      return cell;
    }
    columnIndex = advanceColumnsForCell(columnIndex, cell);
  }

  return null;
};

const findInsertionIndexForColumn = (row, targetColumn) => {
  const cells = Array.isArray(row.content) ? row.content : [];
  let columnIndex = resolveGridBefore(row);

  for (let index = 0; index < cells.length; index++) {
    if (columnIndex >= targetColumn) return index;
    columnIndex = advanceColumnsForCell(columnIndex, cells[index]);
  }

  return cells.length;
};

export function preProcessVerticalMergeCells(table, { editorSchema }) {
  if (!table || !Array.isArray(table.content)) {
    return table;
  }

  const rows = table.content;

  for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
    const row = rows[rowIndex];
    if (!row) continue;

    if (!Array.isArray(row.content)) {
      row.content = [];
    }

    for (let cellIndex = 0; cellIndex < row.content.length; cellIndex++) {
      const cell = row.content[cellIndex];
      if (!cell) continue;

      const attrs = cell.attrs || {};
      const rawRowspan = typeof attrs.rowspan === 'string' ? parseInt(attrs.rowspan, 10) : attrs.rowspan;
      if (!Number.isFinite(rawRowspan) || rawRowspan <= 1) continue;

      const maxRowspan = Math.min(rawRowspan, rows.length - rowIndex);
      const startColumn = getCellStartColumn(row, cell);

      for (let offset = 1; offset < maxRowspan; offset++) {
        const rowToChange = rows[rowIndex + offset];
        if (!rowToChange) continue;

        if (!Array.isArray(rowToChange.content)) {
          rowToChange.content = [];
        }

        const existingCell = findCellCoveringColumn(rowToChange, startColumn);
        if (existingCell?.attrs?.continueMerge) continue;

        const mergedCell = {
          type: cell.type,
          content: [editorSchema.nodes.paragraph.createAndFill().toJSON()],
          attrs: {
            ...cell.attrs,
            rowspan: null,
            continueMerge: true,
          },
        };

        const insertionIndex = findInsertionIndexForColumn(rowToChange, startColumn);
        rowToChange.content.splice(insertionIndex, 0, mergedCell);
      }
    }
  }

  return table;
}
