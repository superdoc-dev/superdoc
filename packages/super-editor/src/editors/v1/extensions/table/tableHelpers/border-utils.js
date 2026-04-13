// @ts-check

/**
 * Creates a shallow clone of the given border map. When `sides` is provided,
 * only those keys will be considered — missing keys are skipped.
 *
 * @param {unknown} borders
 * @param {string[]} [sides]
 * @returns {Record<string, unknown>}
 */
export function cloneBorders(borders, sides) {
  if (!borders || typeof borders !== 'object') return {};
  const source = /** @type {Record<string, unknown>} */ (borders);
  const keys = Array.isArray(sides) ? sides : Object.keys(source);
  const clone = {};

  for (const side of keys) {
    const borderValue = source[side];
    if (!borderValue || typeof borderValue !== 'object') continue;
    /** @type {Record<string, unknown>} */ (clone)[side] = { .../** @type {Record<string, unknown>} */ (borderValue) };
  }

  return /** @type {Record<string, unknown>} */ (clone);
}

/**
 * Maps each border's `size` value via the provided mapper. Operates in-place
 * on a cloned border map produced by `cloneBorders`.
 *
 * @param {Record<string, unknown>} borders
 * @param {(size: unknown) => number | undefined} sizeMapper
 */
export function mapBorderSizes(borders, sizeMapper) {
  if (!borders || typeof borders !== 'object') return;
  if (typeof sizeMapper !== 'function') return;

  for (const border of Object.values(borders)) {
    if (!border || typeof border !== 'object') continue;
    const mapped = sizeMapper(/** @type {{ size?: unknown }} */ (border).size);
    if (typeof mapped === 'number' && Number.isFinite(mapped)) {
      /** @type {{ size?: unknown }} */ (border).size = mapped;
    }
  }
}
