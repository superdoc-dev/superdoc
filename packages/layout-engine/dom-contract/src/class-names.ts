/**
 * DOM Contract: Class Names
 *
 * CSS class names stamped on rendered document elements by the DOM painter.
 * These names form a public contract read by the painter (emitter) and by
 * editor-side DOM observation code (reader).
 *
 * Changing a value here is a breaking change for both systems.
 */

export const DOM_CLASS_NAMES = {
  /** Top-level page container element. */
  PAGE: 'superdoc-page',

  /** Fragment container (paragraph, table, image block, etc.). */
  FRAGMENT: 'superdoc-fragment',

  /** Line container within a fragment. */
  LINE: 'superdoc-line',

  /**
   * Inline structured-content (SDT) wrapper.
   *
   * Carries `data-pm-start` / `data-pm-end` for selection highlighting.
   * Should be EXCLUDED from click-to-position mapping — child spans are
   * the character-level targets.
   */
  INLINE_SDT_WRAPPER: 'superdoc-structured-content-inline',

  /** Block-level structured-content container. */
  BLOCK_SDT: 'superdoc-structured-content-block',

  /** Table fragment container (resize overlay and click-mapping target). */
  TABLE_FRAGMENT: 'superdoc-table-fragment',

  /** Document section container. */
  DOCUMENT_SECTION: 'superdoc-document-section',

  /** Hover highlight applied to all fragments of the same block SDT. */
  SDT_HOVER: 'sdt-hover',

  /** Block-level image fragment (ImageBlock). */
  IMAGE_FRAGMENT: 'superdoc-image-fragment',

  /** Inline image element (ImageRun inside a paragraph). */
  INLINE_IMAGE: 'superdoc-inline-image',

  /** Clip wrapper around a cropped inline image. */
  INLINE_IMAGE_CLIP_WRAPPER: 'superdoc-inline-image-clip-wrapper',
} as const;

/** Union of all DOM contract class name values. */
export type DomClassName = (typeof DOM_CLASS_NAMES)[keyof typeof DOM_CLASS_NAMES];
