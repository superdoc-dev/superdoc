import type { TableBlock, TableBorders, TableRowProperties, TableWidthAttr } from '@superdoc/contracts';
import { OOXML_PCT_DIVISOR, getBorderBandWidthPx, resolveTableWidthAttr } from '@superdoc/contracts';
import type {
  AutoFitCellInput,
  AutoFitLayoutMode,
  AutoFitRowInput,
  AutoFitSkippedColumnInput,
} from './autofit-columns.js';

/** Number of OOXML twips per rendered CSS pixel at 96 DPI. */
const TWIPS_PER_PX = 15;
/** Authored/skipped grid columns at or below this width are treated as import placeholders. */
const PLACEHOLDER_COLUMN_MAX_WIDTH = 1;

/**
 * Narrow OOXML measurement shape used by normalization.
 *
 * This module intentionally avoids importing `style-engine` types so it can stay
 * within the existing `@superdoc/measuring-dom` package dependency graph.
 */
type OoxmlMeasurement = {
  /** Raw measurement value, usually twips or OOXML pct units. */
  value?: number;
  /** Raw OOXML measurement type such as `dxa`, `pct`, or `auto`. */
  type?: string;
};

/**
 * Narrow table-cell property shape used by normalization.
 *
 * Only `cellWidth` matters here; the full OOXML cell property surface remains on
 * the runtime block attrs for later stages that need it.
 */
type NormalizationTableCellProperties = {
  /** Preferred cell width metadata from `w:tcW`. */
  cellWidth?: OoxmlMeasurement;
};

/**
 * Constraints required to normalize a runtime table into AutoFit working-grid input.
 */
export type AutoFitNormalizationConstraints = {
  /** Maximum runtime width available to the table, in pixels. */
  maxWidth: number;
};

/**
 * Stable normalization boundary between runtime `TableBlock` data and the pure
 * AutoFit algorithm input model.
 *
 * The returned object is intentionally free of PM/import quirks:
 * - logical row skips are explicit skipped columns
 * - preferred/authored grid widths are already extracted
 * - preferred table width is resolved to pixels when possible
 * - layout mode is normalized to `fixed` or `autofit`
 */
export type WorkingTableGridInput = {
  /** Normalized runtime layout mode. Omitted `tblLayout` becomes `autofit`. */
  layoutMode: AutoFitLayoutMode;
  /** Maximum runtime width available to the table, in pixels. */
  maxTableWidth: number;
  /**
   * Fixed-layout tables with a complete authored grid whose total already
   * matches tblW should keep that grid as the visual column geometry.
   */
  preserveAuthoredGrid?: boolean;
  /**
   * AutoFit tables with tblW=auto and a complete authored grid should keep that
   * grid as preferred geometry unless content minimums force growth.
   */
  preserveAutoGrid?: boolean;
  /**
   * AutoFit tables with explicit tblW and a complete authored grid that matches
   * tblW should keep that grid as preferred geometry unless content minimums
   * force growth.
   */
  preserveExplicitAutoGrid?: boolean;
  /**
   * Pure-auto tables (autofit layout, auto/nil/absent tblW, and no cell anywhere
   * carrying a concrete width preference) content-size like Word: the stored grid
   * is not a Word layout cache for these, so the solver targets content demand
   * instead of the authored grid sum. (SD-3309)
   */
  contentSizeAutoTable?: boolean;
  /**
   * Per-column vertical border band allowances for content-sized pure-auto tables:
   * each column owns its LEFT gridline band, the last column also the right edge
   * (single-owner model). Border-box cells subtract these from the text box, so
   * content-sized columns must reserve them or text wraps earlier than Word. (SD-3309)
   */
  columnBandAllowances?: number[];
  /**
   * AutoFit tables with auto-width semantics and a complete authored grid that
   * fits the available width should use the grid sum as their outer width
   * budget. Cell `tcW` preferences may still reshape columns inside this budget,
   * but should not by themselves expand the table beyond it.
   */
  autoGridWidthBudget?: number;
  /** Preferred table width target, in pixels, if resolvable. */
  preferredTableWidth?: number;
  /** Preferred/authored grid widths, in pixels, in logical-column order. */
  preferredColumnWidths: number[];
  /** Logical grid column count after accounting for row skips and spans. */
  gridColumnCount: number;
  /** Logical row placements for downstream fixed and AutoFit solvers. */
  rows: WorkingTableRowInput[];
};

