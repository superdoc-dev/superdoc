/**
 * Programmatic sanity checks for numbering abstract definitions.
 *
 * These checks catch OOXML-level correctness issues that the SuperDoc internal
 * projection layer normalizes away — in particular, cases where a list level's
 * `numFmt` disagrees with its `rFonts` (e.g. `decimal` numbering paired with
 * `Wingdings`, which causes Word to render digits as pictographic glyphs).
 *
 * Designed to be cheap and dependency-free so any unit or integration test can
 * use it to gate post-mutation state.
 */

/**
 * Word-known `numFmt` values that render numeric or alphabetic markers.
 * When any of these is set on a level whose `rFonts` points at a symbol font,
 * the marker character (e.g. "1", "a") is drawn through the symbol font and
 * comes out as a pictograph instead of a readable digit/letter.
 */
export const ORDERED_NUM_FMTS = new Set([
  'decimal',
  'decimalZero',
  'decimalEnclosedCircle',
  'decimalEnclosedFullstop',
  'decimalEnclosedParen',
  'lowerLetter',
  'upperLetter',
  'lowerRoman',
  'upperRoman',
  'ordinal',
  'ordinalText',
  'cardinalText',
  'chicago',
]);

/**
 * Fonts with no standard numeric/alphabetic glyphs at ASCII codepoints.
 * Legitimate choice for bullet markers; never correct for ordered markers.
 */
export const SYMBOL_MARKER_FONTS = new Set([
  'Wingdings',
  'Wingdings 2',
  'Wingdings 3',
  'Symbol',
  'Webdings',
  'ZapfDingbats',
  'Zapf Dingbats',
]);

/**
 * Walk an OOXML abstractNum element tree and flag any `<w:lvl>` whose
 * `numFmt` is in the ordered family and whose `rFonts` points at a symbol
 * font. Returns the list of violations; empty means the abstract is clean.
 *
 * @param {object} abstractNum OOXML element shape: { name, attributes, elements: [...] }.
 * @returns {Array<{ ilvl: number, numFmt: string, font: string }>}
 */
export function findSymbolFontsOnOrderedLevels(abstractNum) {
  if (!abstractNum || !Array.isArray(abstractNum.elements)) return [];

  const violations = [];
  for (const level of abstractNum.elements) {
    if (!level || level.name !== 'w:lvl') continue;

    const ilvl = Number.parseInt(level.attributes?.['w:ilvl'] ?? '-1', 10);
    const children = Array.isArray(level.elements) ? level.elements : [];

    const numFmtEl = children.find((c) => c?.name === 'w:numFmt');
    const numFmt = numFmtEl?.attributes?.['w:val'];
    if (!numFmt || !ORDERED_NUM_FMTS.has(numFmt)) continue;

    const rPr = children.find((c) => c?.name === 'w:rPr');
    const rFonts = Array.isArray(rPr?.elements) ? rPr.elements.find((c) => c?.name === 'w:rFonts') : undefined;
    const font =
      rFonts?.attributes?.['w:ascii'] ||
      rFonts?.attributes?.['w:hAnsi'] ||
      rFonts?.attributes?.['w:cs'] ||
      rFonts?.attributes?.['w:eastAsia'];
    if (!font) continue;

    if (SYMBOL_MARKER_FONTS.has(font)) {
      violations.push({ ilvl, numFmt, font });
    }
  }
  return violations;
}
