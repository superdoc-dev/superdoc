// @ts-check
import { CellSelection, TableMap } from 'prosemirror-tables';
import { cellAround } from './cellAround.js';

/**
 * Toggle header-row status on one or more table rows.
 *
 * This command sets **both** the cell node type (`tableHeader` ↔ `tableCell`)
 * and the OOXML repeat-header flag (`tableRowProperties.repeatHeader`) in a
 * single transaction so that undo reverts both changes atomically.
 *
 * ### Three distinct header concepts (do not conflate):
 * - **Repeat Header Row** — `tableRowProperties.repeatHeader` (OOXML `w:tblHeader`).
 *   Controls whether the row repeats on continuation pages during pagination.
 * - **First Row Style Option** — `tableProperties.tblLook.firstRow`.
 *   Controls conditional formatting from the table style. NOT set by this command.
 * - **Header Cell (`<th>`)** — `tableHeader` node type. HTML semantics only;
 *   does not imply repeat-header on its own.
 *
 * @param {import('prosemirror-state').EditorState} state
 * @param {((tr: import('prosemirror-state').Transaction) => void)} [dispatch]
 * @returns {boolean} `true` if the command can (or did) execute, `false` otherwise.
 */
export function toggleHeaderRow(state, dispatch) {
  const target = resolveTarget(state);
  if (!target) return false;

  if (dispatch) {
    const { tableStart, tableNode, rowIndices } = target;
    const firstRowNode = tableNode.child(rowIndices[0]);
    const togglingOn = !firstRowNode.attrs.tableRowProperties?.repeatHeader;

    const tr = state.tr;
    const headerType = state.schema.nodes.tableHeader;
    const cellType = state.schema.nodes.tableCell;
    const headerColumnIndices = togglingOn ? null : getHeaderColumnIndices(tableNode, rowIndices);

    for (const rowIndex of rowIndices) {
      const rowPos = rowPositionByIndex(tableStart, tableNode, rowIndex);
      toggleRowCellTypes(tr, rowPos, togglingOn, headerType, cellType, headerColumnIndices);
      setRepeatHeader(tr, rowPos, togglingOn);
    }

    dispatch(tr);
  }

  return true;
}

// ---------------------------------------------------------------------------
// Target resolution
// ---------------------------------------------------------------------------

/**
 * Resolve the table context and target row indices from the current selection.
 *
 * @returns {{ tableStart: number, tableNode: *, rowIndices: number[] } | null}
 */
function resolveTarget(state) {
  const { selection } = state;

  if (selection instanceof CellSelection) {
    return resolveFromCellSelection(selection);
  }

  const $cell = cellAround(selection.$from);
  if (!$cell) return null;

  const tableNode = findTableAncestor($cell);
  if (!tableNode) return null;

  const tableStart = tableStartFromCell($cell);
  const rowIndex = findRowIndex($cell);
  if (rowIndex == null) return null;

  return { tableStart, tableNode, rowIndices: [rowIndex] };
}

/**
 * Resolve target from a CellSelection. Uses the selection rect to enumerate
 * row indices directly, avoiding the merged-cell deduplication problem where
 * resolving rows from cell positions can miss rows spanned by rowspan cells.
 */
function resolveFromCellSelection(cellSelection) {
  const $anchor = cellSelection.$anchorCell;
  const tableStart = $anchor.start(-1);
  const tableNode = $anchor.node(-1);
  const map = TableMap.get(tableNode);
  const rect = map.rectBetween($anchor.pos - tableStart, cellSelection.$headCell.pos - tableStart);

  const rowIndices = [];
  for (let row = rect.top; row < rect.bottom; row++) {
    rowIndices.push(row);
  }

  return rowIndices.length ? { tableStart, tableNode, rowIndices } : null;
}

// ---------------------------------------------------------------------------
// Header-column awareness
// ---------------------------------------------------------------------------

/**
 * Identify which column indices have header-column status (cells that are
 * `tableHeader` in rows NOT being toggled). When toggling a row OFF, cells
 * in these columns should remain `tableHeader` to preserve header-column state.
 *
 * @param {*} tableNode
 * @param {number[]} toggledRowIndices - Row indices being toggled (excluded from detection).
 * @returns {Set<number>}
 */
