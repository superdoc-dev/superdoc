/**
 * Ruler Module - Per-page and interactive ruler rendering
 *
 * This module provides everything needed to render rulers in the document editor:
 * - Core logic for generating ruler definitions (tick marks, margin positions)
 * - DOM renderer for creating ruler elements
 * - CSS styles for ruler appearance
 *
 * @module ruler
 *
 * @example
 * ```typescript
 * import {
 *   generateRulerDefinition,
 *   createRulerElement,
 *   ensureRulerStyles,
 * } from './ruler/index.js';
 *
 * // Generate ruler data
 * const definition = generateRulerDefinition({
 *   pageSize: { width: 8.5, height: 11 },
 *   pageMargins: { left: 1, right: 1, top: 1, bottom: 1 },
 * });
 *
 * // Ensure styles are injected
 * ensureRulerStyles(document);
 *
 * // Create display-only ruler for a page
 * const ruler = createRulerElement({
 *   definition,
 *   doc: document,
 *   interactive: false,
 * });
 *
 * // Add to page
 * pageElement.insertBefore(ruler, pageElement.firstChild);
 * ```
 */

// Core logic
export {
  generateRulerDefinition,
  generateRulerDefinitionFromPx,
  pxToInches,
  inchesToPx,
  calculateMarginFromHandle,
  clampHandlePosition,
  createHandleStates,
  type PageSize,
  type PageMargins,
  type RulerTick,
  type RulerDefinition,
  type RulerConfig,
  type RulerConfigPx,
  type RulerHandleState,
} from './ruler-core.js';

// DOM renderer
export {
  createRulerElement,
  updateHandlePosition,
  createIndicatorElement,
  updateIndicator,
  RULER_CLASS_NAMES,
  type CreateRulerElementOptions,
} from './ruler-renderer.js';

// Styles
export { ensureRulerStyles, _resetRulerStylesInjection } from './ruler-styles.js';
