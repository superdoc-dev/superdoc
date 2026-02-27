import type { Editor } from '../core/Editor.js';
import { v4 as uuidv4 } from 'uuid';
import type {
  BlockNodeAddress,
  CreateTableInput,
  CreateTableResult,
  CreateTableSuccessResult,
  MutationOptions,
  TableLocator,
  TableMutationResult,
  TablesMoveInput,
  TablesSetLayoutInput,
  TablesSetAltTextInput,
  TablesConvertFromTextInput,
  TablesSplitInput,
  TablesConvertToTextInput,
  TablesInsertRowInput,
  TablesDeleteRowInput,
  TablesSetRowHeightInput,
  TablesSetRowOptionsInput,
  TablesInsertColumnInput,
  TablesDeleteColumnInput,
  TablesSetColumnWidthInput,
  TablesDistributeColumnsInput,
  TablesInsertCellInput,
  TablesDeleteCellInput,
  TablesMergeCellsInput,
  TablesUnmergeCellsInput,
  TablesSplitCellInput,
  TablesSetCellPropertiesInput,
  TablesSortInput,
  TablesSetStyleInput,
  TablesClearStyleInput,
  TablesSetStyleOptionInput,
  TablesSetBorderInput,
  TablesClearBorderInput,
  TablesApplyBorderPresetInput,
  TablesSetShadingInput,
  TablesClearShadingInput,
  TablesSetTablePaddingInput,
  TablesSetCellPaddingInput,
  TablesSetCellSpacingInput,
  TablesClearCellSpacingInput,
  TablesGetInput,
  TablesGetOutput,
  TablesGetCellsInput,
  TablesGetCellsOutput,
  TableCellInfo,
  TablesGetPropertiesInput,
  TablesGetPropertiesOutput,
} from '@superdoc/document-api';
import type { Transaction } from 'prosemirror-state';
import { TableMap } from 'prosemirror-tables';
import { clearIndexCache, getBlockIndex } from './helpers/index-cache.js';
import {
  resolveTableLocator,
  resolveTableCreateLocation,
  resolveRowLocator,
  resolveColumnLocator,
  resolveCellLocator,
  resolveMergeRangeLocator,
  getTableColumnCount,
  toTableFailure,
} from './helpers/table-target-resolver.js';
import { rejectTrackedMode, ensureTrackedCapability, requireEditorCommand } from './helpers/mutation-helpers.js';
import { collectTrackInsertRefsInRange } from './helpers/tracked-change-refs.js';
import { applyDirectMutationMeta, applyTrackedMutationMeta } from './helpers/transaction-meta.js';
import { DocumentApiAdapterError } from './errors.js';
import { toBlockAddress, findBlockById, findBlockByNodeIdOnly } from './helpers/node-address-resolver.js';
import { insertRowAtIndex } from '../extensions/table/tableHelpers/appendRows.js';
import { twipsToPixels } from '../core/super-converter/helpers.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const POINTS_TO_PIXELS = 96 / 72;
const POINTS_TO_TWIPS = 20;
const PIXELS_TO_TWIPS = 1440 / 96;
const DEFAULT_TABLE_GRID_WIDTH_TWIPS = 1500;

function generateParaId(): string {
  return Array.from({ length: 8 }, () => Math.floor(Math.random() * 16).toString(16))
    .join('')
    .toUpperCase();
}

function notYetImplemented(operationName: string): never {
  throw new DocumentApiAdapterError('CAPABILITY_UNAVAILABLE', `${operationName} is not yet implemented.`, {
    reason: 'not_implemented',
  });
}

function buildTableSuccess(
  tableAddress?: BlockNodeAddress,
  trackedChangeRefs?: { kind: 'entity'; entityType: 'trackedChange'; entityId: string }[],
): TableMutationResult {
  return {
    success: true,
    table: tableAddress,
    trackedChangeRefs,
  };
}

/**
 * Produces top-level node attrs that pm-adapter reads for rendering.
 * Mirrors the extraction logic in tbl-translator.js (lines 84-140).
 *
 * INVARIANT: every setter that writes tableProperties on a TABLE NODE
 * via setNodeMarkup MUST spread the return value into the attrs object.
 * This ensures layout/rendering sees updated values immediately.
 *
 * SCOPE: table nodes only. Do NOT call this for cell-node mutations
 * (those use tableCellProperties, not tableProperties).
 *
 * See also: tbl-translator.js lines 84-140 (import-time extraction).
 * If you change one, you must change the other.
 */
function syncExtractedTableAttrs(tp: Record<string, unknown>): Record<string, unknown> {
  const extracted: Record<string, unknown> = {};

  // Direct pass-through fields (importer lines 85-88)
  extracted.tableStyleId = tp.tableStyleId ?? null;
  extracted.justification = tp.justification ?? null;
  extracted.tableLayout = tp.tableLayout ?? null;
  extracted.borders = tp.borders ?? null;

  // tableIndent — importer converts twips→pixels (line 89)
  const indent = tp.tableIndent as { value?: number; type?: string } | undefined;
  if (indent?.value != null) {
    extracted.tableIndent = {
      width: twipsToPixels(indent.value),
      type: indent.type,
    };
  } else {
    extracted.tableIndent = null;
  }

  // tableCellSpacing + borderCollapse derivation (importer lines 90, 109-111)
  const spacing = tp.tableCellSpacing as { value?: number; type?: string } | undefined;
  if (spacing?.value != null) {
    extracted.tableCellSpacing = {
      w: String(spacing.value),
      type: spacing.type ?? 'dxa',
    };
    extracted.borderCollapse = 'separate';
  } else {
    extracted.tableCellSpacing = null;
    extracted.borderCollapse = null;
  }

  // tableWidth — importer handles pct vs dxa vs auto (lines 113-140)
  const tw = tp.tableWidth as { value?: number; type?: string } | undefined;
  if (tw) {
    if (tw.type === 'pct' && typeof tw.value === 'number') {
      extracted.tableWidth = { value: tw.value, type: 'pct' };
    } else if (tw.type === 'auto') {
      extracted.tableWidth = { width: 0, type: 'auto' };
    } else if (tw.value != null) {
      const widthPx = twipsToPixels(tw.value);
      extracted.tableWidth = widthPx != null ? { width: widthPx, type: tw.type } : null;
    } else {
      extracted.tableWidth = null;
    }
  } else {
    extracted.tableWidth = null;
  }

  return extracted;
}

function normalizeGridWidth(width: unknown): { col: number } {
  if (typeof width === 'number' && Number.isFinite(width)) {
    return { col: Math.round(width) };
  }

  if (width && typeof width === 'object') {
    const col = (width as { col?: unknown }).col;
    if (typeof col === 'number' && Number.isFinite(col)) {
      return { col: Math.round(col) };
    }
  }

  return { col: DEFAULT_TABLE_GRID_WIDTH_TWIPS };
}

function normalizeGridColumns(grid: unknown): { columns: { col: number }[]; format: 'array' | 'object' } | null {
  if (Array.isArray(grid)) {
    if (grid.length === 0) return null;
    return { columns: grid.map((width) => normalizeGridWidth(width)), format: 'array' };
  }

  if (grid && typeof grid === 'object') {
    const rawColWidths = (grid as { colWidths?: unknown }).colWidths;
    if (Array.isArray(rawColWidths) && rawColWidths.length > 0) {
      return { columns: rawColWidths.map((width) => normalizeGridWidth(width)), format: 'object' };
    }
  }

  return null;
}

function serializeGridColumns(
  originalGrid: unknown,
  normalized: { columns: { col: number }[]; format: 'array' | 'object' },
): unknown {
  if (normalized.format === 'array') {
    return normalized.columns;
  }
  return { ...(originalGrid as Record<string, unknown>), colWidths: normalized.columns };
}

function insertGridColumnWidth(grid: unknown, insertIndex: number): unknown | null {
  const normalized = normalizeGridColumns(grid);
  if (!normalized) return null;

  const colWidths = normalized.columns.slice();
  const boundedIndex = Math.max(0, Math.min(insertIndex, colWidths.length));
  const template =
    colWidths[Math.min(boundedIndex, colWidths.length - 1)] ??
    colWidths[colWidths.length - 1] ??
    normalizeGridWidth(null);

  colWidths.splice(boundedIndex, 0, { ...template });
  return serializeGridColumns(grid, { ...normalized, columns: colWidths });
}

function removeGridColumnWidth(grid: unknown, deleteIndex: number): unknown | null {
  const normalized = normalizeGridColumns(grid);
  if (!normalized || normalized.columns.length <= 1) return null;

  const colWidths = normalized.columns.slice();
  const boundedIndex = Math.max(0, Math.min(deleteIndex, colWidths.length - 1));
  colWidths.splice(boundedIndex, 1);

  return serializeGridColumns(grid, { ...normalized, columns: colWidths });
}

type TableBorderEdgeForCells = 'top' | 'bottom' | 'left' | 'right' | 'insideH' | 'insideV';
type CellBorderSide = 'top' | 'bottom' | 'left' | 'right';

function isBoundaryEdge(edge: string): edge is TableBorderEdgeForCells {
  return (
    edge === 'top' ||
    edge === 'bottom' ||
    edge === 'left' ||
    edge === 'right' ||
    edge === 'insideH' ||
    edge === 'insideV'
  );
}

function cellSidesForEdge(
  edge: TableBorderEdgeForCells,
  row: number,
  col: number,
  lastRow: number,
  lastCol: number,
): CellBorderSide[] {
  switch (edge) {
    case 'top':
      return row === 0 ? ['top'] : [];
    case 'bottom':
      return row === lastRow ? ['bottom'] : [];
    case 'left':
      return col === 0 ? ['left'] : [];
    case 'right':
      return col === lastCol ? ['right'] : [];
    case 'insideH':
      return [row < lastRow ? 'bottom' : null, row > 0 ? 'top' : null].filter(
        (side): side is CellBorderSide => side != null,
      );
    case 'insideV':
      return [col < lastCol ? 'right' : null, col > 0 ? 'left' : null].filter(
        (side): side is CellBorderSide => side != null,
      );
    default:
      return [];
  }
}

function tableBorderToCellBorder(border: Record<string, unknown>): Record<string, unknown> {
  const val = typeof border.val === 'string' ? border.val : 'single';
  const color = typeof border.color === 'string' ? border.color : 'auto';
  const sizeEighthPoints = typeof border.size === 'number' ? border.size : 0;
  const sizePx = val === 'none' || val === 'nil' ? 0 : (sizeEighthPoints / 8) * POINTS_TO_PIXELS;

  return {
    val,
    color,
    size: sizePx,
    space: 0,
  };
}

function applyTableEdgeToCellBorders(
  tr: Transaction,
  tablePos: number,
  tableNode: import('prosemirror-model').Node,
  edge: TableBorderEdgeForCells,
  borderSpec: Record<string, unknown>,
): void {
  const map = TableMap.get(tableNode);
  const tableStart = tablePos + 1;
  const seen = new Set<number>();
  const mapFrom = tr.mapping.maps.length;
  const lastRow = map.height - 1;
  const lastCol = map.width - 1;
  const cellBorder = tableBorderToCellBorder(borderSpec);

  for (let row = 0; row < map.height; row++) {
    for (let col = 0; col < map.width; col++) {
      const relPos = map.map[row * map.width + col]!;
      if (seen.has(relPos)) continue;
      seen.add(relPos);

      const targetSides = cellSidesForEdge(edge, row, col, lastRow, lastCol);
      if (targetSides.length === 0) continue;

      const cellNode = tableNode.nodeAt(relPos);
      if (!cellNode) continue;

      const cellAttrs = cellNode.attrs as Record<string, unknown>;
      const borders = { ...((cellAttrs.borders ?? {}) as Record<string, unknown>) };
      for (const side of targetSides) {
        borders[side] = { ...cellBorder };
      }

      tr.setNodeMarkup(tr.mapping.slice(mapFrom).map(tableStart + relPos), null, {
        ...cellAttrs,
        borders,
      });
    }
  }
}

function applyTableBorderPresetToCellBorders(
  tr: Transaction,
  tablePos: number,
  tableNode: import('prosemirror-model').Node,
  preset: 'none' | 'box' | 'all' | 'grid' | 'custom',
): void {
  if (preset === 'custom') return;

  const map = TableMap.get(tableNode);
  const tableStart = tablePos + 1;
  const seen = new Set<number>();
  const mapFrom = tr.mapping.maps.length;
  const lastRow = map.height - 1;
  const lastCol = map.width - 1;

  const noneBorder = tableBorderToCellBorder({ val: 'none', color: 'auto', size: 0 });
  const singleBorder = tableBorderToCellBorder({ val: 'single', color: '000000', size: 4 });

  for (let row = 0; row < map.height; row++) {
    for (let col = 0; col < map.width; col++) {
      const relPos = map.map[row * map.width + col]!;
      if (seen.has(relPos)) continue;
      seen.add(relPos);

      const cellNode = tableNode.nodeAt(relPos);
      if (!cellNode) continue;

      const cellAttrs = cellNode.attrs as Record<string, unknown>;
      const borders = { ...((cellAttrs.borders ?? {}) as Record<string, unknown>) };

      if (preset === 'none') {
        borders.top = { ...noneBorder };
        borders.bottom = { ...noneBorder };
        borders.left = { ...noneBorder };
        borders.right = { ...noneBorder };
      } else if (preset === 'box') {
        borders.top = row === 0 ? { ...singleBorder } : { ...noneBorder };
        borders.bottom = row === lastRow ? { ...singleBorder } : { ...noneBorder };
        borders.left = col === 0 ? { ...singleBorder } : { ...noneBorder };
        borders.right = col === lastCol ? { ...singleBorder } : { ...noneBorder };
      } else {
        // 'all' | 'grid'
        borders.top = { ...singleBorder };
        borders.bottom = { ...singleBorder };
        borders.left = { ...singleBorder };
        borders.right = { ...singleBorder };
      }

      tr.setNodeMarkup(tr.mapping.slice(mapFrom).map(tableStart + relPos), null, {
        ...cellAttrs,
        borders,
      });
    }
  }
}