function getHeaderColumnIndices(tableNode, toggledRowIndices) {
  const toggledSet = new Set(toggledRowIndices);
  const headerColumns = new Set();
  const map = TableMap.get(tableNode);

  // Check each column: if any non-toggled row has a tableHeader cell in that
  // column, consider it a header column.
  for (let col = 0; col < map.width; col++) {
    for (let row = 0; row < map.height; row++) {
      if (toggledSet.has(row)) continue;
      const cellOffset = map.map[row * map.width + col];
      const cell = tableNode.nodeAt(cellOffset);
      if (cell && cell.type.spec.tableRole === 'header_cell') {
        headerColumns.add(col);
        break;
      }
    }
  }

  return headerColumns;
}

// ---------------------------------------------------------------------------
// Cell type and row property mutation
// ---------------------------------------------------------------------------

/**
 * Convert cells in a row to the appropriate type, preserving every existing
 * attribute (colspan, rowspan, colwidth, background, tableCellProperties, etc.).
 *
 * When toggling OFF, cells in header-column positions are left as `tableHeader`.
 *
 * @param {*} tr
 * @param {number} rowPos - Absolute position of the row node (pre-mapping).
 * @param {boolean} togglingOn - True if making the row a header, false if removing.
 * @param {*} headerType - Schema node type for tableHeader.
 * @param {*} cellType - Schema node type for tableCell.
 * @param {Set<number> | null} headerColumnIndices - Columns to preserve as header when toggling off.
 */
function toggleRowCellTypes(tr, rowPos, togglingOn, headerType, cellType, headerColumnIndices) {
  const mappedRowPos = tr.mapping.map(rowPos);
  const rowNode = tr.doc.nodeAt(mappedRowPos);
  let offset = mappedRowPos + 1; // step inside the row node
  let colIndex = 0;

  rowNode.forEach((cell) => {
    const targetType = resolveTargetCellType(colIndex, togglingOn, headerType, cellType, headerColumnIndices);
    if (cell.type !== targetType) {
      tr.setNodeMarkup(offset, targetType, cell.attrs, cell.marks);
    }
    colIndex += cell.attrs.colspan || 1;
    offset += cell.nodeSize;
  });
}

/**
 * Determine the correct cell type for a cell during toggle.
 *
 * - Toggling ON: all cells become `tableHeader`.
 * - Toggling OFF: cells become `tableCell` unless they sit in a header column.
 */
function resolveTargetCellType(colIndex, togglingOn, headerType, cellType, headerColumnIndices) {
  if (togglingOn) return headerType;
  if (headerColumnIndices && headerColumnIndices.has(colIndex)) return headerType;
  return cellType;
}

/**
 * Set or unset `tableRowProperties.repeatHeader` on the row at the given position.
 */
function setRepeatHeader(tr, rowPos, value) {
  const mappedPos = tr.mapping.map(rowPos);
  const rowNode = tr.doc.nodeAt(mappedPos);
  const currentProps = rowNode.attrs.tableRowProperties ?? {};

  tr.setNodeMarkup(mappedPos, null, {
    ...rowNode.attrs,
    tableRowProperties: {
      ...currentProps,
      repeatHeader: value,
    },
  });
}

// ---------------------------------------------------------------------------
// Table / row position utilities
// ---------------------------------------------------------------------------

/**
 * Get the absolute position of a row by its index within the table.
 */
function rowPositionByIndex(tableStart, tableNode, rowIndex) {
  let pos = tableStart; // position after the table open token
  for (let i = 0; i < rowIndex; i++) {
    pos += tableNode.child(i).nodeSize;
  }
  return pos;
}

/**
 * Find the row index of the row containing the resolved cell position.
 */
function findRowIndex($cell) {
  for (let d = $cell.depth; d > 0; d--) {
    if ($cell.node(d).type.spec.tableRole === 'row') {
      return $cell.index(d - 1);
    }
  }
  return null;
}

/**
 * Find the table node ancestor from a resolved cell position.
 */
function findTableAncestor($cell) {
  for (let d = $cell.depth; d > 0; d--) {
    if ($cell.node(d).type.spec.tableRole === 'table') {
      return $cell.node(d);
    }
  }
  return null;
}

/**
 * Get the absolute start position of the table's content (after the open token)
 * from a resolved cell position.
 */
function tableStartFromCell($cell) {
  for (let d = $cell.depth; d > 0; d--) {
    if ($cell.node(d).type.spec.tableRole === 'table') {
      return $cell.before(d) + 1;
    }
  }
  return null;
}
