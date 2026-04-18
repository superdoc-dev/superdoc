import type { Node as ProseMirrorNode } from 'prosemirror-model';
import type { Editor } from '../../core/Editor.js';
import type {
  BlockNodeAddress,
  TableAddress,
  TableCellAddress,
  TableCreateLocation,
  TableLocator,
  TableOrRowAddress,
} from '@superdoc/document-api';
import { TableMap } from 'prosemirror-tables';
import { getBlockIndex } from './index-cache.js';
import { findBlockById, findBlockByNodeIdOnly, toBlockAddress, type BlockCandidate } from './node-address-resolver.js';
import { DocumentApiAdapterError } from '../errors.js';

/**
 * Resolved table information from a {@link TableLocator}.
 */
export interface ResolvedTable {
  candidate: BlockCandidate;
  address: TableAddress;
}

/**
 * Validates a `target`/`nodeId` locator and resolves it to a {@link BlockCandidate}.
 *
 * This is the shared first step for all table locator resolution: validate
 * exactly one of `target`/`nodeId` is present, look up the candidate in the
 * block index, and verify it exists. Callers then apply their own node-type check.
 *
 * @throws {DocumentApiAdapterError} `INVALID_TARGET` if both or neither locator fields are provided.
 * @throws {DocumentApiAdapterError} `TARGET_NOT_FOUND` if the node cannot be found.
 */
function resolveLocatorToCandidate(
  editor: Editor,
  locator: { target?: BlockNodeAddress; nodeId?: string },
  operationName: string,
): BlockCandidate {
  const hasTarget = locator.target != null;
  const hasNodeId = locator.nodeId != null;

  if (hasTarget && hasNodeId) {
    throw new DocumentApiAdapterError(
      'INVALID_TARGET',
      `${operationName}: cannot combine target and nodeId. Use exactly one locator mode.`,
      { fields: ['target', 'nodeId'] },
    );
  }

  if (!hasTarget && !hasNodeId) {
    throw new DocumentApiAdapterError('INVALID_TARGET', `${operationName}: requires either target or nodeId.`, {
      fields: ['target', 'nodeId'],
    });
  }

  const index = getBlockIndex(editor);
  const candidate = hasTarget ? findBlockById(index, locator.target!) : findBlockByNodeIdOnly(index, locator.nodeId!);

  if (!candidate) {
    throw new DocumentApiAdapterError('TARGET_NOT_FOUND', `${operationName}: target was not found.`, {
      target: hasTarget ? locator.target : locator.nodeId,
    });
  }

  return candidate;
}

/**
 * Resolves a {@link TableLocator} to a table {@link BlockCandidate}.
 *
 * Accepts either `target` (a full {@link BlockNodeAddress}) or a bare
 * `nodeId` string. Validates that the resolved candidate is a table node.
 *
 * @throws {DocumentApiAdapterError} `INVALID_TARGET` if both or neither locator fields are provided.
 * @throws {DocumentApiAdapterError} `TARGET_NOT_FOUND` if the node cannot be found.
 * @throws {DocumentApiAdapterError} `INVALID_TARGET` if the resolved node is not a table.
 */
export function resolveTableLocator(editor: Editor, locator: TableLocator, operationName: string): ResolvedTable {
  const candidate = resolveLocatorToCandidate(editor, locator, operationName);

  if (candidate.nodeType !== 'table') {
    throw new DocumentApiAdapterError(
      'INVALID_TARGET',
      `${operationName}: target resolved to "${candidate.nodeType}", expected "table".`,
      { actualNodeType: candidate.nodeType, nodeId: candidate.nodeId },
    );
  }

  return { candidate, address: toBlockAddress(candidate) as TableAddress };
}

/**
 * Resolves a {@link TableCreateLocation} to an absolute document position.
 *
 * Handles `documentStart`, `documentEnd`, `before`, and `after` variants.
 *
 * @throws {DocumentApiAdapterError} `TARGET_NOT_FOUND` if the reference block cannot be found.
 */
export function resolveTableCreateLocation(
  editor: Editor,
  location: TableCreateLocation,
  operationName: string,
): number {
  if (location.kind === 'documentStart') return 0;
  if (location.kind === 'documentEnd') return editor.state.doc.content.size;

  const index = getBlockIndex(editor);
  const loc = location as { kind: 'before' | 'after'; target?: BlockNodeAddress; nodeId?: string };

  const target = loc.target != null ? findBlockById(index, loc.target) : findBlockByNodeIdOnly(index, loc.nodeId!);

  if (!target) {
    throw new DocumentApiAdapterError(
      'TARGET_NOT_FOUND',
      `${operationName}: reference block for "${location.kind}" placement was not found.`,
      { location },
    );
  }

  return location.kind === 'before' ? target.pos : target.end;
}

