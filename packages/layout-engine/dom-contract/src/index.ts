/**
 * @superdoc/dom-contract
 *
 * Source of truth for the DOM surface contract shared between the painter
 * (emitter) and editor-side DOM readers.
 *
 * This package owns:
 * - CSS class name constants
 * - Data-attribute name constants
 * - Selector helpers built from the above
 *
 * It must NOT contain DOM querying logic, editor behavior, or painter
 * implementation details.
 */

export { DOM_CLASS_NAMES } from './class-names.js';
export type { DomClassName } from './class-names.js';

export { DATA_ATTRS, DATASET_KEYS } from './data-attrs.js';

export {
  buildImagePmSelector,
  buildInlineImagePmSelector,
  buildSdtBlockSelector,
  buildSdtInlineSelector,
  buildAnnotationSelector,
  buildAnnotationTypeSelector,
  buildAnnotationPmSelector,
  SDT_BLOCK_WITH_ID_SELECTOR,
  DRAGGABLE_SELECTOR,
} from './selectors.js';
