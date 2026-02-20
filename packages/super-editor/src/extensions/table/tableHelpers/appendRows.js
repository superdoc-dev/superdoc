// @ts-check
import { Fragment } from 'prosemirror-model';
import { TableMap } from 'prosemirror-tables';
import { TextSelection } from 'prosemirror-state';

/**
 * Zero-width space used as a placeholder to carry marks in empty cells.
 * ProseMirror marks can only attach to text nodes, so we use this invisible
 * character to preserve formatting (bold, underline, etc.) in empty cells.
 */
const ZERO_WIDTH_SPACE = '\u200B';

/**
 * Offset from a row's start position to the first text position inside its first cell.
 * Calculated as: row open (1) + cell open (1) + paragraph open (1) = 3
 */
const ROW_START_TO_TEXT_OFFSET = 3;

/**
 * Offset from a cell's position to the first text position inside it.
 * Calculated as: cell open (1) + paragraph open (1) = 2
 */
const CELL_TO_TEXT_OFFSET = 2;

/**
 * When converting tableHeader nodes into tableCell nodes, avoid passing
 * `borders: null` so tableCell defaults can apply.
 *
 * @param {Record<string, any>} attrs
 * @returns {Record<string, any>}
 */
const normalizeHeaderAttrsForBodyCell = (attrs) => {
  if (attrs?.borders !== null) return attrs;
  const nextAttrs = { ...attrs };
  delete nextAttrs.borders;
  return nextAttrs;
};

/**
 * Row template formatting
 * @typedef {Object} RowTemplateFormatting
 * @property {import('prosemirror-model').NodeType} blockType - Node type used when building cell content
 * @property {Object|null} blockAttrs - Attributes to apply to the created block node
 * @property {Array<import('prosemirror-model').Mark>} textMarks - Marks copied from the template text node
 */

/**
 * Build row from template row parameters
 * @typedef {Object} BuildRowFromTemplateRowParams
 * @property {import('prosemirror-model').Schema} schema - Editor schema
 * @property {import('prosemirror-model').Node} tableNode - Table node used for column map lookup
 * @property {import('prosemirror-model').Node} templateRow - Row providing structure and formatting
 * @property {Array} values - Values to populate each table cell
 * @property {boolean} [copyRowStyle=false] - Clone template marks and block attrs when true
 */

/**
 * Insert rows at table end parameters
 * @typedef {Object} InsertRowsAtTableEndParams
 * @property {import('prosemirror-state').Transaction} tr - Transaction to mutate
 * @property {number} tablePos - Absolute position of the target table
 * @property {import('prosemirror-model').Node} tableNode - Table node receiving new rows
 * @property {import('prosemirror-model').Node[]} rows - Row nodes to append
 */

/**
 * Resolve the table node that should receive appended rows.
 * Prefers an explicit table node, falling back to a position lookup.
 * @private
 * @param {import('prosemirror-state').Transaction} tr - Current transaction
 * @param {number} [tablePos] - Absolute position of the table in the document
 * @param {import('prosemirror-model').Node} [tableNode] - Explicit table node reference
 * @returns {import('prosemirror-model').Node|null} Table node to append rows to, or null if not found
 */
export function resolveTable(tr, tablePos, tableNode) {
  if (tableNode && tableNode.type && tableNode.type.name === 'table') {
    return tableNode;
  }

  if (typeof tablePos === 'number') {
    const current = tr.doc.nodeAt(tablePos);
    if (current && current.type.name === 'table') {
      return current;
    }
  }

  return null;
}

/**
 * Select the template row used to derive structure and attributes for appended rows.
 * Prefers the last body row (containing table cells) and falls back to the last row in the table.
 * @private
 * @param {import('prosemirror-model').Node} tableNode - Table node to inspect
 * @param {import('prosemirror-model').Schema} schema - Editor schema
 * @returns {import('prosemirror-model').Node|null} Template row node or null if none exist
 */
export function pickTemplateRowForAppend(tableNode, schema) {
  const RowType = schema.nodes.tableRow;
  const rows = [];
  tableNode.descendants((child) => {
    if (child.type === RowType) rows.push(child);
  });
  if (!rows.length) return null;
  for (let i = rows.length - 1; i >= 0; i--) {
    const r = rows[i];
    const hasBodyCell = r.content?.content?.some((c) => c.type.name === 'tableCell');
    if (hasBodyCell) return r;
  }
  return rows[rows.length - 1];
}

/**
 * Extract block type, attributes, and text marks from a template cell.
 * Used to reproduce formatting when constructing new row content.
 * @private
 * @param {import('prosemirror-model').Node} cellNode - Template cell node
 * @param {import('prosemirror-model').Schema} schema - Editor schema
 * @returns {RowTemplateFormatting} Formatting info
 */
