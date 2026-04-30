import type { WorkingTableGridInput } from './autofit-normalize.js';
import { computeFixedTableColumnWidths, type FixedLayoutResult } from './fixed-table-columns.js';

/**
 * AutoFit column width resolution for table measurement.
 *
 * Central invariant:
 * - authored widths and `tcW` values are preferred widths
 * - fixed-pass widths are the baseline for AutoFit
 * - output widths are final runtime widths
 *
 * This module is pure and pixel-based end to end. Callers must provide all
 * content metrics up front; no DOM or text measurement occurs here.
 */

/**
 * Table layout modes relevant to runtime column resolution.
 */
export type AutoFitLayoutMode = 'fixed' | 'autofit';

/**
 * Width hints for a skipped logical column contributed by row-level grid skips
 * such as `gridBefore` / `gridAfter` and `wBefore` / `wAfter`.
 */
export type AutoFitSkippedColumnInput = {
  /** Preferred width hint for the skipped logical column, in pixels. */
  preferredWidth?: number;
  /** Minimum content width contribution for the skipped logical column, in pixels. */
  minContentWidth?: number;
  /** Maximum content width contribution for the skipped logical column, in pixels. */
  maxContentWidth?: number;
};

/**
 * Normalized width inputs for a logical table cell.
 *
 * All widths are expressed in pixels and correspond to a single cell's span.
 */
export type AutoFitCellInput = {
  /** Number of logical grid columns covered by the cell. Defaults to `1`. */
  span?: number;
  /** Minimum content width for the cell after applying all possible breaks. */
  minContentWidth?: number;
  /** Maximum content width for the cell with only forced breaks applied. */
  maxContentWidth?: number;
  /** Preferred width hint equivalent to `tcW`, in pixels. */
  preferredWidth?: number;
};

/**
 * One logical row of legacy AutoFit inputs.
 *
 * This shape is kept as a compatibility surface while the runtime path is
 * migrated to the explicit fixed-pass-driven contract in Commit 7.
 */
export type AutoFitRowInput = {
  /** Skipped columns before the first concrete cell in the row. */
  skippedBefore?: AutoFitSkippedColumnInput[];
  /** Concrete cells in document order. */
  cells?: AutoFitCellInput[];
  /** Skipped columns after the last concrete cell in the row. */
  skippedAfter?: AutoFitSkippedColumnInput[];
};

/**
 * One measured concrete AutoFit cell aligned to a normalized working row.
 */
export type AutoFitContentMetricsCell = {
  /** Physical cell index within the source row. */
  cellIndex: number;
  /** Logical span width in grid columns. */
  span: number;
  /** Preferred width metadata carried into the metrics layer. */
  preferredWidth?: number;
  /** Minimum outer cell width, in pixels. */
  minContentWidth: number;
  /** Maximum outer cell width, in pixels. */
  maxContentWidth: number;
};

/**
 * One measured AutoFit row aligned to the normalized working-grid structure.
 */
export type AutoFitContentMetricsRow = {
  /** Source row index in document order. */
  rowIndex: number;
  /** Concrete measured cells in physical document order. */
  cells: AutoFitContentMetricsCell[];
};

/**
 * Stable content-metrics contract for the pure AutoFit solver.
 */
export type AutoFitContentMetricsInput = {
  /** Row/cell-indexed intrinsic width metrics. */
  rowMetrics: AutoFitContentMetricsRow[];
};

/**
 * Explicit fixed-pass-driven AutoFit input.
 */
export type ExplicitAutoFitInput = {
  /** Normalized working-grid input for the table. */
  workingInput: WorkingTableGridInput;
  /** Fixed-pass result computed from the same working-grid input. */
  fixedLayout: FixedLayoutResult;
  /** Content metrics measured against the fixed-pass baseline. */
  contentMetrics: AutoFitContentMetricsInput;
  /** Minimum fallback width assigned only to degenerate fallback outputs. */
  minColumnWidth?: number;
};

/**
 * Legacy AutoFit input shape preserved temporarily for compatibility.
 */
export type LegacyAutoFitInput = {
  /** Raw layout mode hint. Any non-`fixed` value is treated as AutoFit. */
  tableLayout?: string | null;
  /** Maximum runtime width available to the table, in pixels. */
  maxTableWidth: number;
  /** Preferred table width target, in pixels, if one exists. */
  preferredTableWidth?: number;
  /** Preferred/authored grid widths, in pixels, ordered by logical column. */
  preferredColumnWidths?: number[];
  /** Logical row inputs used for content-driven redistribution. */
  rows?: AutoFitRowInput[];
  /** Minimum fallback width assigned only to degenerate fallback outputs. */
  minColumnWidth?: number;
};

/**
 * Public AutoFit solver input.
 *
 * The explicit fixed-pass-driven shape is the target contract. The legacy shape
 * is still accepted temporarily so existing call sites can compile until the
 * runtime path is switched in the next commit.
 */
export type AutoFitInput = ExplicitAutoFitInput | LegacyAutoFitInput;

/**
 * Final runtime output from the pure AutoFit solver.
 */
export type AutoFitResult = {
  /** Resolved layout mode used for this computation. */
  layoutMode: AutoFitLayoutMode;
  /** Final runtime width of each logical column, in pixels. */
  columnWidths: number[];
  /** Sum of the final runtime width vector, in pixels. */
  totalWidth: number;
  /** Logical grid column count after any span-driven extension. */
  gridColumnCount: number;
};

type NormalizedSkippedColumn = {
  columnIndex: number;
  preferredWidth?: number;
  minContentWidth: number;
  maxContentWidth: number;
};