/** Flattened row locator shape accepted by {@link resolveRowLocator}. */
type RowLocatorFields = {
  target?: BlockNodeAddress;
  nodeId?: string;
  tableTarget?: BlockNodeAddress;
  tableNodeId?: string;
  rowIndex?: number;
};

/** Removes `n` columns from a cell's colspan, adjusting colwidth accordingly (mirrors prosemirror-tables internal). */
function removeColSpan(attrs: Record<string, unknown>, pos: number, n = 1): Record<string, unknown> {
  const result: Record<string, unknown> = { ...attrs, colspan: ((attrs.colspan as number) || 1) - n };
  if (result.colwidth) {
    result.colwidth = (result.colwidth as number[]).slice();
    (result.colwidth as number[]).splice(pos, n);
    if (!(result.colwidth as number[]).some((w) => (w as number) > 0)) result.colwidth = null;
  }
  return result;
}

/** Adds `n` columns to a cell's colspan, adjusting colwidth accordingly (mirrors prosemirror-tables internal). */
function addColSpan(attrs: Record<string, unknown>, pos: number, n = 1): Record<string, unknown> {
  const result: Record<string, unknown> = { ...attrs, colspan: ((attrs.colspan as number) || 1) + n };
  if (result.colwidth) {
    result.colwidth = (result.colwidth as number[]).slice();
    for (let i = 0; i < n; i++) (result.colwidth as number[]).splice(pos, 0, 0);
  }
  return result;
}

/** Inserts a column at `col` in the table (before that column index). Follows prosemirror-tables addColumn pattern. */
function addColumnToTable(tr: Transaction, tablePos: number, col: number): void {
  const tableNode = tr.doc.nodeAt(tablePos);
  if (!tableNode || tableNode.type.name !== 'table') return;
  const map = TableMap.get(tableNode);
  const tableStart = tablePos + 1;
  const mapStart = tr.mapping.maps.length;

  for (let row = 0; row < map.height; row++) {
    const index = row * map.width + col;
    const pos = map.map[index];
    const cell = tableNode.nodeAt(pos);
    if (!cell) continue;

    if (col > 0 && map.map[index - 1] === pos) {
      // Cell spans from the left — expand colspan
      tr.setNodeMarkup(
        tr.mapping.slice(mapStart).map(tableStart + pos),
        null,
        addColSpan(cell.attrs as Record<string, unknown>, col - map.colCount(pos)),
      );
      row += (((cell.attrs as Record<string, unknown>).rowspan as number) || 1) - 1;
    } else {
      // Insert a new empty cell
      const refType = col > 0 ? (tableNode.nodeAt(map.map[index - 1])?.type ?? cell.type) : cell.type;
      const cellPos = map.positionAt(row, col, tableNode);
      tr.insert(tr.mapping.slice(mapStart).map(tableStart + cellPos), refType.createAndFill()!);
      row += ((cell.attrs?.rowspan as number) || 1) - 1;
    }
  }
}

/** Removes a column at `col` from the table. Follows prosemirror-tables removeColumn pattern. */
function removeColumnFromTable(tr: Transaction, tablePos: number, col: number): void {
  const tableNode = tr.doc.nodeAt(tablePos);
  if (!tableNode || tableNode.type.name !== 'table') return;
  const map = TableMap.get(tableNode);
  const tableStart = tablePos + 1;
  const mapStart = tr.mapping.maps.length;

  for (let row = 0; row < map.height; ) {
    const index = row * map.width + col;
    const pos = map.map[index];
    const cell = tableNode.nodeAt(pos);
    if (!cell) {
      row++;
      continue;
    }

    const attrs = cell.attrs as Record<string, unknown>;
    const rowspan = (attrs.rowspan as number) || 1;

    if ((col > 0 && map.map[index - 1] === pos) || (col < map.width - 1 && map.map[index + 1] === pos)) {
      // Cell spans beyond this column — reduce colspan
      tr.setNodeMarkup(
        tr.mapping.slice(mapStart).map(tableStart + pos),
        null,
        removeColSpan(attrs, col - map.colCount(pos)),
      );
    } else {
      // Delete the cell entirely
      const start = tr.mapping.slice(mapStart).map(tableStart + pos);
      tr.delete(start, start + cell.nodeSize);
    }
    row += rowspan;
  }
}

// ---------------------------------------------------------------------------
// Batch 2 — Table lifecycle + layout
// ---------------------------------------------------------------------------

/**
 * tables.delete — delete an entire table.
 */
export function tablesDeleteAdapter(
  editor: Editor,
  input: TableLocator,
  options?: MutationOptions,
): TableMutationResult {
  const mode = options?.changeMode ?? 'direct';
  if (mode === 'tracked') {
    ensureTrackedCapability(editor, { operation: 'tables.delete' });
  }

  const { candidate } = resolveTableLocator(editor, input, 'tables.delete');

  if (options?.dryRun) {
    return buildTableSuccess(toBlockAddress(candidate));
  }

  try {
    const tr = editor.state.tr;
    tr.delete(candidate.pos, candidate.end);
    if (mode === 'tracked') applyTrackedMutationMeta(tr);
    else applyDirectMutationMeta(tr);
    editor.dispatch(tr);
    clearIndexCache(editor);
    return buildTableSuccess();
  } catch {
    return toTableFailure('INVALID_TARGET', 'Table deletion could not be applied.');
  }
}

/**
 * tables.clearContents — clear all text content from a table, keeping structure.
 */
export function tablesClearContentsAdapter(
  editor: Editor,
  input: TableLocator,
  options?: MutationOptions,
): TableMutationResult {
  rejectTrackedMode('tables.clearContents', options);

  const { candidate, address } = resolveTableLocator(editor, input, 'tables.clearContents');

  if (options?.dryRun) {
    return buildTableSuccess(address);
  }

  try {
    const tr = editor.state.tr;
    const tableNode = candidate.node;
    const tableStart = candidate.pos;
    const schema = editor.state.schema;
    const emptyParagraph = schema.nodes.paragraph?.createAndFill();

    if (!emptyParagraph) {
      return toTableFailure('INVALID_TARGET', 'Cannot create empty paragraph for cell replacement.');
    }

    // Walk rows and cells, replacing each cell's content with an empty paragraph.
    // Process in reverse order to avoid position shifting.
    const replacements: Array<{ from: number; to: number }> = [];

    tableNode.forEach((row, rowOffset) => {
      row.forEach((cell, cellOffset) => {
        const cellStart = tableStart + 1 + rowOffset + 1 + cellOffset + 1; // +1 for each node boundary
        const cellEnd = cellStart + cell.content.size;
        replacements.push({ from: cellStart, to: cellEnd });
      });
    });

    // Apply replacements in reverse to maintain position integrity.
    for (let i = replacements.length - 1; i >= 0; i--) {
      const { from, to } = replacements[i]!;
      tr.replaceWith(from, to, emptyParagraph);
    }

    applyDirectMutationMeta(tr);
    editor.dispatch(tr);
    clearIndexCache(editor);
    return buildTableSuccess(address);
  } catch {
    return toTableFailure('INVALID_TARGET', 'Table content clearing could not be applied.');
  }
}

/**
 * tables.move — move a table to a new document location.
 */
export function tablesMoveAdapter(
  editor: Editor,
  input: TablesMoveInput,
  options?: MutationOptions,
): TableMutationResult {
  rejectTrackedMode('tables.move', options);

  const { candidate } = resolveTableLocator(editor, input, 'tables.move');

  if (options?.dryRun) {
    return buildTableSuccess(toBlockAddress(candidate));
  }

  try {
    const tr = editor.state.tr;
    const tableSlice = candidate.node;
    const tablePos = candidate.pos;
    const tableEnd = candidate.end;

    // Resolve destination BEFORE deleting (positions will shift).
    const destPos = resolveTableCreateLocation(editor, input.destination, 'tables.move');

    // Delete the table from its current position.
    tr.delete(tablePos, tableEnd);

    // Map the destination position through the deletion mapping.
    const mappedDest = tr.mapping.map(destPos);

    // Insert the table at the mapped destination.
    tr.insert(mappedDest, tableSlice);

    applyDirectMutationMeta(tr);
    editor.dispatch(tr);
    clearIndexCache(editor);

    // Resolve the table at its new position to return its address.
    // The nodeId is preserved because we moved the same node.
    return buildTableSuccess();
  } catch {
    return toTableFailure('INVALID_TARGET', 'Table move could not be applied.');
  }
}

/**
 * tables.setLayout — update table layout properties.
 */
export function tablesSetLayoutAdapter(
  editor: Editor,
  input: TablesSetLayoutInput,
  options?: MutationOptions,
): TableMutationResult {
  rejectTrackedMode('tables.setLayout', options);

  const { candidate, address } = resolveTableLocator(editor, input, 'tables.setLayout');

  if (options?.dryRun) {
    return buildTableSuccess(address);
  }

  try {
    const tr = editor.state.tr;
    const currentAttrs = candidate.node.attrs as Record<string, unknown>;
    const currentTableProps = (currentAttrs.tableProperties ?? {}) as Record<string, unknown>;

    const updatedTableProps = { ...currentTableProps };

    if (input.preferredWidth !== undefined) {
      updatedTableProps.tableWidth = { value: input.preferredWidth, type: 'dxa' };
    }
    if (input.alignment !== undefined) {
      updatedTableProps.justification = input.alignment;
    }
    if (input.leftIndentPt !== undefined) {
      updatedTableProps.tableIndent = { value: Math.round(input.leftIndentPt * 20), type: 'dxa' };
    }
    if (input.autoFitMode !== undefined) {
      if (input.autoFitMode === 'fixedWidth') {
        updatedTableProps.tableLayout = 'fixed';
      } else if (input.autoFitMode === 'fitWindow') {
        updatedTableProps.tableLayout = 'autofit';
        // fitWindow = autofit + percentage width (always 100%).
        // preferredWidth input is intentionally ignored — it's twips, not percent.
        updatedTableProps.tableWidth = { value: 5000, type: 'pct' };
      } else {
        // fitContents
        updatedTableProps.tableLayout = 'autofit';
      }
    }
    if (input.tableDirection !== undefined) {
      updatedTableProps.rightToLeft = input.tableDirection === 'rtl';
    }

    tr.setNodeMarkup(candidate.pos, null, {
      ...currentAttrs,
      tableProperties: updatedTableProps,
      ...syncExtractedTableAttrs(updatedTableProps),
    });
    applyDirectMutationMeta(tr);
    editor.dispatch(tr);
    clearIndexCache(editor);
    return buildTableSuccess(address);
  } catch {
    return toTableFailure('INVALID_TARGET', 'Table layout update could not be applied.');
  }
}

/**
 * tables.setAltText — update table alt text (caption/description).
 */
export function tablesSetAltTextAdapter(
  editor: Editor,
  input: TablesSetAltTextInput,
  options?: MutationOptions,
): TableMutationResult {
  rejectTrackedMode('tables.setAltText', options);

  const { candidate, address } = resolveTableLocator(editor, input, 'tables.setAltText');

  if (options?.dryRun) {
    return buildTableSuccess(address);
  }

  try {
    const tr = editor.state.tr;
    const currentAttrs = candidate.node.attrs as Record<string, unknown>;
    const currentTableProps = (currentAttrs.tableProperties ?? {}) as Record<string, unknown>;

    const updatedTableProps = { ...currentTableProps };
    if (input.title !== undefined) {
      updatedTableProps.caption = input.title;
    }
    if (input.description !== undefined) {
      updatedTableProps.description = input.description;
    }

    tr.setNodeMarkup(candidate.pos, null, {
      ...currentAttrs,
      tableProperties: updatedTableProps,
      ...syncExtractedTableAttrs(updatedTableProps),
    });
    applyDirectMutationMeta(tr);
    editor.dispatch(tr);
    clearIndexCache(editor);
    return buildTableSuccess(address);
  } catch {
    return toTableFailure('INVALID_TARGET', 'Table alt text update could not be applied.');
  }
}

// ---------------------------------------------------------------------------
// Batch 3 — Row operations
// ---------------------------------------------------------------------------

/**
 * tables.insertRow — insert one or more rows above/below a reference row.
 */
export function tablesInsertRowAdapter(
  editor: Editor,
  input: TablesInsertRowInput,
  options?: MutationOptions,
): TableMutationResult {
  const mode = options?.changeMode ?? 'direct';
  if (mode === 'tracked') {
    ensureTrackedCapability(editor, { operation: 'tables.insertRow' });
  }

  const resolved = resolveRowLocator(editor, input, 'tables.insertRow');
  const { table, rowIndex } = resolved;

  if (options?.dryRun) {
    return buildTableSuccess(table.address);
  }

  try {
    const tr = editor.state.tr;
    const tablePos = table.candidate.pos;
    const count = input.count ?? 1;
    const schema = editor.state.schema;

    for (let i = 0; i < count; i++) {
      // Re-read the table from the (possibly modified) transaction
      const currentTableNode = tr.doc.nodeAt(tablePos);
      if (!currentTableNode || currentTableNode.type.name !== 'table') break;

      const insertIdx = input.position === 'above' ? rowIndex + i : rowIndex + 1 + i;
      const sourceIdx = input.position === 'above' ? rowIndex + i : rowIndex;

      insertRowAtIndex({
        tr,
        tablePos,
        tableNode: currentTableNode,
        sourceRowIndex: Math.min(sourceIdx, currentTableNode.childCount - 1),
        insertIndex: Math.min(insertIdx, currentTableNode.childCount),
        schema,
      });
    }

    if (mode === 'tracked') applyTrackedMutationMeta(tr);
    else applyDirectMutationMeta(tr);
    editor.dispatch(tr);
    clearIndexCache(editor);
    return buildTableSuccess(table.address);
  } catch {
    return toTableFailure('INVALID_TARGET', 'Row insertion could not be applied.');
  }
}

