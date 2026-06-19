import type { Node as ProseMirrorNode, NodeType } from 'prosemirror-model';
import type { Editor } from '../core/Editor.js';
import { v4 as uuidv4 } from 'uuid';
import { NON_SEMANTIC_BLOCK_ATTRS } from '../extensions/diffing/algorithm/identity-attrs.js';
import type {
  CreateTableInput,
  CreateTableResult,
  CreateTableSuccessResult,
  MutationOptions,
  TableAddress,
  TableCellAddress,
  TableOrCellAddress,
  TableOrRowAddress,
  TableLocator,
  TableMutationResult,
  TablePreferredWidthType,
  TablesMoveInput,
  TablesSetLayoutInput,
  TablesSetAltTextInput,
  TablesConvertFromTextInput,
  TablesSplitInput,
  TablesConvertToTextInput,
  TablesInsertRowInput,
  RowInsertPosition,
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
  TablesSetCellTextInput,
  TablesSortInput,
  TablesSetStyleInput,
  TablesClearStyleInput,
  TablesSetStyleOptionInput,
  TableStyleOptionFlag,
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
  TablesGetStylesInput,
  TablesGetStylesOutput,
  TableStyleInfo,
  TablesSetDefaultStyleInput,
  TablesClearDefaultStyleInput,
  DocumentMutationResult,
  TablesApplyStyleInput,
  TablesSetBordersInput,
  TablesSetTableOptionsInput,
  TablesApplyPresetInput,
  TablePresetName,
  TableBorderSpec,
  TableBorderState,
  TableMarginsState,
  TableStyleOptionsPatch,
  TableStyleOptionsState,
  TableBorderPatch,
  TableBorderApplyTo,
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
  resolveTableScopedCellLocator,
  resolveMergeRangeLocator,
  resolvePostMutationTableAddress,
  getTableColumnCount,
  toTableFailure,
} from './helpers/table-target-resolver.js';
import type { ResolvedCell } from './helpers/table-target-resolver.js';
import { rejectTrackedMode, ensureTrackedCapability, requireEditorCommand } from './helpers/mutation-helpers.js';
import { collectTrackInsertRefsInRange } from './helpers/tracked-change-refs.js';
import { applyDirectMutationMeta, applyTrackedMutationMeta } from './helpers/transaction-meta.js';
import { DocumentApiAdapterError } from './errors.js';
import { toBlockAddress, findBlockById, findBlockByNodeIdOnly } from './helpers/node-address-resolver.js';
import { resolvePreferredNewTableStyleId, isKnownTableStyleId } from '@superdoc/style-engine/ooxml';
import { generateDocxHexId } from '../utils/generateDocxHexId.js';
import { Attribute, type AttributeValue } from '../core/Attribute.js';
import {
  readSettingsRoot,
  ensureSettingsRoot,
  readDefaultTableStyle,
  setDefaultTableStyle,
  removeDefaultTableStyle,
  type ConverterWithDocumentSettings,
} from './document-settings.js';
import { readTranslatedLinkedStyles } from '../core/parts/adapters/styles-read.js';
import { mutatePart } from '../core/parts/mutation/mutate-part.js';
import type { PartId } from '../core/parts/types.js';
import { buildWidthAuthoringTableAttrs, syncExtractedTableAttrs } from './helpers/table-attr-sync.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const POINTS_TO_PIXELS = 96 / 72;
const POINTS_TO_TWIPS = 20;
const PIXELS_TO_TWIPS = 1440 / 96;
const DEFAULT_TABLE_GRID_WIDTH_TWIPS = 1500;
const SETTINGS_PART: PartId = 'word/settings.xml';

type TableWidthMeasurement = { value: number; type: TablePreferredWidthType };
type CellWidthMeasurement = { value: number; type: TablePreferredWidthType };

function normalizePreferredWidthType(value: TablePreferredWidthType | undefined): TablePreferredWidthType {
  return value ?? 'dxa';
}

function buildTablePreferredWidth(
  preferredWidth: number | undefined,
  preferredWidthType: TablePreferredWidthType | undefined,
): TableWidthMeasurement | undefined {
  const widthType = normalizePreferredWidthType(preferredWidthType);
  if (widthType === 'auto') return { value: 0, type: 'auto' };
  if (preferredWidth === undefined) return undefined;
  return { value: Math.round(preferredWidth), type: widthType };
}

function buildCellPreferredWidth(
  preferredWidthPt: number | undefined,
  preferredWidthType: TablePreferredWidthType | undefined,
): CellWidthMeasurement | undefined {
  const widthType = normalizePreferredWidthType(preferredWidthType);
  if (widthType === 'auto') return { value: 0, type: 'auto' };
  if (preferredWidthPt === undefined) return undefined;
  const widthValue =
    widthType === 'dxa' ? Math.round(preferredWidthPt * POINTS_TO_TWIPS) : Math.round(preferredWidthPt);
  return { value: widthValue, type: widthType };
}

function createSeparatorParagraph(schema: Editor['state']['schema']): import('prosemirror-model').Node | null {
  const paragraphType = schema.nodes.paragraph;
  if (!paragraphType) return null;

  // Keep separator paragraphs addressable/stable for downstream DOCX roundtrip.
  const separatorAttrs = {
    sdBlockId: uuidv4(),
    paraId: generateDocxHexId(),
  };

  return paragraphType.createAndFill(separatorAttrs) ?? paragraphType.createAndFill();
}

function notYetImplemented(operationName: string): never {
  throw new DocumentApiAdapterError('CAPABILITY_UNAVAILABLE', `${operationName} is not yet implemented.`, {
    reason: 'not_implemented',
  });
}

