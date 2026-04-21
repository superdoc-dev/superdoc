/**
 * AutoFit column width resolution for table measurement.
 *
 * Central invariant:
 * - input widths are preferred widths
 * - output widths are final runtime widths
 *
 * This module is pure and pixel-based end to end. Callers must provide all
 * content metrics up front; no DOM or text measurement occurs here.
 */

/**
 * Table layout modes relevant to runtime column resolution.
 *
 * - `fixed`: preserve preferred grid widths as the primary source of truth
 * - `autofit`: allow content metrics and preferred widths to reshape the grid
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
 * One logical row of AutoFit inputs.
 *
 * Rows can include skipped leading/trailing columns so the algorithm can operate
 * on a logical grid without depending on placeholder cells.
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
 * Pure AutoFit solver input.
 *
 * The caller is responsible for converting imported/runtime table data into
 * this model and for supplying content metrics in pixels.
 */
export type AutoFitInput = {
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
  /** Minimum fallback width assigned to any output column, in pixels. */
  minColumnWidth?: number;
};

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

const DEFAULT_MIN_COLUMN_WIDTH = 8;

/**
 * Resolve final runtime column widths for a table.
 *
 * The solver follows a simplified Word/ECMA-style process:
 * 1. Resolve layout mode.
 * 2. Build a logical working grid from preferred widths and row structure.
 * 3. Seed fixed/preferred widths.
 * 4. Accumulate single-span minimum/maximum content widths.
 * 5. Expand multi-span cells to satisfy minimum and maximum requirements.
 * 6. Apply preferred-width overrides.
 * 7. Distribute toward a preferred table width, if present.
 * 8. Clamp the result to the section/container width.
 *
 * @param input - Pure pixel-based AutoFit inputs.
 * @returns Final runtime width vector and aggregate table width.
 */
export function computeAutoFitColumnWidths(input: AutoFitInput): AutoFitResult {
  const layoutMode = resolveLayoutMode(input.tableLayout);
  const minColumnWidth = sanitizeWidth(input.minColumnWidth, DEFAULT_MIN_COLUMN_WIDTH);
  const maxTableWidth = Math.max(minColumnWidth, sanitizeWidth(input.maxTableWidth, minColumnWidth));
  const preferredTableWidth = sanitizeOptionalWidth(input.preferredTableWidth);

  const normalizedRows = normalizeRows(input.rows ?? []);
  const gridColumnCount = determineGridColumnCount(input.preferredColumnWidths ?? [], normalizedRows);

  if (gridColumnCount === 0) {
    return buildFallbackResult(layoutMode, minColumnWidth);
  }

  const workingColumnWidths = buildWorkingGrid(input.preferredColumnWidths ?? [], gridColumnCount);
  const singleSpanMin = new Array<number>(gridColumnCount).fill(0);
  const singleSpanMax = new Array<number>(gridColumnCount).fill(0);
  const preferredOverrides = new Array<number | undefined>(gridColumnCount).fill(undefined);
  const multiSpanCells: NormalizedCell[] = [];

  accumulateBounds({
    rows: normalizedRows,
    singleSpanMin,
    singleSpanMax,
    preferredOverrides,
    multiSpanCells,
  });

  if (layoutMode === 'fixed') {
    let fixedWidths = [...workingColumnWidths];
    fixedWidths = applySingleSpanPreferredOverrides(fixedWidths, preferredOverrides);
    fixedWidths = applyMultiSpanPreferredWidths(fixedWidths, multiSpanCells);
    fixedWidths = ensureNonZeroWidthFloor(fixedWidths, minColumnWidth);
    fixedWidths = scaleToTargetWidth(fixedWidths, preferredTableWidth);
    fixedWidths = clampToWidth(fixedWidths, maxTableWidth, new Array<number>(fixedWidths.length).fill(minColumnWidth));
    return finalizeResult(layoutMode, fixedWidths, minColumnWidth);
  }

  const minWidths = singleSpanMin.map((value) => Math.max(value, 0));
  let maxWidths = singleSpanMax.map((value, index) => Math.max(value, workingColumnWidths[index], minWidths[index]));

  applyMultiSpanMinimums(minWidths, multiSpanCells);
  applyMultiSpanMaximums(maxWidths, multiSpanCells, minWidths);
  maxWidths = applySingleSpanPreferredOverrides(maxWidths, preferredOverrides);
  maxWidths = applyMultiSpanPreferredWidths(maxWidths, multiSpanCells);

  /**
   * AutoFit uses the authored/preferred grid as its baseline seed, then applies
   * content minima/maxima and preferred-width overrides in the same solver pass.
   *
   * This intentionally does not run a separate "fixed baseline first" pass and
   * then feed that intermediate vector back into AutoFit. For the current
   * implementation, `workingColumnWidths` remains the fixed-style seed and the
   * later preferred-width / table-width resolution stages reconcile conflicts.
   *
   * A dedicated conflict-case test locks this behavior so future changes can
   * make the equivalence question explicit instead of changing it accidentally.
   */
  let resolvedWidths = maxWidths.map((value, index) =>
    Math.max(value, minWidths[index], workingColumnWidths[index], 0),
  );
  resolvedWidths = ensureNonZeroWidthFloor(resolvedWidths, minColumnWidth);

  const runtimeMinWidths = minWidths.map((value) => Math.max(value, minColumnWidth));

  if (preferredTableWidth != null) {
    const target = Math.min(preferredTableWidth, maxTableWidth);
    resolvedWidths = resolvePreferredTableWidth(resolvedWidths, target, runtimeMinWidths, minColumnWidth);
  }

  resolvedWidths = clampToWidth(resolvedWidths, maxTableWidth, runtimeMinWidths);
  return finalizeResult(layoutMode, resolvedWidths, minColumnWidth);
}