/**
 * tables.deleteRow — delete a row from a table.
 * Follows the prosemirror-tables removeRow pattern for rowspan handling.
 */
export function tablesDeleteRowAdapter(
  editor: Editor,
  input: TablesDeleteRowInput,
  options?: MutationOptions,
): TableMutationResult {
  const mode = options?.changeMode ?? 'direct';
  if (mode === 'tracked') {
    ensureTrackedCapability(editor, { operation: 'tables.deleteRow' });
  }

  const resolved = resolveRowLocator(editor, input as RowLocatorFields, 'tables.deleteRow');
  const { table, rowIndex, rowNode, rowPos } = resolved;
  const tableNode = table.candidate.node;
  const tablePos = table.candidate.pos;
  const tableStart = tablePos + 1;

  if (tableNode.childCount <= 1) {
    return toTableFailure('NO_OP', 'Cannot delete the last row of a table.');
  }

  if (options?.dryRun) {
    return buildTableSuccess(table.address);
  }

  try {
    const tr = editor.state.tr;
    const map = TableMap.get(tableNode);
    const nextRowPos = rowPos + rowNode.nodeSize;

    // Step 1: Delete the row (following prosemirror-tables removeRow pattern).
    const mapFrom = tr.mapping.maps.length;
    tr.delete(rowPos, nextRowPos);

    // Step 2: Handle cells with rowspan that intersect the deleted row.
    const seen = new Set<number>();
    for (let col = 0, index = rowIndex * map.width; col < map.width; col++, index++) {
      const pos = map.map[index];
      if (seen.has(pos)) continue;
      seen.add(pos);

      const cell = tableNode.nodeAt(pos);
      if (!cell) continue;
      const attrs = cell.attrs as Record<string, unknown>;
      const rowspan = (attrs.rowspan as number) || 1;
      const colspan = (attrs.colspan as number) || 1;

      if (rowIndex > 0 && pos === map.map[index - map.width]) {
        // Cell starts above the deleted row — decrement its rowspan.
        tr.setNodeMarkup(tr.mapping.slice(mapFrom).map(tableStart + pos), null, { ...attrs, rowspan: rowspan - 1 });
        col += colspan - 1;
      } else if (rowIndex < map.height - 1 && pos === map.map[index + map.width]) {
        // Cell starts in the deleted row but spans below — insert copy into the next row.
        const copy = cell.type.create({ ...attrs, rowspan: rowspan - 1 }, cell.content);
        const newPos = map.positionAt(rowIndex + 1, col, tableNode);
        tr.insert(tr.mapping.slice(mapFrom).map(tableStart + newPos), copy);
        col += colspan - 1;
      }
    }

    if (mode === 'tracked') applyTrackedMutationMeta(tr);
    else applyDirectMutationMeta(tr);
    editor.dispatch(tr);
    clearIndexCache(editor);
    return buildTableSuccess(table.address);
  } catch {
    return toTableFailure('INVALID_TARGET', 'Row deletion could not be applied.');
  }
}

/**
 * tables.setRowHeight — set the height and sizing rule of a row.
 */
export function tablesSetRowHeightAdapter(
  editor: Editor,
  input: TablesSetRowHeightInput,
  options?: MutationOptions,
): TableMutationResult {
  rejectTrackedMode('tables.setRowHeight', options);

  const resolved = resolveRowLocator(editor, input as RowLocatorFields, 'tables.setRowHeight');
  const { table, rowPos, rowNode } = resolved;

  if (options?.dryRun) {
    return buildTableSuccess(table.address);
  }

  try {
    const tr = editor.state.tr;
    const currentAttrs = rowNode.attrs as Record<string, unknown>;
    const currentRowProps = (currentAttrs.tableRowProperties ?? {}) as Record<string, unknown>;

    const heightTwips = Math.round(input.heightPt * POINTS_TO_TWIPS); // points → twips
    const heightPx = Math.round(input.heightPt * POINTS_TO_PIXELS); // points → px
    const updatedRowProps = {
      ...currentRowProps,
      rowHeight: { value: heightTwips, rule: input.rule },
    };

    const newAttrs = {
      ...currentAttrs,
      rowHeight: heightPx,
      tableRowProperties: updatedRowProps,
    };

    tr.setNodeMarkup(rowPos, null, newAttrs);
    applyDirectMutationMeta(tr);
    editor.dispatch(tr);
    clearIndexCache(editor);
    return buildTableSuccess(table.address);
  } catch {
    return toTableFailure('INVALID_TARGET', 'Row height update could not be applied.');
  }
}

/**
 * tables.distributeRows — equalize all row heights in a table.
 */
export function tablesDistributeRowsAdapter(
  editor: Editor,
  input: TableLocator,
  options?: MutationOptions,
): TableMutationResult {
  rejectTrackedMode('tables.distributeRows', options);

  const { candidate, address } = resolveTableLocator(editor, input, 'tables.distributeRows');

  if (options?.dryRun) {
    return buildTableSuccess(address);
  }

  try {
    const tr = editor.state.tr;
    const tableNode = candidate.node;
    const tablePos = candidate.pos;

    // Compute total height from rows with explicit heights.
    let totalHeight = 0;
    let explicitCount = 0;
    for (let i = 0; i < tableNode.childCount; i++) {
      const height = (tableNode.child(i).attrs as Record<string, unknown>).rowHeight as number | null;
      if (height != null && height > 0) {
        totalHeight += height;
        explicitCount++;
      }
    }

    if (explicitCount === 0) {
      // No explicit heights — nothing to distribute.
      return buildTableSuccess(address);
    }

    const avgHeight = Math.round(totalHeight / tableNode.childCount);
    let rowPos = tablePos + 1;
    for (let i = 0; i < tableNode.childCount; i++) {
      const row = tableNode.child(i);
      const currentAttrs = row.attrs as Record<string, unknown>;
      const currentRowProps = (currentAttrs.tableRowProperties ?? {}) as Record<string, unknown>;

      const heightTwips = Math.round(avgHeight * PIXELS_TO_TWIPS); // px → twips
      tr.setNodeMarkup(rowPos, null, {
        ...currentAttrs,
        rowHeight: avgHeight,
        tableRowProperties: {
          ...currentRowProps,
          rowHeight: {
            value: heightTwips,
            rule: (currentRowProps.rowHeight as Record<string, unknown>)?.rule ?? 'atLeast',
          },
        },
      });
      rowPos += row.nodeSize;
    }

    applyDirectMutationMeta(tr);
    editor.dispatch(tr);
    clearIndexCache(editor);
    return buildTableSuccess(address);
  } catch {
    return toTableFailure('INVALID_TARGET', 'Row distribution could not be applied.');
  }
}

/**
 * tables.setRowOptions — set row-level options (allowBreakAcrossPages, repeatHeader).
 */
export function tablesSetRowOptionsAdapter(
  editor: Editor,
  input: TablesSetRowOptionsInput,
  options?: MutationOptions,
): TableMutationResult {
  rejectTrackedMode('tables.setRowOptions', options);

  const resolved = resolveRowLocator(editor, input as RowLocatorFields, 'tables.setRowOptions');
  const { table, rowPos, rowNode } = resolved;

  if (options?.dryRun) {
    return buildTableSuccess(table.address);
  }

  try {
    const tr = editor.state.tr;
    const currentAttrs = rowNode.attrs as Record<string, unknown>;
    const currentRowProps = (currentAttrs.tableRowProperties ?? {}) as Record<string, unknown>;

    const rowPropUpdates: Record<string, unknown> = {};
    const attrUpdates: Record<string, unknown> = {};

    if (input.allowBreakAcrossPages !== undefined) {
      rowPropUpdates.cantSplit = !input.allowBreakAcrossPages;
      attrUpdates.cantSplit = !input.allowBreakAcrossPages;
    }
    if (input.repeatHeader !== undefined) {
      rowPropUpdates.repeatHeader = input.repeatHeader;
    }

    const newAttrs = {
      ...currentAttrs,
      ...attrUpdates,
      tableRowProperties: { ...currentRowProps, ...rowPropUpdates },
    };

    tr.setNodeMarkup(rowPos, null, newAttrs);
    applyDirectMutationMeta(tr);
    editor.dispatch(tr);
    clearIndexCache(editor);
    return buildTableSuccess(table.address);
  } catch {
    return toTableFailure('INVALID_TARGET', 'Row options update could not be applied.');
  }
}

// ---------------------------------------------------------------------------
// Batch 3 — Column operations
// ---------------------------------------------------------------------------

/**
 * tables.insertColumn — insert one or more columns left/right of a reference column.
 */
export function tablesInsertColumnAdapter(
  editor: Editor,
  input: TablesInsertColumnInput,
  options?: MutationOptions,
): TableMutationResult {
  const mode = options?.changeMode ?? 'direct';
  if (mode === 'tracked') {
    ensureTrackedCapability(editor, { operation: 'tables.insertColumn' });
  }

  const resolved = resolveColumnLocator(editor, input, 'tables.insertColumn');
  const { table, columnIndex } = resolved;

  if (options?.dryRun) {
    return buildTableSuccess(table.address);
  }

  try {
    const tr = editor.state.tr;
    const tablePos = table.candidate.pos;
    const count = input.count ?? 1;
    let updatedGrid = (table.candidate.node.attrs as Record<string, unknown>).grid;

    for (let c = 0; c < count; c++) {
      const insertCol = input.position === 'left' ? columnIndex + c : columnIndex + 1 + c;
      addColumnToTable(tr, tablePos, insertCol);
      updatedGrid = insertGridColumnWidth(updatedGrid, insertCol) ?? updatedGrid;
    }

    if (updatedGrid) {
      const currentTableNode = tr.doc.nodeAt(tablePos);
      if (currentTableNode && currentTableNode.type.name === 'table') {
        tr.setNodeMarkup(tablePos, null, {
          ...(currentTableNode.attrs as Record<string, unknown>),
          grid: updatedGrid,
          userEdited: true,
        });
      }
    }

    if (mode === 'tracked') applyTrackedMutationMeta(tr);
    else applyDirectMutationMeta(tr);
    editor.dispatch(tr);
    clearIndexCache(editor);
    return buildTableSuccess(table.address);
  } catch {
    return toTableFailure('INVALID_TARGET', 'Column insertion could not be applied.');
  }
}

/**
 * tables.deleteColumn — delete a column from a table.
 * Follows the prosemirror-tables removeColumn pattern for colspan handling.
 */
export function tablesDeleteColumnAdapter(
  editor: Editor,
  input: TablesDeleteColumnInput,
  options?: MutationOptions,
): TableMutationResult {
  const mode = options?.changeMode ?? 'direct';
  if (mode === 'tracked') {
    ensureTrackedCapability(editor, { operation: 'tables.deleteColumn' });
  }

  const resolved = resolveColumnLocator(editor, input, 'tables.deleteColumn');
  const { table, columnIndex, columnCount } = resolved;

  if (columnCount <= 1) {
    return toTableFailure('NO_OP', 'Cannot delete the last column of a table.');
  }

  if (options?.dryRun) {
    return buildTableSuccess(table.address);
  }

  try {
    const tr = editor.state.tr;
    let updatedGrid = (table.candidate.node.attrs as Record<string, unknown>).grid;
    removeColumnFromTable(tr, table.candidate.pos, columnIndex);
    updatedGrid = removeGridColumnWidth(updatedGrid, columnIndex) ?? updatedGrid;

    if (updatedGrid) {
      const currentTableNode = tr.doc.nodeAt(table.candidate.pos);
      if (currentTableNode && currentTableNode.type.name === 'table') {
        tr.setNodeMarkup(table.candidate.pos, null, {
          ...(currentTableNode.attrs as Record<string, unknown>),
          grid: updatedGrid,
          userEdited: true,
        });
      }
    }

    if (mode === 'tracked') applyTrackedMutationMeta(tr);
    else applyDirectMutationMeta(tr);
    editor.dispatch(tr);
    clearIndexCache(editor);
    return buildTableSuccess(table.address);
  } catch {
    return toTableFailure('INVALID_TARGET', 'Column deletion could not be applied.');
  }
}

/**
 * tables.setColumnWidth — set the width of a column.
 */
export function tablesSetColumnWidthAdapter(
  editor: Editor,
  input: TablesSetColumnWidthInput,
  options?: MutationOptions,
): TableMutationResult {
  rejectTrackedMode('tables.setColumnWidth', options);

  const resolved = resolveColumnLocator(editor, input, 'tables.setColumnWidth');
  const { table, columnIndex } = resolved;

  if (options?.dryRun) {
    return buildTableSuccess(table.address);
  }

  try {
    const tr = editor.state.tr;
    const tablePos = table.candidate.pos;
    const tableStart = tablePos + 1;
    const tableNode = table.candidate.node;
    const map = TableMap.get(tableNode);
    const widthPx = Math.round(input.widthPt * (96 / 72)); // Points → pixels at 96 DPI

    // Set colwidth on all cells at this column.
    const processed = new Set<number>();
    for (let row = 0; row < map.height; row++) {
      const index = row * map.width + columnIndex;
      const pos = map.map[index];
      if (processed.has(pos)) continue;
      processed.add(pos);

      const cell = tableNode.nodeAt(pos);
      if (!cell) continue;

      const attrs = cell.attrs as Record<string, unknown>;
      const colspan = (attrs.colspan as number) || 1;
      const colwidth = (attrs.colwidth as number[] | null)?.slice() ?? [];
      const cellStartCol = map.colCount(pos);
      const withinCol = columnIndex - cellStartCol;

      while (colwidth.length < colspan) colwidth.push(0);
      colwidth[withinCol] = widthPx;

      tr.setNodeMarkup(tableStart + pos, null, { ...attrs, colwidth });
    }

    // Also update the table grid if present.
    const tableAttrs = tableNode.attrs as Record<string, unknown>;
    const normalizedGrid = normalizeGridColumns(tableAttrs.grid);
    if (normalizedGrid && columnIndex < normalizedGrid.columns.length) {
      const newColumns = normalizedGrid.columns.slice();
      newColumns[columnIndex] = { col: Math.round(input.widthPt * POINTS_TO_TWIPS) }; // points → twips
      tr.setNodeMarkup(tablePos, null, {
        ...tableAttrs,
        grid: serializeGridColumns(tableAttrs.grid, { ...normalizedGrid, columns: newColumns }),
        userEdited: true,
      });
    }

    applyDirectMutationMeta(tr);
    editor.dispatch(tr);
    clearIndexCache(editor);
    return buildTableSuccess(table.address);
  } catch {
    return toTableFailure('INVALID_TARGET', 'Column width update could not be applied.');
  }
}

