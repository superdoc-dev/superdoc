/**
 * DOM Painter Constants
 *
 * Shared constants used across the DOM painter, layout bridge, and editor components.
 * These constants define class names and identifiers that must remain synchronized
 * between rendering (painter), click-to-position mapping (layout-bridge), and
 * editor interactions (super-editor).
 *
 * @module constants
 */

/**
 * CSS class names used for structural document elements.
 */
export const DOM_CLASS_NAMES = {
  /**
   * Class name for page container elements.
   * Applied to top-level page divs in the rendered output.
   */
  PAGE: 'superdoc-page',

  /**
   * Class name for fragment container elements.
   * Fragments represent logical blocks within a page (paragraphs, tables, etc.).
   */
  FRAGMENT: 'superdoc-fragment',

  /**
   * Class name for line container elements.
   * Lines contain text runs and are the basic unit of layout within fragments.
   */
  LINE: 'superdoc-line',

  /**
   * Class name for inline structured content (SDT) wrapper elements.
   *
   * Inline SDTs wrap regions of inline content to provide semantic structure.
   * These wrapper elements:
   * - Have `data-pm-start` and `data-pm-end` attributes for selection highlighting
   * - Should be EXCLUDED from click-to-position mapping (child spans are the targets)
   * - Display visual borders and labels on hover
   *
   * **Important:** When handling clicks or caret positioning, the child text spans
   * within this wrapper should be used for character-level positioning, not the
   * wrapper itself.
   */
  INLINE_SDT_WRAPPER: 'superdoc-structured-content-inline',

  /**
   * Class name for block-level structured content containers.
   */
  BLOCK_SDT: 'superdoc-structured-content-block',

  /**
   * Class name for table fragment containers.
   * Applied to table fragments for resize overlay targeting and click mapping.
   */
  TABLE_FRAGMENT: 'superdoc-table-fragment',

  /**
   * Class name for document section containers.
   */
  DOCUMENT_SECTION: 'superdoc-document-section',

  /**
   * Class name added to block SDT fragments on hover via event delegation.
   * Applied/removed by SdtGroupedHover to highlight all fragments of the same SDT.
   */
  SDT_HOVER: 'sdt-hover',

  /**
   * Class name for block-level image fragments (ImageBlock).
   */
  IMAGE_FRAGMENT: 'superdoc-image-fragment',

  /**
   * Class name for inline image elements (ImageRun inside paragraphs).
   */
  INLINE_IMAGE: 'superdoc-inline-image',

  /**
   * Class name for the clip wrapper around cropped inline images.
   * When an inline image has a clipPath, it is wrapped in a span with this class
   * so the resizer and selection outline work on the visible cropped portion.
   */
  INLINE_IMAGE_CLIP_WRAPPER: 'superdoc-inline-image-clip-wrapper',
} as const;

/**
 * Type representing valid DOM class name keys.
 */
export type DomClassName = (typeof DOM_CLASS_NAMES)[keyof typeof DOM_CLASS_NAMES];
