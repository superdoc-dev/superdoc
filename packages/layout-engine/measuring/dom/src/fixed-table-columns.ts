import type {
  WorkingTableCellInput,
  WorkingTableGridInput,
  WorkingTableRowInput,
  WorkingTableSkippedColumnInput,
} from './autofit-normalize.js';

/**
 * Pure fixed-layout column width resolution result.
 *
 * This is the reusable fixed-pass baseline described by ECMA for both:
 * - real fixed-width tables
 * - the first pass of the AutoFit algorithm
 */
export type FixedLayoutResult = {
  /** Final fixed-pass width of each logical grid column, in pixels. */
  columnWidths: number[];
  /** Sum of the final logical column width vector, in pixels. */
  totalWidth: number;
  /** Logical grid column count after any span-driven extension. */
  gridColumnCount: number;
  /** Preferred table width target used during proportional shrink, if any. */
  preferredTableWidth?: number;
};

/**
 * Resolve a table's fixed-layout logical column widths from the shared working
 * grid model.
 *
 * The implementation follows the ECMA fixed-layout structure:
 * 1. seed the logical grid from authored grid widths
 * 2. place skipped columns and concrete cells on that grid
 * 3. apply preferred widths from `wBefore` / `wAfter` and `tcW`
 * 4. extend the grid when rows or spans exceed the authored grid
 * 5. reconcile later-row conflicts by adding width to the last column of the
 *    affected span
 * 6. after each row, proportionally shrink the full width vector when it
 *    exceeds the preferred table width
 *
 * The solver is intentionally pure and pixel-based:
 * - no OOXML measurement parsing occurs here
 * - no DOM or text measurement occurs here
 * - no container-width clamp is applied
 *
 * @param input - Shared working-grid input built by normalization.
 * @returns Fixed-pass logical column widths.
 */
export function computeFixedTableColumnWidths(input: WorkingTableGridInput): FixedLayoutResult {
  const gridColumnCount = Math.max(
    0,
    sanitizeColumnCount(input.gridColumnCount),
    Array.isArray(input.preferredColumnWidths) ? input.preferredColumnWidths.length : 0,
  );
  const preferredTableWidth = sanitizeOptionalWidth(input.preferredTableWidth);
  const defaultAddedColumnWidth = resolveDefaultAddedColumnWidth(input.preferredColumnWidths, preferredTableWidth);
  const columnWidths = buildInitialGrid(input.preferredColumnWidths, gridColumnCount, defaultAddedColumnWidth);

  if (input.preserveAuthoredGrid === true) {
    return {
      columnWidths,
      totalWidth: sumWidths(columnWidths),
      gridColumnCount: columnWidths.length,
      preferredTableWidth,
    };
  }

  if (input.rows.length === 0) {
    if (preferredTableWidth != null) {
      shrinkToPreferredTableWidth(columnWidths, preferredTableWidth);
    }

    return {
      columnWidths,
      totalWidth: sumWidths(columnWidths),
      gridColumnCount: columnWidths.length,
      preferredTableWidth,
    };
  }

  applyFirstRowRequests(columnWidths, input.rows[0], defaultAddedColumnWidth);

  if (preferredTableWidth != null) {
    shrinkToPreferredTableWidth(columnWidths, preferredTableWidth);
  }

  for (const row of input.rows.slice(1)) {
    applySubsequentRowRequests(columnWidths, row, defaultAddedColumnWidth);

    if (preferredTableWidth != null) {
      shrinkToPreferredTableWidth(columnWidths, preferredTableWidth);
    }
  }

  return {
    columnWidths,
    totalWidth: sumWidths(columnWidths),
    gridColumnCount: columnWidths.length,
    preferredTableWidth,
  };
}

/**
 * Build the fixed solver's starting logical grid.
 *
 * Missing authored columns are padded with the solver's default added-column
 * width because the ECMA grid is allowed to be extended by later spans and
 * skipped columns.
 */
function buildInitialGrid(
  preferredColumnWidths: number[],
  gridColumnCount: number,
  defaultAddedColumnWidth: number,
): number[] {
  const next = preferredColumnWidths.slice(0, gridColumnCount).map((width) => sanitizeNonNegativeWidth(width) ?? 0);

  while (next.length < gridColumnCount) {
    next.push(defaultAddedColumnWidth);
  }

  return next;
}

