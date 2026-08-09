/**
 * Font Metrics Cache
 *
 * Pre-measures character widths for common fonts using canvas measureText() API.
 * Enables fast character width lookups without repeated DOM operations.
 *
 * Population Strategy:
 * 1. On document load, scan all text runs for unique font combinations
 * 2. For each font, measure full printable ASCII + common Unicode via canvas
 * 3. Cache is persistent for session, keyed by font signature
 *
 * @module font-metrics-cache
 */

/**
 * Metrics for a specific font configuration.
 */
export interface FontMetrics {
  /** Map of character to width in pixels */
  charWidths: Map<string, number>;
  /** Width of space character in pixels */
  spaceWidth: number;
  /** Line height in pixels */
  lineHeight: number;
  /** Baseline offset from top in pixels */
  baseline: number;
  /** Average character width (fallback for unmeasured chars) */
  avgCharWidth: number;
  /** Timestamp when metrics were measured (for cache invalidation) */
  measuredAt: number;
}

/**
 * Configuration for font metrics caching.
 */
export interface FontMetricsCacheConfig {
  /** Font key in format "fontFamily|fontSize|fontWeight|fontStyle" */
  fontKey: string;
}

/**
 * Printable ASCII range (32-126)
 */
const PRINTABLE_ASCII = (() => {
  const chars: string[] = [];
  for (let i = 32; i <= 126; i++) {
    chars.push(String.fromCharCode(i));
  }
  return chars;
})();

/**
 * Common Unicode characters beyond ASCII that are frequently used.
 * Includes common punctuation, symbols, and Latin-1 supplement.
 */
const COMMON_UNICODE = [
  // Currency symbols
  '\u00A3', // £
  '\u00A5', // ¥
  '\u20AC', // €
  // Common punctuation
  '\u2013', // en dash
  '\u2014', // em dash
  '\u2018', // left single quote
  '\u2019', // right single quote
  '\u201C', // left double quote
  '\u201D', // right double quote
  '\u2026', // ellipsis
  // Common symbols
  '\u00A9', // ©
  '\u00AE', // ®
  '\u2122', // ™
  '\u00B0', // °
  '\u00B1', // ±
  '\u00D7', // ×
  '\u00F7', // ÷
  // Latin-1 accented characters (sample)
  '\u00C0',
  '\u00C1',
  '\u00C2',
  '\u00C3',
  '\u00C4',
  '\u00C5', // À Á Â Ã Ä Å
  '\u00E0',
  '\u00E1',
  '\u00E2',
  '\u00E3',
  '\u00E4',
  '\u00E5', // à á â ã ä å
  '\u00C8',
  '\u00C9',
  '\u00CA',
  '\u00CB', // È É Ê Ë
  '\u00E8',
  '\u00E9',
  '\u00EA',
  '\u00EB', // è é ê ë
];

/**
 * FontMetricsCache provides fast character width lookups by pre-measuring
 * character widths for font configurations using canvas measureText().
 *
 * This cache is essential for performance when calculating cursor positions,
 * as it avoids repeated DOM measurements.
 */
export class FontMetricsCache {
  private cache: Map<string, FontMetrics> = new Map();
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;

  /**
   * Creates a new FontMetricsCache instance.
   * Initializes the canvas context for measurements.
   */
  constructor() {
    this.initializeCanvas();
  }

  /**
   * Initializes the canvas and context for font measurements.
   *
   * Creates an offscreen 1x1 canvas with 2D rendering context optimized for
   * text measurement. The canvas is never attached to the DOM and is purely
   * used for the canvas.measureText() API.
   *
   * Performance considerations:
   * - Canvas is created once and reused for all measurements
   * - Size is minimal (1x1) as we only need measureText(), not rendering
   * - willReadFrequently hint optimizes for frequent measureText() calls
   *
   * Failure modes:
   * - Not in browser environment (SSR): Sets ctx to null, cache will be disabled
   * - Canvas creation fails: Catches error, sets ctx to null, measurements fall back to defaults
   *
   * Side effects:
   * - Creates this.canvas and this.ctx properties
   * - On failure, cache becomes read-only (getMetrics returns undefined for unmeasured fonts)
   *
   * @private
   */
  private initializeCanvas(): void {
    if (typeof document === 'undefined') {
      // Not in browser environment
      return;
    }

    try {
      this.canvas = document.createElement('canvas');
      this.canvas.width = 1;
      this.canvas.height = 1;
      this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
    } catch {
      // Canvas creation failed, cache will be disabled
    }
  }

  /**
   * Pre-warms the cache by measuring all characters for the specified fonts.
   *
   * @param fonts - Array of font configurations to pre-measure
   */
  warmCache(fonts: FontMetricsCacheConfig[]): void {
    for (const config of fonts) {
      // Validate fontKey format (should be "family|size|weight|style")
      if (!this.isValidFontKey(config.fontKey)) {
        console.warn(
          `[FontMetricsCache] Invalid fontKey format: "${config.fontKey}". Expected format: "family|size|weight|style". Skipping.`,
        );
        continue;
      }

      if (!this.cache.has(config.fontKey)) {
        this.measureFont(config.fontKey);
      }
    }
  }

  /**
   * Gets cached metrics for a font key.
   *
   * @param fontKey - Font key in format "fontFamily|fontSize|fontWeight|fontStyle"
   * @returns Font metrics if cached, undefined otherwise
   */
  getMetrics(fontKey: string): FontMetrics | undefined {
    return this.cache.get(fontKey);
  }

