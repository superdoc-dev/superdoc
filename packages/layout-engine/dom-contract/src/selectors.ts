import { DOM_CLASS_NAMES } from './class-names.js';
import { DATA_ATTRS } from './data-attrs.js';

// ---------------------------------------------------------------------------
// Stable selector constants
// ---------------------------------------------------------------------------

/** Selector for any block SDT element that carries an sdtId attribute. */
export const SDT_BLOCK_WITH_ID_SELECTOR = `.${DOM_CLASS_NAMES.BLOCK_SDT}[${DATA_ATTRS.SDT_ID}]`;

/** Selector for draggable elements. */
export const DRAGGABLE_SELECTOR = `[${DATA_ATTRS.DRAGGABLE}="true"]`;

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

// ---------------------------------------------------------------------------
// SDT selectors
// ---------------------------------------------------------------------------

/**
 * Builds a selector for block-level SDT elements with a given sdtId.
 *
 * Callers MUST `CSS.escape()` the sdtId before passing it here;
 * numeric IDs and pre-escaped strings are safe as-is.
 */
export function buildSdtBlockSelector(escapedSdtId: string): string {
  return `.${DOM_CLASS_NAMES.BLOCK_SDT}[${DATA_ATTRS.SDT_ID}="${escapedSdtId}"]`;
}

/**
 * Builds a selector for inline SDT wrapper elements with a given sdtId.
 *
 * Callers MUST `CSS.escape()` the sdtId before passing it here.
 */
export function buildSdtInlineSelector(escapedSdtId: string): string {
  return `.${DOM_CLASS_NAMES.INLINE_SDT_WRAPPER}[${DATA_ATTRS.SDT_ID}="${escapedSdtId}"]`;
}

// ---------------------------------------------------------------------------
// Annotation selectors
// ---------------------------------------------------------------------------

/**
 * Selector for annotation elements that carry a ProseMirror start position.
 */
export function buildAnnotationSelector(): string {
  return `.${DOM_CLASS_NAMES.ANNOTATION}[${DATA_ATTRS.PM_START}]`;
}

/**
 * Selector for annotation elements with a specific `data-type` value.
 */
export function buildAnnotationTypeSelector(type: string): string {
  return `.${DOM_CLASS_NAMES.ANNOTATION}[${DATA_ATTRS.TYPE}="${type}"]`;
}

/**
 * Selector for an annotation element at a specific ProseMirror start position.
 */
export function buildAnnotationPmSelector(pmStart: string | number): string {
  return `.${DOM_CLASS_NAMES.ANNOTATION}[${DATA_ATTRS.PM_START}="${String(pmStart)}"]`;
}