/**
 * Explicit skipped-column placement inside a logical row.
 *
 * This extends the old skipped-column input with a concrete logical grid
 * column index so downstream solvers no longer need to reconstruct placement.
 */
export type WorkingTableSkippedColumnInput = AutoFitSkippedColumnInput & {
  /** Absolute logical grid column index for this skipped column. */
  columnIndex: number;
};

/**
 * Explicit logical cell placement within a row.
 *
 * The existing AutoFit cell width hints remain intact, but placement is made
 * explicit so fixed and AutoFit solvers can share one row model.
 */
export type WorkingTableCellInput = AutoFitCellInput & {
  /** Source runtime cell id when available, useful for debugging and testing. */
  cellId?: string;
  /** Absolute logical grid column where the cell starts. */
  startColumn: number;
};

/**
 * One normalized logical row in the shared working-grid model.
 *
 * This preserves the old `skippedBefore` / `cells` / `skippedAfter` shape for
 * compatibility with the current AutoFit runtime path while also exposing the
 * fully placed logical row needed by the rework.
 */
export type WorkingTableRowInput = AutoFitRowInput & {
  /** All skipped columns in this row with explicit logical positions. */
  skippedColumns: WorkingTableSkippedColumnInput[];
  /** All concrete cells with explicit logical start columns. */
  cells: WorkingTableCellInput[];
  /** Logical column count occupied by this row after skips and spans. */
  logicalColumnCount: number;
};

/**
 * Convert a runtime `TableBlock` into the explicit working-grid input consumed by
 * the pure AutoFit solver.
 *
 * This function performs only structural normalization:
 * - it does not measure content
 * - it does not compute final widths
 * - it does not mutate the source block
 *
 * @param block - Runtime table block from `pm-adapter`.
 * @param constraints - Width constraints for percentage resolution.
 * @returns Pure working-grid input for AutoFit width resolution.
 */
export function buildAutoFitWorkingGridInput(
  block: TableBlock,
  constraints: AutoFitNormalizationConstraints,
): WorkingTableGridInput {
  const maxTableWidth = sanitizePositiveNumber(constraints.maxWidth);
  const layoutMode = resolveLayoutMode(block.attrs?.tableLayout);
  const tableWidth = block.attrs?.tableWidth as TableWidthAttr | undefined;
  const preferredTableWidth = resolvePreferredTableWidth(tableWidth, maxTableWidth);
  const rawPreferredColumnWidths = normalizePreferredColumnWidths(block.columnWidths);
  const logicalColumnLimit = resolveTrailingPlaceholderColumnLimit(rawPreferredColumnWidths);
  let activeRowSpans: number[] = [];
  const rows = block.rows.map((row) => {
    const normalized = normalizeRow(row, preferredTableWidth ?? maxTableWidth, activeRowSpans, logicalColumnLimit);
    activeRowSpans = normalized.nextActiveRowSpans;
    return normalized.row;
  });
  const occupiedGridColumnCount = determineGridColumnCount(0, rows);
  const preferredColumnWidths = trimTrailingUnoccupiedPlaceholderColumns(
    rawPreferredColumnWidths,
    occupiedGridColumnCount,
  );
  const gridColumnCount = determineGridColumnCount(preferredColumnWidths.length, rows);
  const preserveAuthoredGrid = shouldPreserveAuthoredGrid({
    layoutMode,
    preferredColumnWidths,
    preferredTableWidth,
    gridColumnCount,
  });
  const preserveAutoGrid = shouldPreserveAutoGrid({
    layoutMode,
    preferredColumnWidths,
    preferredTableWidth,
    gridColumnCount,
    rows,
  });
  const preserveExplicitAutoGrid = shouldPreserveExplicitAutoGrid({
    layoutMode,
    tableWidth,
    preferredColumnWidths,
    preferredTableWidth,
    gridColumnCount,
    rows,
  });
  const contentSizeAutoTable = resolveContentSizeAutoTable({
    layoutMode,
    tableWidth,
    preferredTableWidth,
    preferredColumnWidths,
    maxTableWidth,
    rows,
    preserveAutoGrid,
    preserveExplicitAutoGrid,
  });
  const columnBandAllowances = contentSizeAutoTable
    ? resolveColumnBandAllowances(block.attrs?.borders as TableBorders | null | undefined, gridColumnCount)
    : undefined;
  const autoGridWidthBudget = contentSizeAutoTable
    ? undefined
    : resolveAutoGridWidthBudget({
        layoutMode,
        tableWidth,
        preferredColumnWidths,
        preferredTableWidth,
        gridColumnCount,
        maxTableWidth,
      });

  return {
    layoutMode,
    maxTableWidth,
    ...(preserveAuthoredGrid ? { preserveAuthoredGrid } : {}),
    ...(preserveAutoGrid ? { preserveAutoGrid } : {}),
    ...(preserveExplicitAutoGrid ? { preserveExplicitAutoGrid } : {}),
    ...(autoGridWidthBudget != null ? { autoGridWidthBudget } : {}),
    ...(contentSizeAutoTable ? { contentSizeAutoTable } : {}),
    ...(columnBandAllowances ? { columnBandAllowances } : {}),
    preferredTableWidth,
    preferredColumnWidths,
    gridColumnCount,
    rows,
  };
}

