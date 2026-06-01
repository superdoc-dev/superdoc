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

  /** Inline structured-content label chrome. */
  INLINE_SDT_LABEL: 'superdoc-structured-content-inline__label',

  /** Block-level structured-content container. */
  BLOCK_SDT: 'superdoc-structured-content-block',

  /** Block-level structured-content label chrome. */
  BLOCK_SDT_LABEL: 'superdoc-structured-content__label',

  /** Table fragment container (resize overlay and click-mapping target). */
  TABLE_FRAGMENT: 'superdoc-table-fragment',

  /** Document section container. */
  DOCUMENT_SECTION: 'superdoc-document-section',

  /**
   * Grouped hover highlight applied to all fragments of the same block SDT.
   * Set by PresentationEditor's hover coordination via event delegation.
   */
  SDT_GROUP_HOVER: 'sdt-group-hover',

  /** Block-level image fragment (ImageBlock). */
  IMAGE_FRAGMENT: 'superdoc-image-fragment',

  /** Inline image element (ImageRun inside a paragraph). */
  INLINE_IMAGE: 'superdoc-inline-image',

  /** Wrapper around a paragraph's list marker (bullet glyph or ordered number). */
  LIST_MARKER: 'superdoc-list-marker',

  /** Clip wrapper around a cropped inline image. */
  INLINE_IMAGE_CLIP_WRAPPER: 'superdoc-inline-image-clip-wrapper',

  /** Field annotation outer wrapper. */
  ANNOTATION: 'annotation',

  /** Field annotation inner content wrapper. */
  ANNOTATION_CONTENT: 'annotation-content',

  /** Hidden caret anchor span appended after field annotation content. */
  ANNOTATION_CARET_ANCHOR: 'annotation-caret-anchor',
} as const;

/** Union of all DOM contract class name values. */
export type DomClassName = (typeof DOM_CLASS_NAMES)[keyof typeof DOM_CLASS_NAMES];

/** Structured-content chrome labels that should not drive text-position mapping. */
export const STRUCTURED_CONTENT_CHROME_LABEL_CLASS_NAMES = [
  DOM_CLASS_NAMES.INLINE_SDT_LABEL,
  DOM_CLASS_NAMES.BLOCK_SDT_LABEL,
] as const;