/**
 * tables.distributeColumns — equalize column widths across a table or a range.
 */
export function tablesDistributeColumnsAdapter(
  editor: Editor,
  input: TablesDistributeColumnsInput,
  options?: MutationOptions,
): TableMutationResult {
  rejectTrackedMode('tables.distributeColumns', options);

  const tableLocator: TableLocator = {};
  if (input.target != null) tableLocator.target = input.target;
  if (input.nodeId != null) tableLocator.nodeId = input.nodeId;

  const { candidate, address } = resolveTableLocator(editor, tableLocator, 'tables.distributeColumns');

  if (options?.dryRun) {
    return buildTableSuccess(address);
  }

  try {
    const tr = editor.state.tr;
    const tablePos = candidate.pos;
    const tableStart = tablePos + 1;
    const tableNode = candidate.node;
    const map = TableMap.get(tableNode);

    const rangeStart = input.columnRange?.start ?? 0;
    const rangeEnd = input.columnRange?.end ?? map.width - 1;
    const rangeWidth = rangeEnd - rangeStart + 1;

    // Compute total width of columns in range from the first row.
    let totalWidth = 0;
    for (let col = rangeStart; col <= rangeEnd; col++) {
      const pos = map.map[col]; // First row
      const cell = tableNode.nodeAt(pos);
      if (!cell) continue;
      const colwidth = (cell.attrs as Record<string, unknown>).colwidth as number[] | null;
      const cellStartCol = map.colCount(pos);
      const withinCol = col - cellStartCol;
      totalWidth += colwidth?.[withinCol] ?? 100;
    }

    const evenWidth = Math.round(totalWidth / rangeWidth);

    // Apply even width to all cells in the range.
    const processed = new Set<number>();
    for (let row = 0; row < map.height; row++) {
      for (let col = rangeStart; col <= rangeEnd; col++) {
        const index = row * map.width + col;
        const pos = map.map[index];
        if (processed.has(pos)) continue;
        processed.add(pos);

        const cell = tableNode.nodeAt(pos);
        if (!cell) continue;

        const attrs = cell.attrs as Record<string, unknown>;
        const colspan = (attrs.colspan as number) || 1;
        const cellStartCol = map.colCount(pos);
        const newColwidth = (attrs.colwidth as number[] | null)?.slice() ?? (Array(colspan).fill(0) as number[]);
        while (newColwidth.length < colspan) newColwidth.push(0);

        for (let c = 0; c < colspan; c++) {
          const absCol = cellStartCol + c;
          if (absCol >= rangeStart && absCol <= rangeEnd) {
            newColwidth[c] = evenWidth;
          }
        }

        tr.setNodeMarkup(tableStart + pos, null, { ...attrs, colwidth: newColwidth });
      }
    }

    // Keep table grid in sync with distributed column widths so DOCX export
    // emits uniform <w:gridCol> values rather than stale grid widths.
    const tableAttrs = tableNode.attrs as Record<string, unknown>;
    const normalizedGrid = normalizeGridColumns(tableAttrs.grid);
    const tableAttrUpdates: Record<string, unknown> = { ...tableAttrs, userEdited: true };

    if (normalizedGrid) {
      const newColumns = normalizedGrid.columns.slice();
      const evenWidthTwips = Math.max(1, Math.round(evenWidth * PIXELS_TO_TWIPS));
      const maxColumn = Math.min(rangeEnd, newColumns.length - 1);

      for (let col = Math.max(rangeStart, 0); col <= maxColumn; col++) {
        newColumns[col] = { col: evenWidthTwips };
      }

      tableAttrUpdates.grid = serializeGridColumns(tableAttrs.grid, { ...normalizedGrid, columns: newColumns });
    }

    tr.setNodeMarkup(tablePos, null, tableAttrUpdates);

    applyDirectMutationMeta(tr);
    editor.dispatch(tr);
    clearIndexCache(editor);
    return buildTableSuccess(address);
  } catch {
    return toTableFailure('INVALID_TARGET', 'Column distribution could not be applied.');
  }
}

// ---------------------------------------------------------------------------
// Batch 4+ stubs — Convert + cell + style operations
// ---------------------------------------------------------------------------

/**
 * tables.convertFromText — convert one or more paragraphs into a table.
 *
 * The target must resolve to a paragraph node. Text is split by the chosen
 * delimiter to form columns. Each paragraph becomes one row. If `columns`
 * is supplied, excess tokens are joined; missing tokens produce empty cells.
 */
export function tablesConvertFromTextAdapter(
  editor: Editor,
  input: TablesConvertFromTextInput,
  options?: MutationOptions,
): TableMutationResult {
  rejectTrackedMode('tables.convertFromText', options);

  // Resolve the target paragraph (uses same target/nodeId pattern as table locator).
  const index = getBlockIndex(editor);
  let candidate: ReturnType<typeof findBlockByNodeIdOnly> | undefined;
  if (input.target != null) {
    candidate = findBlockById(index, input.target);
  } else if (input.nodeId != null) {
    candidate = findBlockByNodeIdOnly(index, input.nodeId);
  } else {
    throw new DocumentApiAdapterError('INVALID_TARGET', 'tables.convertFromText: requires either target or nodeId.');
  }

  if (!candidate) {
    throw new DocumentApiAdapterError('TARGET_NOT_FOUND', 'tables.convertFromText: target was not found.');
  }

  if (options?.dryRun) {
    return buildTableSuccess(toBlockAddress(candidate));
  }

  try {
    const tr = editor.state.tr;
    const schema = editor.state.schema;
    const doc = editor.state.doc;

    // Collect consecutive paragraphs starting at the target.
    const paragraphs: { node: import('prosemirror-model').Node; pos: number }[] = [];
    let pos = candidate.pos;
    while (pos < doc.content.size) {
      const node = doc.nodeAt(pos);
      if (!node || node.type.name !== 'paragraph') break;
      paragraphs.push({ node, pos });
      pos += node.nodeSize;
    }

    if (paragraphs.length === 0) {
      return toTableFailure('INVALID_TARGET', 'No paragraph content found at target.');
    }

    // Determine delimiter.
    const rawDelimiter = input.delimiter ?? 'tab';
    const sep =
      typeof rawDelimiter === 'object'
        ? rawDelimiter.custom
        : rawDelimiter === 'tab'
          ? '\t'
          : rawDelimiter === 'comma'
            ? ','
            : null; // 'paragraph' — each paragraph is a row with one cell

    // Parse rows.
    const rows: string[][] = [];
    let maxCols = 1;
    for (const p of paragraphs) {
      const text = p.node.textContent;
      const cells = sep != null ? text.split(sep) : [text];
      rows.push(cells);
      if (cells.length > maxCols) maxCols = cells.length;
    }

    const numCols = input.columns ?? (input.inferColumns !== false ? maxCols : maxCols);

    // Build table rows.
    const tableRows: import('prosemirror-model').Node[] = [];
    for (const cells of rows) {
      const tableCells: import('prosemirror-model').Node[] = [];
      for (let c = 0; c < numCols; c++) {
        const text = cells[c] ?? '';
        const content = text ? schema.text(text) : undefined;
        const para = schema.nodes.paragraph.createAndFill(null, content)!;
        tableCells.push(
          schema.nodes.tableCell.createAndFill(
            {
              sdBlockId: uuidv4(),
              paraId: generateParaId(),
            },
            para,
          )!,
        );
      }
      tableRows.push(
        schema.nodes.tableRow.createAndFill(
          {
            sdBlockId: uuidv4(),
            paraId: generateParaId(),
          },
          tableCells,
        )!,
      );
    }

    const tableId = uuidv4();
    const tableParaId = generateParaId();
    const tableNode = schema.nodes.table.create({ sdBlockId: tableId, paraId: tableParaId }, tableRows);

    // Replace the source paragraphs with the new table.
    const startPos = paragraphs[0].pos;
    const lastP = paragraphs[paragraphs.length - 1];
    const endPos = lastP.pos + lastP.node.nodeSize;
    tr.replaceWith(startPos, endPos, tableNode);

    applyDirectMutationMeta(tr);
    editor.dispatch(tr);
    clearIndexCache(editor);

    // Resolve the inserted table so callers can chain follow-up table ops.
    const insertedTable = getBlockIndex(editor).candidates.find(
      (block) => block.nodeType === 'table' && block.pos === startPos,
    );
    return buildTableSuccess(insertedTable ? toBlockAddress(insertedTable) : undefined);
  } catch {
    return toTableFailure('INVALID_TARGET', 'Text-to-table conversion could not be applied.');
  }
}

/**
 * tables.split — split a table into two tables at a given row index.
 *
 * All rows from `atRowIndex` onward are moved into a new table that is
 * inserted immediately after the original.
 */
export function tablesSplitAdapter(
  editor: Editor,
  input: TablesSplitInput,
  options?: MutationOptions,
): TableMutationResult {
  rejectTrackedMode('tables.split', options);

  const { candidate, address } = resolveTableLocator(editor, input, 'tables.split');
  const tableNode = candidate.node;

  if (input.atRowIndex <= 0 || input.atRowIndex >= tableNode.childCount) {
    return toTableFailure('INVALID_TARGET', 'Split row index must be between 1 and rowCount-1.');
  }

  if (options?.dryRun) {
    return buildTableSuccess(address);
  }

  try {
    const tr = editor.state.tr;
    const tablePos = candidate.pos;
    const schema = editor.state.schema;

    // Collect rows for the new (second) table.
    const secondTableRows: import('prosemirror-model').Node[] = [];
    for (let i = input.atRowIndex; i < tableNode.childCount; i++) {
      secondTableRows.push(tableNode.child(i));
    }

    // Delete those rows from the original table (reverse order to preserve positions).
    const tableStart = tablePos + 1;
    let rowPos = tableStart;
    const rowPositions: number[] = [];
    for (let i = 0; i < tableNode.childCount; i++) {
      rowPositions.push(rowPos);
      rowPos += tableNode.child(i).nodeSize;
    }

    const mapFrom = tr.mapping.maps.length;
    for (let i = tableNode.childCount - 1; i >= input.atRowIndex; i--) {
      const rp = tr.mapping.slice(mapFrom).map(rowPositions[i]);
      const rEnd = tr.mapping.slice(mapFrom).map(rowPositions[i] + tableNode.child(i).nodeSize);
      tr.delete(rp, rEnd);
    }

    // Build the new table with the same attributes.
    const newTableAttrs = { ...(tableNode.attrs as Record<string, unknown>) };
    delete newTableAttrs.sdBlockId; // Each table needs a unique ID — let PM assign one.
    delete newTableAttrs.paraId; // Avoid duplicate w14:paraId after split.
    delete newTableAttrs.textId; // Avoid duplicate w14:textId after split.
    const newTable = schema.nodes.table.create(newTableAttrs, secondTableRows);

    // Insert the new table after the original.
    const insertPos = tr.mapping.slice(mapFrom).map(tablePos + tableNode.nodeSize);
    tr.insert(insertPos, newTable);

    applyDirectMutationMeta(tr);
    editor.dispatch(tr);
    clearIndexCache(editor);
    return buildTableSuccess(address);
  } catch {
    return toTableFailure('INVALID_TARGET', 'Table split could not be applied.');
  }
}

/**
 * tables.convertToText — replace a table with text paragraphs.
 *
 * Each row becomes one paragraph. Cell text is joined with the specified
 * delimiter (default: tab). When `delimiter` is `'paragraph'`, each cell
 * becomes its own paragraph.
 */
export function tablesConvertToTextAdapter(
  editor: Editor,
  input: TablesConvertToTextInput,
  options?: MutationOptions,
): TableMutationResult {
  rejectTrackedMode('tables.convertToText', options);

  const { candidate, address } = resolveTableLocator(editor, input, 'tables.convertToText');

  if (options?.dryRun) {
    return buildTableSuccess(address);
  }

  try {
    const tr = editor.state.tr;
    const tableNode = candidate.node;
    const tablePos = candidate.pos;
    const schema = editor.state.schema;
    const map = TableMap.get(tableNode);

    const delimiter = input.delimiter ?? 'tab';
    const sep = delimiter === 'tab' ? '\t' : delimiter === 'comma' ? ',' : null;

    const paragraphs: import('prosemirror-model').Node[] = [];

    for (let row = 0; row < map.height; row++) {
      if (sep !== null) {
        // Join all cell texts in the row with the delimiter.
        const cellTexts: string[] = [];
        const seen = new Set<number>();
        for (let col = 0; col < map.width; col++) {
          const pos = map.map[row * map.width + col];
          if (seen.has(pos)) continue;
          seen.add(pos);
          const cell = tableNode.nodeAt(pos);
          cellTexts.push(cell?.textContent ?? '');
        }
        const text = cellTexts.join(sep);
        const content = text ? schema.text(text) : undefined;
        paragraphs.push(schema.nodes.paragraph.createAndFill(null, content)!);
      } else {
        // 'paragraph' mode: each cell becomes its own paragraph.
        const seen = new Set<number>();
        for (let col = 0; col < map.width; col++) {
          const pos = map.map[row * map.width + col];
          if (seen.has(pos)) continue;
          seen.add(pos);
          const cell = tableNode.nodeAt(pos);
          const text = cell?.textContent ?? '';
          const content = text ? schema.text(text) : undefined;
          paragraphs.push(schema.nodes.paragraph.createAndFill(null, content)!);
        }
      }
    }

    // Replace the table with the paragraphs.
    tr.replaceWith(tablePos, tablePos + tableNode.nodeSize, paragraphs);
    applyDirectMutationMeta(tr);
    editor.dispatch(tr);
    clearIndexCache(editor);
    return buildTableSuccess();
  } catch {
    return toTableFailure('INVALID_TARGET', 'Table-to-text conversion could not be applied.');
  }
}