export function extractRowTemplateFormatting(cellNode, schema) {
  const ParagraphType = schema.nodes.paragraph;
  let blockType = ParagraphType;
  let blockAttrs = null;
  let textMarks = [];
  const blocks = cellNode?.content?.content || [];
  for (const block of blocks) {
    const isParagraphish = block.type === ParagraphType || block.type.name === 'heading';
    if (isParagraphish) {
      blockType = block.type || ParagraphType;
      blockAttrs = block.attrs || null;
    }
    /** @type {import('prosemirror-model').Node | null} */
    let foundText = null;
    block.descendants?.((n) => {
      if (!foundText && n.isText) foundText = n;
    });
    if (foundText) {
      textMarks = foundText.marks ? Array.from(foundText.marks) : [];
      break;
    }
  }
  if (!blockType || !blockType.validContent) blockType = ParagraphType;
  return { blockType, blockAttrs, textMarks };
}

/**
 * Create a block node for a new cell, optionally applying marks from the template row.
 * @private
 * @param {import('prosemirror-model').Schema} schema - Editor schema
 * @param {string|any} value - Cell text value
 * @param {RowTemplateFormatting} formatting - Template formatting info
 * @param {boolean} [copyRowStyle=false] - Whether to copy marks from the template row
 * @returns {import('prosemirror-model').Node} Block node ready to insert into the cell
 */
export function buildFormattedCellBlock(schema, value, { blockType, blockAttrs, textMarks }, copyRowStyle = false) {
  const text = typeof value === 'string' ? value : value == null ? '' : String(value);
  const type = blockType || schema.nodes.paragraph;
  const marks = copyRowStyle ? textMarks || [] : [];

  if (!text) {
    // Use zero-width space to preserve marks in empty cells when copying style
    const content = marks.length > 0 ? schema.text(ZERO_WIDTH_SPACE, marks) : null;
    return type.createAndFill(blockAttrs || null, content);
  }

  const textNode = schema.text(text, marks);
  return type.createAndFill(blockAttrs || null, textNode);
}

/**
 * Construct a new table row by cloning structure from a template row and filling in values.
 * Handles colspan-based value mapping and optional style copying.
 * @private
 * @param {BuildRowFromTemplateRowParams} params - Build parameters
 * @returns {import('prosemirror-model').Node|null} Newly created table row node
 */
export function buildRowFromTemplateRow({ schema, tableNode, templateRow, values, copyRowStyle = false }) {
  const RowType = schema.nodes.tableRow;
  const CellType = schema.nodes.tableCell;
  const HeaderType = schema.nodes.tableHeader;
  const map = TableMap.get(tableNode);
  const totalColumns = map.width;
  const byColumns = Array.isArray(values) && values.length === totalColumns;

  const newCells = [];
  let columnCursor = 0;
  templateRow.content.content.forEach((cellNode, cellIndex) => {
    const isHeaderCell = cellNode.type === HeaderType;
    const targetCellType = isHeaderCell ? CellType : cellNode.type;
    const attrs = isHeaderCell ? normalizeHeaderAttrsForBodyCell({ ...cellNode.attrs }) : { ...cellNode.attrs };
    const formatting = extractRowTemplateFormatting(cellNode, schema);

    let cellValue = '';
    if (byColumns) {
      const span = Math.max(1, attrs.colspan || 1);
      cellValue = values[columnCursor] ?? '';
      columnCursor += span;
    } else {
      cellValue = Array.isArray(values) ? (values[cellIndex] ?? '') : '';
    }

    const content = buildFormattedCellBlock(schema, cellValue, formatting, copyRowStyle);
    const newCell = targetCellType.createAndFill(attrs, content);
    if (newCell) newCells.push(newCell);
  });

  return RowType.createAndFill(null, newCells);
}

/**
 * Append one or more rows to the end of a table in a single transaction.
 * @private
 * @param {InsertRowsAtTableEndParams} params - Insert parameters
 */
export function insertRowsAtTableEnd({ tr, tablePos, tableNode, rows }) {
  if (!rows || !rows.length) return;
  const RowTypeName = 'tableRow';
  let lastRowRelPos = 0;
  /** @type {import('prosemirror-model').Node | null} */
  let lastRowNode = null;
  tableNode.descendants((child, relPos) => {
    if (child.type.name === RowTypeName) {
      lastRowRelPos = relPos;
      lastRowNode = child;
    }
  });
  if (!lastRowNode) return;
  const lastRowAbsEnd = tablePos + 1 + lastRowRelPos + lastRowNode.nodeSize;
  const frag = Fragment.fromArray(rows);
  tr.insert(lastRowAbsEnd, frag);
}

/**
 * Insert a new row at a specific index, copying formatting from a source row.
 * Handles rowspan cells properly by incrementing their rowspan when they span
 * across the insertion point.
 * @param {Object} params - Insert parameters
 * @param {import('prosemirror-state').Transaction} params.tr - Transaction to mutate
 * @param {number} params.tablePos - Absolute position of the table
 * @param {import('prosemirror-model').Node} params.tableNode - Table node
 * @param {number} params.sourceRowIndex - Index of the row to copy formatting from
 * @param {number} params.insertIndex - Index where the new row should be inserted
 * @param {import('prosemirror-model').Schema} params.schema - Editor schema
 * @returns {boolean} True if successful
 */
