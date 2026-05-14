/**
 * Inline Direction - rendering feature module
 *
 * Centralises paragraph- and run-level inline-direction (RTL/LTR) logic
 * used by DomPainter:
 * - Detecting whether a paragraph is RTL
 * - Applying dir="rtl" and the correct text-align to an element
 * - Resolving text-align for RTL vs LTR (justify -> right/left)
 * - Deciding whether segment-based (absolute) positioning is safe
 *
 * Scope is the **inline-direction axis only** (paragraph w:bidi +
 * run w:rtl). Table visual direction (w:bidiVisual, ECMA-376 §17.4.1)
 * is a separate orthogonal axis and is owned by the painter's table
 * rendering path, not by this module. Writing mode (w:textDirection,
 * §17.18.93) is another separate axis.
 *
 * @ooxml w:pPr/w:bidi - paragraph bidirectional flag
 * @ooxml w:rPr/w:rtl  - run-level right-to-left flag
 * @spec  ECMA-376 §17.3.1.1 (bidi), §17.3.2.30 (rtl)
 */

export { applyRtlStyles, shouldUseSegmentPositioning } from './rtl-styles.js';