function resolveLayoutMode(tableLayout: string | null | undefined): AutoFitLayoutMode {
  return tableLayout === 'fixed' ? 'fixed' : 'autofit';
}

/**
 * Normalize a required width-like value, falling back when the input is absent,
 * non-finite, or non-positive.
 */
function sanitizeWidth(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback;
}

/**
 * Normalize an optional width-like value, returning `undefined` when the input
 * is absent, non-finite, or non-positive.
 */
function sanitizeOptionalWidth(value: number | undefined): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined;
}

/**
 * Convert row input into a logical-grid representation with explicit start
 * columns for cells and skipped columns.
 */
function normalizeRows(rows: AutoFitRowInput[]): NormalizedRow[] {
  return rows.map((row) => {
    let columnIndex = 0;
    const skippedColumns: NormalizedSkippedColumn[] = [];
    const cells: NormalizedCell[] = [];

    for (const skipped of row.skippedBefore ?? []) {
      skippedColumns.push(normalizeSkippedColumn(skipped, columnIndex));
      columnIndex += 1;
    }

    for (const cell of row.cells ?? []) {
      const span = Math.max(1, Math.floor(cell.span ?? 1));
      cells.push({
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
 * Determine the logical grid width needed to evaluate the table.
 *
 * The result is the maximum of the authored grid length and every normalized row
 * width after accounting for skipped columns and spans.
 */
function determineGridColumnCount(preferredColumnWidths: number[], rows: NormalizedRow[]): number {
  return Math.max(preferredColumnWidths.length, ...rows.map((row) => row.logicalColumnCount), 0);
}

/**
 * Build the mutable working grid used by the solver.
 *
 * Any missing authored columns are extended with zero-width placeholders so later
 * algorithm stages can grow them from content constraints.
 */
function buildWorkingGrid(preferredColumnWidths: number[], gridColumnCount: number): number[] {
  const widths = preferredColumnWidths.slice(0, gridColumnCount).map((width) => Math.max(0, width));
  while (widths.length < gridColumnCount) {
    widths.push(0);
  }
  return widths;
}

/**
 * Gather single-span bounds and preferred-width overrides from normalized rows.
 *
 * Multi-span cells are collected separately because they need redistribution
 * across multiple logical columns.
 */
function accumulateBounds(args: {
  rows: NormalizedRow[];
  singleSpanMin: number[];
  singleSpanMax: number[];
  preferredOverrides: Array<number | undefined>;
  multiSpanCells: NormalizedCell[];
}): void {
  const { rows, singleSpanMin, singleSpanMax, preferredOverrides, multiSpanCells } = args;

  for (const row of rows) {
    for (const skipped of row.skippedColumns) {
      singleSpanMin[skipped.columnIndex] = Math.max(singleSpanMin[skipped.columnIndex], skipped.minContentWidth);
      singleSpanMax[skipped.columnIndex] = Math.max(singleSpanMax[skipped.columnIndex], skipped.maxContentWidth);
      if (preferredOverrides[skipped.columnIndex] == null && skipped.preferredWidth != null) {
        preferredOverrides[skipped.columnIndex] = skipped.preferredWidth;
      }
    }

    for (const cell of row.cells) {
      if (cell.span === 1) {
        singleSpanMin[cell.startColumn] = Math.max(singleSpanMin[cell.startColumn], cell.minContentWidth);
        singleSpanMax[cell.startColumn] = Math.max(singleSpanMax[cell.startColumn], cell.maxContentWidth);
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
 * Expand spanned columns until every multi-span cell can satisfy its minimum
 * content width.
 */
function applyMultiSpanMinimums(widths: number[], cells: NormalizedCell[]): void {
  for (const cell of cells) {
    distributeDeficit(widths, cell.startColumn, cell.span, cell.minContentWidth);
  }
}

/**
 * Expand spanned columns until every multi-span cell can satisfy its maximum
 * content width, while respecting already-established minima.
 */
function applyMultiSpanMaximums(widths: number[], cells: NormalizedCell[], minima: number[]): void {
  for (const cell of cells) {
    const target = Math.max(cell.maxContentWidth, sumSpan(minima, cell.startColumn, cell.span));
    distributeDeficit(widths, cell.startColumn, cell.span, target);
  }
}

/**
 * Apply first-wins preferred-width overrides gathered from single-span inputs.
 */
function applySingleSpanPreferredOverrides(widths: number[], preferredOverrides: Array<number | undefined>): number[] {
  return widths.map((width, index) => Math.max(width, preferredOverrides[index] ?? 0));
}

/**
 * Apply preferred-width requests from multi-span cells by growing the covered
 * span until it reaches the requested width.
 */
function applyMultiSpanPreferredWidths(widths: number[], cells: NormalizedCell[]): number[] {
  const next = [...widths];
  for (const cell of cells) {
    if (cell.preferredWidth != null) {
      distributeDeficit(next, cell.startColumn, cell.span, cell.preferredWidth);
    }
  }
  return next;
}

/**
 * Grow a span proportionally enough to satisfy a target width.
 *
 * The current implementation distributes deficit evenly across the covered span.
 */
function distributeDeficit(widths: number[], startColumn: number, span: number, targetWidth: number): void {
  if (span <= 0 || targetWidth <= 0) return;
  const currentWidth = sumSpan(widths, startColumn, span);
  const deficit = targetWidth - currentWidth;
  if (deficit <= 0) return;

  const baseIncrement = deficit / span;
  let applied = 0;
  for (let offset = 0; offset < span; offset++) {
    const index = startColumn + offset;
    const increment = offset === span - 1 ? deficit - applied : baseIncrement;
    widths[index] = Math.max(0, widths[index] + increment);
    applied += increment;
  }
}

/**
 * Compute the summed width of a contiguous logical span.
 */
function sumSpan(widths: number[], startColumn: number, span: number): number {
  let total = 0;
  for (let offset = 0; offset < span; offset++) {
    total += widths[startColumn + offset] ?? 0;
  }
  return total;
}

/**
 * Scale a width vector to an exact preferred table width.
 */
function scaleToTargetWidth(widths: number[], preferredTableWidth: number | undefined): number[] {
  if (preferredTableWidth == null || preferredTableWidth <= 0) return widths;
  const totalWidth = widths.reduce((sum, width) => sum + width, 0);
  if (totalWidth <= 0) return widths;
  return normalizeRounding(
    widths.map((width) => width * (preferredTableWidth / totalWidth)),
    preferredTableWidth,
  );
}

/**
 * Distribute spare width toward a preferred table width target while keeping the
 * existing width ratios biased by current widths and minima.
 */
function distributeToTargetWidth(
  widths: number[],
  targetWidth: number,
  minWidths: number[],
  minColumnWidth: number,
): number[] {
  const totalWidth = widths.reduce((sum, width) => sum + width, 0);
  if (targetWidth <= 0 || totalWidth >= targetWidth) {
    return widths;
  }

  const extra = targetWidth - totalWidth;
  const basis = widths.reduce((sum, width) => sum + Math.max(width, minColumnWidth), 0);
  if (basis <= 0) {
    return normalizeRounding(
      widths.map(() => targetWidth / widths.length),
      targetWidth,
    );
  }

  const distributed = widths.map((width, index) => {
    const weight = Math.max(width, minWidths[index], minColumnWidth);
    return width + extra * (weight / basis);
  });
  return normalizeRounding(distributed, targetWidth);
}

/**
 * Honor a preferred table width when it can be satisfied without violating
 * runtime minimum widths.
 *
 * AutoFit starts from a content/preference-expanded width vector. If the
 * preferred table width lies between the current minimum and current total, we
 * shrink back toward the preferred width before allowing the table to grow
 * toward the maximum available width.
 */
function resolvePreferredTableWidth(
  widths: number[],
  targetWidth: number,
  minWidths: number[],
  minColumnWidth: number,
): number[] {
  const totalWidth = widths.reduce((sum, width) => sum + width, 0);
  const totalMinWidth = minWidths.reduce((sum, width) => sum + Math.max(width, minColumnWidth), 0);

  if (targetWidth <= 0) {
    return widths;
  }

  if (targetWidth < totalMinWidth) {
    return widths;
  }

  if (targetWidth < totalWidth) {
    return clampToWidth(widths, targetWidth, minWidths);
  }

  if (targetWidth > totalWidth) {
    return distributeToTargetWidth(widths, targetWidth, minWidths, minColumnWidth);
  }

  return widths;
}

/**
 * Clamp a width vector down to a maximum table width without shrinking any
 * column below its minimum.
 */
function clampToWidth(widths: number[], maxWidth: number, minWidths: number[]): number[] {
  const totalWidth = widths.reduce((sum, width) => sum + width, 0);
  if (totalWidth <= maxWidth) return widths;

  const capacities = widths.map((width, index) => Math.max(0, width - Math.max(0, minWidths[index] ?? 0)));
  const totalCapacity = capacities.reduce((sum, value) => sum + value, 0);
  if (totalCapacity <= 0) {
    return normalizeRounding(
      widths.map((width) => width * (maxWidth / totalWidth)),
      maxWidth,
    );
  }

  const excess = totalWidth - maxWidth;
  const clamped = widths.map((width, index) => {
    const shrink = excess * (capacities[index] / totalCapacity);
    return Math.max(minWidths[index] ?? 0, width - shrink);
  });
  return normalizeRounding(clamped, maxWidth);
}

/**
 * Ensure every output column remains visible and that empty/pathological inputs
 * still produce a measurable table width.
 */
function ensureNonZeroWidthFloor(widths: number[], minColumnWidth: number): number[] {
  const sanitized = widths.length > 0 ? widths : [minColumnWidth];
  return sanitized.map((width) => Math.max(minColumnWidth, width));
}

/**
 * Round widths to integer pixels and normalize the last column so the final sum
 * matches the requested target total.
 */
function normalizeRounding(widths: number[], targetTotal: number): number[] {
  const rounded = widths.map((width) => Math.max(1, Math.round(width)));
  const roundedTotal = rounded.reduce((sum, width) => sum + width, 0);
  const diff = Math.round(targetTotal) - roundedTotal;
  if (diff !== 0 && rounded.length > 0) {
    rounded[rounded.length - 1] = Math.max(1, rounded[rounded.length - 1] + diff);
  }
  return rounded;
}

/**
 * Build a minimal non-zero fallback result for degenerate inputs with no logical
 * columns after normalization.
 */
function buildFallbackResult(layoutMode: AutoFitLayoutMode, minColumnWidth: number): AutoFitResult {
  return {
    layoutMode,
    columnWidths: [minColumnWidth],
    totalWidth: minColumnWidth,
    gridColumnCount: 1,
  };
}

/**
 * Finalize the result object after all solver stages have run.
 */
function finalizeResult(layoutMode: AutoFitLayoutMode, widths: number[], minColumnWidth: number): AutoFitResult {
  const normalizedWidths = ensureNonZeroWidthFloor(widths, minColumnWidth);
  return {
    layoutMode,
    columnWidths: normalizedWidths,
    totalWidth: normalizedWidths.reduce((sum, width) => sum + width, 0),
    gridColumnCount: normalizedWidths.length,
  };
}