/**
 * tables.insertCell — insert a cell at a resolved position, shifting existing cells.
 *
 * `shiftRight`: inserts a new cell before the target and cascades overflow cells to
 * subsequent rows in row-major order. If needed, appends a new trailing row so
 * existing cell content is preserved without dropping the rightmost value.
 *
 * `shiftDown`: inserts a new cell at the same column in the row below (creating a row
 * if needed). The last cell of the target column is removed to maintain row count.
 */
export function tablesInsertCellAdapter(
  editor: Editor,
  input: TablesInsertCellInput,
  options?: MutationOptions,
): TableMutationResult {
  rejectTrackedMode('tables.insertCell', options);

  const resolved = resolveCellLocator(editor, input, 'tables.insertCell');
  const { table, cellPos, rowIndex, columnIndex } = resolved;

  if (options?.dryRun) {
    return buildTableSuccess(table.address);
  }

  try {
    const tr = editor.state.tr;
    const tablePos = table.candidate.pos;
    const tableStart = tablePos + 1;
    const tableNode = table.candidate.node;
    const map = TableMap.get(tableNode);
    const schema = editor.state.schema;

    if (input.mode === 'shiftRight') {
      const slotCount = map.width * map.height;
      const uniqueOffsets = new Set(map.map);
      if (uniqueOffsets.size !== slotCount) {
        return toTableFailure(
          'INVALID_TARGET',
          'Cell insertion with shiftRight is not supported for merged cells in this version.',
        );
      }

      const makeEmptyCell = (preferHeader: boolean = false): import('prosemirror-model').Node => {
        const candidateType = preferHeader
          ? (schema.nodes.tableHeader ?? schema.nodes.tableCell)
          : schema.nodes.tableCell;
        return (
          candidateType.createAndFill({
            sdBlockId: uuidv4(),
            paraId: generateParaId(),
          }) ?? candidateType.createAndFill()!
        );
      };

      // Append one empty overflow row first so we can shift without dropping
      // the row-tail content.
      const overflowRowCells: import('prosemirror-model').Node[] = [];
      for (let col = 0; col < map.width; col++) {
        const templateOffset = map.map[(map.height - 1) * map.width + col]!;
        const templateCell = tableNode.nodeAt(templateOffset);
        overflowRowCells.push(makeEmptyCell(templateCell?.type.name === 'tableHeader'));
      }

      const templateRowAttrs = (tableNode.child(Math.max(0, map.height - 1)).attrs as Record<string, unknown>) ?? {};
      const overflowRowAttrs = {
        ...templateRowAttrs,
        sdBlockId: uuidv4(),
        paraId: generateParaId(),
      };
      const overflowRow =
        schema.nodes.tableRow.createAndFill(overflowRowAttrs, overflowRowCells) ??
        schema.nodes.tableRow.create(overflowRowAttrs, overflowRowCells);
      if (!overflowRow) {
        return toTableFailure('INVALID_TARGET', 'Cell insertion could not construct an overflow row.');
      }

      tr.insert(tablePos + tableNode.nodeSize - 1, overflowRow);

      const expandedTableNode = tr.doc.nodeAt(tablePos);
      if (!expandedTableNode || expandedTableNode.type.name !== 'table') {
        return toTableFailure('INVALID_TARGET', 'Cell insertion could not locate expanded table state.');
      }

      const expandedMap = TableMap.get(expandedTableNode);
      const expandedSlotCount = expandedMap.width * expandedMap.height;
      if (new Set(expandedMap.map).size !== expandedSlotCount) {
        return toTableFailure(
          'INVALID_TARGET',
          'Cell insertion with shiftRight produced an unsupported merged-table shape.',
        );
      }

      const rowMajorCells: import('prosemirror-model').Node[] = [];
      for (let i = 0; i < expandedSlotCount; i++) {
        const offset = expandedMap.map[i]!;
        const cell = expandedTableNode.nodeAt(offset);
        if (!cell) {
          return toTableFailure('INVALID_TARGET', 'Cell insertion could not resolve expanded table cells.');
        }
        rowMajorCells.push(cell);
      }

      const targetLinearIndex = rowIndex * expandedMap.width + columnIndex;
      const targetOffset = expandedMap.map[targetLinearIndex]!;
      const targetCell = expandedTableNode.nodeAt(targetOffset);

      rowMajorCells.splice(targetLinearIndex, 0, makeEmptyCell(targetCell?.type.name === 'tableHeader'));
      rowMajorCells.pop();

      const rebuiltRows: import('prosemirror-model').Node[] = [];
      const rebuiltRowCount = rowMajorCells.length / expandedMap.width;
      for (let rebuiltRowIndex = 0; rebuiltRowIndex < rebuiltRowCount; rebuiltRowIndex++) {
        const sourceRow = expandedTableNode.child(rebuiltRowIndex);
        const rowAttrs = ((sourceRow.attrs as Record<string, unknown>) ?? {}) as Record<string, unknown>;

        const rowCells = rowMajorCells.slice(
          rebuiltRowIndex * expandedMap.width,
          (rebuiltRowIndex + 1) * expandedMap.width,
        );
        const rebuiltRow =
          schema.nodes.tableRow.createAndFill(rowAttrs, rowCells) ?? schema.nodes.tableRow.create(rowAttrs, rowCells);
        if (!rebuiltRow) {
          return toTableFailure('INVALID_TARGET', 'Cell insertion could not construct a replacement row.');
        }
        rebuiltRows.push(rebuiltRow);
      }

      const rebuiltTable = schema.nodes.table.create(expandedTableNode.attrs, rebuiltRows);
      tr.replaceWith(tablePos, tablePos + expandedTableNode.nodeSize, rebuiltTable);
    } else {
      // shiftDown: remove the last cell in this column, insert new cell at the same
      // column in the row below the target so cells shift downward within the column.
      const lastRowIdx = (map.height - 1) * map.width + columnIndex;
      const lastCellPos = map.map[lastRowIdx];
      const lastCell = tableNode.nodeAt(lastCellPos);
      if (lastCell) {
        tr.delete(tableStart + lastCellPos, tableStart + lastCellPos + lastCell.nodeSize);
      }

      // Insert at the same column in the next row (rowIndex + 1). When the target is
      // already in the last row the bottom cell was just removed, so insert at the
      // target position itself to fill the gap.
      const insertRow = Math.min(rowIndex + 1, map.height - 1);
      const insertOffset = map.map[insertRow * map.width + columnIndex];
      const newCell = schema.nodes.tableCell.createAndFill()!;
      const mappedInsertPos = tr.mapping.map(tableStart + insertOffset);
      tr.insert(mappedInsertPos, newCell);
    }

    applyDirectMutationMeta(tr);
    editor.dispatch(tr);
    clearIndexCache(editor);
    return buildTableSuccess(table.address);
  } catch {
    return toTableFailure('INVALID_TARGET', 'Cell insertion could not be applied.');
  }
}

/**
 * tables.deleteCell — delete a cell at a resolved position, shifting remaining cells.
 *
 * `shiftLeft`: removes the target cell and appends a new empty cell at the end of
 * the row to maintain column count.
 *
 * `shiftUp`: removes the target cell and appends a new empty cell at the same column
 * in the last row to maintain row count.
 */
export function tablesDeleteCellAdapter(
  editor: Editor,
  input: TablesDeleteCellInput,
  options?: MutationOptions,
): TableMutationResult {
  rejectTrackedMode('tables.deleteCell', options);

  const resolved = resolveCellLocator(editor, input, 'tables.deleteCell');
  const { table, cellPos, cellNode, rowIndex, columnIndex } = resolved;

  if (options?.dryRun) {
    return buildTableSuccess(table.address);
  }

  try {
    const tr = editor.state.tr;
    const tablePos = table.candidate.pos;
    const tableStart = tablePos + 1;
    const tableNode = table.candidate.node;
    const map = TableMap.get(tableNode);
    const schema = editor.state.schema;

    // Delete the target cell.
    tr.delete(cellPos, cellPos + cellNode.nodeSize);

    if (input.mode === 'shiftLeft') {
      // Append a new empty cell at the end of this row.
      const row = tableNode.child(rowIndex);
      const rowEnd = tr.mapping.map(tableStart + map.positionAt(rowIndex, map.width - 1, tableNode));
      const lastCell = row.child(row.childCount - 1);
      const insertPos = tr.mapping.map(cellPos + cellNode.nodeSize + lastCell.nodeSize - cellNode.nodeSize);
      // Find the end of the row in the mapped doc — simpler: compute row end position.
      let rowEndPos = table.candidate.pos + 1;
      for (let i = 0; i <= rowIndex; i++) rowEndPos += tableNode.child(i).nodeSize;
      const mappedRowEnd = tr.mapping.map(rowEndPos - 1); // -1 to be inside the row closing tag
      const newCell = schema.nodes.tableCell.createAndFill()!;
      tr.insert(mappedRowEnd, newCell);
    } else {
      // shiftUp: insert a new empty cell at the same column in the last row.
      const lastRowIndex = map.height - 1;
      const colOffset = map.map[lastRowIndex * map.width + columnIndex];
      const mappedColPos = tr.mapping.map(tableStart + colOffset);
      const newCell = schema.nodes.tableCell.createAndFill()!;
      tr.insert(mappedColPos, newCell);
    }

    applyDirectMutationMeta(tr);
    editor.dispatch(tr);
    clearIndexCache(editor);
    return buildTableSuccess(table.address);
  } catch {
    return toTableFailure('INVALID_TARGET', 'Cell deletion could not be applied.');
  }
}

/**
 * tables.mergeCells — merge a rectangular range of cells into a single cell.
 *
 * Concatenates content from all cells in the range into the top-left cell,
 * then sets colspan/rowspan to cover the range and removes the other cells.
 */
export function tablesMergeCellsAdapter(
  editor: Editor,
  input: TablesMergeCellsInput,
  options?: MutationOptions,
): TableMutationResult {
  rejectTrackedMode('tables.mergeCells', options);

  const resolved = resolveMergeRangeLocator(editor, input, 'tables.mergeCells');
  const { table, startRow, startCol, endRow, endCol } = resolved;

  if (options?.dryRun) {
    return buildTableSuccess(table.address);
  }

  try {
    const tr = editor.state.tr;
    const tablePos = table.candidate.pos;
    const tableStart = tablePos + 1;
    const tableNode = table.candidate.node;
    const map = TableMap.get(tableNode);

    // Collect content from all cells in the range (row-major order).
    const content: import('prosemirror-model').Node[] = [];
    const cellPositions: number[] = [];
    let topLeftPos: number | null = null;
    let topLeftCell: import('prosemirror-model').Node | null = null;

    for (let row = startRow; row <= endRow; row++) {
      for (let col = startCol; col <= endCol; col++) {
        const idx = row * map.width + col;
        const pos = map.map[idx];
        // Skip duplicate positions (cells already counted via colspan/rowspan).
        if (cellPositions.includes(pos)) continue;
        cellPositions.push(pos);

        const cell = tableNode.nodeAt(pos);
        if (!cell) continue;

        if (topLeftPos === null) {
          topLeftPos = pos;
          topLeftCell = cell;
        }

        // Collect child content.
        cell.forEach((child) => content.push(child));
      }
    }

    if (topLeftPos === null || !topLeftCell) {
      return toTableFailure('INVALID_TARGET', 'No cells found in merge range.');
    }

    const rowSpan = endRow - startRow + 1;
    const colSpan = endCol - startCol + 1;

    // Build merged cell attrs.
    const mergedAttrs = {
      ...(topLeftCell.attrs as Record<string, unknown>),
      colspan: colSpan,
      rowspan: rowSpan,
    };

    // Replace: delete all cells in range from bottom-right to top-left (reverse order
    // avoids position shifting issues), then replace top-left with merged cell.
    const mapFrom = tr.mapping.maps.length;

    // Sort cell positions descending so we delete from end to start.
    const sortedPositions = [...cellPositions].sort((a, b) => b - a);
    for (const pos of sortedPositions) {
      const cell = tableNode.nodeAt(pos);
      if (!cell) continue;
      const absPos = tr.mapping.slice(mapFrom).map(tableStart + pos);
      tr.delete(absPos, absPos + cell.nodeSize);
    }

    // Insert merged cell at the top-left position.
    const mergedCell = topLeftCell.type.create(mergedAttrs, content);
    const insertPos = tr.mapping.slice(mapFrom).map(tableStart + topLeftPos);
    tr.insert(insertPos, mergedCell);

    applyDirectMutationMeta(tr);
    editor.dispatch(tr);
    clearIndexCache(editor);
    return buildTableSuccess(table.address);
  } catch {
    return toTableFailure('INVALID_TARGET', 'Cell merge could not be applied.');
  }
}

/**
 * tables.unmergeCells — unmerge a merged cell back into individual cells.
 *
 * The original content is kept in the top-left cell. All other cells in the
 * previously spanned range are filled with empty cells.
 */