type NormalizedCell = {
  rowIndex: number;
  cellIndex: number;
  startColumn: number;
  span: number;
  preferredWidth?: number;
  minContentWidth: number;
  maxContentWidth: number;
};

type NormalizedRow = {
  cells: NormalizedCell[];
  skippedColumns: NormalizedSkippedColumn[];
  logicalColumnCount: number;
};

type AutoFitContext = {
  workingInput: WorkingTableGridInput;
  fixedLayout: FixedLayoutResult;
  rowMetrics: AutoFitContentMetricsRow[];
  minColumnWidth: number;
};

const DEFAULT_MIN_COLUMN_WIDTH = 8;

/**
 * Resolve final runtime column widths for a table.
 *
 * The solver follows the ECMA AutoFit guidance as closely as possible while
 * making the hybrid policy choices codified in the rework spec:
 * 1. start from the fixed-pass result
 * 2. derive min/max bounds from content metrics and preferred widths
 * 3. detect whether any cell minimum exceeds the current fixed width
 * 4. if so, shrink other columns toward minima and, when needed, grow the table
 * 5. if slack remains under `tblW`, redistribute it across remaining max ranges
 *
 * @param input - Explicit fixed-pass-driven input, or the temporary legacy shape.
 * @returns Final runtime width vector and aggregate table width.
 */
export function computeAutoFitColumnWidths(input: AutoFitInput): AutoFitResult {
  const context = resolveAutoFitContext(input);
  const { workingInput, fixedLayout, rowMetrics, minColumnWidth } = context;

  if (workingInput.layoutMode === 'fixed') {
    return finalizeResult('fixed', fixedLayout.columnWidths, minColumnWidth);
  }

  const gridColumnCount = fixedLayout.gridColumnCount;
  if (gridColumnCount === 0) {
    return buildFallbackResult(workingInput.layoutMode, minColumnWidth);
  }

  const normalizedRows = buildNormalizedRows(workingInput, rowMetrics);
  const currentWidths = fixedLayout.columnWidths.slice(0, gridColumnCount);
  const minBounds = new Array<number>(gridColumnCount).fill(0);
  const maxBounds = new Array<number>(gridColumnCount).fill(0);
  const preferredOverrides = new Array<number | undefined>(gridColumnCount).fill(undefined);
  const multiSpanCells: NormalizedCell[] = [];

  accumulateBounds({
    rows: normalizedRows,
    minBounds,
    maxBounds,
    preferredOverrides,
    multiSpanCells,
  });

  applyMultiSpanMinimums(minBounds, multiSpanCells);
  applySingleSpanPreferredOverrides(maxBounds, minBounds, preferredOverrides);
  applyMultiSpanMaximums(maxBounds, minBounds, multiSpanCells, currentWidths);

  const triggerCells = collectTriggerCells(currentWidths, multiSpanCells, normalizedRows);
  const postTriggerGrowableColumns =
    triggerCells.length > 0 ? collectNonProtectedColumns(triggerCells, gridColumnCount) : undefined;
  let resolvedWidths = currentWidths.slice();
  const preferredTableWidth = sanitizeOptionalWidth(workingInput.preferredTableWidth);
  let targetTableWidth = preferredTableWidth ?? fixedLayout.totalWidth;
  const canOverflowAvailableWidth = preferredTableWidth != null || hasCompleteAuthoredGrid(workingInput);
  const maxResolvedTableWidth = canOverflowAvailableWidth
    ? Math.max(workingInput.maxTableWidth, targetTableWidth)
    : workingInput.maxTableWidth;
  const shouldPreservePreferredGrid =
    workingInput.preserveAutoGrid === true || workingInput.preserveExplicitAutoGrid === true;

  if (triggerCells.length > 0) {
    resolvedWidths = raiseToMinimums(resolvedWidths, minBounds);
    resolvedWidths = expandTriggersWithinCurrentTable(resolvedWidths, triggerCells, minBounds, maxBounds);
    resolvedWidths = expandTriggersByGrowingTable(resolvedWidths, triggerCells, maxBounds, maxResolvedTableWidth);
    targetTableWidth = Math.max(targetTableWidth, sumWidths(resolvedWidths));
    targetTableWidth = Math.min(targetTableWidth, maxResolvedTableWidth);
  } else {
    targetTableWidth = Math.min(targetTableWidth, maxResolvedTableWidth);
    if (!shouldPreservePreferredGrid) {
      resolvedWidths = redistributeTowardMaximumsWithinCurrentTable(resolvedWidths, minBounds, maxBounds);
      resolvedWidths = redistributeTowardContentWeightedShape(resolvedWidths, minBounds, maxBounds);
    }
  }

  resolvedWidths = shrinkToTargetWidth(resolvedWidths, targetTableWidth, minBounds);
  resolvedWidths = growToTargetWidth(resolvedWidths, targetTableWidth, maxBounds, postTriggerGrowableColumns);

  if (sumWidths(resolvedWidths) < targetTableWidth) {
    resolvedWidths = distributeRemainingSlack(resolvedWidths, targetTableWidth, postTriggerGrowableColumns);
  }

  if (triggerCells.length > 0) {
    resolvedWidths = clampTriggeredSpansToTargets(resolvedWidths, triggerCells, minBounds, maxBounds, currentWidths);
  }

  if (sumWidths(resolvedWidths) > maxResolvedTableWidth) {
    resolvedWidths = shrinkToTargetWidth(resolvedWidths, maxResolvedTableWidth, minBounds);
  }

  return finalizeResult(workingInput.layoutMode, resolvedWidths, minColumnWidth);
}