/**
 * Resolve the runtime layout mode from the effective table attrs.
 */
function resolveLayoutMode(tableLayout: unknown): AutoFitLayoutMode {
  return tableLayout === 'fixed' ? 'fixed' : 'autofit';
}

function shouldPreserveAuthoredGrid(args: {
  layoutMode: AutoFitLayoutMode;
  preferredColumnWidths: number[];
  preferredTableWidth: number | undefined;
  gridColumnCount: number;
}): boolean {
  const { layoutMode, preferredColumnWidths, preferredTableWidth, gridColumnCount } = args;
  if (layoutMode !== 'fixed') return false;
  if (preferredTableWidth == null || preferredTableWidth <= 0) return false;
  if (preferredColumnWidths.length === 0 || preferredColumnWidths.length !== gridColumnCount) return false;

  const totalPreferredColumnWidth = sumWidths(preferredColumnWidths);
  return (
    approximatelyEqual(totalPreferredColumnWidth, preferredTableWidth) ||
    isSlightlyUnderPreferredTableWidth(totalPreferredColumnWidth, preferredTableWidth)
  );
}

function shouldPreserveAutoGrid(args: {
  layoutMode: AutoFitLayoutMode;
  preferredColumnWidths: number[];
  preferredTableWidth: number | undefined;
  gridColumnCount: number;
  rows: WorkingTableRowInput[];
}): boolean {
  const { layoutMode, preferredColumnWidths, preferredTableWidth, gridColumnCount, rows } = args;
  if (layoutMode !== 'autofit') return false;
  if (preferredTableWidth != null) return false;
  if (preferredColumnWidths.length === 0 || preferredColumnWidths.length !== gridColumnCount) return false;
  // A single-column grid with no concrete cell width anywhere is not a Word layout
  // cache: Word recomputes and content-sizes the table on open (verified against
  // Word renders of single-cell auto tables with a stale w:tblGrid, SD-3308). Let
  // the content-size path claim it. With a tcW present the grid IS a cache: keep it.
  if (preferredColumnWidths.length === 1 && !hasConcreteCellWidthRequest(rows)) return false;
  if (!hasNonUniformGrid(preferredColumnWidths)) return false;
  return true;
}

function shouldPreserveExplicitAutoGrid(args: {
  layoutMode: AutoFitLayoutMode;
  tableWidth: TableWidthAttr | undefined;
  preferredColumnWidths: number[];
  preferredTableWidth: number | undefined;
  gridColumnCount: number;
  rows: WorkingTableRowInput[];
}): boolean {
  const { layoutMode, tableWidth, preferredColumnWidths, preferredTableWidth, gridColumnCount, rows } = args;
  if (layoutMode !== 'autofit') return false;
  if (preferredTableWidth == null || preferredTableWidth <= 0) return false;
  if (preferredColumnWidths.length === 0 || preferredColumnWidths.length !== gridColumnCount) return false;
  if (!hasNonUniformGrid(preferredColumnWidths) && !hasConcreteCellWidthRequest(rows)) return false;

  // A pct-width table re-resolves its absolute width against the CURRENT available width, so the
  // authored grid sum (from authoring-time twips) legitimately differs from the resolved table
  // width while the grid PROPORTIONS stay authoritative. Word honors those proportions (300dpi
  // probes, SD-3309); the solver scales the preferred widths to preferredTableWidth. For dxa/px
  // the grid sum already equals the table width, so the equality check below still gates those.
  if (isPercentTableWidth(tableWidth)) return true;

  return approximatelyEqual(sumWidths(preferredColumnWidths), preferredTableWidth);
}

