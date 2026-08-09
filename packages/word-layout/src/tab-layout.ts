import { pixelsToTwips, twipsToPixels } from './unit-conversions.js';
import type { ParagraphIndent, ResolvedTabStop } from './types.js';

/**
 * Tab alignment type supporting all Word-compatible alignment modes.
 * Used throughout tab stop processing to ensure type safety.
 */
export type TabAlignment = 'start' | 'center' | 'end' | 'decimal' | 'bar' | 'num';

/**
 * Raw tab stop data as received from various document parsers.
 *
 * Different parsers may use different property names for the same concepts:
 * - `val`, `align`, `alignment`, or `type` for alignment mode
 * - `originalPos` for positions already in twips (no conversion needed)
 * - `pos`, `position`, or `offset` for positions in pixels (require conversion to twips)
 * - `leader` for the optional leader character style
 *
 * This flexible structure allows the normalization functions to handle
 * tab stop data from multiple sources without requiring parser-specific code.
 */
export type RawTabStop = {
  val?: string;
  align?: string;
  alignment?: string;
  type?: string;
  originalPos?: number;
  pos?: number;
  position?: number;
  offset?: number;
  leader?: 'none' | 'dot' | 'heavy' | 'hyphen' | 'middleDot' | 'underscore';
};

/**
 * Normalized tab stop with positions standardized to twips.
 *
 * This is the intermediate format used during tab stop processing.
 * All position values are guaranteed to be in twips (1/1440 inch),
 * allowing consistent calculations regardless of the original source format.
 * The alignment is validated and normalized to standard values.
 */
export type NormalizedTabStopTwips = {
  alignment: TabAlignment;
  positionTwips: number;
  leader?: RawTabStop['leader'];
};

/**
 * Options for computing the final set of tab stops.
 *
 * Controls whether to use explicit tab stops or generate default stops,
 * and how to position default stops when generated.
 */
export type ComputeTabStopsOptions = {
  /** Pre-normalized explicit tab stops to use instead of generating defaults */
  explicitStops?: NormalizedTabStopTwips[];
  /** Interval between default tab stops in twips (typically 720 = 0.5 inch) */
  defaultTabIntervalTwips?: number;
  /** Starting offset for default tab stop calculation (e.g., left indent) */
  startTwips?: number;
};

/**
 * Options for building the complete effective tab stop set.
 *
 * Integrates tab stops from multiple sources: paragraph-level explicit stops,
 * paragraph-level defaults, and document-level defaults. Also handles
 * decimal separator configuration for decimal-aligned tabs.
 */
export type BuildEffectiveTabStopsOptions = {
  /** Raw tab stops defined explicitly on the paragraph */
  explicitStops?: RawTabStop[];
  /** Paragraph indentation affecting tab stop positioning */
  paragraphIndent?: ParagraphIndent;
  /** Paragraph-level default tab interval (overrides document default) */
  paragraphTabIntervalTwips?: number;
  /** Document-level default tab interval */
  defaultTabIntervalTwips?: number;
  /** Character to use for decimal alignment (e.g., '.' or ',') */
  decimalSeparator?: string;
};

/**
 * Maximum number of default tab stops to generate.
 *
 * Microsoft Word generates 12 default tab stops at regular intervals
 * when no explicit tab stops are defined. This matches Word's standard
 * behavior to ensure consistent layout compatibility.
 */
const MAX_DEFAULT_TABS = 12;

/**
 * Default interval between tab stops in twips.
 *
 * 720 twips = 0.5 inch, which is Microsoft Word's default tab interval.
 * This value is used when no explicit interval is provided.
 */
const DEFAULT_TAB_INTERVAL_TWIPS = 720;