export function tablesUnmergeCellsAdapter(
  editor: Editor,
  input: TablesUnmergeCellsInput,
  options?: MutationOptions,
): TableMutationResult {
  rejectTrackedMode('tables.unmergeCells', options);

  const resolved = resolveCellLocator(editor, input, 'tables.unmergeCells');
  const { table, cellPos, cellNode, rowIndex, columnIndex } = resolved;

  const attrs = cellNode.attrs as Record<string, unknown>;
  const colspan = (attrs.colspan as number) || 1;
  const rowspan = (attrs.rowspan as number) || 1;

  if (colspan === 1 && rowspan === 1) {
    // Already unmerged — idempotent success.
    return buildTableSuccess(table.address);
  }

  if (options?.dryRun) {
    return buildTableSuccess(table.address);
  }

  try {
    const tr = editor.state.tr;
    const tablePos = table.candidate.pos;
    const tableStart = tablePos + 1;
    const tableNode = table.candidate.node;
    const map = TableMap.get(tableNode);
    const schema = editor.state.schema;

    // Replace the merged cell with a 1x1 cell while preserving content.
    const currentColwidth = Array.isArray(attrs.colwidth) ? (attrs.colwidth as number[]) : null;
    const tableCellProperties = {
      ...((attrs.tableCellProperties ?? {}) as Record<string, unknown>),
    };
    delete tableCellProperties.gridSpan;
    delete tableCellProperties.vMerge;

    const resetCell = cellNode.type.create(
      {
        ...attrs,
        colspan: 1,
        rowspan: 1,
        colwidth: currentColwidth && currentColwidth.length > 0 ? [currentColwidth[0] ?? 0] : currentColwidth,
        tableCellProperties,
      },
      cellNode.content,
    );
    tr.replaceWith(cellPos, cellPos + cellNode.nodeSize, resetCell);

    // Fill the previously spanned area with empty cells.
    const mapFrom = tr.mapping.maps.length;
    for (let row = rowIndex + rowspan - 1; row >= rowIndex; row--) {
      for (let col = columnIndex + colspan - 1; col >= columnIndex; col--) {
        if (row === rowIndex && col === columnIndex) continue;

        const newCell = schema.nodes.tableCell.createAndFill()!;

        let insertRelPos: number;
        if (row === rowIndex) {
          // For the top row, insert after the original cell so it stays top-left.
          const baseRelPos = map.positionAt(rowIndex, columnIndex, tableNode);
          insertRelPos = baseRelPos + resetCell.nodeSize;
        } else {
          insertRelPos = map.positionAt(row, col, tableNode);
        }

        tr.insert(tr.mapping.slice(mapFrom).map(tableStart + insertRelPos), newCell);
      }
    }

    applyDirectMutationMeta(tr);
    editor.dispatch(tr);
    clearIndexCache(editor);
    return buildTableSuccess(table.address);
  } catch {
    return toTableFailure('INVALID_TARGET', 'Cell unmerge could not be applied.');
  }
}

/**
 * tables.splitCell — split a cell into a `rows × columns` grid.
 *
 * The original cell content is placed in the top-left cell of the resulting grid.
 * All other cells are filled with empty content. If the cell currently spans
 * multiple rows/columns, it is first reduced to span the target grid.
 */
export function tablesSplitCellAdapter(
  editor: Editor,
  input: TablesSplitCellInput,
  options?: MutationOptions,
): TableMutationResult {
  rejectTrackedMode('tables.splitCell', options);

  const resolved = resolveCellLocator(editor, input, 'tables.splitCell');
  const { table, cellPos, cellNode, rowIndex, columnIndex } = resolved;

  if (input.rows < 1 || input.columns < 1) {
    return toTableFailure('INVALID_TARGET', 'Split rows and columns must be at least 1.');
  }

  const attrs = cellNode.attrs as Record<string, unknown>;
  const currentColspan = (attrs.colspan as number) || 1;
  const currentRowspan = (attrs.rowspan as number) || 1;

  if ((currentColspan > 1 || currentRowspan > 1) && input.rows === currentRowspan && input.columns === currentColspan) {
    return tablesUnmergeCellsAdapter(editor, input, options);
  }

  if (input.rows === 1 && input.columns === 1 && currentColspan === 1 && currentRowspan === 1) {
    return toTableFailure('NO_OP', 'Cell is already a single cell and split target is 1×1.');
  }

  if (options?.dryRun) {
    return buildTableSuccess(table.address);
  }

  try {
    const tr = editor.state.tr;
    const tablePos = table.candidate.pos;
    const tableStart = tablePos + 1;
    const tableNode = table.candidate.node;
    const map = TableMap.get(tableNode);
    const schema = editor.state.schema;

    // Target span: if the cell already spans more than requested, we reduce.
    // If the cell spans less, the split creates sub-cells within the current span.
    const targetColspan = Math.max(input.columns, currentColspan);
    const targetRowspan = Math.max(input.rows, currentRowspan);

    // Replace the original cell with a 1×1 cell keeping the content.
    const splitAttrs = { ...attrs, colspan: 1, rowspan: 1 };
    tr.setNodeMarkup(cellPos, null, splitAttrs);

    // Insert empty cells for the rest of the grid.
    const mapFrom = tr.mapping.maps.length;
    for (let row = rowIndex + targetRowspan - 1; row >= rowIndex; row--) {
      for (let col = columnIndex + targetColspan - 1; col >= columnIndex; col--) {
        if (row === rowIndex && col === columnIndex) continue;

        const newCell = schema.nodes.tableCell.createAndFill()!;
        // Use positionAt if within original map bounds, otherwise insert at row end.
        if (row < map.height && col < map.width) {
          const insertPos = map.positionAt(row, col, tableNode);
          tr.insert(tr.mapping.slice(mapFrom).map(tableStart + insertPos), newCell);
        }
      }
    }

    applyDirectMutationMeta(tr);
    editor.dispatch(tr);
    clearIndexCache(editor);
    return buildTableSuccess(table.address);
  } catch {
    return toTableFailure('INVALID_TARGET', 'Cell split could not be applied.');
  }
}

/**
 * tables.setCellProperties — set cell-level properties (width, vertical alignment, wrap, fit).
 */
export function tablesSetCellPropertiesAdapter(
  editor: Editor,
  input: TablesSetCellPropertiesInput,
  options?: MutationOptions,
): TableMutationResult {
  rejectTrackedMode('tables.setCellProperties', options);

  const resolved = resolveCellLocator(editor, input, 'tables.setCellProperties');
  const { table, cellPos, cellNode } = resolved;

  if (options?.dryRun) {
    return buildTableSuccess(table.address);
  }

  try {
    const tr = editor.state.tr;
    const currentAttrs = cellNode.attrs as Record<string, unknown>;
    const currentCellProps = (currentAttrs.tableCellProperties ?? {}) as Record<string, unknown>;

    const attrUpdates: Record<string, unknown> = {};
    const cellPropUpdates: Record<string, unknown> = {};

    if (input.preferredWidthPt !== undefined) {
      const widthPx = Math.round(input.preferredWidthPt * (96 / 72));
      const colspan = (currentAttrs.colspan as number) || 1;
      const colwidth = Array(colspan).fill(widthPx) as number[];
      attrUpdates.colwidth = colwidth;
      cellPropUpdates.cellWidth = { w: Math.round(input.preferredWidthPt * 20), type: 'dxa' };
    }

    if (input.verticalAlign !== undefined) {
      attrUpdates.verticalAlign = input.verticalAlign;
      cellPropUpdates.vAlign = input.verticalAlign;
    }

    if (input.wrapText !== undefined) {
      cellPropUpdates.noWrap = !input.wrapText;
    }

    if (input.fitText !== undefined) {
      cellPropUpdates.tcFitText = input.fitText;
    }

    const newAttrs = {
      ...currentAttrs,
      ...attrUpdates,
      tableCellProperties: { ...currentCellProps, ...cellPropUpdates },
    };

    tr.setNodeMarkup(cellPos, null, newAttrs);
    applyDirectMutationMeta(tr);
    editor.dispatch(tr);
    clearIndexCache(editor);
    return buildTableSuccess(table.address);
  } catch {
    return toTableFailure('INVALID_TARGET', 'Cell properties update could not be applied.');
  }
}

/**
 * tables.sort — sort table rows by one or more column keys.
 *
 * Reorders rows in place. The first row is treated as data (not a header)
 * unless the caller excludes it via their key configuration. Multi-key
 * sorting is supported: earlier keys in the array take precedence.
 */
export function tablesSortAdapter(
  editor: Editor,
  input: TablesSortInput,
  options?: MutationOptions,
): TableMutationResult {
  rejectTrackedMode('tables.sort', options);

  const { candidate, address } = resolveTableLocator(editor, input, 'tables.sort');
  const tableNode = candidate.node;

  if (!input.keys || input.keys.length === 0) {
    return toTableFailure('INVALID_TARGET', 'No sort keys provided.');
  }

  if (options?.dryRun) {
    return buildTableSuccess(address);
  }

  try {
    const tr = editor.state.tr;
    const tablePos = candidate.pos;
    const tableStart = tablePos + 1;
    const map = TableMap.get(tableNode);

    // Validate column indices.
    for (const key of input.keys) {
      if (key.columnIndex < 0 || key.columnIndex >= map.width) {
        return toTableFailure('INVALID_TARGET', `Sort column index ${key.columnIndex} is out of bounds.`);
      }
    }

    // Extract text value from each row/column for comparison.
    type RowEntry = { index: number; node: import('prosemirror-model').Node };
    const rows: RowEntry[] = [];
    for (let r = 0; r < tableNode.childCount; r++) {
      rows.push({ index: r, node: tableNode.child(r) });
    }

    const getCellText = (rowIdx: number, colIdx: number): string => {
      const cellPos = map.map[rowIdx * map.width + colIdx];
      const cell = tableNode.nodeAt(cellPos);
      return cell?.textContent ?? '';
    };

    // Build sortable values per row.
    const rowValues = rows.map((row) => ({
      row,
      values: input.keys.map((key) => getCellText(row.index, key.columnIndex)),
    }));

    // Compare function.
    rowValues.sort((a, b) => {
      for (let k = 0; k < input.keys.length; k++) {
        const key = input.keys[k];
        const va = a.values[k];
        const vb = b.values[k];
        let cmp: number;

        if (key.type === 'number') {
          cmp = (parseFloat(va) || 0) - (parseFloat(vb) || 0);
        } else if (key.type === 'date') {
          cmp = (new Date(va).getTime() || 0) - (new Date(vb).getTime() || 0);
        } else {
          cmp = va.localeCompare(vb);
        }

        if (key.direction === 'descending') cmp = -cmp;
        if (cmp !== 0) return cmp;
      }
      return 0;
    });

    // Check if order actually changed.
    const isAlreadySorted = rowValues.every((rv, i) => rv.row.index === i);
    if (isAlreadySorted) {
      return buildTableSuccess(address);
    }

    // Replace all rows: delete all, then re-insert in sorted order.
    const sortedNodes = rowValues.map((rv) => rv.row.node);

    // Delete all rows from the table (single replaceWith is cleanest).
    const tableEnd = tablePos + tableNode.nodeSize;
    const newTable = tableNode.type.create(tableNode.attrs as Record<string, unknown>, sortedNodes);
    tr.replaceWith(tablePos, tableEnd, newTable);

    applyDirectMutationMeta(tr);
    editor.dispatch(tr);
    clearIndexCache(editor);
    return buildTableSuccess(address);
  } catch {
    return toTableFailure('INVALID_TARGET', 'Table sort could not be applied.');
  }
}

// ---------------------------------------------------------------------------
// Batch 6 — Table style operations
// ---------------------------------------------------------------------------

/**
 * tables.setStyle — assign a table style by ID.
 */
export function tablesSetStyleAdapter(
  editor: Editor,
  input: TablesSetStyleInput,
  options?: MutationOptions,
): TableMutationResult {
  rejectTrackedMode('tables.setStyle', options);

  const { candidate, address } = resolveTableLocator(editor, input, 'tables.setStyle');

  if (options?.dryRun) {
    return buildTableSuccess(address);
  }

  try {
    const tr = editor.state.tr;
    const currentAttrs = candidate.node.attrs as Record<string, unknown>;
    const currentTableProps = (currentAttrs.tableProperties ?? {}) as Record<string, unknown>;

    const updatedTableProps = { ...currentTableProps, tableStyleId: input.styleId };
    tr.setNodeMarkup(candidate.pos, null, {
      ...currentAttrs,
      tableProperties: updatedTableProps,
      ...syncExtractedTableAttrs(updatedTableProps),
    });
    applyDirectMutationMeta(tr);
    editor.dispatch(tr);
    clearIndexCache(editor);
    return buildTableSuccess(address);
  } catch {
    return toTableFailure('INVALID_TARGET', 'Table style assignment could not be applied.');
  }
}

/**
 * tables.clearStyle — remove the table style reference.
 */
export function tablesClearStyleAdapter(
  editor: Editor,
  input: TablesClearStyleInput,
  options?: MutationOptions,
): TableMutationResult {
  rejectTrackedMode('tables.clearStyle', options);

  const { candidate, address } = resolveTableLocator(editor, input, 'tables.clearStyle');

  if (options?.dryRun) {
    return buildTableSuccess(address);
  }

  try {
    const tr = editor.state.tr;
    const currentAttrs = candidate.node.attrs as Record<string, unknown>;
    const currentTableProps = { ...((currentAttrs.tableProperties ?? {}) as Record<string, unknown>) };
    delete currentTableProps.tableStyleId;

    tr.setNodeMarkup(candidate.pos, null, {
      ...currentAttrs,
      tableProperties: currentTableProps,
      ...syncExtractedTableAttrs(currentTableProps),
    });
    applyDirectMutationMeta(tr);
    editor.dispatch(tr);
    clearIndexCache(editor);
    return buildTableSuccess(address);
  } catch {
    return toTableFailure('INVALID_TARGET', 'Table style removal could not be applied.');
  }
}

/**
 * tables.setStyleOption — toggle a table style option flag.
 *
 * Maps API flags to OOXML `w:tblLook` attributes, inverting `bandedRows`
 * and `bandedColumns` to the `noHBand`/`noVBand` semantics.
 */