function hasCompleteAuthoredGrid(workingInput: WorkingTableGridInput): boolean {
  const authoredColumnCount = workingInput.preferredColumnWidths.length;
  if (authoredColumnCount === 0) {
    return false;
  }

  return workingInput.rows.some((row) => row.logicalColumnCount >= authoredColumnCount);
}

/**
 * Convert public input into the explicit fixed-pass-driven solver context.
 */
function resolveAutoFitContext(input: AutoFitInput): AutoFitContext {
  const minColumnWidth = sanitizeWidth(input.minColumnWidth, DEFAULT_MIN_COLUMN_WIDTH);

  if (isExplicitInput(input)) {
    return {
      workingInput: input.workingInput,
      fixedLayout: input.fixedLayout,
      rowMetrics: input.contentMetrics.rowMetrics,
      minColumnWidth,
    };
  }

  const layoutMode = resolveLayoutMode(input.tableLayout);
  const normalizedRows = normalizeLegacyRows(input.rows ?? []);
  const gridColumnCount = determineGridColumnCount(input.preferredColumnWidths ?? [], normalizedRows);
  const workingInput: WorkingTableGridInput = {
    layoutMode,
    maxTableWidth: Math.max(minColumnWidth, sanitizeWidth(input.maxTableWidth, minColumnWidth)),
    preferredTableWidth: sanitizeOptionalWidth(input.preferredTableWidth),
    preferredColumnWidths: (input.preferredColumnWidths ?? []).map((width) => Math.max(0, width)),
    gridColumnCount,
    rows: normalizedRows.map((row) => ({
      skippedBefore: row.skippedColumns.filter((column) => column.columnIndex < firstCellStart(row)),
      skippedAfter: row.skippedColumns.filter((column) => column.columnIndex >= lastCellEnd(row)),
      skippedColumns: row.skippedColumns,
      cells: row.cells.map((cell) => ({
        cellId: undefined,
        startColumn: cell.startColumn,
        span: cell.span,
        preferredWidth: cell.preferredWidth,
      })),
      logicalColumnCount: row.logicalColumnCount,
    })),
  };

  const fixedLayout = computeFixedTableColumnWidths(workingInput);
  const rowMetrics: AutoFitContentMetricsRow[] = normalizedRows.map((row, rowIndex) => ({
    rowIndex,
    cells: row.cells.map((cell) => ({
      cellIndex: cell.cellIndex,
      span: cell.span,
      preferredWidth: cell.preferredWidth,
      minContentWidth: cell.minContentWidth,
      maxContentWidth: cell.maxContentWidth,
    })),
  }));

  return {
    workingInput,
    fixedLayout,
    rowMetrics,
    minColumnWidth,
  };
}

/**
 * True when the explicit fixed-pass-driven solver input is being used.
 */
function isExplicitInput(input: AutoFitInput): input is ExplicitAutoFitInput {
  return 'workingInput' in input && 'fixedLayout' in input && 'contentMetrics' in input;
}

function resolveLayoutMode(tableLayout: string | null | undefined): AutoFitLayoutMode {
  return tableLayout === 'fixed' ? 'fixed' : 'autofit';
}

/**
 * Convert legacy rows into normalized logical-grid rows with explicit starts.
 */
function normalizeLegacyRows(rows: AutoFitRowInput[]): NormalizedRow[] {
  return rows.map((row, rowIndex) => {
    let columnIndex = 0;
    const skippedColumns: NormalizedSkippedColumn[] = [];
    const cells: NormalizedCell[] = [];

    for (const skipped of row.skippedBefore ?? []) {
      skippedColumns.push(normalizeSkippedColumn(skipped, columnIndex));
      columnIndex += 1;
    }

    for (let cellIndex = 0; cellIndex < (row.cells ?? []).length; cellIndex++) {
      const cell = row.cells?.[cellIndex];
      if (!cell) continue;
      const span = Math.max(1, Math.floor(cell.span ?? 1));
      cells.push({
        rowIndex,
        cellIndex,
        startColumn: columnIndex,
        span,
        preferredWidth: sanitizeOptionalWidth(cell.preferredWidth),
        minContentWidth: Math.max(0, cell.minContentWidth ?? 0),
        maxContentWidth: Math.max(0, cell.maxContentWidth ?? cell.minContentWidth ?? 0),
      });
      columnIndex += span;
    }

    for (const skipped of row.skippedAfter ?? []) {
      skippedColumns.push(normalizeSkippedColumn(skipped, columnIndex));
      columnIndex += 1;
    }

    return {
      cells,
      skippedColumns,
      logicalColumnCount: columnIndex,
    };
  });
}

function normalizeSkippedColumn(skipped: AutoFitSkippedColumnInput, columnIndex: number): NormalizedSkippedColumn {
  return {
    columnIndex,
    preferredWidth: sanitizeOptionalWidth(skipped.preferredWidth),
    minContentWidth: Math.max(0, skipped.minContentWidth ?? 0),
    maxContentWidth: Math.max(0, skipped.maxContentWidth ?? skipped.minContentWidth ?? 0),
  };
}

/**
 * Align measured row/cell metrics to the normalized working-grid placement.
 */