/** True when the table preferred width is percentage-based (`tblW type="pct"`). */
function isPercentTableWidth(tableWidth: TableWidthAttr | undefined): boolean {
  return (
    typeof tableWidth === 'object' &&
    tableWidth != null &&
    typeof tableWidth.type === 'string' &&
    tableWidth.type.toLowerCase() === 'pct'
  );
}

/**
 * A "pure auto" table: autofit layout, auto/nil/absent tblW, and no cell anywhere
 * carrying a concrete width preference. For these the stored w:tblGrid is not a
 * Word layout cache (Word recomputes and content-sizes such tables on open), so
 * the solver should target content demand instead of the authored grid sum.
 * Tables already claimed by a preserve policy keep that behavior. (SD-3309)
 */
function resolveContentSizeAutoTable(args: {
  layoutMode: AutoFitLayoutMode;
  tableWidth: TableWidthAttr | undefined;
  preferredTableWidth: number | undefined;
  preferredColumnWidths: number[];
  maxTableWidth: number;
  rows: WorkingTableRowInput[];
  preserveAutoGrid: boolean;
  preserveExplicitAutoGrid: boolean;
}): boolean {
  const {
    layoutMode,
    tableWidth,
    preferredTableWidth,
    preferredColumnWidths,
    maxTableWidth,
    rows,
    preserveAutoGrid,
    preserveExplicitAutoGrid,
  } = args;
  if (layoutMode !== 'autofit') return false;
  if (preferredTableWidth != null) return false;
  if (preserveAutoGrid || preserveExplicitAutoGrid) return false;
  if (!isAutoOrNilTableWidth(tableWidth)) return false;
  if (hasConcreteCellWidthRequest(rows)) return false;
  // An authored grid WIDER than the available width is preserved as an overflow
  // (overhang) table; Word keeps those wide (SD-1239, SD-1513). Content sizing
  // only applies when the grid fits the page.
  if (sumWidths(preferredColumnWidths) > maxTableWidth + 0.5) return false;
  return true;
}

/** Auto-width semantics for content sizing: absent tblW, type=auto with no positive width, or type=nil. */
function isAutoOrNilTableWidth(tableWidth: TableWidthAttr | undefined): boolean {
  if (tableWidth == null) return true;
  if (hasAutoTableWidthSemantics(tableWidth)) return true;
  if (typeof tableWidth === 'object' && typeof tableWidth.type === 'string') {
    return tableWidth.type.toLowerCase() === 'nil';
  }
  return false;
}

/**
 * Vertical border band widths owed per column on the content-size path. Table-level
 * borders only (left edge, insideV dividers, right edge); cell-level vertical
 * variation is rare in pure-auto tables and at most under-reserves slightly.
 *
 * Word-measured rule (band-scaling probes, SD-3308): each vertical gridline grants
 * HALF its band width to each adjacent column. The painted band then sits fully
 * inside the cell box, eating the other half back from the content area, so the
 * content span shrinks by exactly the band delta while the column grows by half a
 * band per edge. A single-column table therefore widens by ONE band (half left +
 * half right), matching Word's measured column = text + margins + band.
 */
function resolveColumnBandAllowances(
  borders: TableBorders | null | undefined,
  gridColumnCount: number,
): number[] | undefined {
  if (gridColumnCount <= 0) return undefined;
  const left = getBorderBandWidthPx(borders?.left);
  const insideV = getBorderBandWidthPx(borders?.insideV);
  const right = getBorderBandWidthPx(borders?.right);
  const allowances: number[] = [];
  for (let i = 0; i < gridColumnCount; i++) {
    const edgeLeft = i === 0 ? left : insideV;
    const edgeRight = i === gridColumnCount - 1 ? right : insideV;
    allowances.push((edgeLeft + edgeRight) / 2);
  }
  return allowances.some((a) => a > 0) ? allowances : undefined;
}

