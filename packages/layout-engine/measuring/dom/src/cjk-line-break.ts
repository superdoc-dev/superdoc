/**
 * CJK line-breaking primitives shared by every width-constrained wrapper.
 *
 * Chinese, Japanese, and Korean text carries no ASCII spaces, so a space-based
 * tokenizer sees one giant "word" per clause. Word (and CSS `line-break:
 * normal`) instead breaks between any two ideographs and applies kinsoku shori:
 * a line may not open with a closing mark, and may not end with an opening one.
 *
 * This module is the single source of truth for those rules. It is consumed by
 * the primary paragraph measurer (`measuring/dom`) and by the layout-bridge
 * remeasurement fallback used for narrow columns, float-constrained
 * paragraphs, and textboxes — the two must not drift.
 *
 * Everything here is fullwidth-only on purpose: ASCII punctuation keeps the
 * existing space-based wrapping semantics untouched.
 *
 * Known gap: `w:kinsoku`, `w:wordWrap`, and `w:overflowPunct` are parsed into
 * the style model but not plumbed here, so the rules are applied as if all
 * three carried their Word defaults (kinsoku on, hanging punctuation allowed).
 * Documents that explicitly disable them wrap against their own setting.
 */

/**
 * Characters that may not open a line (JIS X 4051 line-start prohibition).
 */
export const KINSOKU_FORBIDDEN_LINE_START = new Set('、。，．：；！？）］｝〉》」』】〕…‥ー々ゝゞヽヾ'.split(''));

/** Characters that may not close a line (JIS X 4051 line-end prohibition). */
export const KINSOKU_FORBIDDEN_LINE_END = new Set('（［｛〈《「『【〔'.split(''));

/** Maximum characters allowed to hang past a line end to satisfy kinsoku. */
export const KINSOKU_MAX_HANG = 2;

/** Maximum characters carried down to the next line to satisfy kinsoku. */
export const KINSOKU_MAX_CARRY = 2;

/**
 * CJK ideographs, kana, hangul, and CJK/fullwidth punctuation, including the
 * astral extension planes (U+20000–U+3FFFF) via their surrogate pairs.
 */
const CJK_BREAK_OPPORTUNITY_PATTERN =
  /[\u1100-\u11FF\u2E80-\u2EFF\u3000-\u303F\u3040-\u30FF\u3130-\u318F\u31F0-\u31FF\u3400-\u4DBF\u4E00-\u9FFF\uA960-\uA97F\uAC00-\uD7AF\uF900-\uFAFF\uFE30-\uFE4F\uFF00-\uFF60\uFFE0-\uFFE6]|[\uD840-\uD8BF][\uDC00-\uDFFF]/;

/** Same ranges, anchored, for testing a single code point. */
const CJK_SINGLE_CODE_POINT_PATTERN = new RegExp(`^(?:${CJK_BREAK_OPPORTUNITY_PATTERN.source})$`);

/** True when a "word" contains at least one inter-ideograph break opportunity. */
export const hasCjkBreakOpportunity = (text: string): boolean =>
  text.length > 1 && CJK_BREAK_OPPORTUNITY_PATTERN.test(text);

/**
 * True when this single character is itself a CJK break opportunity, i.e. a
 * line may break immediately before it without a preceding space.
 */
export const isCjkBreakOpportunityChar = (char: string): boolean =>
  Boolean(char) && CJK_SINGLE_CODE_POINT_PATTERN.test(char);

/** True when `index` sits on the low half of a surrogate pair. */
const isLowSurrogateAt = (text: string, index: number): boolean => {
  const code = text.charCodeAt(index);
  return code >= 0xdc00 && code <= 0xdfff;
};

/**
 * Exclusive end index of the code point starting at `index`, so astral
 * characters advance as one unit rather than two UTF-16 code units. Breaking
 * inside a pair would emit lone surrogates and desync every offset derived
 * from line `fromChar`/`toChar`, including ProseMirror positions.
 */
export const nextCodePointBoundary = (text: string, index: number): number => {
  if (index >= text.length) return text.length;
  const code = text.charCodeAt(index);
  const isHighSurrogate = code >= 0xd800 && code <= 0xdbff;
  return isHighSurrogate && index + 1 < text.length && isLowSurrogateAt(text, index + 1) ? index + 2 : index + 1;
};

