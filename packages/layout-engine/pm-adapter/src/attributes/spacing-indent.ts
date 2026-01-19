/**
 * Spacing & Indent Normalization Module
 *
 * Functions for converting spacing and indent between pixels and points,
 * and normalizing raw attributes.
 */

import type { ParagraphAttrs, ParagraphSpacing } from '@superdoc/contracts';
import type { ParagraphSpacing as OoxmlParagraphSpacing } from '@superdoc/style-engine/ooxml';
import { twipsToPx, pickNumber } from '../utilities.js';

/**
 * Maximum line spacing multiplier for auto line spacing.
 *
 * OOXML auto line spacing uses multipliers (e.g., 1.5 for 1.5x line spacing).
 * Values above this threshold are assumed to be OOXML "240ths of a line" values.
 *
 * Rationale: Typical multipliers are 1.0-3.0. The minimum meaningful twips
 * value for line spacing is ~240 (12pt font), so 10 provides a safe boundary.
 */
const MAX_AUTO_LINE_MULTIPLIER = 10;

/**
 * Threshold for distinguishing pixel values from twips in indent values.
 *
 * Values with absolute value <= 50 are treated as already-converted pixels.
 * Values > 50 are treated as twips and converted to pixels.
 *
 * Limitation: This creates an ambiguous zone where legitimate pixel values
 * 51-100 will be incorrectly converted from twips. This is a known limitation
 * of the heuristic approach used when the source format is ambiguous.
 */

/**
 * Normalizes paragraph alignment values from OOXML format.
 *
 * Maps OOXML alignment values to standard alignment format. Case-sensitive.
 * Converts 'start'/'end' to 'left'/'right'. Unknown values return undefined.
 *
 * IMPORTANT: 'left' must return 'left' (not undefined) so that explicit left alignment
 * from paragraph properties can override style-based center/right alignment.
 *
 * @param value - OOXML alignment value ('center', 'right', 'justify', 'start', 'end', 'left')
 * @returns Normalized alignment value, or undefined if invalid
 *
 * @example
 * ```typescript
 * normalizeAlignment('center'); // 'center'
 * normalizeAlignment('left'); // 'left'
 * normalizeAlignment('start'); // 'left'
 * normalizeAlignment('end'); // 'right'
 * normalizeAlignment('CENTER'); // undefined (case-sensitive)
 * ```
 */

export const normalizeAlignment = (value: unknown): ParagraphAttrs['alignment'] => {
  switch (value) {
    case 'center':
    case 'right':
    case 'justify':
    case 'left':
      return value;
    case 'both':
    case 'distribute':
    case 'numTab':
    case 'thaiDistribute':
      return 'justify';
    case 'end':
      return 'right';
    case 'start':
      return 'left';
    default:
      return undefined;
  }
};

/**
 * Normalizes paragraph spacing from raw OOXML attributes.
 *
 * Converts spacing values from twips to pixels, handling both standard OOXML
 * properties (before, after, line) and alternative properties (lineSpaceBefore, lineSpaceAfter).
 * For auto line spacing, values <= 10 are treated as multipliers, larger values are treated as
 * OOXML "240ths of a line" and converted to multipliers (e.g., 276 -> 1.15).
 * If w:line is present but w:lineRule is missing, defaults to 'auto' per OOXML.
 *
 * @param value - Raw OOXML spacing object with properties like before, after, line, lineRule
 * @returns Normalized spacing object with values in pixels, or undefined if no valid spacing
 *
 * @example
 * ```typescript
 * normalizeParagraphSpacing({ before: 240, after: 240, line: 360, lineRule: 'auto' });
 * // { before: 16, after: 16, line: 1.5, lineRule: 'auto' } (line is multiplier)
 *
 * normalizeParagraphSpacing({ before: 240, line: 480, lineRule: 'exact' });
 * // { before: 16, line: 32, lineRule: 'exact' } (line converted from twips)
 * ```
 */
export const normalizeParagraphSpacing = (
  value: OoxmlParagraphSpacing | undefined,
  isList: boolean,
): ParagraphSpacing | undefined => {
  if (!value || typeof value !== 'object') return undefined;
  const spacing: ParagraphSpacing = {};

  let before = pickNumber(value.before);
  let after = pickNumber(value.after);
  const lineRaw = pickNumber(value.line);
  const lineRule = normalizeLineRule(value.lineRule);
  const beforeAutospacing = value.beforeAutospacing;
  const afterAutospacing = value.afterAutospacing;

  if (beforeAutospacing && isList) {
    before = undefined;
  }
  if (afterAutospacing && isList) {
    after = undefined;
  }

  const line = normalizeLineValue(lineRaw, lineRule);

  if (before != null) spacing.before = twipsToPx(before);
  if (after != null) spacing.after = twipsToPx(after);
  if (line != null) spacing.line = line;
  if (lineRule != null) spacing.lineRule = lineRule;
  if (beforeAutospacing != null) spacing.beforeAutospacing = beforeAutospacing;
  if (afterAutospacing != null) spacing.afterAutospacing = afterAutospacing;

  return Object.keys(spacing).length > 0 ? spacing : undefined;
};

const normalizeLineValue = (
  value: number | undefined,
  lineRule: ParagraphSpacing['lineRule'] | undefined,
): number | undefined => {
  if (value == null) return undefined;
  if (lineRule === 'auto') {
    if (value > 0 && value <= MAX_AUTO_LINE_MULTIPLIER) {
      return value;
    }
    return value / 240;
  }
  return twipsToPx(value);
};

/**
 * Normalizes line rule values from OOXML format.
 *
 * Validates and returns line rule if it's one of the valid values.
 *
 * @param value - OOXML line rule value ('auto', 'exact', or 'atLeast')
 * @returns Normalized line rule value, or undefined if invalid
 *
 * @example
 * ```typescript
 * normalizeLineRule('auto'); // 'auto'
 * normalizeLineRule('exact'); // 'exact'
 * normalizeLineRule('invalid'); // undefined
 * ```
 */
export const normalizeLineRule = (value: unknown): ParagraphSpacing['lineRule'] => {
  if (value === 'auto' || value === 'exact' || value === 'atLeast') {
    return value;
  }
  return undefined;
};