function resolveAutoGridWidthBudget(args: {
  layoutMode: AutoFitLayoutMode;
  tableWidth: TableWidthAttr | undefined;
  preferredColumnWidths: number[];
  preferredTableWidth: number | undefined;
  gridColumnCount: number;
  maxTableWidth: number;
}): number | undefined {
  const { layoutMode, tableWidth, preferredColumnWidths, preferredTableWidth, gridColumnCount, maxTableWidth } = args;
  if (layoutMode !== 'autofit') return undefined;
  if (!hasAutoTableWidthSemantics(tableWidth)) return undefined;
  if (preferredTableWidth != null) return undefined;
  if (preferredColumnWidths.length === 0 || preferredColumnWidths.length !== gridColumnCount) return undefined;

  const gridWidth = sumWidths(preferredColumnWidths);
  if (gridWidth <= 0) return undefined;
  if (gridWidth > maxTableWidth + 0.5) return undefined;

  return gridWidth;
}

function hasAutoTableWidthSemantics(tableWidth: TableWidthAttr | undefined): boolean {
  if (tableWidth == null) return false;
  if (typeof tableWidth !== 'object') return false;
  const type = typeof tableWidth.type === 'string' ? tableWidth.type.toLowerCase() : undefined;
  if (type !== 'auto') return false;

  const rawWidth = tableWidth.width ?? tableWidth.value;
  return rawWidth == null || (typeof rawWidth === 'number' && Number.isFinite(rawWidth) && rawWidth <= 0);
}

function hasNonUniformGrid(widths: number[]): boolean {
  if (widths.length <= 1) return true;
  const firstWidth = widths[0];
  return widths.some((width) => !approximatelyEqual(width, firstWidth));
}

function hasConcreteCellWidthRequest(rows: WorkingTableRowInput[]): boolean {
  return rows.some((row) => row.cells.some((cell) => cell.preferredWidth != null));
}

function trimTrailingUnoccupiedPlaceholderColumns(widths: number[], occupiedGridColumnCount: number): number[] {
  const occupiedCount = Math.max(0, Math.floor(occupiedGridColumnCount));
  if (occupiedCount <= 0 || widths.length <= occupiedCount) return widths;

  const trailingWidths = widths.slice(occupiedCount);
  if (!trailingWidths.every((width) => width <= PLACEHOLDER_COLUMN_MAX_WIDTH)) {
    return widths;
  }

  return widths.slice(0, occupiedCount);
}

function resolveTrailingPlaceholderColumnLimit(widths: number[]): number | undefined {
  let trailingPlaceholderCount = 0;
  for (let index = widths.length - 1; index >= 0; index--) {
    if (widths[index] > PLACEHOLDER_COLUMN_MAX_WIDTH) break;
    trailingPlaceholderCount += 1;
  }

  if (trailingPlaceholderCount === 0 || trailingPlaceholderCount === widths.length) {
    return undefined;
  }

  return widths.length - trailingPlaceholderCount;
}

/**
 * Normalize preferred/authored grid widths into a finite pixel vector.
 */
function normalizePreferredColumnWidths(columnWidths: number[] | undefined): number[] {
  if (!Array.isArray(columnWidths)) return [];
  return columnWidths
    .map((width) => sanitizeNonNegativeNumber(width))
    .filter((width) => width !== undefined)
    .map((width) => width as number);
}

/**
 * Normalize one runtime row into explicit skipped columns plus span-aware cells.
 */
