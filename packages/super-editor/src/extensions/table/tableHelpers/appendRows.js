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
    const attrs = { ...cellNode.attrs };
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

  // Build row with formatting using existing helper
  const newRow = buildRowFromTemplateRow({
    schema,
    tableNode,
    templateRow: sourceRow,
    values: [],
    copyRowStyle: true,
  });
  if (!newRow) return false;

  // Calculate insert position
  let insertPos = tablePos + 1;
  for (let i = 0; i < insertIndex; i++) {
    insertPos += tableNode.child(i).nodeSize;
  }

  tr.insert(insertPos, newRow);

  // Set cursor in first cell's paragraph and apply stored marks
  const formatting = extractRowTemplateFormatting(sourceRow.firstChild, schema);
  const cursorPos = insertPos + 3; // row start + cell start + paragraph start
  tr.setSelection(TextSelection.create(tr.doc, cursorPos));
  if (formatting.textMarks?.length) {
    tr.setStoredMarks(formatting.textMarks);
  }

  return true;
}