// ---------------------------------------------------------------------------
// Row resolution
// ---------------------------------------------------------------------------

/**
 * Resolved row within a table: the table context, the row node, its absolute
 * position, and its index within the table.
 */
export interface ResolvedRow {
  table: ResolvedTable;
  rowNode: ProseMirrorNode;
  rowPos: number;
  rowIndex: number;
}

/**
 * Backwards-compatible alternative to Array.prototype.findLast.
 */
function findLastCandidate(
  candidates: readonly BlockCandidate[],
  predicate: (candidate: BlockCandidate) => boolean,
): BlockCandidate | undefined {
  for (let i = candidates.length - 1; i >= 0; i--) {
    const candidate = candidates[i];
    if (predicate(candidate)) return candidate;
  }
  return undefined;
}

/**
 * Resolves a row within a table using the unified locator pattern.
 *
 * Uses node-type detection to determine addressing mode:
 * - If `target`/`nodeId` resolves to a `tableRow` → direct row locator mode.
 * - If `target`/`nodeId` resolves to a `table` → table-scoped mode (`rowIndex` required).
 *
 * @throws {DocumentApiAdapterError} Various target/validation errors.
 */
export function resolveRowLocator(
  editor: Editor,
  input: {
    target?: TableOrRowAddress;
    nodeId?: string;
    rowIndex?: number;
  },
  operationName: string,
): ResolvedRow {
  const candidate = resolveLocatorToCandidate(editor, input, operationName);

  // Direct row locator: target/nodeId points at a row node
  if (candidate.nodeType === 'tableRow') {
    if (input.rowIndex != null) {
      throw new DocumentApiAdapterError(
        'INVALID_TARGET',
        `${operationName}: rowIndex must not be provided when target is a row node. ` +
          `Either pass a table nodeId with rowIndex, or pass a row nodeId without rowIndex.`,
      );
    }

    const blockIndex = getBlockIndex(editor);
    const tableCandidate = findParentTable(blockIndex, candidate);
    if (!tableCandidate) {
      throw new DocumentApiAdapterError('TARGET_NOT_FOUND', `${operationName}: parent table for row was not found.`);
    }

    const rowIdx = getRowIndex(tableCandidate, candidate.pos);
    return {
      table: { candidate: tableCandidate, address: toBlockAddress(tableCandidate) as TableAddress },
      rowNode: candidate.node,
      rowPos: candidate.pos,
      rowIndex: rowIdx,
    };
  }

  // Table-scoped row locator: target/nodeId points at a table, rowIndex selects the row
  if (candidate.nodeType !== 'table') {
    throw new DocumentApiAdapterError(
      'INVALID_TARGET',
      `${operationName}: target resolved to "${candidate.nodeType}", expected "table" or "tableRow".`,
      { actualNodeType: candidate.nodeType, nodeId: candidate.nodeId },
    );
  }

  const table: ResolvedTable = { candidate, address: toBlockAddress(candidate) as TableAddress };

  if (input.rowIndex == null) {
    throw new DocumentApiAdapterError(
      'INVALID_TARGET',
      `${operationName}: rowIndex is required when target is a table.`,
    );
  }

  const rowCount = table.candidate.node.childCount;
  if (input.rowIndex < 0 || input.rowIndex >= rowCount) {
    throw new DocumentApiAdapterError(
      'INVALID_TARGET',
      `${operationName}: rowIndex ${input.rowIndex} is out of range (table has ${rowCount} rows).`,
    );
  }

  let rowPos = table.candidate.pos + 1; // +1 for table node open
  for (let i = 0; i < input.rowIndex; i++) {
    rowPos += table.candidate.node.child(i).nodeSize;
  }

  return {
    table,
    rowNode: table.candidate.node.child(input.rowIndex),
    rowPos,
    rowIndex: input.rowIndex,
  };
}

/**
 * Finds the parent table BlockCandidate for a given row position.
 */
function findParentTable(
  index: import('./node-address-resolver.js').BlockIndex,
  rowCandidate: BlockCandidate,
): BlockCandidate | undefined {
  // The table's pos must be less than the row's pos, and its end must be >= row's end.
  // Scan from the end so nested tables (which appear later in depth-first traversal)
  // are preferred over outer tables.
  return findLastCandidate(
    index.candidates,
    (c) => c.nodeType === 'table' && c.pos < rowCandidate.pos && c.end >= rowCandidate.end,
  );
}

/**
 * Computes the 0-based row index of a row at `rowPos` within a table.
 */
function getRowIndex(tableCandidate: BlockCandidate, rowPos: number): number {
  let pos = tableCandidate.pos + 1;
  const tableNode = tableCandidate.node;
  for (let i = 0; i < tableNode.childCount; i++) {
    if (pos === rowPos) return i;
    pos += tableNode.child(i).nodeSize;
  }
  return 0;
}

