/**
 * Font Metrics Cache for Typography Measurements
 *
 * Provides accurate font ascent/descent metrics using the Canvas TextMetrics API.
 * This replaces hardcoded approximations (0.8/0.2 ratios) that caused text clipping
 * for fonts with non-standard glyph heights.
 *
 * The Canvas API's actualBoundingBoxAscent and actualBoundingBoxDescent properties
 * give the exact pixel dimensions needed to render text without clipping.
 *
 * @module fontMetricsCache
 */

/**
 * Font information needed to measure typography metrics.
 */
export type FontInfo = {
  fontFamily: string;
  fontSize: number;
  bold?: boolean;
  italic?: boolean;
};

/**
 * Measured font metrics from the Canvas API.
 *
 * `ascent`/`descent` come from `actualBoundingBox*` on a sample string — these
 * are the painted bounds used by downstream code for glyph-clipping guards.
 *
 * `naturalSingleLine` (optional) is the font's intrinsic single-line-height
 * (what Word uses as the base for `w:lineRule="auto"` rendering). It comes
 * either from a per-font calibration table (for fonts where Word's intrinsic
 * metrics are known to diverge from the browser's) or, when the browser
 * exposes it, from `fontBoundingBoxAscent + fontBoundingBoxDescent`.
 * When undefined, callers fall back to `ascent + descent` or a
 * multiplier-of-fontSize heuristic.
 */
export type FontMetricsResult = {
  ascent: number;
  descent: number;
  naturalSingleLine?: number;
};

/**
 * Per-font calibration of natural single-line height, keyed by lowercased
 * family name (first entry of a comma-separated stack).
 *
 * The multiplier is `fontSize × multiplier = naturalSingleLine` in px. These
 * values were measured by rendering the font in Word and reading back the
 * resulting row heights — the browser's Canvas `fontBoundingBox*` and
 * `actualBoundingBox*` do not produce the same numbers because Word uses
 * Microsoft's internal metrics from the actual font file (not available to
 * the browser unless the font is bundled).
 *
 * Aptos (Microsoft's default since late 2023) and Calibri (previous default)
 * both render at ~1.218–1.219 × fontSize natural single-line in Word.
 * Fonts not in this table fall through to the browser's measured metrics.
 *
 * Add entries as document-corpus evidence accumulates. Values should match
 * Word's output as measured from rendered PDFs at known font sizes.
 */
const FONT_NATURAL_LINE_CALIBRATION: Record<string, number> = {
  aptos: 1.218,
  'aptos display': 1.218,
  calibri: 1.219,
  'calibri light': 1.219,
  cambria: 1.219,
};

/**
 * Parse a CSS font-family stack and return the first family name lowercased,
 * stripped of quotes. Returns empty string for invalid/empty input.
 */