function normalizeRow(
  row: TableBlock['rows'][number],
  percentageBasis: number,
  activeRowSpans: number[],
  logicalColumnLimit: number | undefined,
): { row: WorkingTableRowInput; nextActiveRowSpans: number[] } {
  const rowProps = (row.attrs?.tableRowProperties ?? {}) as TableRowProperties;
  const skippedBeforeCount = sanitizeCount(rowProps.gridBefore);
  const skippedAfterCount = normalizeSkippedAfterCount(
    rowProps.gridAfter,
    rowProps.wAfter as OoxmlMeasurement | undefined,
    percentageBasis,
  );
  const cells = Array.isArray(row.cells) ? row.cells : [];
  let columnIndex = advancePastOccupiedColumns(activeRowSpans, 0);

  const skippedBeforePlacement = buildSkippedColumns(
    skippedBeforeCount,
    rowProps.wBefore as OoxmlMeasurement | undefined,
    percentageBasis,
    columnIndex,
    activeRowSpans,
  );
  columnIndex = skippedBeforePlacement.nextColumnIndex;

  const normalizedCells = cells.map((cell) => {
    columnIndex = advancePastOccupiedColumns(activeRowSpans, columnIndex);
    const normalizedCell = normalizeCell(cell, percentageBasis, columnIndex, logicalColumnLimit);
    columnIndex += normalizedCell.span ?? 1;
    return normalizedCell;
  });

  const skippedAfterPlacement = buildSkippedColumns(
    skippedAfterCount,
    rowProps.wAfter as OoxmlMeasurement | undefined,
    percentageBasis,
    columnIndex,
    activeRowSpans,
  );
  columnIndex = skippedAfterPlacement.nextColumnIndex;

  const logicalColumnCount = Math.max(columnIndex, resolveOccupiedLogicalColumnCount(activeRowSpans));
  const nextActiveRowSpans = advanceRowSpans(activeRowSpans);
  normalizedCells.forEach((cell, index) => {
    const rowSpan = sanitizeCount(cells[index]?.rowSpan) || 1;
    if (rowSpan > 1) {
      markRowSpanOccupancy(nextActiveRowSpans, cell.startColumn, cell.span ?? 1, rowSpan - 1);
    }
  });

  return {
    row: {
      skippedBefore: skippedBeforePlacement.columns,
      cells: normalizedCells,
      skippedAfter: skippedAfterPlacement.columns,
      skippedColumns: [...skippedBeforePlacement.columns, ...skippedAfterPlacement.columns],
      logicalColumnCount,
    },
    nextActiveRowSpans,
  };
}

/**
 * Materialize row-level skipped logical columns.
 *
 * Each skipped column has no content contribution. When a single `wBefore`/`wAfter`
 * preferred width applies to multiple skipped columns, the preferred width is
 * distributed evenly across that logical range.
 */
function buildSkippedColumns(
  count: number,
  preferredWidthMeasurement: OoxmlMeasurement | undefined,
  percentageBasis: number,
  startColumnIndex: number,
  activeRowSpans: number[],
): { columns: WorkingTableSkippedColumnInput[]; nextColumnIndex: number } {
  if (count <= 0) {
    return { columns: [], nextColumnIndex: startColumnIndex };
  }

  const totalPreferredWidth = resolveMeasurementToPx(preferredWidthMeasurement, percentageBasis);
  const perColumnPreferredWidth =
    totalPreferredWidth != null && count > 0 ? Math.max(0, totalPreferredWidth / count) : undefined;
  const columns: WorkingTableSkippedColumnInput[] = [];
  let columnIndex = startColumnIndex;

  for (let index = 0; index < count; index++) {
    columnIndex = advancePastOccupiedColumns(activeRowSpans, columnIndex);
    columns.push({
      columnIndex,
      preferredWidth: perColumnPreferredWidth,
      minContentWidth: 0,
      maxContentWidth: 0,
    });
    columnIndex += 1;
  }

  return { columns, nextColumnIndex: columnIndex };
}

function normalizeSkippedAfterCount(
  countValue: unknown,
  preferredWidthMeasurement: OoxmlMeasurement | undefined,
  percentageBasis: number,
): number {
  const count = sanitizeCount(countValue);
  if (count <= 0) return 0;

  const totalPreferredWidth = resolveMeasurementToPx(preferredWidthMeasurement, percentageBasis);
  if (totalPreferredWidth != null && totalPreferredWidth <= PLACEHOLDER_COLUMN_MAX_WIDTH * count) {
    return 0;
  }

  return count;
}

/**
 * Normalize one runtime cell into span and preferred-width metadata.
 */
function normalizeCell(
  cell: TableBlock['rows'][number]['cells'][number],
  percentageBasis: number,
  startColumn: number,
  logicalColumnLimit: number | undefined,
): WorkingTableCellInput {
  const cellProps = (cell.attrs?.tableCellProperties ?? {}) as NormalizationTableCellProperties;
  const rawSpan = sanitizeCount(cell.colSpan) || 1;
  const span =
    logicalColumnLimit != null && startColumn < logicalColumnLimit && startColumn + rawSpan > logicalColumnLimit
      ? Math.max(1, logicalColumnLimit - startColumn)
      : rawSpan;

  return {
    cellId: cell.id,
    startColumn,
    span,
    preferredWidth: resolveMeasurementToPx(cellProps.cellWidth, percentageBasis),
  };
}

