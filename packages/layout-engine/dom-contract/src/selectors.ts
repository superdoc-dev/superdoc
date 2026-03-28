import { DOM_CLASS_NAMES } from './class-names.js';
import { DATA_ATTRS } from './data-attrs.js';

/**
 * Builds a compound CSS selector matching any image element (block fragment,
 * inline clip-wrapper, or bare inline image) by its `data-pm-start` value.
 *
 * Useful when re-acquiring an image element after a layout re-render.
 *
 * Callers with untrusted or user-facing values should `CSS.escape()` before
 * passing them here; numeric PM positions and pre-escaped IDs are safe as-is.
 */
export function buildImagePmSelector(pmStart: string | number): string {
  const v = String(pmStart);
  const attr = DATA_ATTRS.PM_START;
  return [
    `.${DOM_CLASS_NAMES.IMAGE_FRAGMENT}[${attr}="${v}"]`,
    `.${DOM_CLASS_NAMES.INLINE_IMAGE_CLIP_WRAPPER}[${attr}="${v}"]`,
    `.${DOM_CLASS_NAMES.INLINE_IMAGE}[${attr}="${v}"]`,
  ].join(', ');
}

/**
 * Builds a compound CSS selector matching inline image elements (clip-wrapper
 * first, then bare inline image) by their `data-pm-start` value.
 *
 * Prefers the clip-wrapper because selection outlines and resize handles should
 * target the visible cropped portion, not the scaled inner image.
 */
export function buildInlineImagePmSelector(pmStart: string | number): string {
  const v = String(pmStart);
  const attr = DATA_ATTRS.PM_START;
  return [
    `.${DOM_CLASS_NAMES.INLINE_IMAGE_CLIP_WRAPPER}[${attr}="${v}"]`,
    `.${DOM_CLASS_NAMES.INLINE_IMAGE}[${attr}="${v}"]`,
  ].join(', ');
}
