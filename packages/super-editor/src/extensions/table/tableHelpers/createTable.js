// @ts-check
import { getNodeType } from '@core/helpers/getNodeType.js';
import { createCell } from './createCell.js';
import { createTableBorders } from './createTableBorders.js';

/**
 * Create a new table with specified dimensions
 * @private
 * @category Helper
 * @param {Object} schema - Editor schema
 * @param {number} rowsCount - Number of rows
 * @param {number} colsCount - Number of columns
 * @param {boolean} withHeaderRow - Create first row as header
 * @param {Object} [cellContent=null] - Initial cell content
 * @param {number[]} [columnWidths=null] - Array of pixel widths per column
 * @returns {Object} Complete table node with borders
 * @example
 * const table = createTable(schema, 3, 3, true)
 * @example
 * const table = createTable(schema, 2, 4, false, paragraphNode)
 * @example
 * const table = createTable(schema, 3, 3, false, null, [200, 100, 200])
 */
export const createTable = (schema, rowsCount, colsCount, withHeaderRow, cellContent = null, columnWidths = null) => {
  const types = {
    table: getNodeType('table', schema),
    tableRow: getNodeType('tableRow', schema),
    tableCell: getNodeType('tableCell', schema),
    tableHeader: getNodeType('tableHeader', schema),
  };

  const headerCells = [];
  const cells = [];

  for (let index = 0; index < colsCount; index++) {
    const cellAttrs = columnWidths ? { colwidth: [columnWidths[index]] } : null;
    const cell = createCell(types.tableCell, cellContent, cellAttrs);
    if (cell) cells.push(cell);
    if (withHeaderRow) {
      const headerCell = createCell(types.tableHeader, cellContent, cellAttrs);
      if (headerCell) {
        headerCells.push(headerCell);
      }
    }
  }

  const rows = [];

  for (let index = 0; index < rowsCount; index++) {
    const cellsToInsert = withHeaderRow && index === 0 ? headerCells : cells;
    rows.push(types.tableRow.createChecked(null, cellsToInsert));
  }

  const tableBorders = createTableBorders();

  return types.table.createChecked({ borders: tableBorders }, rows);
};