function advancePastOccupiedColumns(activeRowSpans: number[], columnIndex: number): number {
  let nextColumnIndex = columnIndex;
  while ((activeRowSpans[nextColumnIndex] ?? 0) > 0) {
    nextColumnIndex += 1;
  }
  return nextColumnIndex;
}

function resolveOccupiedLogicalColumnCount(activeRowSpans: number[]): number {
  for (let index = activeRowSpans.length - 1; index >= 0; index--) {
    if ((activeRowSpans[index] ?? 0) > 0) {
      return index + 1;
    }
  }
  return 0;
}

function advanceRowSpans(activeRowSpans: number[]): number[] {
  return activeRowSpans.map((remainingRows) => Math.max(0, remainingRows - 1));
}

function markRowSpanOccupancy(
  activeRowSpans: number[],
  startColumn: number,
  span: number,
  remainingRows: number,
): void {
  const boundedSpan = Math.max(1, sanitizeCount(span));
  for (let offset = 0; offset < boundedSpan; offset++) {
    const columnIndex = startColumn + offset;
    activeRowSpans[columnIndex] = Math.max(activeRowSpans[columnIndex] ?? 0, remainingRows);
  }
}

/**
 * Determine the logical grid width required by the normalized row data.
 */
function determineGridColumnCount(preferredColumnCount: number, rows: AutoFitRowInput[]): number {
  return Math.max(
    preferredColumnCount,
    ...rows.map((row) => {
      if ('logicalColumnCount' in row && typeof row.logicalColumnCount === 'number') {
        return row.logicalColumnCount;
      }
      const skippedBefore = row.skippedBefore?.length ?? 0;
      const skippedAfter = row.skippedAfter?.length ?? 0;
      const cellSpanTotal = (row.cells ?? []).reduce((sum, cell) => sum + Math.max(1, cell.span ?? 1), 0);
      return skippedBefore + skippedAfter + cellSpanTotal;
    }),
    0,
  );
}

/**
 * Resolve a preferred table width into pixels when possible.
 */
function resolvePreferredTableWidth(tableWidth: TableWidthAttr | undefined, maxWidth: number): number | undefined {
  const resolvedWidth = resolveTableWidthAttr(tableWidth);
  if (!resolvedWidth) return undefined;
  if (resolvedWidth.type === 'pct') {
    return Math.round(maxWidth * (resolvedWidth.width / OOXML_PCT_DIVISOR));
  }
  return resolvedWidth.width;
}

/**
 * Resolve an OOXML measurement object into pixels when possible.
 *
 * Percentage widths are resolved against the table's preferred width when one
 * exists, otherwise against the current max available width. This is a v1
 * approximation for `tcW type="pct"` because the final AutoFit table width is
 * not known until after the solver runs.
 */
function resolveMeasurementToPx(
  measurement: OoxmlMeasurement | undefined,
  percentageBasis: number,
): number | undefined {
  if (!measurement || typeof measurement !== 'object' || !Number.isFinite(measurement.value)) {
    return undefined;
  }

  const value = measurement.value as number;
  switch ((measurement.type ?? 'dxa').toLowerCase()) {
    case 'dxa':
      return value / TWIPS_PER_PX;
    case 'pct':
      return Math.round(percentageBasis * (value / OOXML_PCT_DIVISOR));
    case 'px':
    case 'pixel':
      return value;
    case 'auto':
    case 'nil':
      return undefined;
    default:
      return value;
  }
}

/**
 * Normalize a count-like input into a non-negative integer.
 */
function sanitizeCount(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(value));
}

/**
 * Normalize a required positive numeric input.
 */
function sanitizePositiveNumber(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return 1;
  return value;
}

/**
 * Normalize a finite numeric input while allowing zero.
 */
function sanitizeNonNegativeNumber(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return undefined;
  return value;
}

function sumWidths(widths: number[]): number {
  return widths.reduce((sum, width) => sum + Math.max(0, width), 0);
}

function approximatelyEqual(left: number, right: number): boolean {
  return Math.abs(left - right) <= 0.01;
}

function isSlightlyUnderPreferredTableWidth(totalColumnWidth: number, preferredTableWidth: number): boolean {
  if (totalColumnWidth <= 0 || totalColumnWidth >= preferredTableWidth) return false;
  return preferredTableWidth - totalColumnWidth <= preferredTableWidth * 0.05;
}
