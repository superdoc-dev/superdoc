/**
 * RTL Paragraph — rendering feature module
 *
 * Centralises all right-to-left paragraph logic used by DomPainter:
 * - Detecting whether a paragraph is RTL
 * - Applying dir="rtl" and the correct text-align to an element
 * - Resolving text-align for RTL vs LTR (justify → right/left)
 * - Deciding whether segment-based (absolute) positioning is safe
 *
 * @ooxml w:pPr/w:bidi — paragraph bidirectional flag
 * @ooxml w:rPr/w:rtl  — run-level right-to-left flag
 * @spec  ECMA-376 §17.3.1.1 (bidi), §17.3.2.30 (rtl)
 */

export { applyRtlStyles, shouldUseSegmentPositioning } from './rtl-styles.js';