/**
 * Normalizes alignment values from various formats to standard alignment types.
 *
 * Handles case-insensitive alignment names, legacy alignment values (left/right),
 * and unknown values by mapping them to standard alignment types. This ensures
 * consistent alignment handling across different document formats.
 *
 * @param value - Alignment value from document source (may be undefined, empty, or unknown)
 * @returns Normalized TabAlignment, null if no valid alignment provided, or 'start' for unknown values
 *
 * @example
 * ```typescript
 * normalizeAlignment('LEFT')    // returns 'start'
 * normalizeAlignment('Right')   // returns 'end'
 * normalizeAlignment('decimal') // returns 'decimal'
 * normalizeAlignment('')        // returns null
 * normalizeAlignment('unknown') // returns 'start' (fallback)
 * normalizeAlignment(undefined) // returns null
 * ```
 */
export const normalizeAlignment = (value?: string): TabAlignment | null => {
  if (!value) return null;
  const normalized = value.toLowerCase().trim();
  switch (normalized) {
    case 'left':
      return 'start';
    case 'right':
      return 'end';
    case 'center':
    case 'decimal':
    case 'bar':
    case 'num':
    case 'start':
    case 'end':
      return normalized;
    default:
      return 'start';
  }
};

/**
 * Normalizes raw tab stop data into a consistent format with positions in twips.
 *
 * This function processes various tab stop representations (which may use different
 * property names and units) into a standardized format suitable for layout calculations.
 * It handles alignment normalization, position unit conversion, and sorting.
 *
 * @param candidateStops - Array of raw tab stop objects from document parsing.
 *   May be null, undefined, or contain malformed entries.
 * @returns Array of normalized tab stops sorted by position, with positions in twips
 *
 * @example
 * ```typescript
 * const stops = normalizeExplicitTabStops([
 *   { val: 'left', pos: 48 },           // Position in pixels
 *   { val: 'right', originalPos: 1440 }, // Position in twips
 *   { val: 'decimal', pos: 96, leader: 'dot' }
 * ]);
 *
 * console.log(stops);
 * // [
 * //   { alignment: 'start', positionTwips: 720, leader: undefined },
 * //   { alignment: 'end', positionTwips: 1440, leader: undefined },
 * //   { alignment: 'decimal', positionTwips: 1440, leader: 'dot' }
 * // ]
 * ```
 */
export const normalizeExplicitTabStops = (candidateStops?: RawTabStop[] | null): NormalizedTabStopTwips[] => {
  if (!Array.isArray(candidateStops)) return [];
  const result: NormalizedTabStopTwips[] = [];
  for (const stop of candidateStops) {
    if (!stop || typeof stop !== 'object') continue;
    const alignment = normalizeAlignment(stop.val ?? stop.align ?? stop.alignment ?? stop.type);
    if (!alignment) continue;
    const originalPos = stop.originalPos;
    let positionTwips: number | null = null;
    if (originalPos != null && Number.isFinite(originalPos)) {
      positionTwips = Number(originalPos);
    } else {
      const pxCandidate = stop.pos ?? stop.position ?? stop.offset;
      if (pxCandidate != null && Number.isFinite(pxCandidate)) {
        positionTwips = pixelsToTwips(Number(pxCandidate));
      }
    }
    if (positionTwips == null || !Number.isFinite(positionTwips)) {
      continue;
    }
    result.push({
      alignment,
      positionTwips,
      leader: stop.leader,
    });
  }
  return result.sort((a, b) => a.positionTwips - b.positionTwips);
};

/**
 * Computes the final list of tab stops, using either explicit stops or generating
 * default stops at regular intervals.
 *
 * When explicit tab stops are provided, they are used directly. Otherwise, this function
 * generates a default set of equally-spaced tab stops based on the default interval.
 *
 * @param options - Configuration for tab stop computation
 * @param options.explicitStops - Pre-normalized explicit tab stops to use
 * @param options.defaultTabIntervalTwips - Interval between default tab stops in twips
 * @param options.startTwips - Starting offset for default tab stop calculation
 * @returns Array of tab stops sorted by position
 *
 * @example
 * ```typescript
 * // Using explicit stops
 * const explicit = computeTabStops({
 *   explicitStops: [
 *     { alignment: 'start', positionTwips: 720 },
 *     { alignment: 'end', positionTwips: 1440 }
 *   ]
 * });
 *
 * // Generating default stops
 * const defaults = computeTabStops({
 *   defaultTabIntervalTwips: 720,
 *   startTwips: 0
 * });
 * // Returns 12 stops at 720, 1440, 2160, ... twips
 * ```
 */
