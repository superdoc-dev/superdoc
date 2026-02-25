/**
 * Helpers for building the blocks/runs match hierarchy from ProseMirror state.
 *
 * Responsibilities:
 * - Mark-signature comparison for run coalescing (D4).
 * - Style projection from PM marks to contract MatchStyle (D15, D10a).
 * - Color normalization via fixed CSS Named Colors table (D15).
 *
 * All functions are pure — no editor state mutation.
 */

import type { MatchStyle, MatchRun } from '@superdoc/document-api';
import type { CapturedRun } from './style-resolver.js';
import { planError } from './errors.js';

/** A PM mark as visible on CapturedRun.marks — minimal shape for style extraction. */
type PmMark = CapturedRun['marks'][number];

// ---------------------------------------------------------------------------
// Mark-signature equality (D4)
// ---------------------------------------------------------------------------

/**
 * Returns true when two mark arrays are structurally identical — same marks
 * in the same order with the same attrs. Uses PM's own `eq` method which
 * compares type + attrs.
 */
export function marksEqual(a: readonly PmMark[], b: readonly PmMark[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (!a[i].eq(b[i])) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Run coalescing (D4)
// ---------------------------------------------------------------------------

/**
 * Coalesces adjacent CapturedRuns with identical mark-signatures into merged
 * runs. Drops zero-width runs. Returns runs in offset order.
 *
 * Input: raw PM text node runs within a matched block range.
 * Output: coalesced runs ready for projection to contract MatchRun[].
 */
export function coalesceRuns(runs: CapturedRun[]): CapturedRun[] {
  if (runs.length === 0) return [];

  const sorted = [...runs].sort((a, b) => a.from - b.from);
  const result: CapturedRun[] = [];

  // Find the first non-zero-width run to seed the coalescing loop.
  let startIndex = 0;
  while (startIndex < sorted.length && sorted[startIndex].from >= sorted[startIndex].to) {
    startIndex++;
  }
  if (startIndex >= sorted.length) return [];

  let current = { ...sorted[startIndex] };

  for (let i = startIndex + 1; i < sorted.length; i++) {
    const next = sorted[i];

    // Drop zero-width runs
    if (next.from >= next.to) continue;

    if (next.from === current.to && marksEqual(current.marks, next.marks)) {
      // Adjacent with identical mark-signature → merge
      current = {
        from: current.from,
        to: next.to,
        charCount: current.charCount + next.charCount,
        marks: current.marks,
      };
    } else {
      if (current.charCount > 0) result.push(current);
      current = { ...next };
    }
  }

  if (current.charCount > 0) result.push(current);

  return result;
}

// ---------------------------------------------------------------------------
// Style projection: PM marks → MatchStyle (D15)
// ---------------------------------------------------------------------------

/**
 * Projects PM marks into a contract MatchStyle.
 *
 * Core-4 booleans are derived from mark presence.
 * Optional fields use runProperties → textStyle precedence (D15, Phase 2).
 */
export function toMatchStyle(marks: readonly PmMark[]): MatchStyle {
  const style: MatchStyle = {
    bold: marks.some((m) => m.type.name === 'bold'),
    italic: marks.some((m) => m.type.name === 'italic'),
    underline: marks.some((m) => m.type.name === 'underline'),
    strike: marks.some((m) => m.type.name === 'strike'),
  };

  // Extract optional presentational fields with runProperties > textStyle precedence
  const runProps = marks.find((m) => m.type.name === 'runProperties');
  const textStyle = marks.find((m) => m.type.name === 'textStyle');

  const color = extractAttr(runProps, 'color') ?? extractAttr(textStyle, 'color');
  const normalizedColor = color != null ? normalizeHexColor(String(color)) : undefined;
  if (normalizedColor) style.color = normalizedColor;

  const highlight = extractAttr(runProps, 'highlight') ?? extractAttr(textStyle, 'highlight');
  const normalizedHighlight = highlight != null ? normalizeHexColor(String(highlight)) : undefined;
  if (normalizedHighlight) style.highlight = normalizedHighlight;

  const fontFamily = extractAttr(runProps, 'fontFamily') ?? extractAttr(textStyle, 'fontFamily');
  if (typeof fontFamily === 'string' && fontFamily.trim().length > 0) {
    style.fontFamily = fontFamily;
  }

  // fontSize with half-point awareness (D15):
  // runProperties stores OOXML half-points (w:sz w:val) — divide by 2 to get points.
  // textStyle stores CSS/standard values — use as-is.
  const rpFontSize = extractAttr(runProps, 'fontSize');
  const rawFontSize = rpFontSize ?? extractAttr(textStyle, 'fontSize');
  const fontSizeSource = rpFontSize != null ? 'runProperties' : 'textStyle';
  const normalizedFontSize =
    fontSizeSource === 'runProperties' && typeof rawFontSize === 'number' ? rawFontSize / 2 : rawFontSize;
  const parsedSize = parseFontSizePt(normalizedFontSize);
  if (parsedSize !== undefined) style.fontSizePt = parsedSize;

  return style;
}

function extractAttr(mark: PmMark | undefined, key: string): unknown {
  if (!mark) return undefined;
  const val = mark.attrs[key];
  return val === undefined || val === null ? undefined : val;
}

// ---------------------------------------------------------------------------
// Run-level styleId extraction (D10a)
// ---------------------------------------------------------------------------

/**
 * Extracts the OOXML character style definition ID from a run's marks.
 * Returns undefined if no runProperties mark or no styleId attr.
 */
export function extractRunStyleId(marks: readonly PmMark[]): string | undefined {
  const runProps = marks.find((m) => m.type.name === 'runProperties');
  if (!runProps) return undefined;
  const id = runProps.attrs.styleId;
  return typeof id === 'string' && id.length > 0 ? id : undefined;
}

// ---------------------------------------------------------------------------
// Color normalization (D15)
// ---------------------------------------------------------------------------

/**
 * Normalizes a color value to 6-digit lowercase hex with `#` prefix.
 * Returns undefined if the value cannot be parsed.
 *
 * Accepts: `#rgb`, `#rrggbb`, `rgb(r,g,b)`, CSS named colors.
 * Uses a fixed internal lookup table for named colors (D15).
 */
export function normalizeHexColor(raw: string): string | undefined {
  if (!raw || typeof raw !== 'string') return undefined;

  const trimmed = raw.trim().toLowerCase();
  if (!trimmed) return undefined;

  // Already 6-digit hex
  if (/^#[0-9a-f]{6}$/.test(trimmed)) return trimmed;

  // 3-digit hex shorthand → expand
  if (/^#[0-9a-f]{3}$/.test(trimmed)) {
    const [, r, g, b] = trimmed;
    return `#${r}${r}${g}${g}${b}${b}`;
  }

  // Bare 6-digit hex (no #)
  if (/^[0-9a-f]{6}$/.test(trimmed)) return `#${trimmed}`;

  // rgb(r, g, b)
  const rgbMatch = trimmed.match(/^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/);
  if (rgbMatch) {
    const [, rs, gs, bs] = rgbMatch;
    const r = parseInt(rs, 10);
    const g = parseInt(gs, 10);
    const b = parseInt(bs, 10);
    if (r <= 255 && g <= 255 && b <= 255) {
      return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
    }
  }

  // Named CSS color lookup
  const named = CSS_NAMED_COLORS[trimmed];
  if (named) return named;

  // Unparseable → omit
  return undefined;
}

// ---------------------------------------------------------------------------
// Font size parsing (D15)
// ---------------------------------------------------------------------------

/**
 * Parses a font size value to points. Handles:
 * - Numbers (returned as-is if valid)
 * - Half-point numbers (detected by being >= 2x what's reasonable; divided by 2)
 * - Strings like "12pt", "24" (strips unit suffix, parses numeric)
 *
 * Returns undefined for unparseable, NaN, Infinity, or negative values.
 * Rounds to 1 decimal place.
 */
export function parseFontSizePt(raw: unknown): number | undefined {
  if (raw === undefined || raw === null) return undefined;

  let value: number;

  if (typeof raw === 'number') {
    value = raw;
  } else if (typeof raw === 'string') {
    // Strip common unit suffixes
    const cleaned = raw.replace(/\s*(pt|px|hp)$/i, '').trim();
    value = parseFloat(cleaned);
  } else {
    return undefined;
  }

  if (!Number.isFinite(value) || value < 0) return undefined;

  // Round to 1 decimal place
  return Math.round(value * 10) / 10;
}

// ---------------------------------------------------------------------------
// Run-tiling invariant assertion (D4)
// ---------------------------------------------------------------------------

/**
 * Asserts that runs exactly tile their parent block's range.
 * Throws INTERNAL_ERROR on violation — this indicates a bug in our code.
 */
export function assertRunTilingInvariant(
  runs: MatchRun[],
  blockRange: { start: number; end: number },
  blockId: string,
): void {
  if (runs.length === 0) {
    if (blockRange.start !== blockRange.end) {
      throw planError('INTERNAL_ERROR', `run-tiling: no runs for non-empty block range in block ${blockId}`);
    }
    return;
  }

  if (runs[0].range.start !== blockRange.start) {
    throw planError(
      'INTERNAL_ERROR',
      `run-tiling: first run starts at ${runs[0].range.start} but block range starts at ${blockRange.start} in block ${blockId}`,
    );
  }

  if (runs[runs.length - 1].range.end !== blockRange.end) {
    throw planError(
      'INTERNAL_ERROR',
      `run-tiling: last run ends at ${runs[runs.length - 1].range.end} but block range ends at ${blockRange.end} in block ${blockId}`,
    );
  }

  for (let i = 0; i < runs.length - 1; i++) {
    if (runs[i].range.end !== runs[i + 1].range.start) {
      throw planError(
        'INTERNAL_ERROR',
        `run-tiling: gap or overlap between runs[${i}] and runs[${i + 1}] in block ${blockId}`,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// CSS Named Colors — fixed 148-entry lookup table (D15)
// ---------------------------------------------------------------------------

const CSS_NAMED_COLORS: Record<string, string> = {
  aliceblue: '#f0f8ff',
  antiquewhite: '#faebd7',
  aqua: '#00ffff',
  aquamarine: '#7fffd4',
  azure: '#f0ffff',
  beige: '#f5f5dc',
  bisque: '#ffe4c4',
  black: '#000000',
  blanchedalmond: '#ffebcd',
  blue: '#0000ff',
  blueviolet: '#8a2be2',
  brown: '#a52a2a',
  burlywood: '#deb887',
  cadetblue: '#5f9ea0',
  chartreuse: '#7fff00',
  chocolate: '#d2691e',
  coral: '#ff7f50',
  cornflowerblue: '#6495ed',
  cornsilk: '#fff8dc',
  crimson: '#dc143c',
  cyan: '#00ffff',
  darkblue: '#00008b',
  darkcyan: '#008b8b',
  darkgoldenrod: '#b8860b',
  darkgray: '#a9a9a9',
  darkgreen: '#006400',
  darkgrey: '#a9a9a9',
  darkkhaki: '#bdb76b',
  darkmagenta: '#8b008b',
  darkolivegreen: '#556b2f',
  darkorange: '#ff8c00',
  darkorchid: '#9932cc',
  darkred: '#8b0000',
  darksalmon: '#e9967a',
  darkseagreen: '#8fbc8f',
  darkslateblue: '#483d8b',
  darkslategray: '#2f4f4f',
  darkslategrey: '#2f4f4f',
  darkturquoise: '#00ced1',
  darkviolet: '#9400d3',
  deeppink: '#ff1493',
  deepskyblue: '#00bfff',
  dimgray: '#696969',
  dimgrey: '#696969',
  dodgerblue: '#1e90ff',
  firebrick: '#b22222',
  floralwhite: '#fffaf0',
  forestgreen: '#228b22',
  fuchsia: '#ff00ff',
  gainsboro: '#dcdcdc',
  ghostwhite: '#f8f8ff',
  gold: '#ffd700',
  goldenrod: '#daa520',
  gray: '#808080',
  green: '#008000',
  greenyellow: '#adff2f',
  grey: '#808080',
  honeydew: '#f0fff0',
  hotpink: '#ff69b4',
  indianred: '#cd5c5c',
  indigo: '#4b0082',
  ivory: '#fffff0',
  khaki: '#f0e68c',
  lavender: '#e6e6fa',
  lavenderblush: '#fff0f5',
  lawngreen: '#7cfc00',
  lemonchiffon: '#fffacd',
  lightblue: '#add8e6',
  lightcoral: '#f08080',
  lightcyan: '#e0ffff',
  lightgoldenrodyellow: '#fafad2',
  lightgray: '#d3d3d3',
  lightgreen: '#90ee90',
  lightgrey: '#d3d3d3',
  lightpink: '#ffb6c1',
  lightsalmon: '#ffa07a',
  lightseagreen: '#20b2aa',
  lightskyblue: '#87cefa',
  lightslategray: '#778899',
  lightslategrey: '#778899',
  lightsteelblue: '#b0c4de',
  lightyellow: '#ffffe0',
  lime: '#00ff00',
  limegreen: '#32cd32',
  linen: '#faf0e6',
  magenta: '#ff00ff',
  maroon: '#800000',
  mediumaquamarine: '#66cdaa',
  mediumblue: '#0000cd',
  mediumorchid: '#ba55d3',
  mediumpurple: '#9370db',
  mediumseagreen: '#3cb371',
  mediumslateblue: '#7b68ee',
  mediumspringgreen: '#00fa9a',
  mediumturquoise: '#48d1cc',
  mediumvioletred: '#c71585',
  midnightblue: '#191970',
  mintcream: '#f5fffa',
  mistyrose: '#ffe4e1',
  moccasin: '#ffe4b5',
  navajowhite: '#ffdead',
  navy: '#000080',
  oldlace: '#fdf5e6',
  olive: '#808000',
  olivedrab: '#6b8e23',
  orange: '#ffa500',
  orangered: '#ff4500',
  orchid: '#da70d6',
  palegoldenrod: '#eee8aa',
  palegreen: '#98fb98',
  paleturquoise: '#afeeee',
  palevioletred: '#db7093',
  papayawhip: '#ffefd5',
  peachpuff: '#ffdab9',
  peru: '#cd853f',
  pink: '#ffc0cb',
  plum: '#dda0dd',
  powderblue: '#b0e0e6',
  purple: '#800080',
  rebeccapurple: '#663399',
  red: '#ff0000',
  rosybrown: '#bc8f8f',
  royalblue: '#4169e1',
  saddlebrown: '#8b4513',
  salmon: '#fa8072',
  sandybrown: '#f4a460',
  seagreen: '#2e8b57',
  seashell: '#fff5ee',
  sienna: '#a0522d',
  silver: '#c0c0c0',
  skyblue: '#87ceeb',
  slateblue: '#6a5acd',
  slategray: '#708090',
  slategrey: '#708090',
  snow: '#fffafa',
  springgreen: '#00ff7f',
  steelblue: '#4682b4',
  tan: '#d2b48c',
  teal: '#008080',
  thistle: '#d8bfd8',
  tomato: '#ff6347',
  turquoise: '#40e0d0',
  violet: '#ee82ee',
  wheat: '#f5deb3',
  white: '#ffffff',
  whitesmoke: '#f5f5f5',
  yellow: '#ffff00',
  yellowgreen: '#9acd32',
};