export function tablesSetStyleOptionAdapter(
  editor: Editor,
  input: TablesSetStyleOptionInput,
  options?: MutationOptions,
): TableMutationResult {
  rejectTrackedMode('tables.setStyleOption', options);

  const { candidate, address } = resolveTableLocator(editor, input, 'tables.setStyleOption');

  if (options?.dryRun) {
    return buildTableSuccess(address);
  }

  try {
    const tr = editor.state.tr;
    const currentAttrs = candidate.node.attrs as Record<string, unknown>;
    const currentTableProps = (currentAttrs.tableProperties ?? {}) as Record<string, unknown>;
    const currentLook = {
      ...((currentTableProps.tblLook ?? {}) as Record<string, unknown>),
    };

    // Map API flag names to OOXML tblLook keys.
    const flagMap: Record<string, string> = {
      headerRow: 'firstRow',
      totalRow: 'lastRow',
      firstColumn: 'firstColumn',
      lastColumn: 'lastColumn',
      bandedRows: 'noHBand',
      bandedColumns: 'noVBand',
    };

    const xmlKey = flagMap[input.flag];
    if (xmlKey) {
      // bandedRows/bandedColumns are inverted: enabled → noHBand = false.
      const value = input.flag === 'bandedRows' || input.flag === 'bandedColumns' ? !input.enabled : input.enabled;
      currentLook[xmlKey] = value;
    }

    const updatedTableProps = { ...currentTableProps, tblLook: currentLook };
    tr.setNodeMarkup(candidate.pos, null, {
      ...currentAttrs,
      tableProperties: updatedTableProps,
      ...syncExtractedTableAttrs(updatedTableProps),
    });
    applyDirectMutationMeta(tr);
    editor.dispatch(tr);
    clearIndexCache(editor);
    return buildTableSuccess(address);
  } catch {
    return toTableFailure('INVALID_TARGET', 'Table style option could not be applied.');
  }
}

// ---------------------------------------------------------------------------
// Batch 7 — Border + shading operations
// ---------------------------------------------------------------------------

/**
 * Resolves a target that may be either a table or a cell node.
 * Returns the node, position, and which scope was resolved.
 */
function resolveTableOrCellTarget(
  editor: Editor,
  locator: { target?: BlockNodeAddress; nodeId?: string },
  operationName: string,
): {
  node: import('prosemirror-model').Node;
  pos: number;
  address: BlockNodeAddress;
  scope: 'table' | 'cell' | 'invalid';
} {
  const index = getBlockIndex(editor);
  let candidate: ReturnType<typeof findBlockByNodeIdOnly> | undefined;

  if (locator.target != null) {
    candidate = findBlockById(index, locator.target);
  } else if (locator.nodeId != null) {
    candidate = findBlockByNodeIdOnly(index, locator.nodeId);
  } else {
    throw new DocumentApiAdapterError('INVALID_TARGET', `${operationName}: requires either target or nodeId.`);
  }

  if (!candidate) {
    throw new DocumentApiAdapterError('TARGET_NOT_FOUND', `${operationName}: target was not found.`);
  }

  const scope: 'table' | 'cell' | 'invalid' =
    candidate.nodeType === 'table' ? 'table' : candidate.nodeType === 'tableCell' ? 'cell' : 'invalid';
  return { node: candidate.node, pos: candidate.pos, address: toBlockAddress(candidate), scope };
}

/**
 * tables.setBorder — set a border edge on a table or cell.
 */
export function tablesSetBorderAdapter(
  editor: Editor,
  input: TablesSetBorderInput,
  options?: MutationOptions,
): TableMutationResult {
  rejectTrackedMode('tables.setBorder', options);

  const resolved = resolveTableOrCellTarget(editor, input, 'tables.setBorder');

  if (resolved.scope === 'invalid') {
    return toTableFailure('INVALID_TARGET', 'tables.setBorder: target must be a table or tableCell.');
  }

  if (options?.dryRun) {
    return buildTableSuccess(resolved.address);
  }

  try {
    const tr = editor.state.tr;
    const currentAttrs = resolved.node.attrs as Record<string, unknown>;
    const propsKey = resolved.scope === 'table' ? 'tableProperties' : 'tableCellProperties';
    const currentProps = { ...((currentAttrs[propsKey] ?? {}) as Record<string, unknown>) };
    const currentBorders = { ...((currentProps.borders ?? {}) as Record<string, unknown>) };

    currentBorders[input.edge] = {
      val: input.lineStyle,
      size: Math.round(input.lineWeightPt * 8), // pt → eighths of a point (OOXML w:sz)
      color: input.color,
    };

    currentProps.borders = currentBorders;
    const syncAttrs = resolved.scope === 'table' ? syncExtractedTableAttrs(currentProps) : {};
    tr.setNodeMarkup(resolved.pos, null, { ...currentAttrs, [propsKey]: currentProps, ...syncAttrs });

    if (resolved.scope === 'table' && isBoundaryEdge(input.edge)) {
      applyTableEdgeToCellBorders(
        tr,
        resolved.pos,
        resolved.node,
        input.edge,
        currentBorders[input.edge] as Record<string, unknown>,
      );
    }

    applyDirectMutationMeta(tr);
    editor.dispatch(tr);
    clearIndexCache(editor);
    return buildTableSuccess(resolved.address);
  } catch {
    return toTableFailure('INVALID_TARGET', 'Border update could not be applied.');
  }
}

/**
 * tables.clearBorder — clear a border edge on a table or cell.
 */
export function tablesClearBorderAdapter(
  editor: Editor,
  input: TablesClearBorderInput,
  options?: MutationOptions,
): TableMutationResult {
  rejectTrackedMode('tables.clearBorder', options);

  const resolved = resolveTableOrCellTarget(editor, input, 'tables.clearBorder');

  if (resolved.scope === 'invalid') {
    return toTableFailure('INVALID_TARGET', 'tables.clearBorder: target must be a table or tableCell.');
  }

  if (options?.dryRun) {
    return buildTableSuccess(resolved.address);
  }

  try {
    const tr = editor.state.tr;
    const currentAttrs = resolved.node.attrs as Record<string, unknown>;
    const propsKey = resolved.scope === 'table' ? 'tableProperties' : 'tableCellProperties';
    const currentProps = { ...((currentAttrs[propsKey] ?? {}) as Record<string, unknown>) };
    const currentBorders = { ...((currentProps.borders ?? {}) as Record<string, unknown>) };

    currentBorders[input.edge] = { val: 'nil', size: 0, color: 'auto' };

    currentProps.borders = currentBorders;
    const syncAttrs = resolved.scope === 'table' ? syncExtractedTableAttrs(currentProps) : {};
    tr.setNodeMarkup(resolved.pos, null, { ...currentAttrs, [propsKey]: currentProps, ...syncAttrs });

    if (resolved.scope === 'table' && isBoundaryEdge(input.edge)) {
      applyTableEdgeToCellBorders(
        tr,
        resolved.pos,
        resolved.node,
        input.edge,
        currentBorders[input.edge] as Record<string, unknown>,
      );
    }

    applyDirectMutationMeta(tr);
    editor.dispatch(tr);
    clearIndexCache(editor);
    return buildTableSuccess(resolved.address);
  } catch {
    return toTableFailure('INVALID_TARGET', 'Border clear could not be applied.');
  }
}

/**
 * tables.applyBorderPreset — apply a border preset to a table.
 */
export function tablesApplyBorderPresetAdapter(
  editor: Editor,
  input: TablesApplyBorderPresetInput,
  options?: MutationOptions,
): TableMutationResult {
  rejectTrackedMode('tables.applyBorderPreset', options);

  const { candidate, address } = resolveTableLocator(editor, input, 'tables.applyBorderPreset');

  if (options?.dryRun) {
    return buildTableSuccess(address);
  }

  try {
    const tr = editor.state.tr;
    const currentAttrs = candidate.node.attrs as Record<string, unknown>;
    const currentTableProps = { ...((currentAttrs.tableProperties ?? {}) as Record<string, unknown>) };

    const none = { val: 'none', size: 0, color: 'auto' };
    const single = { val: 'single', size: 4, color: '000000' };

    let borders: Record<string, unknown>;
    switch (input.preset) {
      case 'none':
        borders = { top: none, bottom: none, left: none, right: none, insideH: none, insideV: none };
        break;
      case 'box':
        borders = { top: single, bottom: single, left: single, right: single, insideH: none, insideV: none };
        break;
      case 'all':
      case 'grid':
        borders = { top: single, bottom: single, left: single, right: single, insideH: single, insideV: single };
        break;
      default:
        // 'custom' — no-op, return success.
        return buildTableSuccess(address);
    }

    currentTableProps.borders = borders;
    tr.setNodeMarkup(candidate.pos, null, {
      ...currentAttrs,
      tableProperties: currentTableProps,
      ...syncExtractedTableAttrs(currentTableProps),
    });

    applyTableBorderPresetToCellBorders(tr, candidate.pos, candidate.node, input.preset);

    applyDirectMutationMeta(tr);
    editor.dispatch(tr);
    clearIndexCache(editor);
    return buildTableSuccess(address);
  } catch {
    return toTableFailure('INVALID_TARGET', 'Border preset could not be applied.');
  }
}

/**
 * tables.setShading — set shading color on a table or cell.
 */
export function tablesSetShadingAdapter(
  editor: Editor,
  input: TablesSetShadingInput,
  options?: MutationOptions,
): TableMutationResult {
  rejectTrackedMode('tables.setShading', options);

  const resolved = resolveTableOrCellTarget(editor, input, 'tables.setShading');

  if (resolved.scope === 'invalid') {
    return toTableFailure('INVALID_TARGET', 'tables.setShading: target must be a table or tableCell.');
  }

  if (options?.dryRun) {
    return buildTableSuccess(resolved.address);
  }

  try {
    const tr = editor.state.tr;
    const currentAttrs = resolved.node.attrs as Record<string, unknown>;
    const propsKey = resolved.scope === 'table' ? 'tableProperties' : 'tableCellProperties';
    const currentProps = { ...((currentAttrs[propsKey] ?? {}) as Record<string, unknown>) };

    currentProps.shading = { fill: input.color, val: 'clear', color: 'auto' };
    const syncAttrs = resolved.scope === 'table' ? syncExtractedTableAttrs(currentProps) : {};
    tr.setNodeMarkup(resolved.pos, null, { ...currentAttrs, [propsKey]: currentProps, ...syncAttrs });
    applyDirectMutationMeta(tr);
    editor.dispatch(tr);
    clearIndexCache(editor);
    return buildTableSuccess(resolved.address);
  } catch {
    return toTableFailure('INVALID_TARGET', 'Shading update could not be applied.');
  }
}

/**
 * tables.clearShading — clear shading from a table or cell.
 */
export function tablesClearShadingAdapter(
  editor: Editor,
  input: TablesClearShadingInput,
  options?: MutationOptions,
): TableMutationResult {
  rejectTrackedMode('tables.clearShading', options);

  const resolved = resolveTableOrCellTarget(editor, input, 'tables.clearShading');

  if (resolved.scope === 'invalid') {
    return toTableFailure('INVALID_TARGET', 'tables.clearShading: target must be a table or tableCell.');
  }

  if (options?.dryRun) {
    return buildTableSuccess(resolved.address);
  }

  try {
    const tr = editor.state.tr;
    const currentAttrs = resolved.node.attrs as Record<string, unknown>;
    const propsKey = resolved.scope === 'table' ? 'tableProperties' : 'tableCellProperties';
    const currentProps = { ...((currentAttrs[propsKey] ?? {}) as Record<string, unknown>) };

    delete currentProps.shading;
    const syncAttrs = resolved.scope === 'table' ? syncExtractedTableAttrs(currentProps) : {};
    tr.setNodeMarkup(resolved.pos, null, { ...currentAttrs, [propsKey]: currentProps, ...syncAttrs });

    if (resolved.scope === 'table') {
      const tableNode = resolved.node;
      const tableStart = resolved.pos + 1;
      const map = TableMap.get(tableNode);
      const seen = new Set<number>();
      const mapFrom = tr.mapping.maps.length;

      for (let i = 0; i < map.map.length; i++) {
        const relPos = map.map[i]!;
        if (seen.has(relPos)) continue;
        seen.add(relPos);

        const cellNode = tableNode.nodeAt(relPos);
        if (!cellNode) continue;

        const cellAttrs = cellNode.attrs as Record<string, unknown>;
        const cellProps = { ...((cellAttrs.tableCellProperties ?? {}) as Record<string, unknown>) };
        delete cellProps.shading;

        const nextCellAttrs: Record<string, unknown> = {
          ...cellAttrs,
          tableCellProperties: cellProps,
        };
        delete nextCellAttrs.background;

        tr.setNodeMarkup(tr.mapping.slice(mapFrom).map(tableStart + relPos), null, nextCellAttrs);
      }
    }

    applyDirectMutationMeta(tr);
    editor.dispatch(tr);
    clearIndexCache(editor);
    return buildTableSuccess(resolved.address);
  } catch {
    return toTableFailure('INVALID_TARGET', 'Shading clear could not be applied.');
  }
}

// ---------------------------------------------------------------------------
// Batch 8 — Padding + spacing operations
// ---------------------------------------------------------------------------

/**
 * tables.setTablePadding — set default cell margins for the entire table.
 */
export function tablesSetTablePaddingAdapter(
  editor: Editor,
  input: TablesSetTablePaddingInput,
  options?: MutationOptions,
): TableMutationResult {
  rejectTrackedMode('tables.setTablePadding', options);

  const { candidate, address } = resolveTableLocator(editor, input, 'tables.setTablePadding');

  if (options?.dryRun) {
    return buildTableSuccess(address);
  }

  try {
    const tr = editor.state.tr;
    const currentAttrs = candidate.node.attrs as Record<string, unknown>;
    const currentTableProps = { ...((currentAttrs.tableProperties ?? {}) as Record<string, unknown>) };

    // OOXML stores default cell margins at tblPr/tblCellMar in twips.
    currentTableProps.cellMargins = {
      marginTop: { value: Math.round(input.topPt * POINTS_TO_TWIPS), type: 'dxa' },
      marginRight: { value: Math.round(input.rightPt * POINTS_TO_TWIPS), type: 'dxa' },
      marginBottom: { value: Math.round(input.bottomPt * POINTS_TO_TWIPS), type: 'dxa' },
      marginLeft: { value: Math.round(input.leftPt * POINTS_TO_TWIPS), type: 'dxa' },
    };

    tr.setNodeMarkup(candidate.pos, null, {
      ...currentAttrs,
      tableProperties: currentTableProps,
      ...syncExtractedTableAttrs(currentTableProps),
    });
    applyDirectMutationMeta(tr);
    editor.dispatch(tr);
    clearIndexCache(editor);
    return buildTableSuccess(address);
  } catch {
    return toTableFailure('INVALID_TARGET', 'Table padding could not be applied.');
  }
}