export const computeTabStops = (options: ComputeTabStopsOptions): NormalizedTabStopTwips[] => {
  const explicitStops = Array.isArray(options?.explicitStops) ? options.explicitStops.filter(Boolean) : [];
  if (explicitStops.length) {
    return [...explicitStops].sort((a, b) => a.positionTwips - b.positionTwips);
  }
  const interval = Number(options?.defaultTabIntervalTwips);
  const start = Number(options?.startTwips) || 0;
  if (!Number.isFinite(interval) || interval <= 0) {
    return [];
  }
  const stops: NormalizedTabStopTwips[] = [];
  for (let i = 1; i <= MAX_DEFAULT_TABS; i++) {
    stops.push({
      alignment: 'start',
      positionTwips: start + i * interval,
    });
  }
  return stops;
};

/**
 * Builds the complete set of effective tab stops in pixels, accounting for paragraph
 * indentation and document defaults.
 *
 * This is the primary tab stop resolution function that integrates all sources of tab
 * configuration: explicit paragraph tab stops, paragraph-level defaults, and document-level
 * defaults. It also handles decimal separator characters for decimal-aligned tabs.
 *
 * @param options - Options for building effective tab stops
 * @param options.explicitStops - Raw tab stops defined on the paragraph
 * @param options.paragraphIndent - Paragraph indentation that affects tab stop positioning
 * @param options.paragraphTabIntervalTwips - Paragraph-level default tab interval
 * @param options.defaultTabIntervalTwips - Document-level default tab interval
 * @param options.decimalSeparator - Character to use for decimal alignment (e.g., '.' or ',')
 * @returns Array of resolved tab stops with positions in pixels
 *
 * @example
 * ```typescript
 * const stops = buildEffectiveTabStopsPx({
 *   explicitStops: [
 *     { val: 'decimal', pos: 96, leader: 'dot' }
 *   ],
 *   paragraphIndent: { left: 24 },
 *   defaultTabIntervalTwips: 720,
 *   decimalSeparator: ','
 * });
 *
 * console.log(stops[0]);
 * // {
 * //   alignment: 'decimal',
 * //   position: 96,
 * //   leader: 'dot',
 * //   decimalChar: ','
 * // }
 * ```
 */
export const buildEffectiveTabStopsPx = (options: BuildEffectiveTabStopsOptions): ResolvedTabStop[] => {
  const paragraphIndent = options.paragraphIndent || {};
  const indentTwips = {
    left: pixelsToTwips(paragraphIndent.left),
    right: pixelsToTwips(paragraphIndent.right),
    firstLine: pixelsToTwips(paragraphIndent.firstLine),
    hanging: pixelsToTwips(paragraphIndent.hanging),
  };

  const explicitStops = normalizeExplicitTabStops(options.explicitStops);

  const interval = Number.isFinite(options.paragraphTabIntervalTwips)
    ? Number(options.paragraphTabIntervalTwips)
    : Number.isFinite(options.defaultTabIntervalTwips)
      ? Number(options.defaultTabIntervalTwips)
      : DEFAULT_TAB_INTERVAL_TWIPS;

  const stopsTwips = computeTabStops({
    explicitStops,
    defaultTabIntervalTwips: interval,
    startTwips: indentTwips.left ?? 0,
  });

  const decimalChar = options.decimalSeparator;

  return stopsTwips.map<ResolvedTabStop>((stop) => ({
    position: twipsToPixels(stop.positionTwips),
    alignment: stop.alignment,
    leader: stop.leader ?? undefined,
    ...(stop.alignment === 'decimal' && decimalChar ? { decimalChar } : {}),
  }));
};
