import { DOM_CLASS_NAMES } from '@superdoc/dom-contract';

const EMPTY_SDT_PLACEHOLDER_CLASSES = [
  'superdoc-empty-sdt-placeholder',
  'superdoc-empty-inline-sdt-placeholder',
  'superdoc-empty-block-sdt-placeholder',
];

/** Placeholder painted for an SDT with no content. */
export function isEmptySdtPlaceholder(el: HTMLElement): boolean {
  return EMPTY_SDT_PLACEHOLDER_CLASSES.some((className) => el.classList.contains(className));
}

/**
 * AIDEV-NOTE: A tab span is painted `vertical-align: bottom` (SD-3330) inside a `font-size: 0`
 * line, so its own box starts below the line top. Every caret path must route through this —
 * the header/footer path missed the body-only fix in #3677 and kept rendering the caret low.
 */
export function isLineAnchoredCaretElement(el: HTMLElement): boolean {
  return isEmptySdtPlaceholder(el) || el.classList.contains('superdoc-tab');
}

/** The line box a caret should use, or null when the element's own box is correct. */
export function resolveCaretLineBox(el: HTMLElement): DOMRect | null {
  if (!isLineAnchoredCaretElement(el)) return null;

  const lineRect = el.closest<HTMLElement>(`.${DOM_CLASS_NAMES.LINE}`)?.getBoundingClientRect();
  if (!lineRect || !Number.isFinite(lineRect.top) || lineRect.height <= 0) return null;

  return lineRect;
}