/**
 * Apply the first logical row's preferred-width requests to the mutable fixed grid.
 *
 * ECMA describes the first row as setting widths from `wBefore` / `wAfter` and
 * `tcW`, so first-row requests are allowed to replace larger seeded/default
 * widths downward as well as upward.
 */
function applyFirstRowRequests(
  columnWidths: number[],
  row: WorkingTableRowInput,
  defaultAddedColumnWidth: number,
): void {
  ensureGridWidth(columnWidths, row.logicalColumnCount, defaultAddedColumnWidth);

  for (const skippedColumn of row.skippedColumns) {
    setSkippedColumnWidth(columnWidths, skippedColumn, defaultAddedColumnWidth);
  }

  for (const cell of row.cells) {
    setCellSpanWidth(columnWidths, cell, defaultAddedColumnWidth);
  }
}

/**
 * Apply a subsequent logical row's preferred-width requests to the mutable fixed
 * grid.
 *
 * After the first row, ECMA describes conflicts as reconciliation by maxima, so
 * later rows only grow the affected logical columns and spans.
 */
function applySubsequentRowRequests(
  columnWidths: number[],
  row: WorkingTableRowInput,
  defaultAddedColumnWidth: number,
): void {
  ensureGridWidth(columnWidths, row.logicalColumnCount, defaultAddedColumnWidth);

  for (const skippedColumn of row.skippedColumns) {
    growSkippedColumnWidth(columnWidths, skippedColumn, defaultAddedColumnWidth);
  }

  for (const cell of row.cells) {
    growCellSpanWidth(columnWidths, cell, defaultAddedColumnWidth);
  }
}

/**
 * Set one skipped logical column's width from the first-row `wBefore` / `wAfter`
 * request.
 */
function setSkippedColumnWidth(
  columnWidths: number[],
  skippedColumn: WorkingTableSkippedColumnInput,
  defaultAddedColumnWidth: number,
): void {
  const preferredWidth = sanitizeOptionalWidth(skippedColumn.preferredWidth);
  if (preferredWidth == null) return;

  ensureGridWidth(columnWidths, skippedColumn.columnIndex + 1, defaultAddedColumnWidth);
  columnWidths[skippedColumn.columnIndex] = preferredWidth;
}

/**
 * Grow one skipped logical column's width for a subsequent-row conflict.
 */
function growSkippedColumnWidth(
  columnWidths: number[],
  skippedColumn: WorkingTableSkippedColumnInput,
  defaultAddedColumnWidth: number,
): void {
  const preferredWidth = sanitizeOptionalWidth(skippedColumn.preferredWidth);
  if (preferredWidth == null) return;

  ensureGridWidth(columnWidths, skippedColumn.columnIndex + 1, defaultAddedColumnWidth);
  columnWidths[skippedColumn.columnIndex] = Math.max(columnWidths[skippedColumn.columnIndex] ?? 0, preferredWidth);
}

/**
 * Set one first-row cell span width from `tcW`.
 *
 * The current span total is forced to the requested width by adjusting the last
 * column in the span, leaving earlier columns unchanged.
 */
function setCellSpanWidth(columnWidths: number[], cell: WorkingTableCellInput, defaultAddedColumnWidth: number): void {
  const span = Math.max(1, sanitizeColumnCount(cell.span));
  const preferredWidth = sanitizeOptionalWidth(cell.preferredWidth);
  const endColumn = cell.startColumn + span;

  ensureGridWidth(columnWidths, endColumn, defaultAddedColumnWidth);

  if (preferredWidth == null) return;

  const currentSpanWidth = sumSpan(columnWidths, cell.startColumn, span);
  const lastColumnIndex = endColumn - 1;
  columnWidths[lastColumnIndex] = Math.max(
    0,
    (columnWidths[lastColumnIndex] ?? 0) + (preferredWidth - currentSpanWidth),
  );
}

/**
 * Grow one subsequent-row cell span width for a fixed-layout conflict.
 *
 * Later rows only reconcile by maxima, so a subsequent-row request can enlarge
 * the span but cannot reduce it below the current resolved width.
 */