/**
 * tables.setCellPadding — set margins on a specific cell.
 */
export function tablesSetCellPaddingAdapter(
  editor: Editor,
  input: TablesSetCellPaddingInput,
  options?: MutationOptions,
): TableMutationResult {
  rejectTrackedMode('tables.setCellPadding', options);

  const resolved = resolveCellLocator(editor, input, 'tables.setCellPadding');
  const { table, cellPos, cellNode } = resolved;

  if (options?.dryRun) {
    return buildTableSuccess(table.address);
  }

  try {
    const tr = editor.state.tr;
    const currentAttrs = cellNode.attrs as Record<string, unknown>;
    const currentCellProps = { ...((currentAttrs.tableCellProperties ?? {}) as Record<string, unknown>) };

    // Update both the PM-level cellMargins attr and the OOXML tcMar property.
    const cellMargins = {
      top: Math.round(input.topPt * (96 / 72)),
      right: Math.round(input.rightPt * (96 / 72)),
      bottom: Math.round(input.bottomPt * (96 / 72)),
      left: Math.round(input.leftPt * (96 / 72)),
    };

    currentCellProps.cellMargins = {
      top: { w: Math.round(input.topPt * 20), type: 'dxa' },
      right: { w: Math.round(input.rightPt * 20), type: 'dxa' },
      bottom: { w: Math.round(input.bottomPt * 20), type: 'dxa' },
      left: { w: Math.round(input.leftPt * 20), type: 'dxa' },
    };

    tr.setNodeMarkup(cellPos, null, {
      ...currentAttrs,
      cellMargins,
      tableCellProperties: currentCellProps,
    });
    applyDirectMutationMeta(tr);
    editor.dispatch(tr);
    clearIndexCache(editor);
    return buildTableSuccess(table.address);
  } catch {
    return toTableFailure('INVALID_TARGET', 'Cell padding could not be applied.');
  }
}

/**
 * tables.setCellSpacing — set cell spacing for the table.
 */
export function tablesSetCellSpacingAdapter(
  editor: Editor,
  input: TablesSetCellSpacingInput,
  options?: MutationOptions,
): TableMutationResult {
  rejectTrackedMode('tables.setCellSpacing', options);

  const { candidate, address } = resolveTableLocator(editor, input, 'tables.setCellSpacing');

  if (options?.dryRun) {
    return buildTableSuccess(address);
  }

  try {
    const tr = editor.state.tr;
    const currentAttrs = candidate.node.attrs as Record<string, unknown>;
    const currentTableProps = { ...((currentAttrs.tableProperties ?? {}) as Record<string, unknown>) };

    currentTableProps.tableCellSpacing = {
      value: Math.round(input.spacingPt * 20),
      type: 'dxa',
    };

    tr.setNodeMarkup(candidate.pos, null, {
      ...currentAttrs,
      tableProperties: currentTableProps,
      ...syncExtractedTableAttrs(currentTableProps),
    });
    applyDirectMutationMeta(tr);
    editor.dispatch(tr);
    clearIndexCache(editor);
    return buildTableSuccess(address);
  } catch {
    return toTableFailure('INVALID_TARGET', 'Cell spacing could not be applied.');
  }
}

/**
 * tables.clearCellSpacing — remove cell spacing from the table.
 */
export function tablesClearCellSpacingAdapter(
  editor: Editor,
  input: TablesClearCellSpacingInput,
  options?: MutationOptions,
): TableMutationResult {
  rejectTrackedMode('tables.clearCellSpacing', options);

  const { candidate, address } = resolveTableLocator(editor, input, 'tables.clearCellSpacing');

  if (options?.dryRun) {
    return buildTableSuccess(address);
  }

  try {
    const tr = editor.state.tr;
    const currentAttrs = candidate.node.attrs as Record<string, unknown>;
    const currentTableProps = { ...((currentAttrs.tableProperties ?? {}) as Record<string, unknown>) };

    delete currentTableProps.tableCellSpacing;
    delete currentTableProps.tblCellSpacing; // clean up any legacy data

    tr.setNodeMarkup(candidate.pos, null, {
      ...currentAttrs,
      tableProperties: currentTableProps,
      ...syncExtractedTableAttrs(currentTableProps),
    });
    applyDirectMutationMeta(tr);
    editor.dispatch(tr);
    clearIndexCache(editor);
    return buildTableSuccess(address);
  } catch {
    return toTableFailure('INVALID_TARGET', 'Cell spacing removal could not be applied.');
  }
}

// ---------------------------------------------------------------------------
// create.table
// ---------------------------------------------------------------------------

type InsertTableAtCommandOptions = {
  pos: number;
  rows: number;
  columns: number;
  sdBlockId?: string;
  paraId?: string;
  tracked?: boolean;
};

type InsertTableAtCommand = (options: InsertTableAtCommandOptions) => boolean;

function resolveCreatedTable(editor: Editor, tableId: string): ReturnType<typeof findBlockById> {
  const index = getBlockIndex(editor);
  const resolved = index.byId.get(`table:${tableId}`);
  if (resolved) return resolved;

  const bySdBlockId = index.candidates.find((candidate) => {
    if (candidate.nodeType !== 'table') return false;
    const attrs = (candidate.node as { attrs?: { sdBlockId?: unknown } }).attrs;
    return typeof attrs?.sdBlockId === 'string' && attrs.sdBlockId === tableId;
  });
  if (bySdBlockId) return bySdBlockId;

  throw new DocumentApiAdapterError('TARGET_NOT_FOUND', 'Created table could not be resolved after insertion.', {
    tableId,
  });
}

export function createTableAdapter(
  editor: Editor,
  input: CreateTableInput,
  options?: MutationOptions,
): CreateTableResult {
  const insertTableAt = requireEditorCommand(editor.commands?.insertTableAt, 'create.table') as InsertTableAtCommand;
  const mode = options?.changeMode ?? 'direct';

  if (mode === 'tracked') {
    ensureTrackedCapability(editor, { operation: 'create.table' });
  }

  const insertAt = resolveTableCreateLocation(editor, input.at ?? { kind: 'documentEnd' }, 'create.table');

  if (options?.dryRun) {
    const canInsert = editor.can().insertTableAt?.({
      pos: insertAt,
      rows: input.rows,
      columns: input.columns,
      tracked: mode === 'tracked',
    });

    if (!canInsert) {
      return {
        success: false,
        failure: {
          code: 'INVALID_TARGET',
          message: 'Table creation could not be applied at the requested location.',
        },
      };
    }

    return {
      success: true,
      table: {
        kind: 'block',
        nodeType: 'table',
        nodeId: '(dry-run)',
      },
    };
  }

  const tableId = uuidv4();
  // Generate a w14:paraId-compatible 8-char uppercase hex string for DOCX roundtrip stability.
  const paraId = generateParaId();

  const didApply = insertTableAt({
    pos: insertAt,
    rows: input.rows,
    columns: input.columns,
    sdBlockId: tableId,
    paraId,
    tracked: mode === 'tracked',
  });

  if (!didApply) {
    return {
      success: false,
      failure: {
        code: 'INVALID_TARGET',
        message: 'Table creation could not be applied at the requested location.',
      },
    };
  }

  clearIndexCache(editor);
  try {
    const table = resolveCreatedTable(editor, tableId);
    const trackedChangeRefs =
      mode === 'tracked' ? collectTrackInsertRefsInRange(editor, table!.pos, table!.end) : undefined;

    return {
      success: true,
      table: {
        kind: 'block',
        nodeType: 'table',
        nodeId: table!.nodeId,
      },
      trackedChangeRefs,
    };
  } catch {
    return {
      success: true,
      table: {
        kind: 'block',
        nodeType: 'table',
        nodeId: tableId,
      },
    };
  }
}

// ---------------------------------------------------------------------------
// Read operations (B4: ref handoff)
// ---------------------------------------------------------------------------

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : undefined;
}

function resolveTableLook(tableProps: Record<string, unknown>): Record<string, unknown> | undefined {
  return asRecord(tableProps.tblLook);
}

function mapJustificationToTableAlignment(value: unknown): TablesGetPropertiesOutput['alignment'] | undefined {
  switch (value) {
    case 'left':
    case 'start':
      return 'left';
    case 'center':
      return 'center';
    case 'right':
    case 'end':
      return 'right';
    default:
      return undefined;
  }
}

function mapTableLayoutToAutoFitMode(
  layout: unknown,
  tableWidth: Record<string, unknown> | undefined,
): TablesGetPropertiesOutput['autoFitMode'] | undefined {
  if (layout === 'fixed') return 'fixedWidth';
  if (layout === 'autofit') {
    return tableWidth?.type === 'pct' ? 'fitWindow' : 'fitContents';
  }
  return undefined;
}

function resolveMeasurementValue(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function resolvePreferredWidth(value: unknown): number | undefined {
  const numeric = resolveMeasurementValue(value);
  if (numeric != null) return numeric;

  const record = asRecord(value);
  if (!record) return undefined;

  return resolveMeasurementValue(record.value) ?? resolveMeasurementValue(record.width);
}

function resolveCellNodeId(attrs: Record<string, unknown>): string {
  // Keep precedence aligned with resolveBlockNodeId() for table cells so
  // tables.getCells output round-trips into cell-targeting mutations.
  const idFields = ['paraId', 'sdBlockId', 'blockId', 'id', 'uuid', 'nodeId'] as const;
  for (const field of idFields) {
    const value = attrs[field];
    if (typeof value === 'string' && value.length > 0) return value;
  }
  return '';
}

export function tablesGetAdapter(editor: Editor, input: TablesGetInput): TablesGetOutput {
  const resolved = resolveTableLocator(editor, input, 'tables.get');
  const tableNode = resolved.candidate.node;

  return {
    nodeId: resolved.candidate.nodeId,
    address: resolved.address,
    rows: tableNode.childCount,
    columns: getTableColumnCount(tableNode),
  };
}

export function tablesGetCellsAdapter(editor: Editor, input: TablesGetCellsInput): TablesGetCellsOutput {
  const resolved = resolveTableLocator(editor, input, 'tables.getCells');
  const tableNode = resolved.candidate.node;
  const tablePos = resolved.candidate.pos;
  const tableEnd = resolved.candidate.end;
  const tableStart = resolved.candidate.pos + 1;
  const map = TableMap.get(tableNode);
  const index = getBlockIndex(editor);
  const cells: TableCellInfo[] = [];

  // Derive cell identities from canonical block candidates, then map each
  // candidate back to row/column using TableMap offsets.
  for (const candidate of index.candidates) {
    if (candidate.nodeType !== 'tableCell') continue;
    if (candidate.pos <= tablePos || candidate.end > tableEnd) continue;

    const offsets = [candidate.pos - tableStart, candidate.pos - tablePos];
    let mapIndex = -1;
    for (const offset of offsets) {
      mapIndex = map.map.indexOf(offset);
      if (mapIndex !== -1) break;
    }
    if (mapIndex === -1) continue;

    const row = Math.floor(mapIndex / map.width);
    const col = mapIndex % map.width;
    if (input.rowIndex != null && row !== input.rowIndex) continue;
    if (input.columnIndex != null && col !== input.columnIndex) continue;

    const attrs = candidate.node.attrs as Record<string, unknown>;
    cells.push({
      nodeId: candidate.nodeId || resolveCellNodeId(attrs),
      rowIndex: row,
      columnIndex: col,
      colspan: typeof attrs.colspan === 'number' ? attrs.colspan : 1,
      rowspan: typeof attrs.rowspan === 'number' ? attrs.rowspan : 1,
    });
  }

  cells.sort((a, b) => a.rowIndex - b.rowIndex || a.columnIndex - b.columnIndex);

  return {
    tableNodeId: resolved.candidate.nodeId,
    cells,
  };
}

export function tablesGetPropertiesAdapter(editor: Editor, input: TablesGetPropertiesInput): TablesGetPropertiesOutput {
  const resolved = resolveTableLocator(editor, input, 'tables.getProperties');
  const tp = asRecord(resolved.candidate.node.attrs?.tableProperties) ?? {};

  const result: TablesGetPropertiesOutput = {
    nodeId: resolved.candidate.nodeId,
  };

  if (tp.tableStyleId != null) result.styleId = String(tp.tableStyleId);

  const alignment = mapJustificationToTableAlignment(tp.justification);
  if (alignment) result.alignment = alignment;

  // Three-state direction: true→rtl, false→ltr (explicit), undefined→omit
  if (tp.rightToLeft === true) result.direction = 'rtl';
  else if (tp.rightToLeft === false) result.direction = 'ltr';

  const tableWidth = asRecord(tp.tableWidth);
  const autoFitMode = mapTableLayoutToAutoFitMode(tp.tableLayout, tableWidth);
  if (autoFitMode) result.autoFitMode = autoFitMode;

  // preferredWidth is only meaningful for fixedWidth mode (twips).
  // fitWindow tables use percentage width internally — exposing that as
  // preferredWidth would mix units (twips vs OOXML pct).
  if (autoFitMode !== 'fitWindow') {
    const preferredWidth = resolvePreferredWidth(tp.tableWidth);
    if (preferredWidth != null) result.preferredWidth = preferredWidth;
  }

  const look = resolveTableLook(tp);
  if (look) {
    result.styleOptions = {
      headerRow: look.firstRow === true,
      totalRow: look.lastRow === true,
      firstColumn: look.firstColumn === true,
      lastColumn: look.lastColumn === true,
      bandedRows: look.noHBand !== true,
      bandedColumns: look.noVBand !== true,
    };
  }

  return result;
}