export function insertRowAtIndex({ tr, tablePos, tableNode, sourceRowIndex, insertIndex, schema }) {
  const sourceRow = tableNode.child(sourceRowIndex);
  if (!sourceRow) return false;

  const map = TableMap.get(tableNode);
  const { width, height } = map;

  // Track which columns are occupied by spanning cells from above
  // and collect the cells we need to create for the new row
  const newCells = [];
  const cellsToExtend = []; // { pos: number, attrs: object }

  const RowType = schema.nodes.tableRow;
  const CellType = schema.nodes.tableCell;

  // Get formatting from source row for new cells
  const sourceFormatting = extractRowTemplateFormatting(sourceRow.firstChild, schema);

  for (let col = 0; col < width; ) {
    // Check if we're inserting within an existing table (not at the end)
    // and if a cell from above spans into this row
    if (insertIndex > 0 && insertIndex < height) {
      const indexAbove = (insertIndex - 1) * width + col;
      const indexAtInsert = insertIndex * width + col;

      // If the cell position is the same, a cell from above spans into this position
      if (map.map[indexAbove] === map.map[indexAtInsert]) {
        const cellPos = map.map[indexAbove];
        const cell = tableNode.nodeAt(cellPos);
        if (cell) {
          const attrs = cell.attrs;
          // Record this cell needs its rowspan extended
          cellsToExtend.push({
            pos: tablePos + 1 + cellPos,
            attrs: { ...attrs, rowspan: (attrs.rowspan || 1) + 1 },
          });
          // Skip the columns this cell spans
          col += attrs.colspan || 1;
          continue;
        }
      }
    }

    // Use TableMap to find the cell at this column in the source row
    // This correctly handles cases where the source row has cells from rowspans above
    const sourceMapIndex = sourceRowIndex * width + col;
    const sourceCellPos = map.map[sourceMapIndex];
    const sourceCell = tableNode.nodeAt(sourceCellPos);

    if (!sourceCell) {
      // Fallback: use the first cell of the source row
      const fallbackCell = sourceRow.firstChild;
      const formatting = extractRowTemplateFormatting(fallbackCell, schema);
      const content = buildFormattedCellBlock(schema, '', formatting, true);
      const newCell = CellType.createAndFill({ rowspan: 1, colspan: 1 }, content);
      if (newCell) newCells.push(newCell);
      col += 1;
      continue;
    }

    const colspan = sourceCell.attrs.colspan || 1;
    const formatting = extractRowTemplateFormatting(sourceCell, schema);

    // Create a new cell with formatting but reset rowspan to 1
    const cellAttrs = {
      ...sourceCell.attrs,
      rowspan: 1, // New cells always have rowspan 1
    };

    const content = buildFormattedCellBlock(schema, '', formatting, true);
    const targetCellType = sourceCell.type.name === 'tableHeader' ? CellType : sourceCell.type;
    const normalizedCellAttrs =
      sourceCell.type.name === 'tableHeader' ? normalizeHeaderAttrsForBodyCell(cellAttrs) : cellAttrs;
    const newCell = targetCellType.createAndFill(normalizedCellAttrs, content);
    if (newCell) newCells.push(newCell);

    col += colspan;
  }

  // Apply rowspan extensions to spanning cells (before insert to maintain positions)
  for (const { pos, attrs } of cellsToExtend) {
    tr.setNodeMarkup(pos, null, attrs);
  }

  // Calculate insert position
  let insertPos = tablePos + 1;
  for (let i = 0; i < insertIndex; i++) {
    insertPos += tableNode.child(i).nodeSize;
  }

  // Create and insert the new row (only if we have cells to add)
  if (newCells.length > 0) {
    const newRow = RowType.createAndFill(null, newCells);
    if (newRow) {
      tr.insert(insertPos, newRow);

      // Set cursor in first cell's paragraph and apply stored marks
      const cursorPos = insertPos + ROW_START_TO_TEXT_OFFSET;
      tr.setSelection(TextSelection.create(tr.doc, cursorPos));

      // Get formatting from the first CREATED cell, not sourceRow.firstChild
      // This fixes cursor marks when column 0 is spanned and cursor lands in a different column
      const firstCellBlock = newCells[0].firstChild;
      const firstTextNode = firstCellBlock?.firstChild;
      if (firstTextNode?.marks?.length) {
        tr.setStoredMarks(firstTextNode.marks);
      } else if (sourceFormatting.textMarks?.length) {
        tr.setStoredMarks(sourceFormatting.textMarks);
      }
    }
  } else {
    // Edge case: all columns are occupied by spanning cells from above.
    // The rowspans have already been extended (cellsToExtend), so inserting
    // a physical cell would create overlap/structural conflict.
    // Instead, place cursor in one of the extended spanning cells.
    if (cellsToExtend.length > 0) {
      const spanningCellPos = cellsToExtend[0].pos;
      const cursorPos = spanningCellPos + CELL_TO_TEXT_OFFSET;
      tr.setSelection(TextSelection.create(tr.doc, cursorPos));
    }
    // No row inserted - the spanning cells already cover this space
  }

  return true;
}
