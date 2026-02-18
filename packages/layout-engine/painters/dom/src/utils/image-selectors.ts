import { DOM_CLASS_NAMES } from '../constants.js';

/**
 * Builds a compound CSS selector that matches any image element (block fragment,
 * inline clip-wrapper, or bare inline image) by its `data-pm-start` attribute.
 *
 * Useful when re-acquiring an image element after a layout re-render.
 *
 * Callers that have untrusted or user-facing values should `CSS.escape()` before
 * passing them here; numeric PM positions and pre-escaped IDs are safe as-is.
 */
export function buildImagePmSelector(pmStart: string | number): string {
  const v = String(pmStart);
  return [
    `.${DOM_CLASS_NAMES.IMAGE_FRAGMENT}[data-pm-start="${v}"]`,
    `.${DOM_CLASS_NAMES.INLINE_IMAGE_CLIP_WRAPPER}[data-pm-start="${v}"]`,
    `.${DOM_CLASS_NAMES.INLINE_IMAGE}[data-pm-start="${v}"]`,
  ].join(', ');
}

/**
 * Builds a compound CSS selector that matches inline image elements (clip-wrapper
 * first, then bare inline image) by their `data-pm-start` attribute.
 *
 * Prefers the clip-wrapper because selection outlines and resize handles should
 * target the visible cropped portion, not the scaled inner image.
 */
export function buildInlineImagePmSelector(pmStart: string | number): string {
  const v = String(pmStart);
  return [
    `.${DOM_CLASS_NAMES.INLINE_IMAGE_CLIP_WRAPPER}[data-pm-start="${v}"]`,
    `.${DOM_CLASS_NAMES.INLINE_IMAGE}[data-pm-start="${v}"]`,
  ].join(', ');
}