function buildNormalizedRows(
  workingInput: WorkingTableGridInput,
  rowMetrics: AutoFitContentMetricsRow[],
): NormalizedRow[] {
  return workingInput.rows.map((workingRow, rowIndex) => {
    const metricsRow = rowMetrics[rowIndex];
    return {
      cells: (workingRow.cells ?? []).map((cell, cellIndex) => {
        const metrics = metricsRow?.cells[cellIndex];
        const placedCell = cell as { startColumn: number; span?: number; preferredWidth?: number };
        return {
          rowIndex,
          cellIndex: metrics?.cellIndex ?? cellIndex,
          startColumn: placedCell.startColumn,
          span: Math.max(1, placedCell.span ?? metrics?.span ?? 1),
          preferredWidth: sanitizeOptionalWidth(metrics?.preferredWidth ?? placedCell.preferredWidth),
          minContentWidth: Math.max(0, metrics?.minContentWidth ?? 0),
          maxContentWidth: Math.max(0, metrics?.maxContentWidth ?? metrics?.minContentWidth ?? 0),
        };
      }),
      skippedColumns: (workingRow.skippedColumns ?? []).map((skipped) => ({
        columnIndex: skipped.columnIndex,
        preferredWidth: sanitizeOptionalWidth(skipped.preferredWidth),
        minContentWidth: Math.max(0, skipped.minContentWidth ?? 0),
        maxContentWidth: Math.max(0, skipped.maxContentWidth ?? skipped.minContentWidth ?? 0),
      })),
      logicalColumnCount: workingRow.logicalColumnCount,
    };
  });
}

/**
 * Gather per-column min/max bounds and first preferred overrides.
 */
function accumulateBounds(args: {
  rows: NormalizedRow[];
  minBounds: number[];
  maxBounds: number[];
  preferredOverrides: Array<number | undefined>;
  multiSpanCells: NormalizedCell[];
}): void {
  const { rows, minBounds, maxBounds, preferredOverrides, multiSpanCells } = args;

  for (const row of rows) {
    for (const skipped of row.skippedColumns) {
      minBounds[skipped.columnIndex] = Math.max(minBounds[skipped.columnIndex], skipped.minContentWidth);
      maxBounds[skipped.columnIndex] = Math.max(maxBounds[skipped.columnIndex], skipped.maxContentWidth);
      if (preferredOverrides[skipped.columnIndex] == null && skipped.preferredWidth != null) {
        preferredOverrides[skipped.columnIndex] = skipped.preferredWidth;
      }
    }

    for (const cell of row.cells) {
      if (cell.span === 1) {
        minBounds[cell.startColumn] = Math.max(minBounds[cell.startColumn], cell.minContentWidth);
        maxBounds[cell.startColumn] = Math.max(maxBounds[cell.startColumn], cell.maxContentWidth);
        if (preferredOverrides[cell.startColumn] == null && cell.preferredWidth != null) {
          preferredOverrides[cell.startColumn] = cell.preferredWidth;
        }
      } else {
        multiSpanCells.push(cell);
      }
    }
  }
}

/**
 * Enforce multi-span minimum content widths by enlarging the participating
 * column minima until each spanned minimum is satisfied.
 */
function applyMultiSpanMinimums(minBounds: number[], cells: NormalizedCell[]): void {
  for (const cell of cells) {
    growSpanTotal(minBounds, cell.startColumn, cell.span, cell.minContentWidth);
  }
}

/**
 * Apply first-wins preferred overrides for single-span cells and skipped columns.
 */
function applySingleSpanPreferredOverrides(
  maxBounds: number[],
  minBounds: number[],
  preferredOverrides: Array<number | undefined>,
): void {
  for (let index = 0; index < maxBounds.length; index++) {
    const currentMax = Math.max(maxBounds[index], minBounds[index]);
    maxBounds[index] = preferredOverrides[index] ?? currentMax;
    maxBounds[index] = Math.max(maxBounds[index], minBounds[index]);
  }
}

/**
 * Apply multi-span maximum and preferred-width semantics.
 *
 * Preferred widths act as preferred total span maxima in both directions:
 * - if the preferred total is larger than the current span maximum, the span grows
 * - if the preferred total is smaller, reducible range is removed proportionally
 */
function applyMultiSpanMaximums(
  maxBounds: number[],
  minBounds: number[],
  cells: NormalizedCell[],
  fixedWidths: number[],
): void {
  for (const cell of cells) {
    const targetTotal =
      cell.preferredWidth != null
        ? Math.max(cell.preferredWidth, sumSpan(minBounds, cell.startColumn, cell.span))
        : Math.max(cell.maxContentWidth, sumSpan(minBounds, cell.startColumn, cell.span));

    setSpanTotal(maxBounds, minBounds, fixedWidths, cell.startColumn, cell.span, targetTotal);
  }
}

/**
 * Collect every cell whose minimum width exceeds the current fixed-pass width.
 */
function collectTriggerCells(
  currentWidths: number[],
  multiSpanCells: NormalizedCell[],
  rows: NormalizedRow[],
): NormalizedCell[] {
  const triggers: NormalizedCell[] = [];

  for (const row of rows) {
    for (const cell of row.cells) {
      if (sumSpan(currentWidths, cell.startColumn, cell.span) < cell.minContentWidth) {
        triggers.push(cell);
      }
    }
  }

  for (const cell of multiSpanCells) {
    if (sumSpan(currentWidths, cell.startColumn, cell.span) < cell.minContentWidth) {
      triggers.push(cell);
    }
  }

  return coalesceEquivalentTriggerCells(dedupeCells(triggers));
}

/**
 * Reduce a span total by distributing reduction across reducible column ranges
 * or grow it by distributing extra across the span proportionally to fixed-pass
 * widths.
 */