/** Moves a boundary off the low half of a surrogate pair, back to the pair's start. */
export const alignToCodePointBoundary = (text: string, index: number): number =>
  index > 0 && index < text.length && isLowSurrogateAt(text, index) ? index - 1 : index;

/** The whole code point starting at `index` (one or two UTF-16 units). */
export const codePointAt = (text: string, index: number): string =>
  text.slice(index, nextCodePointBoundary(text, index));

/**
 * Latin letters and digits. Used to keep an embedded Latin word inside CJK text
 * from being split mid-word: Word breaks CJK per ideograph but Latin per word.
 */
export const isLatinRunChar = (char: string): boolean => {
  if (!char) return false;
  const code = char.charCodeAt(0);
  return (
    (code >= 48 && code <= 57) ||
    (code >= 65 && code <= 90) ||
    (code >= 97 && code <= 122) ||
    (code >= 0x00c0 && code <= 0x024f)
  );
};

/**
 * The smallest leading piece of `text` that may occupy a line on its own: a
 * leading Latin word when the text starts with one, otherwise the first code
 * point.
 *
 * Callers deciding whether to fill the remainder of a started line must fit
 * this, not merely the first character. `SuperDoc中文` qualifies for CJK
 * chunking because it contains ideographs, but its Latin head cannot be split —
 * {@link resolveKinsokuBoundary} deliberately refuses to move a Latin run that
 * begins at the boundary start — so admitting it on "one character fits" would
 * cut the word in half.
 */
export const firstBreakUnit = (text: string): string => {
  if (!text) return text;
  if (!isLatinRunChar(text[0])) return codePointAt(text, 0);
  let end = 1;
  while (end < text.length && isLatinRunChar(text[end])) end += 1;
  return text.slice(0, end);
};

/**
 * Adjusts a greedy break boundary so the emitted lines obey kinsoku shori.
 *
 * Applied in order:
 * 1. Line-start prohibition — a closer (`，` `。` `）` …) that would open the
 *    next line hangs on this line's end instead, accepting the slight overflow
 *    Word accepts when `w:overflowPunct` is on (its default).
 * 2. Line-end prohibition — an opener (`（` `「` …) that would close this line
 *    carries down to the next one.
 * 3. Opener-only rescue — when rule 2 cannot carry (the opener is the only
 *    character on the line), pull the following character up instead so the
 *    line still does not end with an opener.
 * 4. Latin-run integrity — when the boundary lands inside an embedded Latin
 *    word that started after `rangeStart`, move the whole word down.
 *
 * Always returns a boundary strictly greater than `rangeStart`, so a caller's
 * chunking loop is guaranteed to make progress, and never inside a surrogate
 * pair.
 *
 * @param text - The text being broken
 * @param rangeStart - Index the current line/chunk starts at
 * @param greedyEnd - Exclusive end index the greedy fitter chose
 * @returns Adjusted exclusive end index for the current line/chunk
 */
export const resolveKinsokuBoundary = (text: string, rangeStart: number, greedyEnd: number): number => {
  let boundary = greedyEnd;

  let hung = 0;
  while (boundary < text.length && hung < KINSOKU_MAX_HANG && KINSOKU_FORBIDDEN_LINE_START.has(text[boundary])) {
    boundary += 1;
    hung += 1;
  }

  let carried = 0;
  while (
    boundary - 1 > rangeStart &&
    carried < KINSOKU_MAX_CARRY &&
    KINSOKU_FORBIDDEN_LINE_END.has(text[boundary - 1])
  ) {
    boundary -= 1;
    carried += 1;
  }

  let pulled = 0;
  while (boundary < text.length && pulled < KINSOKU_MAX_CARRY && KINSOKU_FORBIDDEN_LINE_END.has(text[boundary - 1])) {
    boundary = nextCodePointBoundary(text, boundary);
    pulled += 1;
  }

  if (boundary < text.length && isLatinRunChar(text[boundary - 1]) && isLatinRunChar(text[boundary])) {
    let latinStart = boundary - 1;
    while (latinStart > rangeStart && isLatinRunChar(text[latinStart - 1])) latinStart -= 1;
    if (latinStart > rangeStart) boundary = latinStart;
  }

  return alignToCodePointBoundary(text, boundary);
};
