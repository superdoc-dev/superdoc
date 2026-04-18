/**
 * @deprecated Temporary compatibility shim — source of truth moved to `dom-observer/`.
 * @see {@link ../../../dom-observer/DomSelectionGeometry.ts}
 * Remove this shim in a later cleanup PR.
 */
export {
  type LayoutRect,
  type PageLocalCaretPosition,
  type ComputeSelectionRectsFromDomOptions,
  type ComputeDomCaretPageLocalOptions,
  computeSelectionRectsFromDom,
  computeDomCaretPageLocal,
  deduplicateOverlappingRects,
} from '../../../dom-observer/DomSelectionGeometry.js';