function setSpanTotal(
  widths: number[],
  minBounds: number[],
  fixedWidths: number[],
  startColumn: number,
  span: number,
  targetTotal: number,
): void {
  const currentTotal = sumSpan(widths, startColumn, span);
  const minTotal = sumSpan(minBounds, startColumn, span);
  const boundedTarget = Math.max(targetTotal, minTotal);

  if (currentTotal < boundedTarget) {
    growSpanTotal(widths, startColumn, span, boundedTarget, fixedWidths);
    return;
  }

  if (currentTotal === boundedTarget) {
    return;
  }

  const reducibleRanges = collectSpanRanges(widths, minBounds, startColumn, span);
  const totalReducible = reducibleRanges.reduce((sum, range) => sum + range.amount, 0);
  if (totalReducible <= 0) {
    return;
  }

  const reduction = currentTotal - boundedTarget;
  let applied = 0;
  for (let rangeIndex = 0; rangeIndex < reducibleRanges.length; rangeIndex++) {
    const range = reducibleRanges[rangeIndex];
    const portion =
      rangeIndex === reducibleRanges.length - 1 ? reduction - applied : reduction * (range.amount / totalReducible);
    widths[range.index] = Math.max(minBounds[range.index], widths[range.index] - portion);
    applied += portion;
  }
}

/**
 * Grow a span total by distributing extra width across the covered columns.
 *
 * Fixed-pass widths are used as the primary weighting so the AutoFit growth
 * stays anchored to the fixed baseline. When the fixed baseline carries no
 * weight, growth falls back to equal distribution.
 */
function growSpanTotal(
  widths: number[],
  startColumn: number,
  span: number,
  targetTotal: number,
  fixedWidths?: number[],
): void {
  const currentTotal = sumSpan(widths, startColumn, span);
  const deficit = targetTotal - currentTotal;
  if (deficit <= 0) return;

  const weights = Array.from({ length: span }, (_, offset) => {
    const index = startColumn + offset;
    return Math.max(fixedWidths?.[index] ?? 0, widths[index] ?? 0, 1);
  });
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);

  let applied = 0;
  for (let offset = 0; offset < span; offset++) {
    const index = startColumn + offset;
    const increment = offset === span - 1 ? deficit - applied : deficit * (weights[offset] / totalWeight);
    widths[index] = Math.max(0, (widths[index] ?? 0) + increment);
    applied += increment;
  }
}

/**
 * Shrink the current width vector toward a target using shrink-capacity-based
 * proportional reduction.
 */
function shrinkToTargetWidth(widths: number[], targetWidth: number, minBounds: number[]): number[] {
  const currentTotal = sumWidths(widths);
  if (currentTotal <= targetWidth) {
    return widths;
  }

  const minTotal = sumWidths(minBounds);
  if (targetWidth <= 0) {
    return widths;
  }

  if (targetWidth < minTotal) {
    return scaleToTargetWidth(widths, targetWidth);
  }

  const capacities = widths.map((width, index) => Math.max(0, width - minBounds[index]));
  const totalCapacity = capacities.reduce((sum, capacity) => sum + capacity, 0);
  if (totalCapacity <= 0) {
    return widths;
  }

  const excess = currentTotal - targetWidth;
  return widths.map((width, index) => {
    const shrink = excess * (capacities[index] / totalCapacity);
    return Math.max(minBounds[index], width - shrink);
  });
}

/**
 * Grow the current width vector toward a target using remaining `(max-current)`
 * range as the proportional basis.
 */
function growToTargetWidth(
  widths: number[],
  targetWidth: number,
  maxBounds: number[],
  growableColumns?: Set<number>,
): number[] {
  const currentTotal = sumWidths(widths);
  if (currentTotal >= targetWidth) {
    return widths;
  }

  const ranges = widths.map((width, index) =>
    growableColumns == null || growableColumns.has(index) ? Math.max(0, maxBounds[index] - width) : 0,
  );
  const totalRange = ranges.reduce((sum, range) => sum + range, 0);
  if (totalRange <= 0) {
    return widths;
  }

  const slack = targetWidth - currentTotal;
  return widths.map((width, index) => width + slack * (ranges[index] / totalRange));
}

/**
 * Distribute any remaining slack proportionally across all columns.
 *
 * This is the hybrid follow-up step that keeps the table at `tblW` when the
 * initial trigger handling leaves the width vector underfilled.
 */
function distributeRemainingSlack(widths: number[], targetWidth: number, growableColumns?: Set<number>): number[] {
  const currentTotal = sumWidths(widths);
  if (currentTotal >= targetWidth) {
    return widths;
  }

  const basis = widths.reduce((sum, width, index) => {
    if (growableColumns != null && !growableColumns.has(index)) {
      return sum;
    }
    return sum + Math.max(width, 1);
  }, 0);
  const slack = targetWidth - currentTotal;
  if (basis <= 0) {
    if (growableColumns == null) {
      return widths;
    }

    const growableIndexes = widths.map((_, index) => index).filter((index) => growableColumns.has(index));
    if (growableIndexes.length === 0) {
      return widths;
    }

    const share = slack / growableIndexes.length;
    return widths.map((width, index) => (growableColumns.has(index) ? width + share : width));
  }

  return widths.map((width, index) => {
    if (growableColumns != null && !growableColumns.has(index)) {
      return width;
    }
    return width + slack * (Math.max(width, 1) / basis);
  });
}

/**
 * Raise any columns below their minimum by borrowing width from columns that
 * still have shrink capacity above their own minimum.
 *
 * This is the first step of the ECMA override flow for constrained cells:
 * before the table grows wider, other columns are reduced toward their minima.
 */