function growCellSpanWidth(columnWidths: number[], cell: WorkingTableCellInput, defaultAddedColumnWidth: number): void {
  const span = Math.max(1, sanitizeColumnCount(cell.span));
  const preferredWidth = sanitizeOptionalWidth(cell.preferredWidth);
  const endColumn = cell.startColumn + span;

  ensureGridWidth(columnWidths, endColumn, defaultAddedColumnWidth);

  if (preferredWidth == null) return;

  const currentSpanWidth = sumSpan(columnWidths, cell.startColumn, span);
  const deficit = preferredWidth - currentSpanWidth;
  if (deficit <= 0) return;

  const lastColumnIndex = endColumn - 1;
  columnWidths[lastColumnIndex] = Math.max(0, (columnWidths[lastColumnIndex] ?? 0) + deficit);
}

/**
 * Proportionally shrink the current logical grid to the preferred table width.
 *
 * Fixed layout is allowed to overflow the container, but when the table has an
 * explicit preferred table width the ECMA fixed algorithm reduces every grid
 * column proportionally once the current request exceeds that preferred total.
 */
function shrinkToPreferredTableWidth(columnWidths: number[], preferredTableWidth: number): void {
  const totalWidth = sumWidths(columnWidths);
  if (preferredTableWidth <= 0 || totalWidth <= preferredTableWidth || totalWidth <= 0) {
    return;
  }

  const scale = preferredTableWidth / totalWidth;
  let consumed = 0;

  for (let index = 0; index < columnWidths.length; index++) {
    if (index === columnWidths.length - 1) {
      columnWidths[index] = Math.max(0, preferredTableWidth - consumed);
      continue;
    }

    const scaled = Math.max(0, (columnWidths[index] ?? 0) * scale);
    columnWidths[index] = scaled;
    consumed += scaled;
  }
}

/**
 * Ensure the mutable logical grid is wide enough for the current request set.
 */
function ensureGridWidth(columnWidths: number[], requiredColumnCount: number, defaultAddedColumnWidth: number): void {
  while (columnWidths.length < requiredColumnCount) {
    columnWidths.push(defaultAddedColumnWidth);
  }
}

/**
 * Resolve the default width assigned to newly added logical grid columns.
 *
 * ECMA requires dynamically added columns to receive a default width but does
 * not define a specific numeric value. This implementation reuses the last
 * non-zero authored grid width when available, otherwise the average authored
 * grid width, then the preferred table width, and finally `1px` as a visible
 * non-zero minimum.
 */
function resolveDefaultAddedColumnWidth(
  preferredColumnWidths: number[],
  preferredTableWidth: number | undefined,
): number {
  for (let index = preferredColumnWidths.length - 1; index >= 0; index--) {
    const width = sanitizeNonNegativeWidth(preferredColumnWidths[index]);
    if (width != null && width > 0) {
      return width;
    }
  }

  const positiveAuthoredWidths = preferredColumnWidths
    .map((width) => sanitizeNonNegativeWidth(width))
    .filter((width) => width != null && width > 0) as number[];
  if (positiveAuthoredWidths.length > 0) {
    return sumWidths(positiveAuthoredWidths) / positiveAuthoredWidths.length;
  }

  if (preferredTableWidth != null && preferredTableWidth > 0) {
    return preferredTableWidth;
  }

  return 1;
}

/**
 * Sum the width of a contiguous logical column span.
 */
function sumSpan(columnWidths: number[], startColumn: number, span: number): number {
  let total = 0;
  for (let offset = 0; offset < span; offset++) {
    total += columnWidths[startColumn + offset] ?? 0;
  }
  return total;
}

/**
 * Sum an entire logical column width vector.
 */
function sumWidths(columnWidths: number[]): number {
  return columnWidths.reduce((sum, width) => sum + Math.max(0, width), 0);
}

/**
 * Normalize a column-count-like value into a finite non-negative integer.
 */
function sanitizeColumnCount(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return 0;
  }

  return Math.floor(value);
}

/**
 * Normalize an optional width, returning `undefined` for invalid or negative
 * inputs.
 */
function sanitizeOptionalWidth(value: number | undefined): number | undefined {
  const width = sanitizeNonNegativeWidth(value);
  return width == null ? undefined : width;
}

/**
 * Normalize a width-like value into a finite non-negative pixel width.
 */
function sanitizeNonNegativeWidth(value: number | undefined): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return undefined;
  }

  return Math.max(0, value);
}
