/**
 * OOXML unsignedInt bounds for wp:anchor@relativeHeight.
 * ECMA-376 defines unsignedInt as 0..4294967295.
 */
export const RELATIVE_HEIGHT_MIN = 0;
export const RELATIVE_HEIGHT_MAX = 4_294_967_295;

/**
 * Check if a value is a valid OOXML unsignedInt (32-bit).
 *
 * @param {unknown} value
 * @returns {value is number}
 */
export function isValidRelativeHeight(value) {
  return (
    typeof value === 'number' && Number.isInteger(value) && value >= RELATIVE_HEIGHT_MIN && value <= RELATIVE_HEIGHT_MAX
  );
}

/**
 * Parse and normalize an OOXML relativeHeight value.
 *
 * Accepts:
 * - numbers that are already valid unsignedInt values
 * - digit-only strings (e.g. "251651584")
 *
 * Returns null for malformed, fractional, negative, or out-of-range values.
 *
 * @param {unknown} value
 * @returns {number|null}
 */
export function parseRelativeHeight(value) {
  if (isValidRelativeHeight(value)) return value;

  if (typeof value !== 'string') return null;

  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) return null;

  const parsed = Number.parseInt(trimmed, 10);
  if (!Number.isFinite(parsed)) return null;
  if (!Number.isSafeInteger(parsed)) return null;

  return isValidRelativeHeight(parsed) ? parsed : null;
}