  /**
   * Measures a specific character if not already in cache.
   * If the font is not cached, measures the entire font first.
   *
   * @param fontKey - Font key in format "fontFamily|fontSize|fontWeight|fontStyle"
   * @param char - Character to measure
   * @returns Width of the character in pixels
   */
  measureChar(fontKey: string, char: string): number {
    let metrics = this.cache.get(fontKey);

    if (!metrics) {
      metrics = this.measureFont(fontKey);
    }

    const cached = metrics.charWidths.get(char);
    if (cached !== undefined) {
      return cached;
    }

    // Measure the character and cache it
    const width = this.measureCharWidth(fontKey, char);
    metrics.charWidths.set(char, width);

    return width;
  }

  /**
   * Measures all common characters for a font and caches the results.
   *
   * @param fontKey - Font key in format "fontFamily|fontSize|fontWeight|fontStyle"
   * @returns Measured font metrics
   * @private
   */
  private measureFont(fontKey: string): FontMetrics {
    if (!this.ctx) {
      // Canvas not available, return and cache default metrics so callers still get usable values
      const fallbackMetrics = this.createDefaultMetrics(fontKey);
      this.cache.set(fontKey, fallbackMetrics);
      return fallbackMetrics;
    }

    const { family, size, weight, style } = FontMetricsCache.parseFontKey(fontKey);
    this.ctx.font = `${style} ${weight} ${size}px ${family}`;

    const charWidths = new Map<string, number>();

    // Measure printable ASCII
    for (const char of PRINTABLE_ASCII) {
      const width = this.ctx.measureText(char).width;
      charWidths.set(char, width);
    }

    // Measure common Unicode
    for (const char of COMMON_UNICODE) {
      const width = this.ctx.measureText(char).width;
      charWidths.set(char, width);
    }

    // Calculate space width
    const spaceWidth = charWidths.get(' ') ?? size * 0.25;

    // Calculate average character width
    let totalWidth = 0;
    let count = 0;
    for (const width of charWidths.values()) {
      totalWidth += width;
      count++;
    }
    const avgCharWidth = count > 0 ? totalWidth / count : size * 0.5;

    // Get font metrics (baseline, line height)
    const textMetrics = this.ctx.measureText('M');
    const ascent = textMetrics.actualBoundingBoxAscent || size * 0.8;
    const descent = textMetrics.actualBoundingBoxDescent || size * 0.2;
    const lineHeight = ascent + descent;
    const baseline = ascent;

    const metrics: FontMetrics = {
      charWidths,
      spaceWidth,
      lineHeight,
      baseline,
      avgCharWidth,
      measuredAt: Date.now(),
    };

    this.cache.set(fontKey, metrics);
    return metrics;
  }

  /**
   * Measures the width of a single character.
   *
   * @param fontKey - Font key in format "fontFamily|fontSize|fontWeight|fontStyle"
   * @param char - Character to measure
   * @returns Width in pixels
   * @private
   */
  private measureCharWidth(fontKey: string, char: string): number {
    if (!this.ctx) {
      const { size } = FontMetricsCache.parseFontKey(fontKey);
      return size * 0.5; // Default fallback
    }

    const { family, size, weight, style } = FontMetricsCache.parseFontKey(fontKey);
    this.ctx.font = `${style} ${weight} ${size}px ${family}`;

    return this.ctx.measureText(char).width;
  }

  /**
   * Creates default metrics when canvas is not available.
   *
   * @returns Default font metrics
   * @private
   */
  private createDefaultMetrics(fontKey?: string): FontMetrics {
    const { size } = FontMetricsCache.parseFontKey(fontKey ?? '');
    return {
      charWidths: new Map(),
      spaceWidth: size * 0.25,
      lineHeight: size * 1.2,
      baseline: size * 0.8,
      avgCharWidth: size * 0.5,
      measuredAt: Date.now(),
    };
  }

  /**
   * Generates a font key from font properties.
   *
   * @param family - Font family name
   * @param size - Font size in pixels
   * @param weight - Font weight (e.g., 'normal', 'bold', '400', '700')
   * @param style - Font style (e.g., 'normal', 'italic')
   * @returns Font key string
   */
  static createFontKey(family: string, size: number, weight: string = 'normal', style: string = 'normal'): string {
    return `${family}|${size}|${weight}|${style}`;
  }

  /**
   * Parses a font key into its components.
   *
   * @param fontKey - Font key string
   * @returns Font properties
   * @private
   */
  private static parseFontKey(fontKey: string): {
    family: string;
    size: number;
    weight: string;
    style: string;
  } {
    const parts = fontKey.split('|');
    return {
      family: parts[0] || 'Arial',
      size: Number(parts[1]) || 16,
      weight: parts[2] || 'normal',
      style: parts[3] || 'normal',
    };
  }

  /**
   * Clears all cached metrics.
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Gets the number of cached font configurations.
   */
  get size(): number {
    return this.cache.size;
  }

  /**
   * Checks if metrics exist for a font key.
   *
   * @param fontKey - Font key to check
   * @returns True if metrics are cached
   */
  has(fontKey: string): boolean {
    return this.cache.has(fontKey);
  }

  /**
   * Validates fontKey format.
   *
   * @param fontKey - Font key to validate
   * @returns True if fontKey has valid format "family|size|weight|style"
   * @private
   */
  private isValidFontKey(fontKey: string): boolean {
    if (!fontKey || typeof fontKey !== 'string') {
      return false;
    }

    const parts = fontKey.split('|');
    if (parts.length !== 4) {
      return false;
    }

    const [family, size, weight, style] = parts;

    // Validate family is non-empty
    if (!family || family.trim().length === 0) {
      return false;
    }

    // Validate size is a positive number
    const sizeNum = Number(size);
    if (isNaN(sizeNum) || sizeNum <= 0) {
      return false;
    }

    // Validate weight and style are non-empty
    if (!weight || !style) {
      return false;
    }

    return true;
  }
}
