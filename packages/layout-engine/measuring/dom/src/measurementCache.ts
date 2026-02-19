// Simple LRU cache for measured text widths

type CacheEntry = {
  width: number;
};

// Default cache size of 5000 entries balances memory usage with performance.
// Typical documents contain thousands of unique text measurements across different
// font/size/spacing combinations, and this size prevents frequent evictions.
const defaultMaxSize = 5000;
let maxSize = defaultMaxSize;
const cache = new Map<string, CacheEntry>();

const makeKey = (text: string, font: string, letterSpacing: number): string => {
  return `${text}|${font}|${letterSpacing || 0}`;
};

/**
 * Sets the maximum number of entries the measurement cache can hold.
 * Invalid sizes (non-finite, zero, or negative) are ignored to prevent cache corruption.
 *
 * @param size - The desired cache size (must be finite and positive)
 * @returns void
 * @example
 * ```typescript
 * setCacheSize(10000); // Increase cache for large documents
 * setCacheSize(1000);  // Reduce cache for memory-constrained environments
 * ```
 */
export function setCacheSize(size: number): void {
  if (!Number.isFinite(size) || size <= 0) {
    return;
  }
  maxSize = size;
  evictIfNeeded();
}

/**
 * Clears all entries from the measurement cache.
 * Useful for resetting state during tests or when memory needs to be reclaimed.
 *
 * @returns void
 * @example
 * ```typescript
 * clearMeasurementCache(); // Clear cache before running tests
 * ```
 */
export function clearMeasurementCache(): void {
  cache.clear();
}

/**
 * Measures the width of text with specified font and letter spacing.
 * Results are cached using an LRU strategy to optimize repeated measurements.
 * Excessively long text (>32000 chars) is truncated to prevent Canvas API issues.
 *
 * @param text - The text to measure
 * @param font - CSS font string (e.g., "16px Arial")
 * @param letterSpacing - Additional spacing between characters in pixels
 * @param ctx - Canvas rendering context used for measurement
 * @returns The measured width in pixels, or 0 on measurement failure
 * @example
 * ```typescript
 * const ctx = canvas.getContext('2d');
 * const width = getMeasuredTextWidth('Hello', '16px Arial', 0, ctx);
 * console.log(width); // e.g., 45.2
 * ```
 */
export function getMeasuredTextWidth(
  text: string,
  font: string,
  letterSpacing: number,
  ctx: CanvasRenderingContext2D,
): number {
  // Truncate excessively long text to prevent Canvas API issues
  if (text.length > 32000) {
    text = text.substring(0, 32000);
  }

  const key = makeKey(text, font, letterSpacing);
  const hit = cache.get(key);
  // Check for undefined explicitly since width can be 0 (valid but falsy)
  if (hit !== undefined) {
    // Refresh LRU
    cache.delete(key);
    cache.set(key, hit);
    return hit.width;
  }

  try {
    ctx.font = font;
    const metrics = ctx.measureText(text);
    // Use advance width for line fitting; bounding-box overhangs inflate width and cause premature wraps.
    const baseWidth = metrics.width;
    const extra = letterSpacing ? Math.max(0, text.length - 1) * letterSpacing : 0;
    const width = baseWidth + extra;

    cache.set(key, { width });
    evictIfNeeded();
    return width;
  } catch {
    // Return 0 on measurement failure (e.g., invalid font, excessively long text)
    // This prevents crashes while maintaining reasonable layout behavior
    return 0;
  }
}

function evictIfNeeded(): void {
  while (cache.size > maxSize) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey === undefined) break;
    cache.delete(oldestKey);
  }
}