function raiseToMinimums(widths: number[], minBounds: number[]): number[] {
  const next = widths.slice();
  const deficits = next.map((width, index) => Math.max(0, minBounds[index] - width));
  const totalDeficit = deficits.reduce((sum, deficit) => sum + deficit, 0);
  if (totalDeficit <= 0) {
    return next;
  }

  const capacities = next.map((width, index) => Math.max(0, width - minBounds[index]));
  const totalCapacity = capacities.reduce((sum, capacity) => sum + capacity, 0);
  const borrowAmount = Math.min(totalDeficit, totalCapacity);

  if (borrowAmount > 0 && totalCapacity > 0) {
    let borrowed = 0;
    for (let index = 0; index < next.length; index++) {
      const reduction =
        index === next.length - 1 ? borrowAmount - borrowed : borrowAmount * (capacities[index] / totalCapacity);
      next[index] = Math.max(minBounds[index], next[index] - reduction);
      borrowed += reduction;
    }
  }

  for (let index = 0; index < next.length; index++) {
    next[index] = Math.max(next[index], Math.min(minBounds[index], widths[index] + deficits[index]));
  }

  return next;
}

/**
 * Redistribute width toward column-level maximums while keeping the current
 * table width fixed.
 *
 * This covers the AutoFit case where no column violates its minimum width, but
 * one or more columns still sit below their no-wrap maximums and other columns
 * have spare width above their minima. Word does this for ordinary content such
 * as the "Human Plasma (long text)" case even though no `min-content` trigger
 * fires.
 */
function redistributeTowardMaximumsWithinCurrentTable(
  widths: number[],
  minBounds: number[],
  maxBounds: number[],
): number[] {
  const next = widths.slice();

  for (let iteration = 0; iteration < 8; iteration++) {
    const receiverHeadrooms = next.map((width, index) => Math.max(0, maxBounds[index] - width));
    const totalReceiverHeadroom = receiverHeadrooms.reduce((sum, headroom) => sum + headroom, 0);
    if (totalReceiverHeadroom <= 0.001) {
      break;
    }

    const donorCapacities = next.map((width, index) =>
      receiverHeadrooms[index] > 0.001 ? 0 : Math.max(0, width - minBounds[index]),
    );
    let totalDonorCapacity = donorCapacities.reduce((sum, capacity) => sum + capacity, 0);

    if (totalDonorCapacity <= 0.001) {
      for (let index = 0; index < next.length; index++) {
        donorCapacities[index] = Math.max(0, next[index] - minBounds[index]);
      }
      totalDonorCapacity = donorCapacities.reduce((sum, capacity) => sum + capacity, 0);
    }

    if (totalDonorCapacity <= 0.001) {
      break;
    }

    const redistribution = Math.min(totalReceiverHeadroom, totalDonorCapacity);
    shrinkColumnsByCapacity(next, donorCapacities, minBounds, redistribution);
    growColumnsByHeadroom(next, receiverHeadrooms, redistribution);
  }

  return next;
}

/**
 * Redistribute a fixed-width AutoFit table beyond strict `max-content` caps
 * using a content-demand-weighted target shape.
 *
 * Word does not always stop once every column reaches its measured no-wrap
 * width. In customer documents such as `test-blank-autofit2.docx`, Word keeps
 * the table at the same total width but still shifts more width into the
 * highest-demand column, producing a visually different distribution from a
 * strict `max-content` stop. This phase models that behavior by:
 * - preserving the current total table width exactly
 * - preserving every column minimum
 * - redistributing the width above minima using content-demand weights
 *
 * The weights intentionally bias larger-demand columns more strongly than a
 * linear share by squaring each column's content-demand signal. This is an
 * observed-Word-parity heuristic rather than a literal ECMA rule.
 *
 * @param widths - Current fixed-total width vector after no-wrap fitting.
 * @param minBounds - Per-column minimum widths that may not be violated.
 * @param maxBounds - Per-column content-demand widths used as weighting input.
 * @returns A reshaped width vector with the same total width.
 */
function redistributeTowardContentWeightedShape(widths: number[], minBounds: number[], maxBounds: number[]): number[] {
  const currentTotal = sumWidths(widths);
  const minTotal = sumWidths(minBounds);
  const distributableWidth = currentTotal - minTotal;

  if (distributableWidth <= 0.001 || widths.length === 0) {
    return widths;
  }

  const demandWeights = widths.map((width, index) => {
    const demand = Math.max(maxBounds[index], width, minBounds[index], 1);
    return demand * demand;
  });
  const totalDemandWeight = demandWeights.reduce((sum, weight) => sum + weight, 0);

  if (totalDemandWeight <= 0.001) {
    return widths;
  }

  return widths.map((_, index) => minBounds[index] + distributableWidth * (demandWeights[index] / totalDemandWeight));
}

/**
 * Continue the ECMA override flow after minimum satisfaction by shrinking
 * non-trigger columns toward their minima so constrained spans can move toward
 * their maximum widths while staying within the current table width.
 */
function expandTriggersWithinCurrentTable(
  widths: number[],
  triggerCells: NormalizedCell[],
  minBounds: number[],
  maxBounds: number[],
): number[] {
  const next = widths.slice();
  const protectedColumns = collectProtectedColumns(triggerCells);

  for (let iteration = 0; iteration < 8; iteration++) {
    const headrooms = collectTriggerHeadrooms(next, triggerCells, maxBounds);
    const totalHeadroom = headrooms.reduce((sum, headroom) => sum + headroom, 0);
    if (totalHeadroom <= 0.001) {
      break;
    }

    const donorCapacities = next.map((width, index) =>
      protectedColumns.has(index) ? 0 : Math.max(0, width - minBounds[index]),
    );
    const totalDonorCapacity = donorCapacities.reduce((sum, capacity) => sum + capacity, 0);
    if (totalDonorCapacity <= 0.001) {
      break;
    }

    const borrowedWidth = Math.min(totalHeadroom, totalDonorCapacity);
    shrinkColumnsByCapacity(next, donorCapacities, minBounds, borrowedWidth);
    applyTriggerGrowth(next, triggerCells, maxBounds, borrowedWidth);
  }

  return next;
}

