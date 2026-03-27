/**
 * DOM observation and query boundary for the v1 editor.
 *
 * This module owns reading and querying the rendered DOM produced by the layout
 * engine's DomPainter. It is the editor-side counterpart to the painter's
 * rendering pipeline.
 *
 * @module dom-observer
 */

export { DomPositionIndex, type DomPositionIndexEntry } from './DomPositionIndex.js';
export { DomPositionIndexObserverManager } from './DomPositionIndexObserverManager.js';
export {
  type LayoutRect,
  type PageLocalCaretPosition,
  type ComputeSelectionRectsFromDomOptions,
  type ComputeDomCaretPageLocalOptions,
  computeSelectionRectsFromDom,
  computeDomCaretPageLocal,
  deduplicateOverlappingRects,
} from './DomSelectionGeometry.js';
export { getPageElementByIndex } from './PageDom.js';
