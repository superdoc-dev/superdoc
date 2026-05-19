/**
 * Inline Direction - rendering feature module
 *
 * Centralises paragraph base-direction and run-level RTL/bidi handling
 * used by DomPainter:
 * - Detecting whether a paragraph is RTL
 * - Applying dir="rtl" and the correct text-align to an element
 * - Resolving text-align for RTL vs LTR (justify -> right/left)
 * - Deciding whether segment-based (absolute) positioning is safe
 *
 * Scope is paragraph/run inline bidi handling only. Table visual
 * direction (w:bidiVisual, ECMA-376 §17.4.1) is a separate orthogonal
 * axis owned by the painter's table rendering path. Writing mode
 * (w:textDirection, ECMA-376 §17.3.1.41 paragraph / §17.4.72 cell;
 * values in §17.18.93 ST_TextDirection) is another separate axis.
 *
 * @ooxml w:pPr/w:bidi - paragraph bidirectional flag
 * @ooxml w:rPr/w:rtl  - run-level right-to-left flag
 * @spec  ECMA-376 §17.3.1.1 (bidi), §17.3.2.30 (rtl)
 */

export { applyRtlStyles, shouldUseSegmentPositioning } from './rtl-styles.js';
export {
  resolveRunDirectionAttribute,
  normalizeRtlDateTokenForWordParity,
  RTL_DATE_LIKE_TOKEN_RE,
  STRONG_RTL_CHAR_RE,
  LATIN_DIGIT_NEUTRAL_ONLY_RE,
  type RunDirAttribute,
} from './run-direction.js';