/**
 * When constrained spans still have headroom after all non-trigger shrink
 * capacity has been consumed, grow the table itself up to the available page
 * width and allocate that extra width to the triggered spans.
 */
function expandTriggersByGrowingTable(
  widths: number[],
  triggerCells: NormalizedCell[],
  maxBounds: number[],
  maxTableWidth: number,
): number[] {
  const next = widths.slice();

  for (let iteration = 0; iteration < 8; iteration++) {
    const headrooms = collectTriggerHeadrooms(next, triggerCells, maxBounds);
    const totalHeadroom = headrooms.reduce((sum, headroom) => sum + headroom, 0);
    if (totalHeadroom <= 0.001) {
      break;
    }

    const remainingTableGrowth = Math.max(0, maxTableWidth - sumWidths(next));
    if (remainingTableGrowth <= 0.001) {
      break;
    }

    const growth = Math.min(totalHeadroom, remainingTableGrowth);
    applyTriggerGrowth(next, triggerCells, maxBounds, growth);
  }

  return next;
}

/**
 * Measure remaining trigger-span headroom against the current width vector.
 */
function collectTriggerHeadrooms(widths: number[], triggerCells: NormalizedCell[], maxBounds: number[]): number[] {
  return triggerCells.map((cell) => {
    const currentTotal = sumSpan(widths, cell.startColumn, cell.span);
    const targetTotal = resolveTriggerTargetTotal(cell, maxBounds);
    return Math.max(0, targetTotal - currentTotal);
  });
}

/**
 * Resolve the ECMA "grow between minimum and maximum width" target for a
 * triggered cell.
 *
 * Single-span cells use the column-level maximum after preferred-width
 * overrides. Multi-span cells grow toward their own preferred-total or content
 * maximum, rather than the sum of overlapping per-column maxima.
 */
function resolveTriggerTargetTotal(cell: NormalizedCell, maxBounds: number[]): number {
  if (cell.span === 1) {
    return maxBounds[cell.startColumn] ?? cell.maxContentWidth;
  }

  return cell.preferredWidth != null
    ? Math.max(cell.preferredWidth, cell.minContentWidth)
    : Math.max(cell.maxContentWidth, cell.minContentWidth);
}

/**
 * Track every logical column covered by a triggered span so only "other"
 * columns are used as donors during the intra-table shrink phase.
 */
function collectProtectedColumns(cells: NormalizedCell[]): Set<number> {
  const protectedColumns = new Set<number>();
  for (const cell of cells) {
    for (let offset = 0; offset < cell.span; offset++) {
      protectedColumns.add(cell.startColumn + offset);
    }
  }
  return protectedColumns;
}

/**
 * Columns outside every triggered span remain eligible for post-trigger slack
 * redistribution. Triggered columns have already been resolved explicitly and
 * should not receive additional blind growth.
 */
function collectNonProtectedColumns(cells: NormalizedCell[], columnCount: number): Set<number> {
  const protectedColumns = collectProtectedColumns(cells);
  const growableColumns = new Set<number>();
  for (let index = 0; index < columnCount; index++) {
    if (!protectedColumns.has(index)) {
      growableColumns.add(index);
    }
  }
  return growableColumns;
}

/**
 * Shrink donor columns proportionally to their remaining shrink capacity.
 */
function shrinkColumnsByCapacity(
  widths: number[],
  capacities: number[],
  minBounds: number[],
  shrinkAmount: number,
): void {
  const totalCapacity = capacities.reduce((sum, capacity) => sum + capacity, 0);
  if (totalCapacity <= 0 || shrinkAmount <= 0) {
    return;
  }

  let applied = 0;
  for (let index = 0; index < widths.length; index++) {
    const reduction =
      index === widths.length - 1 ? shrinkAmount - applied : shrinkAmount * (capacities[index] / totalCapacity);
    widths[index] = Math.max(minBounds[index], widths[index] - reduction);
    applied += reduction;
  }
}

/**
 * Grow columns proportionally to their remaining headroom to maximum.
 */
function growColumnsByHeadroom(widths: number[], headrooms: number[], growthAmount: number): void {
  const totalHeadroom = headrooms.reduce((sum, headroom) => sum + headroom, 0);
  if (totalHeadroom <= 0 || growthAmount <= 0) {
    return;
  }

  let applied = 0;
  const activeIndexes = headrooms
    .map((headroom, index) => ({ headroom, index }))
    .filter((entry) => entry.headroom > 0.001);

  for (let activeIndex = 0; activeIndex < activeIndexes.length; activeIndex++) {
    const { index, headroom } = activeIndexes[activeIndex];
    const growth =
      activeIndex === activeIndexes.length - 1 ? growthAmount - applied : growthAmount * (headroom / totalHeadroom);
    widths[index] += Math.min(headroom, growth);
    applied += Math.min(headroom, growth);
  }
}

/**
 * Grow triggered spans proportionally to their remaining headroom.
 *
 * Headroom is recomputed after each allocation round so overlapping spans do
 * not double-spend shared-column growth from a stale snapshot.
 */
