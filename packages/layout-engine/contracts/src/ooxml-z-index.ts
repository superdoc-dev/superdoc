/**
 * OOXML z-index normalization utilities.
 *
 * OOXML stores z-order as large relativeHeight numbers (base ~251658240).
 * These helpers convert to small positive CSS z-index values.
 */

/** Checks whether `value` is a non-null, non-array object. */
export const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

/**
 * Base value for OOXML relativeHeight z-ordering.
 *
 * @example
 * - 251658240 → 0 (base/background)
 * - 251658242 → 2 (slightly above base)
 * - 251658291 → 51 (further above)
 */
export const OOXML_Z_INDEX_BASE = 251658240;

/**
 * Coerces relativeHeight from OOXML (number or string) to a finite number.
 */
export function coerceRelativeHeight(raw: unknown): number | undefined {
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  if (typeof raw === 'string' && raw.trim() !== '') {
    const n = Number(raw);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

/**
 * Normalizes z-index from OOXML relativeHeight value.
 *
 * OOXML uses large numbers starting around 251658240. To preserve the relative
 * stacking order, we subtract the base value to get a small positive number
 * suitable for CSS z-index. This ensures elements with close relativeHeight
 * values maintain their correct stacking order.
 *
 * @param originalAttributes - The originalAttributes object from ProseMirror node attrs
 * @returns Normalized z-index number or undefined if no relativeHeight
 *
 * @example
 * ```typescript
 * normalizeZIndex({ relativeHeight: 251658240 }); // 0 (background)
 * normalizeZIndex({ relativeHeight: 251658242 }); // 2 (above background)
 * normalizeZIndex({ relativeHeight: 251658291 }); // 51 (further above)
 * normalizeZIndex({}); // undefined
 * normalizeZIndex(null); // undefined
 * ```
 */
export function normalizeZIndex(originalAttributes: unknown): number | undefined {
  if (!isPlainObject(originalAttributes)) return undefined;
  const relativeHeight = coerceRelativeHeight(originalAttributes.relativeHeight);
  if (relativeHeight === undefined) return undefined;
  return Math.max(0, relativeHeight - OOXML_Z_INDEX_BASE);
}