const primaryFontFamily = (fontFamily: string): string => {
  if (typeof fontFamily !== 'string') return '';
  const first = fontFamily.split(',')[0] ?? '';
  return first
    .trim()
    .replace(/^['"]|['"]$/g, '')
    .toLowerCase();
};

/**
 * Look up per-font natural-single-line calibration for a given family.
 * Returns px value when the family has a calibration entry, undefined otherwise.
 */
export const getCalibratedNaturalSingleLine = (fontFamily: string, fontSizePx: number): number | undefined => {
  const multiplier = FONT_NATURAL_LINE_CALIBRATION[primaryFontFamily(fontFamily)];
  if (multiplier == null || !Number.isFinite(fontSizePx) || fontSizePx <= 0) return undefined;
  return fontSizePx * multiplier;
};

/**
 * Measurement configuration for deterministic mode.
 */
type MeasurementFonts = {
  deterministicFamily: string;
  fallbackStack: string[];
};

/**
 * Cache for font metrics to avoid repeated measurements.
 * Key format: "fontFamily|fontSize|bold|italic"
 */
const fontMetricsCache = new Map<string, FontMetricsResult>();

/**
 * Maximum cache size to prevent memory issues.
 */
const MAX_CACHE_SIZE = 1000;

/**
 * Test string for measuring font metrics.
 * Includes characters that exercise both ascenders and descenders:
 * - 'M' and 'H' for typical cap height
 * - 'g', 'y', 'p' for descenders
 * - 'b', 'd', 'l' for ascenders
 * - Accented capitals for maximum ascent
 */
const METRICS_TEST_STRING = 'MHgypbdlÁÉÍ';

/**
 * Generates a cache key for font metrics.
 *
 * Creates a deterministic string key from font information for efficient cache lookups.
 * The key format ensures that different font configurations (size, weight, style) produce
 * unique keys while identical configurations always produce the same key.
 *
 * @param fontInfo - Font configuration to generate key from
 * @returns Cache key in format "fontFamily|fontSize|bold|italic"
 *
 * @example
 * ```typescript
 * getFontKey({ fontFamily: 'Arial', fontSize: 16, bold: true, italic: false })
 * // Returns: "Arial|16|true|false"
 *
 * getFontKey({ fontFamily: 'Times New Roman', fontSize: 12 })
 * // Returns: "Times New Roman|12|false|false"
 * ```
 */
function getFontKey(fontInfo: FontInfo): string {
  return `${fontInfo.fontFamily}|${fontInfo.fontSize}|${fontInfo.bold ?? false}|${fontInfo.italic ?? false}`;
}

/**
 * Builds a CSS font string from font info.
 *
 * Constructs a valid CSS font shorthand string for use with Canvas 2D context.
 * Handles both browser mode (uses actual font family) and deterministic mode
 * (uses fixed fallback stack for consistent measurements across environments).
 *
 * @param fontInfo - Font configuration (family, size, weight, style)
 * @param mode - Measurement mode: 'browser' uses fontInfo.fontFamily, 'deterministic' uses fallback stack
 * @param fonts - Font configuration containing deterministic family and fallback stack
 * @returns CSS font string in format "italic bold 16px Arial" (style and weight are optional)
 *
 * @example
 * ```typescript
 * buildFontStringForMetrics(
 *   { fontFamily: 'Arial', fontSize: 16, bold: true, italic: true },
 *   'browser',
 *   { deterministicFamily: 'Noto Sans', fallbackStack: [] }
 * )
 * // Returns: "italic bold 16px Arial"
 *
 * buildFontStringForMetrics(
 *   { fontFamily: 'CustomFont', fontSize: 12 },
 *   'deterministic',
 *   { deterministicFamily: 'Noto Sans', fallbackStack: ['Noto Sans', 'Arial'] }
 * )
 * // Returns: "12px Noto Sans, Arial"
 * ```
 */
function buildFontStringForMetrics(
  fontInfo: FontInfo,
  mode: 'browser' | 'deterministic',
  fonts: MeasurementFonts,
): string {
  const parts: string[] = [];

  if (fontInfo.italic) parts.push('italic');
  if (fontInfo.bold) parts.push('bold');
  parts.push(`${fontInfo.fontSize}px`);

  if (mode === 'deterministic') {
    parts.push(fonts.fallbackStack.length > 0 ? fonts.fallbackStack.join(', ') : fonts.deterministicFamily);
  } else {
    parts.push(fontInfo.fontFamily);
  }

  return parts.join(' ');
}

/**
 * Gets font metrics (ascent/descent) for the given font configuration.
 *
 * Uses the Canvas TextMetrics API to measure actual glyph bounds rather than
 * relying on hardcoded approximations. This prevents text clipping for fonts
 * with non-standard ascent/descent ratios.
 *
 * Results are cached to avoid repeated measurements.
 *
 * @param ctx - Canvas 2D rendering context
 * @param fontInfo - Font configuration (family, size, bold, italic)
 * @param mode - Measurement mode ('browser' or 'deterministic')
 * @param fonts - Font configuration for deterministic mode
 * @returns Font metrics with ascent and descent in pixels
 * @throws {TypeError} If canvas context is null or undefined
 * @throws {TypeError} If font size is not a positive finite number
 * @throws {TypeError} If font family is not a non-empty string
 * @throws {TypeError} If mode is not 'browser' or 'deterministic'
 *
 * @example
 * ```typescript
 * const ctx = canvas.getContext('2d');
 * const metrics = getFontMetrics(ctx, {
 *   fontFamily: 'Arial',
 *   fontSize: 16,
 *   bold: true
 * }, 'browser', { deterministicFamily: 'Noto Sans', fallbackStack: [] });
 * // Returns: { ascent: 14.5, descent: 3.8 }
 * ```
 */
export function getFontMetrics(
  ctx: CanvasRenderingContext2D,
  fontInfo: FontInfo,
  mode: 'browser' | 'deterministic',
  fonts: MeasurementFonts,
): FontMetricsResult {
  // Validate canvas context
  if (!ctx || typeof ctx !== 'object') {
    throw new TypeError('Canvas context must be a valid CanvasRenderingContext2D object');
  }

  // Validate font size: must be positive and finite
  if (typeof fontInfo.fontSize !== 'number' || !Number.isFinite(fontInfo.fontSize) || fontInfo.fontSize <= 0) {
    throw new TypeError(
      `Font size must be a positive finite number, got: ${typeof fontInfo.fontSize === 'number' ? fontInfo.fontSize : typeof fontInfo.fontSize}`,
    );
  }

  // Validate font family: must be non-empty string
  if (typeof fontInfo.fontFamily !== 'string' || fontInfo.fontFamily.trim().length === 0) {
    throw new TypeError('Font family must be a non-empty string');
  }

  // Validate mode parameter
  if (mode !== 'browser' && mode !== 'deterministic') {
    throw new TypeError(`Mode must be 'browser' or 'deterministic', got: ${mode}`);
  }

  const key = getFontKey(fontInfo);

  // Check cache first
  const cached = fontMetricsCache.get(key);
  if (cached) {
    return cached;
  }

  // Measure using Canvas API
  const font = buildFontStringForMetrics(fontInfo, mode, fonts);
  ctx.font = font;
  const textMetrics = ctx.measureText(METRICS_TEST_STRING);

  let ascent: number;
  let descent: number;

  // Use actual bounding box metrics if available (modern browsers)
  // These give the precise pixel dimensions of the rendered glyphs
  if (
    typeof textMetrics.actualBoundingBoxAscent === 'number' &&
    typeof textMetrics.actualBoundingBoxDescent === 'number' &&
    textMetrics.actualBoundingBoxAscent > 0
  ) {
    ascent = textMetrics.actualBoundingBoxAscent;
    descent = textMetrics.actualBoundingBoxDescent;
  } else {
    // Fallback to approximations for legacy browsers
    ascent = fontInfo.fontSize * 0.8;
    descent = fontInfo.fontSize * 0.2;
  }

  // Natural single-line height: prefer explicit calibration for fonts where
  // Word's intrinsic metrics differ from the browser's measurement, otherwise
  // use the browser's `fontBoundingBox*` values when exposed, otherwise leave
  // undefined and let the caller apply its own fallback.
  let naturalSingleLine: number | undefined = getCalibratedNaturalSingleLine(fontInfo.fontFamily, fontInfo.fontSize);
  if (
    naturalSingleLine == null &&
    typeof textMetrics.fontBoundingBoxAscent === 'number' &&
    typeof textMetrics.fontBoundingBoxDescent === 'number' &&
    textMetrics.fontBoundingBoxAscent > 0
  ) {
    naturalSingleLine = textMetrics.fontBoundingBoxAscent + textMetrics.fontBoundingBoxDescent;
  }

  const result: FontMetricsResult = { ascent, descent, naturalSingleLine };

  // Cache the result (with size limit)
  if (fontMetricsCache.size >= MAX_CACHE_SIZE) {
    // Remove oldest entry (first key)
    const firstKey = fontMetricsCache.keys().next().value;
    if (firstKey) {
      fontMetricsCache.delete(firstKey);
    }
  }
  fontMetricsCache.set(key, result);

  return result;
}

/**
 * Clears the font metrics cache.
 *
 * Removes all cached font metrics to ensure fresh measurements. Call this function
 * when fonts are loaded, unloaded, or changed to prevent stale metrics from being
 * used. This is particularly important for:
 * - Dynamic font loading (e.g., Google Fonts, custom web fonts)
 * - Font face updates or replacements
 * - Test isolation (clearing state between test cases)
 *
 * @returns void
 *
 * @example
 * ```typescript
 * // Clear cache after loading custom fonts
 * await document.fonts.ready;
 * clearFontMetricsCache();
 *
 * // Clear cache in test cleanup
 * afterEach(() => {
 *   clearFontMetricsCache();
 * });
 * ```
 */
export function clearFontMetricsCache(): void {
  fontMetricsCache.clear();
}

/**
 * Gets the current size of the font metrics cache.
 *
 * Returns the number of font metric entries currently stored in the cache.
 * Useful for debugging, monitoring memory usage, and understanding cache behavior.
 * The cache has a maximum size of MAX_CACHE_SIZE (1000 entries) and uses FIFO
 * eviction when the limit is reached.
 *
 * @returns The number of cached font metric entries (0 to MAX_CACHE_SIZE)
 *
 * @example
 * ```typescript
 * // Monitor cache growth during font measurements
 * console.log('Cache size before:', getFontMetricsCacheSize()); // 0
 * getFontMetrics(ctx, { fontFamily: 'Arial', fontSize: 16 }, 'browser', fonts);
 * console.log('Cache size after:', getFontMetricsCacheSize()); // 1
 *
 * // Verify cache clearing
 * clearFontMetricsCache();
 * console.log('Cache size:', getFontMetricsCacheSize()); // 0
 *
 * // Debug cache behavior in tests
 * const initialSize = getFontMetricsCacheSize();
 * measureManyFonts();
 * expect(getFontMetricsCacheSize()).toBeGreaterThan(initialSize);
 * ```
 */
export function getFontMetricsCacheSize(): number {
  return fontMetricsCache.size;
}