// ---------------------------------------------------------------------------
// Cell resolution
// ---------------------------------------------------------------------------

/**
 * Resolved cell within a table: the table context, the cell node, its absolute
 * position, and its row/column indices.
 */
export interface ResolvedCell {
  table: ResolvedTable;
  cellNode: ProseMirrorNode;
  cellPos: number;
  rowIndex: number;
  columnIndex: number;
}

/**
 * Resolves a {@link CellLocator} to a cell within its parent table.
 *
 * Uses the same `target`/`nodeId` pattern as table locators but expects
 * the resolved node to be a `tableCell` (or `tableHeader`).
 *
 * @throws {DocumentApiAdapterError} Various target/validation errors.
 */
export function resolveCellLocator(
  editor: Editor,
  locator: { target?: TableCellAddress; nodeId?: string },
  operationName: string,
): ResolvedCell {
  const candidate = resolveLocatorToCandidate(editor, locator, operationName);

  if (candidate.nodeType !== 'tableCell') {
    throw new DocumentApiAdapterError(
      'INVALID_TARGET',
      `${operationName}: target resolved to "${candidate.nodeType}", expected "tableCell".`,
      { actualNodeType: candidate.nodeType, nodeId: candidate.nodeId },
    );
  }

  // Find the parent table by scanning from the end so nested tables (which
  // appear later in depth-first traversal) are preferred over outer tables.
  const blockIndex = getBlockIndex(editor);
  const tableCandidate = findLastCandidate(
    blockIndex.candidates,
    (c) => c.nodeType === 'table' && c.pos < candidate.pos && c.end >= candidate.end,
  );

  if (!tableCandidate) {
    throw new DocumentApiAdapterError('TARGET_NOT_FOUND', `${operationName}: parent table for cell was not found.`);
  }

  // Determine row/column indices using TableMap.
  // TableMap.map stores cell positions relative to the table content start (tablePos + 1).
  const map = TableMap.get(tableCandidate.node);
  const cellOffset = candidate.pos - tableCandidate.pos - 1;
  const mapIndex = map.map.indexOf(cellOffset);
  const rowIndex = Math.floor(mapIndex / map.width);
  const columnIndex = mapIndex % map.width;

  return {
    table: { candidate: tableCandidate, address: toBlockAddress(tableCandidate) as TableAddress },
    cellNode: candidate.node,
    cellPos: candidate.pos,
    rowIndex: rowIndex >= 0 ? rowIndex : 0,
    columnIndex: columnIndex >= 0 ? columnIndex : 0,
  };
}

/**
 * Resolves a merge-range locator to a table plus validated start/end coordinates.
 *
 * @throws {DocumentApiAdapterError} Various target/validation errors.
 */
export function resolveMergeRangeLocator(
  editor: Editor,
  input: {
    target?: TableAddress;
    nodeId?: string;
    start: { rowIndex: number; columnIndex: number };
    end: { rowIndex: number; columnIndex: number };
  },
  operationName: string,
): { table: ResolvedTable; startRow: number; startCol: number; endRow: number; endCol: number } {
  const table = resolveTableLocator(editor, input, operationName);
  const map = TableMap.get(table.candidate.node);

  const startRow = Math.min(input.start.rowIndex, input.end.rowIndex);
  const endRow = Math.max(input.start.rowIndex, input.end.rowIndex);
  const startCol = Math.min(input.start.columnIndex, input.end.columnIndex);
  const endCol = Math.max(input.start.columnIndex, input.end.columnIndex);

  if (startRow < 0 || endRow >= map.height || startCol < 0 || endCol >= map.width) {
    throw new DocumentApiAdapterError(
      'INVALID_TARGET',
      `${operationName}: cell range is out of bounds (table is ${map.height}×${map.width}).`,
    );
  }

  return { table, startRow, startCol, endRow, endCol };
}

/**
 * Resolves a table-scoped cell locator (table target/nodeId + rowIndex + columnIndex)
 * to a {@link ResolvedCell}.
 *
 * If the requested coordinates land inside a merged cell, the returned
 * `rowIndex`/`columnIndex` are canonicalized to the merged cell's **anchor**
 * (top-left) coordinates. This is critical for callers like `unmergeCells`
 * that pass coordinates into `expandMergedCellIntoSingles`.
 *
 * @throws {DocumentApiAdapterError} Various target/validation errors.
 */
