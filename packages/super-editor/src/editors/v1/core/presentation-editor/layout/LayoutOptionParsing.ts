import type { ColumnLayout } from '@superdoc/contracts';

/**
 * Converts inches to pixels using standard 96 DPI conversion.
 *
 * @param value - Value in inches (will be coerced to number)
 * @returns Value in pixels, or undefined if input is not a finite number
 *
 * @remarks
 * Uses 96 DPI as the standard conversion rate (1 inch = 96 pixels).
 * This is the CSS/web standard for physical unit conversion.
 */
export function inchesToPx(value: unknown): number | undefined {
  if (value == null) return undefined;
  const num = Number(value);
  if (!Number.isFinite(num)) return undefined;
  return num * 96;
}

/**
 * Parses column layout configuration from raw input.
 *
 * Extracts column count and gap spacing from various possible property names,
 * normalizing to a standard ColumnLayout object. Returns undefined for single-column
 * layouts (count <= 1) since they don't require special column handling.
 *
 * @param raw - Raw column configuration object with properties like count, num, or numberOfColumns
 * @returns ColumnLayout with count and gap, or undefined if not multi-column or invalid
 *
 * @remarks
 * - Returns undefined if raw is not an object
 * - Accepts count from: 'count', 'num', or 'numberOfColumns' properties
 * - Returns undefined if count <= 1 (single column doesn't need layout)
 * - Accepts gap from: 'space' or 'gap' properties (converted from inches to pixels)
 * - Gap defaults to 0 if not provided or invalid
 * - Column count is floored to nearest integer and minimum of 1
 */
export function parseColumns(raw: unknown): ColumnLayout | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const columnSource = raw as Record<string, unknown>;
  const rawCount = Number(columnSource.count ?? columnSource.num ?? columnSource.numberOfColumns ?? 1);
  if (!Number.isFinite(rawCount) || rawCount <= 1) {
    return undefined;
  }
  const count = Math.max(1, Math.floor(rawCount));
  const gap = inchesToPx(columnSource.space ?? columnSource.gap) ?? 0;
  return { count, gap };
}
