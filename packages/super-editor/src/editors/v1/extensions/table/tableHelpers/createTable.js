// @ts-check
import { getNodeType } from '@core/helpers/getNodeType.js';
import { createCell } from './createCell.js';
import { generateDocxHexId } from '../../../utils/generateDocxHexId.js';
import { cellWidthDxa } from './cellWidth.js';

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
 * @param {Object} [tableAttrsOverride=null] - Table attributes (tableStyleId, borders, tableProperties, etc.)
 * @returns {Object} Complete table node
 * @example
 * const table = createTable(schema, 3, 3, true)
 * @example
 * const table = createTable(schema, 2, 4, false, paragraphNode)
 * @example
 * const table = createTable(schema, 3, 3, false, null, [200, 100, 200])
 */
export const createTable = (
  schema,
  rowsCount,
  colsCount,
  withHeaderRow,
  cellContent = null,
  columnWidths = null,
  tableAttrsOverride = null,
) => {
  const types = {
    table: getNodeType('table', schema),
    tableRow: getNodeType('tableRow', schema),
    tableCell: getNodeType('tableCell', schema),
    tableHeader: getNodeType('tableHeader', schema),
  };

  const headerCells = [];
  const cells = [];

  for (let index = 0; index < colsCount; index++) {
    // Word writes w:tcW on every cell it inserts; the concrete cell width marks
    // the grid as a real layout cache so the measuring pass preserves the
    // requested column widths instead of content-sizing the table as pure-auto.
    // (SD-3308)
    const cellAttrs = columnWidths
      ? {
          colwidth: [columnWidths[index]],
          tableCellProperties: {
            cellWidth: cellWidthDxa(columnWidths[index]),
          },
        }
      : null;
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
    const isHeader = withHeaderRow && index === 0;
    const cellsToInsert = isHeader ? headerCells : cells;
    const rowAttrs = {
      ...(isHeader ? { tableRowProperties: { repeatHeader: true } } : {}),
      paraId: generateDocxHexId(),
    };
    rows.push(types.tableRow.createChecked(rowAttrs, cellsToInsert));
  }

  return types.table.createChecked(tableAttrsOverride, rows);
};