function buildTableSuccess(
  tableAddress?: TableAddress,
  trackedChangeRefs?: { kind: 'entity'; entityType: 'trackedChange'; entityId: string }[],
): TableMutationResult {
  return {
    success: true,
    table: tableAddress,
    trackedChangeRefs,
  };
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

function buildFirstRowCellWidthProps(
  attrs: Record<string, unknown>,
  cellStartCol: number,
  colspan: number,
  colwidth: number[],
  gridColumns?: { col: number }[],
): Record<string, unknown> | undefined {
  const currentCellProps =
    attrs.tableCellProperties && typeof attrs.tableCellProperties === 'object'
      ? (attrs.tableCellProperties as Record<string, unknown>)
      : {};

  const spanTwips = resolveSpanWidthTwips(cellStartCol, colspan, colwidth, gridColumns);
  if (spanTwips == null) return Object.keys(currentCellProps).length > 0 ? currentCellProps : undefined;

  return {
    ...currentCellProps,
    cellWidth: { value: spanTwips, type: 'dxa' },
  };
}

function resolveSpanWidthTwips(
  cellStartCol: number,
  colspan: number,
  colwidth: number[],
  gridColumns?: { col: number }[],
): number | undefined {
  const boundedSpan = Math.max(1, colspan);
  if (Array.isArray(gridColumns) && cellStartCol >= 0 && cellStartCol + boundedSpan <= gridColumns.length) {
    const gridSpanTwips = gridColumns
      .slice(cellStartCol, cellStartCol + boundedSpan)
      .reduce((sum, column) => sum + normalizeGridWidth(column).col, 0);
    if (gridSpanTwips > 0) return gridSpanTwips;
  }

  const spanWidthPx = colwidth
    .slice(0, boundedSpan)
    .reduce((sum, width) => sum + (Number.isFinite(width) ? width : 0), 0);
  if (spanWidthPx > 0) {
    return Math.round(spanWidthPx * PIXELS_TO_TWIPS);
  }

  return undefined;
}

function normalizeCellAttrsForSingleCell(attrs: Record<string, unknown>): Record<string, unknown> {
  const currentColwidth = Array.isArray(attrs.colwidth) ? (attrs.colwidth as number[]) : null;
  const tableCellProperties = {
    ...((attrs.tableCellProperties ?? {}) as Record<string, unknown>),
  };

  delete tableCellProperties.gridSpan;
  delete tableCellProperties.vMerge;

  return {
    ...attrs,
    colspan: 1,
    rowspan: 1,
    colwidth: currentColwidth && currentColwidth.length > 0 ? [currentColwidth[0] ?? 0] : currentColwidth,
    tableCellProperties,
  };
}

/**
 * Strip merge metadata (`gridSpan`, `vMerge`) from cloned cell properties
 * so a singleton cell doesn't inherit the source's merge state.
 */
function stripMergeMetadataFromTableCellProperties(attrs: Record<string, unknown>): Record<string, unknown> {
  const tcp = (attrs.tableCellProperties as Record<string, unknown> | undefined) ?? {};
  const { gridSpan: _g, vMerge: _v, ...cleanedTcp } = tcp;
  return { ...attrs, tableCellProperties: cleanedTcp };
}

function normalizeClonedRowInsertCellAttrs(
  sourceAttrs: Record<string, unknown>,
  fromHeaderToBody: boolean,
): Record<string, unknown> {
  // Row-insert PRESERVES horizontal-merge geometry from the source row
  // (colspan / gridSpan). Stripping them here produces a too-narrow row
  // that PM auto-pads to N singletons, silently losing the merge. Only
  // reset rowspan: vertical merges belong to the source row and must not
  // carry into the new row.
  const normalizedAttrs: Record<string, unknown> = {
    ...sourceAttrs,
    rowspan: 1,
  };

  // Header rows can carry explicit `borders: null` to suppress drawing.
  // Drop that sentinel when cloning into body cells so tableCell defaults apply.
  if (fromHeaderToBody && normalizedAttrs.borders == null) {
    delete normalizedAttrs.borders;
  }

  return normalizedAttrs;
}

/**
 * Clone attrs from an adjacent column's cell when inserting a new column.
 * Preserves shading, background, vAlign, cell margins, borders, cellWidth —
 * everything the cell carries — but resets span to a singleton and strips
 * merge metadata (`gridSpan`, `vMerge`) so a clone of a merged source doesn't
 * carry the merge state into the new cell. Also clears the array-shaped
 * `colwidth` (sized to the source's colspan, won't fit a singleton).
 */
function normalizeClonedColumnInsertCellAttrs(sourceAttrs: Record<string, unknown>): Record<string, unknown> {
  const normalizedAttrs: Record<string, unknown> = {
    ...stripMergeMetadataFromTableCellProperties(sourceAttrs),
    colspan: 1,
    rowspan: 1,
  };
  if (Array.isArray(normalizedAttrs.colwidth)) {
    delete normalizedAttrs.colwidth;
  }
  return normalizedAttrs;
}

type ExpandMergedCellParams = {
  tr: Transaction;
  tablePos: number;
  tableNode: import('prosemirror-model').Node;
  cellPos: number;
  cellNode: import('prosemirror-model').Node;
  rowIndex: number;
  columnIndex: number;
  rowspan: number;
  colspan: number;
  schema: Editor['state']['schema'];
};

function expandMergedCellIntoSingles({
  tr,
  tablePos,
  tableNode,
  cellPos,
  cellNode,
  rowIndex,
  columnIndex,
  rowspan,
  colspan,
  schema,
}: ExpandMergedCellParams): void {
  const tableStart = tablePos + 1;
  const map = TableMap.get(tableNode);
  const resetCell = cellNode.type.create(
    normalizeCellAttrsForSingleCell(cellNode.attrs as Record<string, unknown>),
    cellNode.content,
  );
  tr.replaceWith(cellPos, cellPos + cellNode.nodeSize, resetCell);

  // Fill the previously merged region with empty cells, preserving top-left content cell.
  const mapFrom = tr.mapping.maps.length;
  for (let row = rowIndex + rowspan - 1; row >= rowIndex; row--) {
    for (let col = columnIndex + colspan - 1; col >= columnIndex; col--) {
      if (row === rowIndex && col === columnIndex) continue;

      const newCell = schema.nodes.tableCell.createAndFill()!;

      let insertRelPos: number;
      if (row === rowIndex) {
        const baseRelPos = map.positionAt(rowIndex, columnIndex, tableNode);
        insertRelPos = baseRelPos + resetCell.nodeSize;
      } else {
        insertRelPos = map.positionAt(row, col, tableNode);
      }

      tr.insert(tr.mapping.slice(mapFrom).map(tableStart + insertRelPos), newCell);
    }
  }
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
  const size = typeof border.size === 'number' ? border.size : 0;

  return {
    val,
    color,
    size: val === 'none' || val === 'nil' ? 0 : size,
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
      const tcp = { ...((cellAttrs.tableCellProperties ?? {}) as Record<string, unknown>) };
      const borders = { ...((tcp.borders ?? {}) as Record<string, unknown>) };
      for (const side of targetSides) {
        borders[side] = { ...cellBorder };
      }
      tcp.borders = borders;

      tr.setNodeMarkup(tr.mapping.slice(mapFrom).map(tableStart + relPos), null, {
        ...cellAttrs,
        borders: null,
        tableCellProperties: tcp,
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
      const tcp = { ...((cellAttrs.tableCellProperties ?? {}) as Record<string, unknown>) };
      const borders = { ...((tcp.borders ?? {}) as Record<string, unknown>) };

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
      tcp.borders = borders;

      tr.setNodeMarkup(tr.mapping.slice(mapFrom).map(tableStart + relPos), null, {
        ...cellAttrs,
        borders: null,
        tableCellProperties: tcp,
      });
    }
  }
}

type PresetSpec = {
  borders: TableBorderPatch;
  styleOptions: TableStyleOptionsPatch;
  /** Hex color (canonical RRGGBB) or `null` for none. */
  headerRowFill: string | null;
};

const PRESET_GREY = '999999';
const PRESET_BLACK = '000000';

const STATIC_PRESETS: Record<Exclude<TablePresetName, 'accent'>, PresetSpec> = {
  grid: {
    borders: {
      top: { lineStyle: 'single', lineWeightPt: 1, color: PRESET_BLACK },
      bottom: { lineStyle: 'single', lineWeightPt: 1, color: PRESET_BLACK },
      left: { lineStyle: 'single', lineWeightPt: 1, color: PRESET_BLACK },
      right: { lineStyle: 'single', lineWeightPt: 1, color: PRESET_BLACK },
      insideH: { lineStyle: 'single', lineWeightPt: 1, color: PRESET_BLACK },
      insideV: { lineStyle: 'single', lineWeightPt: 1, color: PRESET_BLACK },
    },
    styleOptions: {},
    headerRowFill: null,
  },
  minimal: {
    borders: {
      top: null,
      left: null,
      right: null,
      insideV: null,
      insideH: { lineStyle: 'single', lineWeightPt: 0.25, color: PRESET_GREY },
      bottom: { lineStyle: 'single', lineWeightPt: 1, color: PRESET_BLACK },
    },
    styleOptions: {},
    headerRowFill: null,
  },
  striped: {
    borders: {
      top: { lineStyle: 'single', lineWeightPt: 0.5, color: PRESET_GREY },
      bottom: { lineStyle: 'single', lineWeightPt: 0.5, color: PRESET_GREY },
      left: { lineStyle: 'single', lineWeightPt: 0.5, color: PRESET_GREY },
      right: { lineStyle: 'single', lineWeightPt: 0.5, color: PRESET_GREY },
      insideH: { lineStyle: 'single', lineWeightPt: 0.5, color: PRESET_GREY },
      insideV: { lineStyle: 'single', lineWeightPt: 0.5, color: PRESET_GREY },
    },
    styleOptions: { bandedRows: true },
    headerRowFill: null,
  },
};

function buildPresetSpec(preset: TablePresetName, accentColorInput: string | undefined): PresetSpec | null {
  if (preset === 'accent') {
    const accentColor = normalizeColorInput(accentColorInput ?? '1F3864');
    return {
      borders: {
        top: { lineStyle: 'single', lineWeightPt: 2, color: accentColor },
        bottom: { lineStyle: 'single', lineWeightPt: 2, color: accentColor },
        left: null,
        right: null,
        insideV: null,
        insideH: { lineStyle: 'single', lineWeightPt: 0.5, color: PRESET_GREY },
      },
      styleOptions: { headerRow: true },
      headerRowFill: accentColor,
    };
  }
  return STATIC_PRESETS[preset] ?? null;
}

/**
 * Apply a shading fill to cells in a table. When `cellPositions` is provided,
 * only those cells are updated (deduped); otherwise every unique cell in the
 * table is updated. `fill` is a normalized color (`'auto'` clears the
 * `background` attribute).
 */
function applyShadingToCells(
  tr: Transaction,
  tableNode: import('prosemirror-model').Node,
  tableStart: number,
  fill: string,
  cellPositions?: number[],
): void {
  const map = TableMap.get(tableNode);
  const positions = cellPositions ?? map.map;
  const seen = new Set<number>();
  const mapFrom = tr.mapping.maps.length;

  for (const relPos of positions) {
    if (seen.has(relPos)) continue;
    seen.add(relPos);

    const cellNode = tableNode.nodeAt(relPos);
    if (!cellNode) continue;

    const cellAttrs = cellNode.attrs as Record<string, unknown>;
    const cellProps = { ...((cellAttrs.tableCellProperties ?? {}) as Record<string, unknown>) };
    cellProps.shading = { fill, val: 'clear', color: 'auto' };

    const nextCellAttrs: Record<string, unknown> = {
      ...cellAttrs,
      tableCellProperties: cellProps,
    };

    if (fill === 'auto') delete nextCellAttrs.background;
    else nextCellAttrs.background = { color: fill };

    tr.setNodeMarkup(tr.mapping.slice(mapFrom).map(tableStart + relPos), null, nextCellAttrs);
  }
}

/** Flattened row locator shape accepted by {@link resolveRowLocator}. */
type RowLocatorFields = {
  target?: TableOrRowAddress;
  nodeId?: string;
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

function isHeaderColumn(tableNode: ProseMirrorNode, map: ReturnType<(typeof TableMap)['get']>, col: number): boolean {
  for (let row = 0; row < map.height; row++) {
    const cell = tableNode.nodeAt(map.map[col + row * map.width]);
    if (!cell || cell.type.name !== 'tableHeader') return false;
  }
  return true;
}

function resolveInsertedColumnCellType(
  tableNode: ProseMirrorNode,
  map: ReturnType<(typeof TableMap)['get']>,
  index: number,
  col: number,
): NodeType | null {
  let refColumn: number | null = col > 0 ? -1 : 0;
  if (isHeaderColumn(tableNode, map, col + refColumn)) {
    refColumn = col === 0 || col === map.width ? null : 0;
  }

  if (refColumn == null) {
    return tableNode.type.schema.nodes.tableCell ?? null;
  }

  const refPos = map.map[index + refColumn];
  return refPos != null ? (tableNode.nodeAt(refPos)?.type ?? null) : null;
}

/**
 * Inserts a column at `col` in the table (before that column index). Follows
 * prosemirror-tables addColumn pattern.
 *
 * New cells inherit attrs (shading, background, vAlign, cell margins, borders)
 * from an adjacent column's cell so the inserted column visually matches the
 * rest of the table.
 */
function addColumnToTable(tr: Transaction, tablePos: number, col: number): void {
  const tableNode = tr.doc.nodeAt(tablePos);
  if (!tableNode || tableNode.type.name !== 'table') return;
  const map = TableMap.get(tableNode);
  const tableStart = tablePos + 1;
  const mapStart = tr.mapping.maps.length;

  // Source column for cloning: prefer the column to the left (col-1); fall
  // back to col (which gets shifted right by the insertion) when inserting at
  // the start of the table. -1 means "no source available" (empty table).
  const sourceCol = col > 0 ? col - 1 : map.width > 0 ? 0 : -1;

  for (let row = 0; row < map.height; row++) {
    const index = row * map.width + col;
    if (col > 0 && col < map.width && map.map[index - 1] === map.map[index]) {
      // Cell spans from the left — expand colspan
      const pos = map.map[index];
      const cell = tableNode.nodeAt(pos);
      if (!cell) continue;
      tr.setNodeMarkup(
        tr.mapping.slice(mapStart).map(tableStart + pos),
        null,
        addColSpan(cell.attrs as Record<string, unknown>, col - map.colCount(pos)),
      );
      row += (((cell.attrs as Record<string, unknown>).rowspan as number) || 1) - 1;
    } else {
      // Insert a new cell, cloning attrs from the adjacent column's cell at
      // this row so shading / borders / vAlign / margins match the rest of
      // the table.
      const refType = resolveInsertedColumnCellType(tableNode, map, index, col);
      if (!refType) continue;

      let clonedAttrs: Record<string, unknown> | null = null;
      if (sourceCol >= 0) {
        const sourceIdx = row * map.width + sourceCol;
        const sourcePos = map.map[sourceIdx];
        if (sourcePos != null) {
          const sourceCell = tableNode.nodeAt(sourcePos);
          if (sourceCell) {
            clonedAttrs = normalizeClonedColumnInsertCellAttrs(sourceCell.attrs as Record<string, unknown>);
          }
        }
      }

      const cellPos = map.positionAt(row, col, tableNode);
      const newCell = refType.createAndFill(clonedAttrs ?? undefined);
      if (!newCell) continue;
      tr.insert(tr.mapping.slice(mapStart).map(tableStart + cellPos), newCell);
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

/** Inserts a row at `insertIndex`, cloning cell structure from `sourceRowIndex` and preserving rowspan integrity. */
function insertRowInTable(
  tr: Transaction,
  tablePos: number,
  sourceRowIndex: number,
  insertIndex: number,
  schema: Editor['state']['schema'],
): boolean {
  const tableNode = tr.doc.nodeAt(tablePos);
  if (!tableNode || tableNode.type.name !== 'table') return false;

  const rowCount = tableNode.childCount;
  if (rowCount === 0) return false;

  const map = TableMap.get(tableNode);
  const boundedInsertIndex = Math.max(0, Math.min(insertIndex, rowCount));
  const boundedSourceRowIndex = Math.max(0, Math.min(sourceRowIndex, rowCount - 1));
  const sourceRow = tableNode.child(boundedSourceRowIndex);
  if (!sourceRow) return false;

  const rowType = schema.nodes.tableRow;
  const defaultCellType = schema.nodes.tableCell;
  if (!rowType || !defaultCellType) return false;

  const newCells: import('prosemirror-model').Node[] = [];
  const cellsToExtend: Array<{ pos: number; attrs: Record<string, unknown> }> = [];

  for (let col = 0; col < map.width; ) {
    if (boundedInsertIndex > 0 && boundedInsertIndex < map.height) {
      const indexAbove = (boundedInsertIndex - 1) * map.width + col;
      const indexAtInsert = boundedInsertIndex * map.width + col;

      if (map.map[indexAbove] === map.map[indexAtInsert]) {
        const spanningPos = map.map[indexAbove];
        const spanningCell = tableNode.nodeAt(spanningPos);
        if (spanningCell) {
          const spanningAttrs = spanningCell.attrs as Record<string, unknown>;
          const rowspan = (spanningAttrs.rowspan as number) || 1;
          const colspan = (spanningAttrs.colspan as number) || 1;
          cellsToExtend.push({
            pos: tablePos + 1 + spanningPos,
            attrs: { ...spanningAttrs, rowspan: rowspan + 1 },
          });
          col += colspan;
          continue;
        }
      }
    }

    const sourceMapIndex = boundedSourceRowIndex * map.width + col;
    const sourceCellPos = map.map[sourceMapIndex];
    const sourceCell = tableNode.nodeAt(sourceCellPos) ?? sourceRow.firstChild;
    if (!sourceCell) {
      col += 1;
      continue;
    }

    const colspan = ((sourceCell.attrs as Record<string, unknown>).colspan as number) || 1;
    const fromHeaderToBody = sourceCell.type.name === 'tableHeader';
    const targetCellType = fromHeaderToBody ? defaultCellType : sourceCell.type;
    const newCell = targetCellType.createAndFill(
      normalizeClonedRowInsertCellAttrs(sourceCell.attrs as Record<string, unknown>, fromHeaderToBody),
    );
    if (newCell) newCells.push(newCell);
    col += colspan;
  }

  for (const { pos, attrs } of cellsToExtend) {
    tr.setNodeMarkup(pos, null, attrs);
  }

  if (newCells.length === 0) return true;

  const newRow = rowType.createAndFill(null, newCells);
  if (!newRow) return false;

  let insertPos = tablePos + 1;
  for (let row = 0; row < boundedInsertIndex; row++) {
    insertPos += tableNode.child(row).nodeSize;
  }
  tr.insert(insertPos, newRow);
  return true;
}

function addColumnToTableForSplit(
  tr: Transaction,
  tablePos: number,
  col: number,
  splitRowStart: number,
  splitRowEnd: number,
): void {
  const tableNode = tr.doc.nodeAt(tablePos);
  if (!tableNode || tableNode.type.name !== 'table') return;
  const map = TableMap.get(tableNode);
  const tableStart = tablePos + 1;
  const mapStart = tr.mapping.maps.length;
  const widenedOutsideSplit = new Set<number>();

  for (let row = 0; row < map.height; row++) {
    const index = row * map.width + col;
    const pos = map.map[index];
    const cell = tableNode.nodeAt(pos);
    if (!cell) continue;

    const inSplitRows = row >= splitRowStart && row < splitRowEnd;
    if (!inSplitRows && col > 0) {
      const leftPos = map.map[index - 1]!;
      const leftCell = tableNode.nodeAt(leftPos);
      if (leftCell && !widenedOutsideSplit.has(leftPos)) {
        tr.setNodeMarkup(
          tr.mapping.slice(mapStart).map(tableStart + leftPos),
          null,
          addColSpan(leftCell.attrs as Record<string, unknown>, col - map.colCount(leftPos)),
        );
        widenedOutsideSplit.add(leftPos);
      }
      row += ((cell.attrs?.rowspan as number) || 1) - 1;
      continue;
    }

    if (col > 0 && map.map[index - 1] === pos) {
      tr.setNodeMarkup(
        tr.mapping.slice(mapStart).map(tableStart + pos),
        null,
        addColSpan(cell.attrs as Record<string, unknown>, col - map.colCount(pos)),
      );
      row += (((cell.attrs as Record<string, unknown>).rowspan as number) || 1) - 1;
    } else {
      const refType = col > 0 ? (tableNode.nodeAt(map.map[index - 1])?.type ?? cell.type) : cell.type;
      const cellPos = map.positionAt(row, col, tableNode);
      tr.insert(tr.mapping.slice(mapStart).map(tableStart + cellPos), refType.createAndFill()!);
      row += ((cell.attrs?.rowspan as number) || 1) - 1;
    }
  }
}

function insertRowInTableForSplit(
  tr: Transaction,
  tablePos: number,
  sourceRowIndex: number,
  insertIndex: number,
  splitColStart: number,
  splitColEnd: number,
  schema: Editor['state']['schema'],
): boolean {
  const tableNode = tr.doc.nodeAt(tablePos);
  if (!tableNode || tableNode.type.name !== 'table') return false;

  const rowCount = tableNode.childCount;
  if (rowCount === 0) return false;

  const map = TableMap.get(tableNode);
  const boundedInsertIndex = Math.max(0, Math.min(insertIndex, rowCount));
  const boundedSourceRowIndex = Math.max(0, Math.min(sourceRowIndex, rowCount - 1));
  const sourceRow = tableNode.child(boundedSourceRowIndex);
  if (!sourceRow) return false;

  const rowType = schema.nodes.tableRow;
  const defaultCellType = schema.nodes.tableCell;
  if (!rowType || !defaultCellType) return false;

  const newCells: import('prosemirror-model').Node[] = [];
  const cellsToExtend = new Map<number, Record<string, unknown>>();

  for (let col = 0; col < map.width; ) {
    if (boundedInsertIndex > 0 && boundedInsertIndex < map.height) {
      const indexAbove = (boundedInsertIndex - 1) * map.width + col;
      const indexAtInsert = boundedInsertIndex * map.width + col;

      if (map.map[indexAbove] === map.map[indexAtInsert]) {
        const spanningPos = map.map[indexAbove];
        const spanningCell = tableNode.nodeAt(spanningPos);
        if (spanningCell) {
          const spanningAttrs = spanningCell.attrs as Record<string, unknown>;
          const rowspan = (spanningAttrs.rowspan as number) || 1;
          const colspan = (spanningAttrs.colspan as number) || 1;
          cellsToExtend.set(tablePos + 1 + spanningPos, { ...spanningAttrs, rowspan: rowspan + 1 });
          col += colspan;
          continue;
        }
      }
    }

    const sourceMapIndex = boundedSourceRowIndex * map.width + col;
    const sourceCellPos = map.map[sourceMapIndex];
    const sourceCell = tableNode.nodeAt(sourceCellPos) ?? sourceRow.firstChild;
    if (!sourceCell) {
      col += 1;
      continue;
    }

    const sourceAttrs = sourceCell.attrs as Record<string, unknown>;
    const colspan = (sourceAttrs.colspan as number) || 1;
    const overlapsSplitRange = col < splitColEnd && col + colspan > splitColStart;

    if (!overlapsSplitRange) {
      const sourceRowspan = (sourceAttrs.rowspan as number) || 1;
      cellsToExtend.set(tablePos + 1 + sourceCellPos, { ...sourceAttrs, rowspan: sourceRowspan + 1 });
      col += colspan;
      continue;
    }

    const fromHeaderToBody = sourceCell.type.name === 'tableHeader';
    const targetCellType = fromHeaderToBody ? defaultCellType : sourceCell.type;
    const newCell = targetCellType.createAndFill(normalizeClonedRowInsertCellAttrs(sourceAttrs, fromHeaderToBody));
    if (newCell) newCells.push(newCell);
    col += colspan;
  }

  for (const [pos, attrs] of cellsToExtend.entries()) {
    tr.setNodeMarkup(pos, null, attrs);
  }

  if (newCells.length === 0) return true;

  const newRow = rowType.createAndFill(null, newCells);
  if (!newRow) return false;

  let insertPos = tablePos + 1;
  for (let row = 0; row < boundedInsertIndex; row++) {
    insertPos += tableNode.child(row).nodeSize;
  }
  tr.insert(insertPos, newRow);
  return true;
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
    return buildTableSuccess();
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
    return buildTableSuccess(resolvePostMutationTableAddress(editor, candidate.pos, address.nodeId, tr));
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

  const { candidate, address } = resolveTableLocator(editor, input, 'tables.move');

  if (options?.dryRun) {
    return buildTableSuccess(address);
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

    // For move, position mapping fails (the node was deleted and re-inserted
    // at a new location). Try nodeId-based resolution first (works for DOCX
    // tables with stable paraId), then fall back to sdBlockId lookup for
    // runtime tables whose position-based nodeId changed.
    let freshAddress = resolvePostMutationTableAddress(editor, candidate.pos, address.nodeId, tr);
    if (!freshAddress) {
      const sdBlockId = (tableSlice.attrs as Record<string, unknown>).sdBlockId;
      if (typeof sdBlockId === 'string') {
        const index = getBlockIndex(editor);
        const found = index.candidates.find(
          (c) => c.nodeType === 'table' && (c.node.attrs as Record<string, unknown>).sdBlockId === sdBlockId,
        );
        if (found) freshAddress = toBlockAddress(found) as TableAddress;
      }
    }
    return buildTableSuccess(freshAddress);
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

    const preferredWidth = buildTablePreferredWidth(input.preferredWidth, input.preferredWidthType);
    if (preferredWidth) {
      updatedTableProps.tableWidth = preferredWidth;
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
    return buildTableSuccess(resolvePostMutationTableAddress(editor, candidate.pos, address.nodeId, tr));
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
    return buildTableSuccess(resolvePostMutationTableAddress(editor, candidate.pos, address.nodeId, tr));
  } catch {
    return toTableFailure('INVALID_TARGET', 'Table alt text update could not be applied.');
  }
}

// ---------------------------------------------------------------------------
// Batch 3 — Row operations
// ---------------------------------------------------------------------------

/**
 * tables.insertRow — insert one or more rows above/below a reference row.
 *
 * Append-at-end shorthand: when called with a table-level target (no
 * `rowIndex`, no `position`), inserts `count` rows after the last row.
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

  // Append-at-end shorthand: rewrite to "below the last row" before resolving.
  let normalizedInput: TablesInsertRowInput = input;
  const inputAny = input as { rowIndex?: number; position?: RowInsertPosition };
  if (inputAny.rowIndex == null && inputAny.position == null) {
    const tableResolved = resolveTableLocator(editor, input as TableLocator, 'tables.insertRow');
    const lastIndex = tableResolved.candidate.node.childCount - 1;
    normalizedInput = {
      ...(input as TableLocator),
      rowIndex: lastIndex,
      position: 'below',
    } as TablesInsertRowInput;
  }

  const resolved = resolveRowLocator(editor, normalizedInput, 'tables.insertRow');
  const { table, rowIndex } = resolved;

  if (options?.dryRun) {
    return buildTableSuccess(table.address);
  }

  try {
    const tr = editor.state.tr;
    const tablePos = table.candidate.pos;
    const normalizedAny = normalizedInput as { count?: number; position?: RowInsertPosition };
    const count = normalizedAny.count ?? 1;
    const position = normalizedAny.position ?? 'below';
    const schema = editor.state.schema;

    for (let i = 0; i < count; i++) {
      // Re-read the table from the (possibly modified) transaction
      const currentTableNode = tr.doc.nodeAt(tablePos);
      if (!currentTableNode || currentTableNode.type.name !== 'table') break;

      const insertIdx = position === 'above' ? rowIndex + i : rowIndex + 1 + i;
      const sourceIdx = position === 'above' ? rowIndex + i : rowIndex;

      const didInsertRow = insertRowInTable(
        tr,
        tablePos,
        Math.min(sourceIdx, currentTableNode.childCount - 1),
        Math.min(insertIdx, currentTableNode.childCount),
        schema,
      );
      if (!didInsertRow) {
        return toTableFailure('INVALID_TARGET', 'Row insertion could not be applied.');
      }
    }

    if (mode === 'tracked') applyTrackedMutationMeta(tr);
    else applyDirectMutationMeta(tr);
    editor.dispatch(tr);
    clearIndexCache(editor);
    return buildTableSuccess(resolvePostMutationTableAddress(editor, table.candidate.pos, table.address.nodeId, tr));
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
    return buildTableSuccess(resolvePostMutationTableAddress(editor, table.candidate.pos, table.address.nodeId, tr));
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
    return buildTableSuccess(resolvePostMutationTableAddress(editor, table.candidate.pos, table.address.nodeId, tr));
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
    return buildTableSuccess(resolvePostMutationTableAddress(editor, candidate.pos, address.nodeId, tr));
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
    return buildTableSuccess(resolvePostMutationTableAddress(editor, table.candidate.pos, table.address.nodeId, tr));
  } catch {
    return toTableFailure('INVALID_TARGET', 'Row options update could not be applied.');
  }
}

// ---------------------------------------------------------------------------
// Batch 3 — Column operations
// ---------------------------------------------------------------------------

/**
 * tables.insertColumn — insert one or more columns left/right of a reference
 * column. Shorthand positions `first` and `last` don't require a columnIndex
 * (insert at column 0 or after the last column).
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

  // Resolve shorthand to a concrete columnIndex + left/right before
  // delegating to the column locator (which requires columnIndex). Two cases:
  //  - position 'first' | 'last' (no columnIndex needed).
  //  - position 'left' | 'right' WITHOUT a columnIndex — treat as first/last.
  let normalizedInput: TablesInsertColumnInput = input;
  const inputAny = input as { position?: string; columnIndex?: number };
  const isShorthand =
    inputAny.position === 'first' ||
    inputAny.position === 'last' ||
    ((inputAny.position === 'left' || inputAny.position === 'right') && inputAny.columnIndex == null);
  if (isShorthand) {
    const tableResolved = resolveTableLocator(editor, input as TableLocator, 'tables.insertColumn');
    const lastColumnIndex = Math.max(0, getTableColumnCount(tableResolved.candidate.node) - 1);
    const insertAtStart = inputAny.position === 'first' || inputAny.position === 'left';
    normalizedInput = {
      ...(input as TableLocator),
      columnIndex: insertAtStart ? 0 : lastColumnIndex,
      position: insertAtStart ? 'left' : 'right',
    } as TablesInsertColumnInput;
  }

  const resolved = resolveColumnLocator(
    editor,
    normalizedInput as { target?: TableAddress; nodeId?: string; columnIndex: number },
    'tables.insertColumn',
  );
  const { table, columnIndex } = resolved;

  if (options?.dryRun) {
    return buildTableSuccess(table.address);
  }

  try {
    const tr = editor.state.tr;
    const tablePos = table.candidate.pos;
    const normalizedAny = normalizedInput as { count?: number; position?: 'left' | 'right' };
    const count = normalizedAny.count ?? 1;
    const position = normalizedAny.position ?? 'right';
    let updatedGrid = (table.candidate.node.attrs as Record<string, unknown>).grid;

    for (let c = 0; c < count; c++) {
      const insertCol = position === 'left' ? columnIndex + c : columnIndex + 1 + c;
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
    return buildTableSuccess(resolvePostMutationTableAddress(editor, table.candidate.pos, table.address.nodeId, tr));
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
    return buildTableSuccess(resolvePostMutationTableAddress(editor, table.candidate.pos, table.address.nodeId, tr));
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
    const tableAttrs = tableNode.attrs as Record<string, unknown>;
    const map = TableMap.get(tableNode);
    const widthPx = Math.round(input.widthPt * (96 / 72)); // Points → pixels at 96 DPI
    const normalizedGrid = normalizeGridColumns(tableAttrs.grid);
    const nextGridColumns = normalizedGrid?.columns.slice();

    if (nextGridColumns && columnIndex < nextGridColumns.length) {
      nextGridColumns[columnIndex] = { col: Math.round(input.widthPt * POINTS_TO_TWIPS) }; // points → twips
    }

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

      const nextAttrs: Record<string, unknown> = { ...attrs, colwidth };
      if (row === 0) {
        const nextCellProps = buildFirstRowCellWidthProps(attrs, cellStartCol, colspan, colwidth, nextGridColumns);
        if (nextCellProps) {
          nextAttrs.tableCellProperties = nextCellProps;
        } else {
          delete nextAttrs.tableCellProperties;
        }
      }

      tr.setNodeMarkup(tableStart + pos, null, nextAttrs);
    }

    const tableAttrUpdates: Record<string, unknown> = {};

    if (normalizedGrid && nextGridColumns) {
      tableAttrUpdates.grid = serializeGridColumns(tableAttrs.grid, { ...normalizedGrid, columns: nextGridColumns });
    }

    tr.setNodeMarkup(tablePos, null, buildWidthAuthoringTableAttrs(tableAttrs, tableAttrUpdates));

    applyDirectMutationMeta(tr);
    editor.dispatch(tr);
    clearIndexCache(editor);
    return buildTableSuccess(resolvePostMutationTableAddress(editor, table.candidate.pos, table.address.nodeId, tr));
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
    const tableAttrs = tableNode.attrs as Record<string, unknown>;
    const map = TableMap.get(tableNode);
    const normalizedGrid = normalizeGridColumns(tableAttrs.grid);
    const nextGridColumns = normalizedGrid?.columns.slice();

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
    if (nextGridColumns) {
      const evenWidthTwips = Math.max(1, Math.round(evenWidth * PIXELS_TO_TWIPS));
      const maxColumn = Math.min(rangeEnd, nextGridColumns.length - 1);

      for (let col = Math.max(rangeStart, 0); col <= maxColumn; col++) {
        nextGridColumns[col] = { col: evenWidthTwips };
      }
    }

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

        const nextAttrs: Record<string, unknown> = { ...attrs, colwidth: newColwidth };
        if (row === 0) {
          const nextCellProps = buildFirstRowCellWidthProps(attrs, cellStartCol, colspan, newColwidth, nextGridColumns);
          if (nextCellProps) {
            nextAttrs.tableCellProperties = nextCellProps;
          } else {
            delete nextAttrs.tableCellProperties;
          }
        }

        tr.setNodeMarkup(tableStart + pos, null, nextAttrs);
      }
    }

    // Keep table grid in sync with distributed column widths so DOCX export
    // emits uniform <w:gridCol> values rather than stale grid widths.
    const tableAttrUpdates: Record<string, unknown> = {};

    if (normalizedGrid && nextGridColumns) {
      tableAttrUpdates.grid = serializeGridColumns(tableAttrs.grid, { ...normalizedGrid, columns: nextGridColumns });
    }

    tr.setNodeMarkup(tablePos, null, buildWidthAuthoringTableAttrs(tableAttrs, tableAttrUpdates));

    applyDirectMutationMeta(tr);
    editor.dispatch(tr);
    clearIndexCache(editor);
    return buildTableSuccess(resolvePostMutationTableAddress(editor, candidate.pos, address.nodeId, tr));
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
    return buildTableSuccess();
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
            },
            para,
          )!,
        );
      }
      tableRows.push(
        schema.nodes.tableRow.createAndFill(
          {
            sdBlockId: uuidv4(),
            paraId: generateDocxHexId(),
          },
          tableCells,
        )!,
      );
    }

    const tableId = uuidv4();
    const tableNode = schema.nodes.table.create({ sdBlockId: tableId }, tableRows);

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
    return buildTableSuccess(insertedTable ? (toBlockAddress(insertedTable) as TableAddress) : undefined);
  } catch {
    return toTableFailure('INVALID_TARGET', 'Text-to-table conversion could not be applied.');
  }
}

/**
 * tables.split — split a table into two tables at a given row index.
 *
 * All rows from `rowIndex` onward are moved into a new table that is
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

  if (input.rowIndex <= 0 || input.rowIndex >= tableNode.childCount) {
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
    for (let i = input.rowIndex; i < tableNode.childCount; i++) {
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
    for (let i = tableNode.childCount - 1; i >= input.rowIndex; i--) {
      const rp = tr.mapping.slice(mapFrom).map(rowPositions[i]);
      const rEnd = tr.mapping.slice(mapFrom).map(rowPositions[i] + tableNode.child(i).nodeSize);
      tr.delete(rp, rEnd);
    }

    const newTableAttrs = Attribute.getSplittedAttributes(
      editor.extensionService?.attributes ?? [],
      tableNode.type.name,
      tableNode.attrs as Record<string, AttributeValue>,
    );
    const newTable = schema.nodes.table.create(newTableAttrs, secondTableRows);
    const separatorParagraph = createSeparatorParagraph(schema);
    if (!separatorParagraph) {
      return toTableFailure('INVALID_TARGET', 'Table split could not create a separator paragraph.');
    }

    // Insert an empty paragraph between tables. Without this block separator,
    // Word merges adjacent <w:tbl> nodes into one visual table.
    const insertPos = tr.mapping.slice(mapFrom).map(tablePos + tableNode.nodeSize);
    tr.insert(insertPos, separatorParagraph);
    tr.insert(insertPos + separatorParagraph.nodeSize, newTable);

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
        paraId: generateDocxHexId(),
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
    return buildTableSuccess(resolvePostMutationTableAddress(editor, table.candidate.pos, table.address.nodeId, tr));
  } catch {
    return toTableFailure('INVALID_TARGET', 'Cell insertion could not be applied.');
  }
}

/**
 * tables.deleteCell — delete a cell at a resolved position, shifting remaining cells.
 *
 * `shiftLeft`: removes the target cell and shifts remaining cells in the row left.
 * This reduces the row cell count by one and avoids a synthetic trailing cell unless
 * widening the remaining trailing cell would conflict with vertical merges.
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
  const row = table.candidate.node.child(rowIndex);
  const deletedColspan = Math.max(1, ((cellNode.attrs as Record<string, unknown>).colspan as number) || 1);
  const deletedColwidth = Array.isArray((cellNode.attrs as Record<string, unknown>).colwidth)
    ? [...((cellNode.attrs as Record<string, unknown>).colwidth as number[])]
    : null;

  if (input.mode === 'shiftLeft' && row.childCount <= 1) {
    return toTableFailure('NO_OP', 'Cannot shift-left delete the last remaining cell in a row.');
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

    // Delete the target cell.
    tr.delete(cellPos, cellPos + cellNode.nodeSize);

    if (input.mode === 'shiftLeft') {
      // Prefer preserving fewer visual cells by widening the new trailing cell.
      // Fall back to a trailing replacement cell when merged geometry would become invalid.
      const currentTableNode = tr.doc.nodeAt(tablePos);
      if (!currentTableNode || currentTableNode.type.name !== 'table') {
        return toTableFailure('INVALID_TARGET', 'Cell deletion could not locate the updated table.');
      }

      const currentRow = currentTableNode.child(rowIndex);
      const lastCellIndex = currentRow.childCount - 1;
      const lastCell = currentRow.child(lastCellIndex);
      const lastAttrs = lastCell.attrs as Record<string, unknown>;
      const tableCellProperties = (lastAttrs.tableCellProperties ?? {}) as Record<string, unknown>;
      const lastRowspan = Math.max(1, (lastAttrs.rowspan as number) || 1);
      const hasVerticalMerge = tableCellProperties.vMerge != null;

      if (lastRowspan > 1 || hasVerticalMerge) {
        // Extending a vertically merged cell can overlap cells in lower rows.
        let rowEndPos = tablePos + 1;
        for (let i = 0; i <= rowIndex; i++) rowEndPos += currentTableNode.child(i).nodeSize;
        const mappedRowEnd = rowEndPos - 1; // -1 to stay inside the row. No mapping needed — rowEndPos is already in post-delete doc space.
        const newCell = schema.nodes.tableCell.createAndFill()!;
        tr.insert(mappedRowEnd, newCell);
      } else {
        const lastColspan = Math.max(1, (lastAttrs.colspan as number) || 1);
        const nextColspan = lastColspan + deletedColspan;

        const nextTableCellProps = {
          ...tableCellProperties,
        };
        if (nextColspan > 1) nextTableCellProps.gridSpan = nextColspan;
        else delete nextTableCellProps.gridSpan;

        const nextColwidth = Array.isArray(lastAttrs.colwidth) ? [...(lastAttrs.colwidth as number[])] : null;
        if (nextColwidth) {
          if (deletedColwidth) {
            for (const width of deletedColwidth) {
              if (nextColwidth.length >= nextColspan) break;
              nextColwidth.push(typeof width === 'number' ? width : 0);
            }
          }
          while (nextColwidth.length < nextColspan) nextColwidth.push(0);
        }

        let rowOffset = 0;
        for (let i = 0; i < rowIndex; i++) rowOffset += currentTableNode.child(i).nodeSize;
        let lastCellOffset = rowOffset + 1;
        for (let i = 0; i < lastCellIndex; i++) lastCellOffset += currentRow.child(i).nodeSize;

        tr.setNodeMarkup(tableStart + lastCellOffset, null, {
          ...lastAttrs,
          colspan: nextColspan,
          colwidth: nextColwidth,
          tableCellProperties: nextTableCellProps,
        });
      }
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
    return buildTableSuccess(resolvePostMutationTableAddress(editor, table.candidate.pos, table.address.nodeId, tr));
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
    return buildTableSuccess(resolvePostMutationTableAddress(editor, table.candidate.pos, table.address.nodeId, tr));
  } catch {
    return toTableFailure('INVALID_TARGET', 'Cell merge could not be applied.');
  }
}

function hasDefinedUnmergeCoordinates(
  input: TablesUnmergeCellsInput,
): input is Extract<TablesUnmergeCellsInput, { rowIndex: number; columnIndex: number }> {
  const inputRecord = input as Record<string, unknown>;
  return inputRecord.rowIndex != null && inputRecord.columnIndex != null;
}

/**
 * Shared dispatcher for cell-or-table-scoped inputs (cell target/nodeId, OR
 * table target/nodeId + rowIndex + columnIndex). Used by `tables.unmergeCells`
 * and `tables.setCellText`. Handles three ambiguous cases:
 *   - no coordinates → must be a direct cell locator
 *   - coordinates + table target → table-scoped (rowIndex/columnIndex pick the cell)
 *   - coordinates + nodeId → resolve the nodeId, then dispatch by node type
 */
function resolveCellOrTableScopedInput(
  editor: Editor,
  input: { target?: unknown; nodeId?: unknown; rowIndex?: unknown; columnIndex?: unknown },
  operationName: string,
): ResolvedCell {
  const hasCoords = input.rowIndex != null && input.columnIndex != null;
  if (!hasCoords) {
    return resolveCellLocator(editor, input as { target?: TableCellAddress; nodeId?: string }, operationName);
  }

  const target = input.target;
  if (target && typeof target === 'object' && !Array.isArray(target)) {
    const blockTarget = target as { kind?: unknown; nodeType?: unknown };
    if (blockTarget.kind === 'block' && blockTarget.nodeType === 'table') {
      return resolveTableScopedCellLocator(
        editor,
        input as { target?: TableAddress; nodeId?: string; rowIndex: number; columnIndex: number },
        operationName,
      );
    }
    return resolveCellLocator(editor, { target: target as TableCellAddress }, operationName);
  }

  const nodeId = input.nodeId;
  if (typeof nodeId === 'string') {
    const candidate = findBlockByNodeIdOnly(getBlockIndex(editor), nodeId);
    if (!candidate) {
      throw new DocumentApiAdapterError('TARGET_NOT_FOUND', `${operationName}: target was not found.`, {
        target: nodeId,
      });
    }
    return candidate.nodeType === 'table'
      ? resolveTableScopedCellLocator(
          editor,
          input as { target?: TableAddress; nodeId?: string; rowIndex: number; columnIndex: number },
          operationName,
        )
      : resolveCellLocator(editor, { nodeId }, operationName);
  }

  return resolveCellLocator(editor, {}, operationName);
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

  // Preserve read→write handoff from tables.getCells(): a TableCellInfo carries
  // row/column metadata plus a cell nodeId. For nodeId-based inputs, resolve by
  // actual node type instead of assuming coordinates always mean "table-scoped".
  const resolved = resolveCellOrTableScopedInput(
    editor,
    input as { target?: unknown; nodeId?: unknown; rowIndex?: unknown; columnIndex?: unknown },
    'tables.unmergeCells',
  );
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
    const tableNode = table.candidate.node;
    const schema = editor.state.schema;
    expandMergedCellIntoSingles({
      tr,
      tablePos,
      tableNode,
      cellPos,
      cellNode,
      rowIndex,
      columnIndex,
      rowspan,
      colspan,
      schema,
    });

    applyDirectMutationMeta(tr);
    editor.dispatch(tr);
    clearIndexCache(editor);
    return buildTableSuccess(resolvePostMutationTableAddress(editor, table.candidate.pos, table.address.nodeId, tr));
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

  if (input.rows === 1 && input.columns === 1 && currentColspan === 1 && currentRowspan === 1) {
    return toTableFailure('NO_OP', 'Cell is already a single cell and split target is 1×1.');
  }

  if (options?.dryRun) {
    return buildTableSuccess(table.address);
  }

  try {
    const tr = editor.state.tr;
    const tablePos = table.candidate.pos;
    const schema = editor.state.schema;
    const targetColumns = Math.max(input.columns, currentColspan);
    const targetRows = Math.max(input.rows, currentRowspan);
    const additionalColumns = Math.max(0, targetColumns - currentColspan);
    const additionalRows = Math.max(0, targetRows - currentRowspan);
    let updatedGrid = (table.candidate.node.attrs as Record<string, unknown>).grid;

    // If the target is already merged, first normalize it to single cells in its current span.
    // This preserves all non-target cells while creating a stable base region to expand from.
    if (currentColspan > 1 || currentRowspan > 1) {
      const currentTableNode = tr.doc.nodeAt(tablePos);
      if (!currentTableNode || currentTableNode.type.name !== 'table') {
        return toTableFailure('INVALID_TARGET', 'Cell split target table is unavailable.');
      }

      const currentCellPos = tr.mapping.map(cellPos, 1);
      const currentCellNode = tr.doc.nodeAt(currentCellPos);
      if (
        !currentCellNode ||
        (currentCellNode.type.name !== 'tableCell' && currentCellNode.type.name !== 'tableHeader')
      ) {
        return toTableFailure('INVALID_TARGET', 'Split target cell is unavailable.');
      }

      expandMergedCellIntoSingles({
        tr,
        tablePos,
        tableNode: currentTableNode,
        cellPos: currentCellPos,
        cellNode: currentCellNode,
        rowIndex,
        columnIndex,
        rowspan: currentRowspan,
        colspan: currentColspan,
        schema,
      });
    }

    for (let columnOffset = 0; columnOffset < additionalColumns; columnOffset++) {
      const insertColumnIndex = columnIndex + currentColspan + columnOffset;
      addColumnToTableForSplit(tr, tablePos, insertColumnIndex, rowIndex, rowIndex + targetRows);
      updatedGrid = insertGridColumnWidth(updatedGrid, insertColumnIndex) ?? updatedGrid;
    }

    for (let rowOffset = 0; rowOffset < additionalRows; rowOffset++) {
      const currentTableNode = tr.doc.nodeAt(tablePos);
      if (!currentTableNode || currentTableNode.type.name !== 'table') {
        return toTableFailure('INVALID_TARGET', 'Cell split target table is unavailable.');
      }

      const insertIndex = rowIndex + currentRowspan + rowOffset;
      const boundedInsertIndex = Math.max(0, Math.min(insertIndex, currentTableNode.childCount));
      const sourceRowIndex = Math.max(0, Math.min(boundedInsertIndex - 1, currentTableNode.childCount - 1));
      const didInsertRow = insertRowInTableForSplit(
        tr,
        tablePos,
        sourceRowIndex,
        boundedInsertIndex,
        columnIndex,
        columnIndex + targetColumns,
        schema,
      );

      if (!didInsertRow) {
        return toTableFailure('INVALID_TARGET', 'Cell split could not insert required rows.');
      }
    }

    const finalTableNode = tr.doc.nodeAt(tablePos);
    if (!finalTableNode || finalTableNode.type.name !== 'table') {
      return toTableFailure('INVALID_TARGET', 'Cell split target table is unavailable.');
    }

    const mappedTargetCellPos = tr.mapping.map(cellPos, 1);
    let finalTargetCellPos = mappedTargetCellPos;
    let finalTargetCell = tr.doc.nodeAt(finalTargetCellPos);

    if (
      !finalTargetCell ||
      (finalTargetCell.type.name !== 'tableCell' && finalTargetCell.type.name !== 'tableHeader')
    ) {
      const tableStart = tablePos + 1;
      const finalMap = TableMap.get(finalTableNode);
      const finalTargetRelPos = finalMap.positionAt(rowIndex, columnIndex, finalTableNode);
      finalTargetCellPos = tableStart + finalTargetRelPos;
      finalTargetCell = tr.doc.nodeAt(finalTargetCellPos);
    }

    if (
      !finalTargetCell ||
      (finalTargetCell.type.name !== 'tableCell' && finalTargetCell.type.name !== 'tableHeader')
    ) {
      return toTableFailure('INVALID_TARGET', 'Split target cell is unavailable.');
    }

    tr.setNodeMarkup(
      finalTargetCellPos,
      null,
      normalizeCellAttrsForSingleCell(finalTargetCell.attrs as Record<string, unknown>),
    );

    if (updatedGrid) {
      const currentTableAttrs = finalTableNode.attrs as Record<string, unknown>;
      tr.setNodeMarkup(tablePos, null, {
        ...currentTableAttrs,
        grid: updatedGrid,
        userEdited: true,
      });
    }

    applyDirectMutationMeta(tr);
    editor.dispatch(tr);
    clearIndexCache(editor);
    return buildTableSuccess(resolvePostMutationTableAddress(editor, table.candidate.pos, table.address.nodeId, tr));
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
    const preferredWidthType = (
      input as TablesSetCellPropertiesInput & {
        preferredWidthType?: TablePreferredWidthType;
      }
    ).preferredWidthType;

    const preferredWidth = buildCellPreferredWidth(input.preferredWidthPt, preferredWidthType);
    if (preferredWidth) {
      const colspan = (currentAttrs.colspan as number) || 1;
      if (preferredWidth.type === 'dxa' && input.preferredWidthPt !== undefined) {
        const widthPx = Math.round(input.preferredWidthPt * (96 / 72));
        const colwidth = Array(colspan).fill(widthPx) as number[];
        attrUpdates.colwidth = colwidth;
      } else {
        attrUpdates.colwidth = null;
      }
      cellPropUpdates.cellWidth = preferredWidth;
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

    if (preferredWidth) {
      const tableAttrs = table.candidate.node.attrs as Record<string, unknown>;
      tr.setNodeMarkup(table.candidate.pos, null, buildWidthAuthoringTableAttrs(tableAttrs));
    }

    applyDirectMutationMeta(tr);
    editor.dispatch(tr);
    clearIndexCache(editor);
    return buildTableSuccess(resolvePostMutationTableAddress(editor, table.candidate.pos, table.address.nodeId, tr));
  } catch {
    return toTableFailure('INVALID_TARGET', 'Cell properties update could not be applied.');
  }
}

/**
 * Build the paragraph node that `tables.setCellText` would write into a
 * cell for the given text. Empty text produces an empty paragraph.
 * Returns `null` when the schema lacks a paragraph node type.
 */
function buildSetCellTextParagraph(
  schema: Editor['state']['schema'],
  text: string,
): import('prosemirror-model').Node | null {
  const paragraphType = schema.nodes.paragraph;
  if (!paragraphType) return null;
  return text.length === 0 ? paragraphType.createAndFill() : paragraphType.createAndFill(null, schema.text(text));
}

/**
 * Identity attrs that the cell-content NO_OP comparator must ignore: auto-
 * generated session block IDs and OOXML revision IDs. Same list used by
 * the diff fingerprint normalization (`NON_SEMANTIC_BLOCK_ATTRS`).
 */
const IDENTITY_BLOCK_ATTRS = NON_SEMANTIC_BLOCK_ATTRS;

/**
 * Compare two cell-content fragments while ignoring auto-generated block
 * identity attrs. Returns true when the visible content (text + inline
 * marks + non-identity node attrs) is identical.
 */
function cellContentEqualsIgnoringIdentity(
  a: import('prosemirror-model').Node,
  b: import('prosemirror-model').Node,
): boolean {
  if (a.type !== b.type) return false;
  if (a.text !== b.text) return false;
  if (a.marks.length !== b.marks.length) return false;
  for (let i = 0; i < a.marks.length; i++) {
    if (!a.marks[i]!.eq(b.marks[i]!)) return false;
  }
  // Compare attrs except identity ones.
  const aAttrs = a.attrs as Record<string, unknown>;
  const bAttrs = b.attrs as Record<string, unknown>;
  const keys = new Set([...Object.keys(aAttrs), ...Object.keys(bAttrs)]);
  for (const key of keys) {
    if (IDENTITY_BLOCK_ATTRS.has(key)) continue;
    if (JSON.stringify(aAttrs[key]) !== JSON.stringify(bAttrs[key])) return false;
  }
  // Compare children recursively.
  if (a.childCount !== b.childCount) return false;
  for (let i = 0; i < a.childCount; i++) {
    if (!cellContentEqualsIgnoringIdentity(a.child(i), b.child(i))) return false;
  }
  return true;
}

/**
 * tables.setCellText — replace the text content of a single cell with a single
 * paragraph holding `text` (plain text). Cell properties (vAlign, shading,
 * borders, colspan/rowspan) are preserved.
 *
 * Accepts either a direct cell locator (target/nodeId pointing at a tableCell)
 * or a table-scoped locator (target/nodeId pointing at a table + rowIndex +
 * columnIndex).
 */
export function tablesSetCellTextAdapter(
  editor: Editor,
  input: TablesSetCellTextInput,
  options?: MutationOptions,
): TableMutationResult {
  rejectTrackedMode('tables.setCellText', options);

  const resolved = resolveCellOrTableScopedInput(
    editor,
    input as { target?: unknown; nodeId?: unknown; rowIndex?: unknown; columnIndex?: unknown },
    'tables.setCellText',
  );
  const { table, cellPos, cellNode } = resolved;

  const candidateParagraph = buildSetCellTextParagraph(editor.state.schema, input.text);
  if (!candidateParagraph) {
    return toTableFailure('INVALID_TARGET', 'tables.setCellText: paragraph node type is unavailable.');
  }

  try {
    const tr = editor.state.tr;

    // Replace the entire cell content (between cellPos+1 and cellPos+1+content.size).
    const cellStart = cellPos + 1;
    const cellEnd = cellStart + cellNode.content.size;
    tr.replaceWith(cellStart, cellEnd, candidateParagraph);

    // NO_OP detection — apply the transaction in-memory (running plugin
    // appendTransaction filters and schema fills, e.g. wrapping text in a
    // `run` and inheriting cell-default textStyle attrs). Compare the
    // projected cell content to the pre-mutation cell, ignoring auto-
    // regenerated identity attrs (sdBlockId / paraId / etc). If equal, the
    // op would change nothing visibly and we report NO_OP without
    // dispatching. This catches all "same plain text" cases regardless of
    // how attrs (color, fontFamily, fontSize) sit on the textStyle mark —
    // a bolded run, a colored run, or a different font all show up as a
    // content delta and dispatch as usual.
    //
    // The NO_OP check runs BEFORE the dryRun branch so dryRun results
    // mirror what a live call would produce.
    //
    // Test mocks may stub editor.state without `apply`; in that case skip
    // the projection and (for non-dryRun) dispatch unconditionally.
    const stateApply = (editor.state as { apply?: (t: Transaction) => { doc: typeof editor.state.doc } }).apply;
    if (typeof stateApply === 'function') {
      const projected = stateApply.call(editor.state, tr);
      const projectedCell = projected.doc.nodeAt(cellPos);
      if (projectedCell && cellContentEqualsIgnoringIdentity(cellNode, projectedCell)) {
        return toTableFailure('NO_OP', 'tables.setCellText: cell already contains this text.');
      }
    }

    if (options?.dryRun) {
      return buildTableSuccess(table.address);
    }

    applyDirectMutationMeta(tr);
    editor.dispatch(tr);
    clearIndexCache(editor);
    return buildTableSuccess(resolvePostMutationTableAddress(editor, table.candidate.pos, table.address.nodeId, tr));
  } catch {
    return toTableFailure('INVALID_TARGET', 'Cell text update could not be applied.');
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
    return buildTableSuccess(resolvePostMutationTableAddress(editor, candidate.pos, address.nodeId, tr));
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
    return buildTableSuccess(resolvePostMutationTableAddress(editor, candidate.pos, address.nodeId, tr));
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
    return buildTableSuccess(resolvePostMutationTableAddress(editor, candidate.pos, address.nodeId, tr));
  } catch {
    return toTableFailure('INVALID_TARGET', 'Table style removal could not be applied.');
  }
}

/**
 * Word-effective defaults for `tblLook` when the element is absent (0x04A0).
 * Defined locally to avoid a cross-layer dependency on the style-engine.
 *
 * @see ECMA-376 §17.4.56, Microsoft open specs for Word's tblLook defaults.
 */
const WORD_DEFAULT_TBL_LOOK: Readonly<Record<string, boolean>> = {
  firstRow: true,
  lastRow: false,
  firstColumn: true,
  lastColumn: false,
  noHBand: false,
  noVBand: true,
};

/** Maps every public `TableStyleOptionFlag` to its OOXML `tblLook` key. */
type TblLookKey = 'firstRow' | 'lastRow' | 'firstColumn' | 'lastColumn' | 'noHBand' | 'noVBand';

const FLAG_TO_OOXML_KEY: Record<Exclude<TableStyleOptionFlag, 'totalRow'>, TblLookKey> = {
  headerRow: 'firstRow',
  lastRow: 'lastRow',
  firstColumn: 'firstColumn',
  lastColumn: 'lastColumn',
  bandedRows: 'noHBand',
  bandedColumns: 'noVBand',
};

/** Flags whose OOXML semantics are inverted (enabled API → `false` on disk). */
const INVERTED_FLAGS: ReadonlySet<TableStyleOptionFlag> = new Set<TableStyleOptionFlag>([
  'bandedRows',
  'bandedColumns',
]);

/**
 * Resolves a public API flag to its OOXML tblLook key,
 * normalizing the deprecated `totalRow` alias to `lastRow`.
 */
function resolveStyleOptionFlag(flag: TableStyleOptionFlag): TblLookKey {
  const normalized: Exclude<TableStyleOptionFlag, 'totalRow'> = flag === 'totalRow' ? 'lastRow' : flag;
  return FLAG_TO_OOXML_KEY[normalized];
}

/**
 * tables.setStyleOption — toggle a table style option flag.
 *
 * Maps API flags to OOXML `w:tblLook` attributes, inverting `bandedRows`
 * and `bandedColumns` to the `noHBand`/`noVBand` semantics.
 *
 * Behavioral notes:
 * - Returns NO_OP when the explicit tblLook already holds the requested value.
 * - On first write to a table with no explicit `tblLook`, seeds a full baseline
 *   from Word's effective defaults (0x04A0) before applying the mutation.
 * - Deletes stale `w:val` bitmask on any mutation (explicit attrs are canonical).
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
    const xmlKey = resolveStyleOptionFlag(input.flag);
    const ooxmlValue = INVERTED_FLAGS.has(input.flag) ? !input.enabled : input.enabled;

    const currentAttrs = candidate.node.attrs as Record<string, unknown>;
    const currentTableProps = (currentAttrs.tableProperties ?? {}) as Record<string, unknown>;
    const existingLook = currentTableProps.tblLook as Record<string, unknown> | undefined;

    // NO_OP: if tblLook already has an explicit value matching the request, skip.
    if (existingLook != null && existingLook[xmlKey] === ooxmlValue) {
      return toTableFailure('NO_OP', `Style option '${input.flag}' already has the requested value.`);
    }

    // Seed from Word defaults on first materialization, then apply the mutation.
    const updatedLook: Record<string, unknown> =
      existingLook != null ? { ...existingLook } : { ...WORD_DEFAULT_TBL_LOOK };

    updatedLook[xmlKey] = ooxmlValue;

    // Delete stale w:val bitmask — explicit attrs are the canonical representation.
    delete updatedLook.val;

    const updatedTableProps = { ...currentTableProps, tblLook: updatedLook };
    const tr = editor.state.tr;
    tr.setNodeMarkup(candidate.pos, null, {
      ...currentAttrs,
      tableProperties: updatedTableProps,
      ...syncExtractedTableAttrs(updatedTableProps),
    });
    applyDirectMutationMeta(tr);
    editor.dispatch(tr);
    clearIndexCache(editor);
    return buildTableSuccess(resolvePostMutationTableAddress(editor, candidate.pos, address.nodeId, tr));
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
  locator: { target?: TableOrCellAddress; nodeId?: string },
  operationName: string,
): {
  node: import('prosemirror-model').Node;
  pos: number;
  address: TableAddress;
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

  if (candidate.nodeType === 'tableCell') {
    const resolvedCell = resolveCellLocator(
      editor,
      locator as { target?: TableCellAddress; nodeId?: string },
      operationName,
    );
    return {
      node: candidate.node,
      pos: candidate.pos,
      address: resolvedCell.table.address,
      scope: 'cell',
    };
  }

  const scope: 'table' | 'cell' | 'invalid' = candidate.nodeType === 'table' ? 'table' : 'invalid';
  return { node: candidate.node, pos: candidate.pos, address: toBlockAddress(candidate) as TableAddress, scope };
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
      color: normalizeColorInput(input.color),
    };

    currentProps.borders = currentBorders;
    const syncAttrs = resolved.scope === 'table' ? syncExtractedTableAttrs(currentProps) : {};
    const cellClear = resolved.scope === 'cell' ? { borders: null } : {};
    tr.setNodeMarkup(resolved.pos, null, { ...currentAttrs, [propsKey]: currentProps, ...syncAttrs, ...cellClear });

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
    if (resolved.scope === 'table') {
      return buildTableSuccess(resolvePostMutationTableAddress(editor, resolved.pos, resolved.address.nodeId, tr));
    }
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
    const cellClear = resolved.scope === 'cell' ? { borders: null } : {};
    tr.setNodeMarkup(resolved.pos, null, { ...currentAttrs, [propsKey]: currentProps, ...syncAttrs, ...cellClear });

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
    if (resolved.scope === 'table') {
      return buildTableSuccess(resolvePostMutationTableAddress(editor, resolved.pos, resolved.address.nodeId, tr));
    }
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
    return buildTableSuccess(resolvePostMutationTableAddress(editor, candidate.pos, address.nodeId, tr));
  } catch {
    return toTableFailure('INVALID_TARGET', 'Border preset could not be applied.');
  }
}

/**
 * tables.setShading — set shading color on a table or cell.
 *
 * Passing `color: null` delegates to `tablesClearShadingAdapter` so a single
 * action can both set and clear (mirrors the `null`-to-clear convention used
 * by `tables.setBorders`'s edges patch).
 */
export function tablesSetShadingAdapter(
  editor: Editor,
  input: TablesSetShadingInput,
  options?: MutationOptions,
): TableMutationResult {
  if (input.color === null) {
    return tablesClearShadingAdapter(editor, { target: input.target, nodeId: input.nodeId }, options);
  }

  // The merged `superdoc_table` tool schema can let an LLM call setShading
  // without a `color`. Reject upfront so `normalizeColorInput` doesn't blow
  // up on undefined (and to surface a structured failure to the agent).
  if (typeof input.color !== 'string') {
    return toTableFailure(
      'INVALID_INPUT',
      'tables.setShading: color is required (hex string, "auto", or null to clear).',
    );
  }

  rejectTrackedMode('tables.setShading', options);

  const resolved = resolveTableOrCellTarget(editor, input, 'tables.setShading');

  if (resolved.scope === 'invalid') {
    return toTableFailure('INVALID_TARGET', 'tables.setShading: target must be a table or tableCell.');
  }

  if (options?.dryRun) {
    return buildTableSuccess(resolved.address);
  }

  const normalizedColor = normalizeColorInput(input.color);

  try {
    const tr = editor.state.tr;
    const currentAttrs = resolved.node.attrs as Record<string, unknown>;
    const propsKey = resolved.scope === 'table' ? 'tableProperties' : 'tableCellProperties';
    const currentProps = { ...((currentAttrs[propsKey] ?? {}) as Record<string, unknown>) };

    currentProps.shading = { fill: normalizedColor, val: 'clear', color: 'auto' };
    const syncAttrs = resolved.scope === 'table' ? syncExtractedTableAttrs(currentProps) : {};
    tr.setNodeMarkup(resolved.pos, null, { ...currentAttrs, [propsKey]: currentProps, ...syncAttrs });

    if (resolved.scope === 'table') {
      applyShadingToCells(tr, resolved.node, resolved.pos + 1, normalizedColor);
    }

    applyDirectMutationMeta(tr);
    editor.dispatch(tr);
    clearIndexCache(editor);
    if (resolved.scope === 'table') {
      return buildTableSuccess(resolvePostMutationTableAddress(editor, resolved.pos, resolved.address.nodeId, tr));
    }
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
    if (resolved.scope === 'table') {
      return buildTableSuccess(resolvePostMutationTableAddress(editor, resolved.pos, resolved.address.nodeId, tr));
    }
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
    return buildTableSuccess(resolvePostMutationTableAddress(editor, candidate.pos, address.nodeId, tr));
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
    const cellMargins = { ...(asRecord(currentAttrs.cellMargins) ?? {}) };
    const ooxmlCellMargins = { ...(asRecord(currentCellProps.cellMargins) ?? {}) };
    const sideInputs = [
      ['top', input.topPt],
      ['right', input.rightPt],
      ['bottom', input.bottomPt],
      ['left', input.leftPt],
    ] as const;
    for (const [side, value] of sideInputs) {
      if (value === undefined) continue;
      cellMargins[side] = Math.round(value * POINTS_TO_PIXELS);
      ooxmlCellMargins[side] = {
        value: Math.round(value * POINTS_TO_TWIPS),
        type: 'dxa',
      };
    }

    currentCellProps.cellMargins = ooxmlCellMargins;

    tr.setNodeMarkup(cellPos, null, {
      ...currentAttrs,
      cellMargins,
      tableCellProperties: currentCellProps,
    });
    applyDirectMutationMeta(tr);
    editor.dispatch(tr);
    clearIndexCache(editor);
    return buildTableSuccess(resolvePostMutationTableAddress(editor, table.candidate.pos, table.address.nodeId, tr));
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
    return buildTableSuccess(resolvePostMutationTableAddress(editor, candidate.pos, address.nodeId, tr));
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
    return buildTableSuccess(resolvePostMutationTableAddress(editor, candidate.pos, address.nodeId, tr));
  } catch {
    return toTableFailure('INVALID_TARGET', 'Cell spacing removal could not be applied.');
  }
}

// ---------------------------------------------------------------------------
// Convenience operation helpers (SD-2129)
// ---------------------------------------------------------------------------

/** Reverse map from OOXML tblLook key to API style-option flag. */
const XML_KEY_TO_STYLE_OPTION: Record<TblLookKey, keyof TableStyleOptionsState> = {
  firstRow: 'headerRow',
  lastRow: 'lastRow',
  firstColumn: 'firstColumn',
  lastColumn: 'lastColumn',
  noHBand: 'bandedRows',
  noVBand: 'bandedColumns',
};

/**
 * Read `tblLook` flags as `TableStyleOptionsState`.
 * Emits only explicitly stored flags — absent OOXML keys stay omitted.
 */
function readTableLookAsState(tblLook: Record<string, unknown> | undefined): TableStyleOptionsState | undefined {
  if (!tblLook) return undefined;

  const result: TableStyleOptionsState = {};
  let hasAny = false;

  for (const [xmlKey, apiFlag] of Object.entries(XML_KEY_TO_STYLE_OPTION)) {
    if (xmlKey in tblLook && typeof tblLook[xmlKey] === 'boolean') {
      const rawValue = tblLook[xmlKey] as boolean;
      (result as Record<string, boolean>)[apiFlag] = INVERTED_FLAGS.has(apiFlag) ? !rawValue : rawValue;
      hasAny = true;
    }
  }

  return hasAny ? result : undefined;
}

/**
 * Merge API style-option flags into an existing `tblLook` object.
 * Returns the updated tblLook (new object, original not mutated).
 */
function writeTableLook(
  currentLook: Record<string, unknown> | undefined,
  patch: TableStyleOptionsPatch,
): Record<string, unknown> {
  // Match tables.setStyleOption behavior: once tblLook is materialized,
  // omitted flags should preserve Word's effective default mask.
  const result = currentLook ? { ...currentLook } : { ...WORD_DEFAULT_TBL_LOOK };
  for (const [apiFlag, value] of Object.entries(patch) as Array<[keyof TableStyleOptionsPatch, boolean | undefined]>) {
    if (value === undefined) continue;
    const normalizedFlag = apiFlag as TableStyleOptionFlag;
    const xmlKey = resolveStyleOptionFlag(normalizedFlag);
    result[xmlKey] = INVERTED_FLAGS.has(normalizedFlag) ? !value : value;
  }
  delete result.val;
  return result;
}

/**
 * Normalize a user-supplied color string to canonical uppercase `RRGGBB` (or
 * `'auto'`). Accepts `RRGGBB`, `#RRGGBB`, 3-digit shorthand `RGB` / `#RGB`,
 * and `'auto'`. The schema regex permits these forms; reads (see
 * `normalizeBorderSpecToApi`) emit canonical uppercase, so writes must match.
 */
function normalizeColorInput(color: string): string {
  if (color === 'auto') return 'auto';
  const stripped = color.startsWith('#') ? color.slice(1) : color;
  // 3-digit shorthand: `abc` → `aabbcc`.
  const expanded =
    stripped.length === 3
      ? stripped[0]! + stripped[0]! + stripped[1]! + stripped[1]! + stripped[2]! + stripped[2]!
      : stripped;
  return expanded.toUpperCase();
}

/** Convert API `TableBorderSpec` to OOXML border storage. pt → eighths-of-a-point. */
function normalizeBorderSpecFromApi(spec: TableBorderSpec): Record<string, unknown> {
  return {
    val: spec.lineStyle,
    size: Math.round(spec.lineWeightPt * 8),
    color: normalizeColorInput(spec.color),
  };
}

/** Convert OOXML border storage to API `TableBorderSpec`. Eighths-of-a-point → pt. */
function normalizeBorderSpecToApi(border: Record<string, unknown>): TableBorderSpec {
  const rawColor = typeof border.color === 'string' ? border.color : 'auto';
  // `auto` stays lowercase per the public contract; hex values are uppercased.
  const color = rawColor === 'auto' ? 'auto' : rawColor.toUpperCase();
  return {
    lineStyle: String(border.val ?? 'single'),
    lineWeightPt: typeof border.size === 'number' ? border.size / 8 : 0,
    color,
  };
}

/** The OOXML representation of "no border" — used when API sends `null`. */
const CLEARED_BORDER_OOXML = { val: 'none', size: 0, color: 'auto' } as const;

/** Returns true if an OOXML border value represents an explicit clear. */
function isClearedBorder(border: Record<string, unknown>): boolean {
  return border.val === 'none' || border.val === 'nil';
}

/** Convert OOXML border to the three-state API read model. */
function readBorderEdge(border: unknown): TableBorderSpec | null | undefined {
  if (!border || typeof border !== 'object') return undefined;
  const b = border as Record<string, unknown>;
  if (isClearedBorder(b)) return null;
  return normalizeBorderSpecToApi(b);
}

/** Read OOXML borders as `TableBorderState`. Returns undefined if no direct formatting. */
function readBordersAsState(borders: unknown): TableBorderState | undefined {
  if (!borders || typeof borders !== 'object') return undefined;
  const b = borders as Record<string, unknown>;

  const result: TableBorderState = {};
  let hasAny = false;
  const edgeNames = ['top', 'bottom', 'left', 'right', 'insideH', 'insideV'] as const;

  for (const edge of edgeNames) {
    if (edge in b) {
      const value = readBorderEdge(b[edge]);
      if (value !== undefined) {
        (result as Record<string, TableBorderSpec | null>)[edge] = value;
        hasAny = true;
      }
    }
  }

  return hasAny ? result : undefined;
}

type TableCellMarginKey = 'marginTop' | 'marginRight' | 'marginBottom' | 'marginLeft' | 'marginStart' | 'marginEnd';

const TABLE_MARGIN_KEY_GROUPS: ReadonlyArray<{
  keys: readonly TableCellMarginKey[];
  apiKey: keyof TableMarginsState;
}> = [
  { keys: ['marginTop'], apiKey: 'topPt' },
  { keys: ['marginRight', 'marginEnd'], apiKey: 'rightPt' },
  { keys: ['marginBottom'], apiKey: 'bottomPt' },
  { keys: ['marginLeft', 'marginStart'], apiKey: 'leftPt' },
] as const;

function readCellMarginEntry(
  cellMargins: Record<string, unknown>,
  keys: readonly TableCellMarginKey[],
): { value?: number } | undefined {
  for (const key of keys) {
    const entry = cellMargins[key] as { value?: number } | undefined;
    if (entry && typeof entry.value === 'number') return entry;
  }
  return undefined;
}

/** Read OOXML cell margins as `TableMarginsState`. Returns undefined if no direct formatting. */
function readCellMarginsAsState(cellMargins: unknown): TableMarginsState | undefined {
  if (!cellMargins || typeof cellMargins !== 'object') return undefined;
  const cm = cellMargins as Record<string, unknown>;

  const result: TableMarginsState = {};
  let hasAny = false;

  for (const { keys, apiKey } of TABLE_MARGIN_KEY_GROUPS) {
    const entry = readCellMarginEntry(cm, keys);
    if (entry && typeof entry.value === 'number') {
      result[apiKey] = entry.value / POINTS_TO_TWIPS;
      hasAny = true;
    }
  }

  return hasAny ? result : undefined;
}

/** Read OOXML cell spacing as API Pt. Returns undefined if absent. */
function readCellSpacingPt(spacing: unknown): number | undefined {
  if (!spacing || typeof spacing !== 'object') return undefined;
  const s = spacing as { value?: number };
  if (typeof s.value !== 'number') return undefined;
  return s.value / POINTS_TO_TWIPS;
}

/**
 * Expand `applyTo` target into the concrete edge patch.
 */
function expandApplyToEdges(
  applyTo: TableBorderApplyTo,
): Array<'top' | 'bottom' | 'left' | 'right' | 'insideH' | 'insideV'> {
  switch (applyTo) {
    case 'all':
      return ['top', 'bottom', 'left', 'right', 'insideH', 'insideV'];
    case 'outside':
      return ['top', 'bottom', 'left', 'right'];
    case 'inside':
      return ['insideH', 'insideV'];
    default:
      return [applyTo as 'top' | 'bottom' | 'left' | 'right' | 'insideH' | 'insideV'];
  }
}

/**
 * Build the OOXML border patch from the resolved edge map.
 * Each edge is either a border spec (from API) or null (clear).
 */
function buildOoxmlBorderPatch(
  currentBorders: Record<string, unknown>,
  edgePatch: TableBorderPatch,
): Record<string, unknown> {
  const result = { ...currentBorders };
  const edges = Object.entries(edgePatch) as Array<[string, TableBorderSpec | null | undefined]>;
  for (const [edge, value] of edges) {
    if (value === undefined) continue;
    result[edge] = value === null ? { ...CLEARED_BORDER_OOXML } : normalizeBorderSpecFromApi(value);
  }
  return result;
}

/**
 * Check if the requested style patch is already satisfied by current table properties.
 * Compares against raw direct flag keys, not inferred defaults.
 */
function isStylePatchSatisfied(currentTableProps: Record<string, unknown>, input: TablesApplyStyleInput): boolean {
  if (input.styleId !== undefined) {
    if (currentTableProps.tableStyleId !== input.styleId) return false;
  }

  if (input.styleOptions) {
    const currentLook = (currentTableProps.tblLook ?? {}) as Record<string, unknown>;
    for (const [apiFlag, value] of Object.entries(input.styleOptions)) {
      if (value === undefined) continue;
      const normalizedFlag = apiFlag as TableStyleOptionFlag;
      const xmlKey = resolveStyleOptionFlag(normalizedFlag);
      const expectedXmlValue = INVERTED_FLAGS.has(normalizedFlag) ? !value : value;
      if (!(xmlKey in currentLook) || currentLook[xmlKey] !== expectedXmlValue) return false;
    }
  }

  return true;
}

/**
 * Check if the requested table-options patch is already satisfied by current table properties.
 */
function isTableOptionsSatisfied(
  currentTableProps: Record<string, unknown>,
  input: TablesSetTableOptionsInput,
): boolean {
  if (input.defaultCellMargins !== undefined) {
    const cm = currentTableProps.cellMargins as Record<string, unknown> | undefined;
    if (!cm) return false;
    const m = input.defaultCellMargins;
    const pairs: Array<[readonly TableCellMarginKey[], number]> = [
      [['marginTop'], m.topPt],
      [['marginRight', 'marginEnd'], m.rightPt],
      [['marginBottom'], m.bottomPt],
      [['marginLeft', 'marginStart'], m.leftPt],
    ];
    for (const [ooxmlKeys, ptValue] of pairs) {
      const entry = readCellMarginEntry(cm, ooxmlKeys);
      if (!entry || entry.value !== Math.round(ptValue * POINTS_TO_TWIPS)) return false;
    }
  }

  if (input.cellSpacingPt !== undefined) {
    const spacing = currentTableProps.tableCellSpacing as { value?: number } | undefined;
    if (input.cellSpacingPt === null) {
      if (spacing !== undefined && spacing !== null) return false;
    } else {
      if (!spacing || spacing.value !== Math.round(input.cellSpacingPt * POINTS_TO_TWIPS)) return false;
    }
  }

  return true;
}

// ---------------------------------------------------------------------------
// Convenience adapters (SD-2129)
// ---------------------------------------------------------------------------

/**
 * tables.applyStyle — apply a table style and/or style options in one call.
 */
export function tablesApplyStyleAdapter(
  editor: Editor,
  input: TablesApplyStyleInput,
  options?: MutationOptions,
): TableMutationResult {
  rejectTrackedMode('tables.applyStyle', options);

  const { candidate, address } = resolveTableLocator(editor, input, 'tables.applyStyle');

  if (options?.dryRun) {
    return buildTableSuccess(address);
  }

  try {
    const currentAttrs = candidate.node.attrs as Record<string, unknown>;
    const currentTableProps = (currentAttrs.tableProperties ?? {}) as Record<string, unknown>;

    if (isStylePatchSatisfied(currentTableProps, input)) {
      return toTableFailure('NO_OP', 'tables.applyStyle did not produce a change.');
    }

    const updatedTableProps = { ...currentTableProps };

    if (input.styleId !== undefined) {
      updatedTableProps.tableStyleId = input.styleId;
    }

    if (input.styleOptions) {
      const currentLook = asRecord(updatedTableProps.tblLook);
      updatedTableProps.tblLook = writeTableLook(currentLook, input.styleOptions as Record<string, boolean>);
    }

    const tr = editor.state.tr;
    tr.setNodeMarkup(candidate.pos, null, {
      ...currentAttrs,
      tableProperties: updatedTableProps,
      ...syncExtractedTableAttrs(updatedTableProps),
    });
    applyDirectMutationMeta(tr);
    editor.dispatch(tr);
    clearIndexCache(editor);
    return buildTableSuccess(resolvePostMutationTableAddress(editor, candidate.pos, address.nodeId, tr));
  } catch {
    return toTableFailure('INVALID_TARGET', 'Table style application could not be applied.');
  }
}

/**
 * tables.setBorders — set borders on a table using a target set or per-edge patch.
 */
export function tablesSetBordersAdapter(
  editor: Editor,
  input: TablesSetBordersInput,
  options?: MutationOptions,
): TableMutationResult {
  rejectTrackedMode('tables.setBorders', options);

  const { candidate, address } = resolveTableLocator(editor, input, 'tables.setBorders');

  if (options?.dryRun) {
    return buildTableSuccess(address);
  }

  try {
    // Resolve the edge patch from the input mode
    let edgePatch: TableBorderPatch;
    if (input.mode === 'applyTo') {
      const edges = expandApplyToEdges(input.applyTo);
      edgePatch = {};
      for (const edge of edges) {
        (edgePatch as Record<string, TableBorderSpec | null>)[edge] = input.border;
      }
    } else {
      edgePatch = input.edges;
    }

    const tr = editor.state.tr;
    const currentAttrs = candidate.node.attrs as Record<string, unknown>;
    const currentTableProps = { ...((currentAttrs.tableProperties ?? {}) as Record<string, unknown>) };
    const currentBorders = (currentTableProps.borders ?? {}) as Record<string, unknown>;

    currentTableProps.borders = buildOoxmlBorderPatch(currentBorders, edgePatch);

    tr.setNodeMarkup(candidate.pos, null, {
      ...currentAttrs,
      tableProperties: currentTableProps,
      ...syncExtractedTableAttrs(currentTableProps),
    });

    // Propagate to cell borders for each edge in the patch
    const patchEntries = Object.entries(edgePatch) as Array<[string, TableBorderSpec | null | undefined]>;
    for (const [edge, value] of patchEntries) {
      if (value === undefined) continue;
      if (!isBoundaryEdge(edge)) continue;
      const ooxmlSpec = value === null ? { ...CLEARED_BORDER_OOXML } : normalizeBorderSpecFromApi(value);
      applyTableEdgeToCellBorders(tr, candidate.pos, candidate.node, edge as TableBorderEdgeForCells, ooxmlSpec);
    }

    applyDirectMutationMeta(tr);
    editor.dispatch(tr);
    clearIndexCache(editor);
    return buildTableSuccess(resolvePostMutationTableAddress(editor, candidate.pos, address.nodeId, tr));
  } catch {
    return toTableFailure('INVALID_TARGET', 'Table border update could not be applied.');
  }
}

/**
 * tables.setTableOptions — set table-level default cell margins and/or cell spacing.
 */
export function tablesSetTableOptionsAdapter(
  editor: Editor,
  input: TablesSetTableOptionsInput,
  options?: MutationOptions,
): TableMutationResult {
  rejectTrackedMode('tables.setTableOptions', options);

  const { candidate, address } = resolveTableLocator(editor, input, 'tables.setTableOptions');

  if (options?.dryRun) {
    return buildTableSuccess(address);
  }

  try {
    const currentAttrs = candidate.node.attrs as Record<string, unknown>;
    const currentTableProps = (currentAttrs.tableProperties ?? {}) as Record<string, unknown>;

    if (isTableOptionsSatisfied(currentTableProps, input)) {
      return toTableFailure('NO_OP', 'tables.setTableOptions did not produce a change.');
    }

    const updatedTableProps = { ...currentTableProps };

    if (input.defaultCellMargins !== undefined) {
      const m = input.defaultCellMargins;
      updatedTableProps.cellMargins = {
        marginTop: { value: Math.round(m.topPt * POINTS_TO_TWIPS), type: 'dxa' },
        marginRight: { value: Math.round(m.rightPt * POINTS_TO_TWIPS), type: 'dxa' },
        marginBottom: { value: Math.round(m.bottomPt * POINTS_TO_TWIPS), type: 'dxa' },
        marginLeft: { value: Math.round(m.leftPt * POINTS_TO_TWIPS), type: 'dxa' },
      };
    }

    if (input.cellSpacingPt !== undefined) {
      if (input.cellSpacingPt === null) {
        delete updatedTableProps.tableCellSpacing;
        delete updatedTableProps.tblCellSpacing;
      } else {
        updatedTableProps.tableCellSpacing = {
          value: Math.round(input.cellSpacingPt * POINTS_TO_TWIPS),
          type: 'dxa',
        };
      }
    }

    const tr = editor.state.tr;
    tr.setNodeMarkup(candidate.pos, null, {
      ...currentAttrs,
      tableProperties: updatedTableProps,
      ...syncExtractedTableAttrs(updatedTableProps),
    });
    applyDirectMutationMeta(tr);
    editor.dispatch(tr);
    clearIndexCache(editor);
    return buildTableSuccess(resolvePostMutationTableAddress(editor, candidate.pos, address.nodeId, tr));
  } catch {
    return toTableFailure('INVALID_TARGET', 'Table options could not be applied.');
  }
}

/**
 * tables.applyPreset — apply a named visual preset (borders + shading + style
 * options) to a table in a single transaction.
 *
 * Reachable through the document-api / SDK / superdoc_mutations. Intentionally
 * NOT surfaced as a top-level action on the `superdoc_table` intent tool —
 * presets confused the LLM (it would call apply_preset and stop, producing no
 * visible change). The op stays available for power users and for composing
 * via `superdoc_mutations`.
 */
export function tablesApplyPresetAdapter(
  editor: Editor,
  input: TablesApplyPresetInput,
  options?: MutationOptions,
): TableMutationResult {
  rejectTrackedMode('tables.applyPreset', options);

  const { candidate, address } = resolveTableLocator(editor, input, 'tables.applyPreset');

  if (options?.dryRun) {
    return buildTableSuccess(address);
  }

  const spec = buildPresetSpec(input.preset, input.accentColor);
  if (!spec) {
    return toTableFailure('INVALID_TARGET', `tables.applyPreset: unknown preset "${input.preset}".`);
  }

  try {
    const tr = editor.state.tr;
    const tableNode = candidate.node;
    const tablePos = candidate.pos;
    const currentAttrs = tableNode.attrs as Record<string, unknown>;
    const currentTableProps = { ...((currentAttrs.tableProperties ?? {}) as Record<string, unknown>) };

    const currentBorders = (currentTableProps.borders ?? {}) as Record<string, unknown>;
    currentTableProps.borders = buildOoxmlBorderPatch(currentBorders, spec.borders);

    if (Object.keys(spec.styleOptions).length > 0) {
      const currentLook = (currentTableProps.tblLook ?? { ...WORD_DEFAULT_TBL_LOOK }) as Record<string, unknown>;
      const updatedLook: Record<string, unknown> = { ...currentLook };
      for (const [flag, value] of Object.entries(spec.styleOptions)) {
        if (value === undefined) continue;
        const ooxmlKey = resolveStyleOptionFlag(flag as TableStyleOptionFlag);
        const stored = INVERTED_FLAGS.has(flag as TableStyleOptionFlag) ? !value : value;
        updatedLook[ooxmlKey] = stored;
      }
      currentTableProps.tblLook = updatedLook;
    }

    tr.setNodeMarkup(tablePos, null, {
      ...currentAttrs,
      tableProperties: currentTableProps,
      ...syncExtractedTableAttrs(currentTableProps),
    });

    const patchEntries = Object.entries(spec.borders) as Array<[string, TableBorderSpec | null | undefined]>;
    for (const [edge, value] of patchEntries) {
      if (value === undefined) continue;
      if (!isBoundaryEdge(edge)) continue;
      const ooxmlSpec = value === null ? { ...CLEARED_BORDER_OOXML } : normalizeBorderSpecFromApi(value);
      applyTableEdgeToCellBorders(tr, tablePos, tableNode, edge as TableBorderEdgeForCells, ooxmlSpec);
    }

    if (spec.headerRowFill && tableNode.childCount > 0) {
      const map = TableMap.get(tableNode);
      const headerCellPositions = map.map.slice(0, map.width);
      applyShadingToCells(tr, tableNode, tablePos + 1, spec.headerRowFill, headerCellPositions);
    }

    applyDirectMutationMeta(tr);
    editor.dispatch(tr);
    clearIndexCache(editor);
    return buildTableSuccess(resolvePostMutationTableAddress(editor, tablePos, address.nodeId, tr));
  } catch {
    return toTableFailure('INVALID_TARGET', 'Table preset could not be applied.');
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
  const didApply = insertTableAt({
    pos: insertAt,
    rows: input.rows,
    columns: input.columns,
    sdBlockId: tableId,
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
    const cellNodeId = candidate.nodeId || resolveCellNodeId(attrs);
    cells.push({
      nodeId: cellNodeId,
      address: { kind: 'block', nodeType: 'tableCell', nodeId: cellNodeId },
      rowIndex: row,
      columnIndex: col,
      colspan: typeof attrs.colspan === 'number' ? attrs.colspan : 1,
      rowspan: typeof attrs.rowspan === 'number' ? attrs.rowspan : 1,
    });
  }

  cells.sort((a, b) => a.rowIndex - b.rowIndex || a.columnIndex - b.columnIndex);

  return {
    nodeId: resolved.candidate.nodeId,
    address: resolved.address,
    cells,
  };
}

export function tablesGetPropertiesAdapter(editor: Editor, input: TablesGetPropertiesInput): TablesGetPropertiesOutput {
  const resolved = resolveTableLocator(editor, input, 'tables.getProperties');
  const tp = asRecord(resolved.candidate.node.attrs?.tableProperties) ?? {};

  const result: TablesGetPropertiesOutput = {
    nodeId: resolved.candidate.nodeId,
    address: resolved.address,
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

  const styleOptions = readTableLookAsState(resolveTableLook(tp));
  if (styleOptions) result.styleOptions = styleOptions;

  const borders = readBordersAsState(tp.borders);
  if (borders) result.borders = borders;

  const defaultCellMargins = readCellMarginsAsState(tp.cellMargins);
  if (defaultCellMargins) result.defaultCellMargins = defaultCellMargins;

  const cellSpacingPt = readCellSpacingPt(tp.tableCellSpacing);
  if (cellSpacingPt !== undefined) result.cellSpacingPt = cellSpacingPt;

  return result;
}

// ---------------------------------------------------------------------------
// Document-level table style operations
// ---------------------------------------------------------------------------

type ConverterForTableStyles = ConverterWithDocumentSettings;

function getConverterForStyles(editor: Editor): ConverterForTableStyles | undefined {
  return (editor as unknown as { converter?: ConverterForTableStyles }).converter;
}

function toDocumentMutationFailure(code: 'NO_OP' | 'INVALID_INPUT', message: string): DocumentMutationResult {
  return {
    success: false,
    failure: { code, message },
  };
}

function toDocumentMutationSuccess(): DocumentMutationResult {
  return { success: true };
}

export function tablesGetStylesAdapter(editor: Editor, _input?: TablesGetStylesInput): TablesGetStylesOutput {
  const converter = getConverterForStyles(editor);
  if (!converter) {
    return {
      explicitDefaultStyleId: null,
      effectiveDefaultStyleId: null,
      effectiveDefaultSource: 'none',
      styles: [],
    };
  }

  const translatedLinkedStyles = readTranslatedLinkedStyles(editor);
  const allStyles = translatedLinkedStyles?.styles ?? {};

  // Collect table styles
  const styles: TableStyleInfo[] = [];
  for (const [id, def] of Object.entries(allStyles)) {
    if (def.type !== 'table') continue;
    styles.push({
      id,
      name: def.name ?? null,
      basedOn: def.basedOn ?? null,
      isDefault: def.default === true,
      isCustom: def.customStyle === true,
      uiPriority: def.uiPriority ?? null,
      hidden: def.hidden === true || def.semiHidden === true,
      quickFormat: def.qFormat === true,
      conditionalRegions: def.tableStyleProperties ? Object.keys(def.tableStyleProperties) : [],
    });
  }

  // Read explicit default from settings.xml
  let explicitDefaultStyleId: string | null = null;
  const settingsRoot = readSettingsRoot(converter);
  if (settingsRoot) {
    explicitDefaultStyleId = readDefaultTableStyle(settingsRoot);
  }

  // Resolve effective default
  const resolved = resolvePreferredNewTableStyleId(explicitDefaultStyleId, translatedLinkedStyles);

  return {
    explicitDefaultStyleId,
    effectiveDefaultStyleId: resolved.styleId,
    effectiveDefaultSource: resolved.source,
    styles,
  };
}

export function tablesSetDefaultStyleAdapter(
  editor: Editor,
  input: TablesSetDefaultStyleInput,
  options?: MutationOptions,
): DocumentMutationResult {
  rejectTrackedMode('tables.setDefaultStyle', options);

  const converter = getConverterForStyles(editor);
  if (!converter) {
    throw new DocumentApiAdapterError(
      'CAPABILITY_UNAVAILABLE',
      'tables.setDefaultStyle requires an active document converter.',
    );
  }

  // Validate styleId
  if (!isKnownTableStyleId(input.styleId, readTranslatedLinkedStyles(editor))) {
    throw new DocumentApiAdapterError(
      'INVALID_INPUT',
      `tables.setDefaultStyle: "${input.styleId}" is not a known table style.`,
    );
  }

  const result = mutatePart({
    editor,
    partId: SETTINGS_PART,
    operation: 'mutate',
    source: 'tables.setDefaultStyle',
    dryRun: options?.dryRun === true,
    expectedRevision: options?.expectedRevision,
    mutate({ part, dryRun: isDryRun }) {
      const existingRoot = readSettingsRoot(converter);
      const current = existingRoot ? readDefaultTableStyle(existingRoot) : null;

      if (current === input.styleId) {
        return toDocumentMutationFailure('NO_OP', 'tables.setDefaultStyle did not produce a document settings change.');
      }

      if (!isDryRun) {
        const settingsRoot = ensureSettingsRoot(part as Parameters<typeof ensureSettingsRoot>[0]);
        setDefaultTableStyle(settingsRoot, input.styleId);
      }

      return toDocumentMutationSuccess();
    },
  });

  return result.result as DocumentMutationResult;
}

export function tablesClearDefaultStyleAdapter(
  editor: Editor,
  _input?: TablesClearDefaultStyleInput,
  options?: MutationOptions,
): DocumentMutationResult {
  rejectTrackedMode('tables.clearDefaultStyle', options);

  const converter = getConverterForStyles(editor);
  if (!converter) {
    throw new DocumentApiAdapterError(
      'CAPABILITY_UNAVAILABLE',
      'tables.clearDefaultStyle requires an active document converter.',
    );
  }

  const result = mutatePart({
    editor,
    partId: SETTINGS_PART,
    operation: 'mutate',
    source: 'tables.clearDefaultStyle',
    dryRun: options?.dryRun === true,
    expectedRevision: options?.expectedRevision,
    mutate({ part, dryRun: isDryRun }) {
      const existingRoot = readSettingsRoot(converter);
      const current = existingRoot ? readDefaultTableStyle(existingRoot) : null;

      if (current === null) {
        return toDocumentMutationFailure(
          'NO_OP',
          'tables.clearDefaultStyle did not produce a document settings change.',
        );
      }

      if (!isDryRun) {
        const settingsRoot = ensureSettingsRoot(part as Parameters<typeof ensureSettingsRoot>[0]);
        removeDefaultTableStyle(settingsRoot);
      }

      return toDocumentMutationSuccess();
    },
  });

  return result.result as DocumentMutationResult;
}