function applyTriggerGrowth(
  widths: number[],
  triggerCells: NormalizedCell[],
  maxBounds: number[],
  growthAmount: number,
): void {
  let remainingGrowth = growthAmount;
  for (let iteration = 0; iteration < 16 && remainingGrowth > 0.001; iteration++) {
    const headrooms = collectTriggerHeadrooms(widths, triggerCells, maxBounds);
    const totalHeadroom = headrooms.reduce((sum, headroom) => sum + headroom, 0);
    if (totalHeadroom <= 0.001) {
      break;
    }

    const stepGrowth = Math.min(remainingGrowth, totalHeadroom);
    const activeIndexes = headrooms
      .map((headroom, index) => ({ headroom, index }))
      .filter((entry) => entry.headroom > 0.001);

    let appliedThisRound = 0;
    for (let activeIndex = 0; activeIndex < activeIndexes.length; activeIndex++) {
      const { index, headroom } = activeIndexes[activeIndex];
      const cell = triggerCells[index];
      const proportionalGrowth =
        activeIndex === activeIndexes.length - 1
          ? stepGrowth - appliedThisRound
          : stepGrowth * (headroom / totalHeadroom);
      const boundedGrowth = Math.min(headroom, proportionalGrowth);
      if (boundedGrowth <= 0) {
        continue;
      }

      growSpanTotal(widths, cell.startColumn, cell.span, sumSpan(widths, cell.startColumn, cell.span) + boundedGrowth);
      appliedThisRound += boundedGrowth;
    }

    if (appliedThisRound <= 0.001) {
      break;
    }

    remainingGrowth -= appliedThisRound;
  }
}

/**
 * Re-clamp triggered spans to their resolved cell-level maximum targets.
 *
 * Overlapping triggered spans can accumulate later redistribution noise even
 * after iterative growth. This pass keeps the final vector bounded by each
 * trigger cell's own maximum target before the result is returned.
 */
function clampTriggeredSpansToTargets(
  widths: number[],
  triggerCells: NormalizedCell[],
  minBounds: number[],
  maxBounds: number[],
  fixedWidths: number[],
): number[] {
  const next = widths.slice();

  for (let iteration = 0; iteration < 8; iteration++) {
    let changed = false;
    for (const cell of triggerCells) {
      const currentTotal = sumSpan(next, cell.startColumn, cell.span);
      const targetTotal = resolveTriggerTargetTotal(cell, maxBounds);
      if (currentTotal > targetTotal + 0.001) {
        setSpanTotal(next, minBounds, fixedWidths, cell.startColumn, cell.span, targetTotal);
        changed = true;
      }
    }

    if (!changed) {
      break;
    }
  }

  return next;
}

function collectSpanRanges(
  widths: number[],
  minBounds: number[],
  startColumn: number,
  span: number,
): Array<{ index: number; amount: number }> {
  const ranges: Array<{ index: number; amount: number }> = [];
  for (let offset = 0; offset < span; offset++) {
    const index = startColumn + offset;
    const amount = Math.max(0, widths[index] - minBounds[index]);
    if (amount > 0) {
      ranges.push({ index, amount });
    }
  }
  return ranges;
}

function dedupeCells(cells: NormalizedCell[]): NormalizedCell[] {
  const seen = new Set<string>();
  return cells.filter((cell) => {
    const key = `${cell.rowIndex}:${cell.startColumn}:${cell.span}:${cell.cellIndex}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function coalesceEquivalentTriggerCells(cells: NormalizedCell[]): NormalizedCell[] {
  const strongestBySpan = new Map<string, NormalizedCell>();

  for (const cell of cells) {
    const key = `${cell.startColumn}:${cell.span}`;
    const current = strongestBySpan.get(key);
    if (!current || resolveTriggerStrength(cell) > resolveTriggerStrength(current)) {
      strongestBySpan.set(key, cell);
    }
  }

  return [...strongestBySpan.values()];
}

function resolveTriggerStrength(cell: NormalizedCell): number {
  return cell.preferredWidth != null
    ? Math.max(cell.preferredWidth, cell.minContentWidth)
    : Math.max(cell.maxContentWidth, cell.minContentWidth);
}

function determineGridColumnCount(preferredColumnWidths: number[], rows: NormalizedRow[]): number {
  return Math.max(preferredColumnWidths.length, ...rows.map((row) => row.logicalColumnCount), 0);
}

function firstCellStart(row: NormalizedRow): number {
  return row.cells[0]?.startColumn ?? row.logicalColumnCount;
}

function lastCellEnd(row: NormalizedRow): number {
  const lastCell = row.cells[row.cells.length - 1];
  return lastCell ? lastCell.startColumn + lastCell.span : 0;
}

function sumSpan(widths: number[], startColumn: number, span: number): number {
  let total = 0;
  for (let offset = 0; offset < span; offset++) {
    total += widths[startColumn + offset] ?? 0;
  }
  return total;
}

function sumWidths(widths: number[]): number {
  return widths.reduce((sum, width) => sum + Math.max(0, width), 0);
}

function scaleToTargetWidth(widths: number[], targetWidth: number): number[] {
  const currentTotal = sumWidths(widths);
  if (currentTotal <= 0 || targetWidth <= 0) {
    return widths;
  }

  const scale = targetWidth / currentTotal;
  return widths.map((width) => Math.max(0, width * scale));
}

function sanitizeWidth(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback;
}

function sanitizeOptionalWidth(value: number | undefined): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined;
}

function buildFallbackResult(layoutMode: AutoFitLayoutMode, minColumnWidth: number): AutoFitResult {
  return {
    layoutMode,
    columnWidths: [minColumnWidth],
    totalWidth: minColumnWidth,
    gridColumnCount: 1,
  };
}

function finalizeResult(layoutMode: AutoFitLayoutMode, widths: number[], minColumnWidth: number): AutoFitResult {
  if (widths.length === 0) {
    return buildFallbackResult(layoutMode, minColumnWidth);
  }

  return {
    layoutMode,
    columnWidths: widths,
    totalWidth: sumWidths(widths),
    gridColumnCount: widths.length,
  };
}
