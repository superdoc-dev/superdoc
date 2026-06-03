/**
 * SD-2986/B1: Shared helper for converting an OOXML footnote/endnote cardinal
 * to its visible string per the document's `w:numFmt` setting.
 *
 * Used by:
 *  - `footnote-reference.ts` (inline ref in body text)
 *  - `super-editor/.../FootnotesBuilder.ts` (leading marker inside the footnote)
 *
 * Single source of truth so the inline reference and leading marker cannot
 * drift apart visually.
 *
 * The format switch is intentionally inlined (rather than imported from
 * `@superdoc/layout-engine`'s `formatPageNumber`) because pm-adapter sits
 * upstream of layout-engine in the package graph and must not depend on it
 * — see `Guard C` in `architecture-boundaries.test.ts`. A drift-detection
 * parity test in the layout-tests suite asserts that this helper agrees with
 * `formatPageNumber` for every supported format on integers 1..100.
 */

export type FootnoteNumberFormat =
  | 'decimal'
  | 'upperRoman'
  | 'lowerRoman'
  | 'upperLetter'
  | 'lowerLetter'
  | 'numberInDash';

const SUPPORTED_FORMATS: ReadonlySet<FootnoteNumberFormat> = new Set([
  'decimal',
  'upperRoman',
  'lowerRoman',
  'upperLetter',
  'lowerLetter',
  'numberInDash',
]);

/** Roman numerals, 1-3999. Outside that range, fall back to decimal. */
function toUpperRoman(num: number): string {
  if (num < 1 || num > 3999) return String(num);
  const values = [1000, 900, 500, 400, 100, 90, 50, 40, 10, 9, 5, 4, 1];
  const numerals = ['M', 'CM', 'D', 'CD', 'C', 'XC', 'L', 'XL', 'X', 'IX', 'V', 'IV', 'I'];
  let result = '';
  let remaining = num;
  for (let i = 0; i < values.length; i += 1) {
    while (remaining >= values[i]) {
      result += numerals[i];
      remaining -= values[i];
    }
  }
  return result;
}

/** Excel-style spreadsheet column letters: A..Z, AA..ZZ, AAA..ZZZ, … */
function toUpperLetter(num: number): string {
  if (num < 1) return 'A';
  let result = '';
  let n = num;
  while (n > 0) {
    const remainder = (n - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    n = Math.floor((n - 1) / 26);
  }
  return result;
}

/**
 * Format a footnote/endnote cardinal per the OOXML `w:numFmt` value.
 * Unrecognized formats fall back to decimal.
 *
 * @example
 *   formatFootnoteCardinal(4, 'upperRoman')   // "IV"
 *   formatFootnoteCardinal(3, 'lowerLetter')  // "c"
 *   formatFootnoteCardinal(7, undefined)      // "7"
 *   formatFootnoteCardinal(7, 'invalid')      // "7"
 */
export const formatFootnoteCardinal = (cardinal: number, numFmt: string | undefined): string => {
  const fmt =
    numFmt && SUPPORTED_FORMATS.has(numFmt as FootnoteNumberFormat) ? (numFmt as FootnoteNumberFormat) : 'decimal';
  const num = Math.max(1, cardinal);
  switch (fmt) {
    case 'decimal':
      return String(num);
    case 'upperRoman':
      return toUpperRoman(num);
    case 'lowerRoman':
      return toUpperRoman(num).toLowerCase();
    case 'upperLetter':
      return toUpperLetter(num);
    case 'lowerLetter':
      return toUpperLetter(num).toLowerCase();
    case 'numberInDash':
      return `-${num}-`;
    default:
      return String(num);
  }
};