export function resolveTableScopedCellLocator(
  editor: Editor,
  input: {
    target?: TableAddress;
    nodeId?: string;
    rowIndex: number;
    columnIndex: number;
  },
  operationName: string,
): ResolvedCell {
  const table = resolveTableLocator(editor, input, operationName);
  const map = TableMap.get(table.candidate.node);

  if (input.rowIndex < 0 || input.rowIndex >= map.height || input.columnIndex < 0 || input.columnIndex >= map.width) {
    throw new DocumentApiAdapterError(
      'INVALID_TARGET',
      `${operationName}: cell (${input.rowIndex}, ${input.columnIndex}) is out of bounds (table is ${map.height}×${map.width}).`,
    );
  }

  // Look up the cell offset from the table map. For merged cells, multiple
  // map indices share the same offset — the anchor is the first occurrence.
  const requestedIndex = input.rowIndex * map.width + input.columnIndex;
  const cellOffset = map.map[requestedIndex];
  const anchorIndex = map.map.indexOf(cellOffset);
  const anchorRow = Math.floor(anchorIndex / map.width);
  const anchorCol = anchorIndex % map.width;

  const cellPos = table.candidate.pos + 1 + cellOffset;
  const cellNode = table.candidate.node.nodeAt(cellOffset);

  if (!cellNode) {
    throw new DocumentApiAdapterError(
      'TARGET_NOT_FOUND',
      `${operationName}: cell at (${input.rowIndex}, ${input.columnIndex}) could not be resolved.`,
    );
  }

  return {
    table,
    cellNode,
    cellPos,
    rowIndex: anchorRow,
    columnIndex: anchorCol,
  };
}

// ---------------------------------------------------------------------------
// Column resolution
// ---------------------------------------------------------------------------

/**
 * Resolved column within a table: the table context plus validated column index.
 */
export interface ResolvedColumn {
  table: ResolvedTable;
  columnIndex: number;
  columnCount: number;
}

/**
 * Resolves a table-scoped column locator.
 *
 * @throws {DocumentApiAdapterError} Various target/validation errors.
 */
export function resolveColumnLocator(
  editor: Editor,
  input: {
    target?: TableAddress;
    nodeId?: string;
    columnIndex: number;
  },
  operationName: string,
): ResolvedColumn {
  const table = resolveTableLocator(editor, input, operationName);
  const columnCount = getTableColumnCount(table.candidate.node);

  if (input.columnIndex < 0 || input.columnIndex >= columnCount) {
    throw new DocumentApiAdapterError(
      'INVALID_TARGET',
      `${operationName}: columnIndex ${input.columnIndex} is out of range (table has ${columnCount} columns).`,
    );
  }

  return { table, columnIndex: input.columnIndex, columnCount };
}

/**
 * Gets the column count from the first row's cells (summing their colspans).
 */
export function getTableColumnCount(tableNode: ProseMirrorNode): number {
  if (tableNode.childCount === 0) return 0;
  const firstRow = tableNode.child(0);
  let count = 0;
  for (let i = 0; i < firstRow.childCount; i++) {
    const cell = firstRow.child(i);
    count += (cell.attrs as { colspan?: number }).colspan ?? 1;
  }
  return count;
}

// ---------------------------------------------------------------------------
// Post-mutation re-resolution
// ---------------------------------------------------------------------------

/**
 * Re-resolves a table's address after a mutation has been dispatched.
 *
 * Uses transaction position mapping as the primary strategy, with
 * nodeId-based fallback for DOCX tables with stable primary IDs.
 *
 * Returns `undefined` if the table cannot be re-resolved — callers
 * should NOT fall back to the pre-mutation address.
 */
export function resolvePostMutationTableAddress(
  editor: Editor,
  preMutationPos: number,
  preMutationNodeId: string,
  tr: { mapping: { map(pos: number, assoc?: number): number } },
): TableAddress | undefined {
  const index = getBlockIndex(editor);

  // Strategy 1: Map pre-mutation position through the transaction.
  const mappedPos = tr.mapping.map(preMutationPos);
  const candidate = index.candidates.find((c) => c.pos === mappedPos && c.nodeType === 'table');
  if (candidate) return toBlockAddress(candidate) as TableAddress;

  // Strategy 2: Look up by pre-mutation nodeId (works for DOCX tables with stable paraId).
  try {
    const found = findBlockByNodeIdOnly(index, preMutationNodeId);
    if (found.nodeType === 'table') return toBlockAddress(found) as TableAddress;
  } catch {
    // Not found or ambiguous — fall through.
  }

  return undefined;
}

// ---------------------------------------------------------------------------
// Failure helper
// ---------------------------------------------------------------------------

/**
 * Returns a table-mutation failure result matching {@link TableMutationFailure}.
 */
export function toTableFailure(
  code: 'NO_OP' | 'INVALID_TARGET' | 'TARGET_NOT_FOUND' | 'CAPABILITY_UNAVAILABLE',
  message: string,
  details?: unknown,
): { success: false; failure: { code: typeof code; message: string; details?: unknown } } {
  return { success: false as const, failure: { code, message, details } };
}
