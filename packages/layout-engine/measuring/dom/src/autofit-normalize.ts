import type { TableBlock, TableRowProperties, TableWidthAttr } from '@superdoc/contracts';
import { OOXML_PCT_DIVISOR } from '@superdoc/contracts';
import type { AutoFitLayoutMode, AutoFitRowInput } from './autofit-columns.js';

/** Number of OOXML twips per rendered CSS pixel at 96 DPI. */
const TWIPS_PER_PX = 15;

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
  /** Preferred table width target, in pixels, if resolvable. */
  preferredTableWidth?: number;
  /** Preferred/authored grid widths, in pixels, in logical-column order. */
  preferredColumnWidths: number[];
  /** Logical grid column count after accounting for row skips and spans. */
  gridColumnCount: number;
  /** Logical row inputs for the AutoFit solver. */
  rows: AutoFitRowInput[];
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
  const preferredTableWidth = resolvePreferredTableWidth(
    block.attrs?.tableWidth as TableWidthAttr | undefined,
    maxTableWidth,
  );
  const preferredColumnWidths = normalizePreferredColumnWidths(block.columnWidths);

  const rows = block.rows.map((row) => normalizeRow(row, preferredTableWidth ?? maxTableWidth));
  const gridColumnCount = determineGridColumnCount(preferredColumnWidths.length, rows);

  return {
    layoutMode,
    maxTableWidth,
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
function normalizeRow(row: TableBlock['rows'][number], percentageBasis: number): AutoFitRowInput {
  const rowProps = (row.attrs?.tableRowProperties ?? {}) as TableRowProperties;
  const skippedBeforeCount = sanitizeCount(rowProps.gridBefore);
  const skippedAfterCount = sanitizeCount(rowProps.gridAfter);
  const cells = Array.isArray(row.cells) ? row.cells : [];

  return {
    skippedBefore: buildSkippedColumns(
      skippedBeforeCount,
      rowProps.wBefore as OoxmlMeasurement | undefined,
      percentageBasis,
    ),
    cells: cells.map((cell) => normalizeCell(cell, percentageBasis)),
    skippedAfter: buildSkippedColumns(
      skippedAfterCount,
      rowProps.wAfter as OoxmlMeasurement | undefined,
      percentageBasis,
    ),
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
): AutoFitRowInput['skippedBefore'] {
  if (count <= 0) return [];

  const totalPreferredWidth = resolveMeasurementToPx(preferredWidthMeasurement, percentageBasis);
  const perColumnPreferredWidth =
    totalPreferredWidth != null && count > 0 ? Math.max(0, totalPreferredWidth / count) : undefined;

  return Array.from({ length: count }, () => ({
    preferredWidth: perColumnPreferredWidth,
    minContentWidth: 0,
    maxContentWidth: 0,
  }));
}

/**
 * Normalize one runtime cell into span and preferred-width metadata.
 */
function normalizeCell(
  cell: TableBlock['rows'][number]['cells'][number],
  percentageBasis: number,
): NonNullable<AutoFitRowInput['cells']>[number] {
  const cellProps = (cell.attrs?.tableCellProperties ?? {}) as NormalizationTableCellProperties;
  return {
    span: sanitizeCount(cell.colSpan) || 1,
    preferredWidth: resolveMeasurementToPx(cellProps.cellWidth, percentageBasis),
  };
}

/**
 * Determine the logical grid width required by the normalized row data.
 */
function determineGridColumnCount(preferredColumnCount: number, rows: AutoFitRowInput[]): number {
  return Math.max(
    preferredColumnCount,
    ...rows.map((row) => {
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
  if (!tableWidth || typeof tableWidth !== 'object') return undefined;
  const raw = typeof tableWidth.width === 'number' ? tableWidth.width : tableWidth.value;
  if (!Number.isFinite(raw) || raw == null || raw <= 0) return undefined;
  if (tableWidth.type === 'pct') {
    return Math.round(maxWidth * (raw / OOXML_PCT_DIVISOR));
  }
  return raw;
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
