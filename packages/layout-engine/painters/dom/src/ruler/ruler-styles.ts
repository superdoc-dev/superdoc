/**
 * Ruler Styles - CSS injection for ruler elements
 *
 * This module provides CSS styles for ruler elements that are injected once
 * into the document head, similar to other painter styles.
 *
 * @module ruler-styles
 */

import { RULER_CLASS_NAMES } from './ruler-renderer.js';

/**
 * CSS styles for ruler elements.
 *
 * These styles complement the inline styles applied during element creation,
 * providing hover effects, transitions, and print-mode handling.
 */
const RULER_STYLES = `
/* Ruler container */
.${RULER_CLASS_NAMES.ruler} {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  background-color: transparent;
}

/* Tick marks base styling */
.${RULER_CLASS_NAMES.tick} {
  flex-shrink: 0;
}

/* Handle hover and active states */
.${RULER_CLASS_NAMES.handle}:hover {
  background-color: rgba(37, 99, 235, 0.4) !important;
}

.${RULER_CLASS_NAMES.handle}:active,
.${RULER_CLASS_NAMES.handle}[data-dragging="true"] {
  background-color: rgba(37, 99, 235, 0.6) !important;
  cursor: grabbing !important;
}

/* Vertical indicator animation */
.${RULER_CLASS_NAMES.indicator} {
  transition: left 16ms linear;
}

/* Print mode: hide rulers */
@media print {
  .${RULER_CLASS_NAMES.ruler} {
    display: none !important;
  }
}

/* High contrast mode support */
@media (prefers-contrast: high) {
  .${RULER_CLASS_NAMES.tick} {
    background-color: #000 !important;
  }

  .${RULER_CLASS_NAMES.label} {
    color: #000 !important;
  }

  .${RULER_CLASS_NAMES.handle} {
    background-color: #666 !important;
    border: 1px solid #000;
  }

  .${RULER_CLASS_NAMES.handle}:hover,
  .${RULER_CLASS_NAMES.handle}:active {
    background-color: #0066cc !important;
  }
}

/* Reduced motion support */
@media (prefers-reduced-motion: reduce) {
  .${RULER_CLASS_NAMES.handle} {
    transition: none !important;
  }

  .${RULER_CLASS_NAMES.indicator} {
    transition: none !important;
  }
}
`;

/** Track whether styles have been injected */
let rulerStylesInjected = false;

/**
 * Inject ruler styles into the document head.
 *
 * Styles are only injected once per document lifecycle.
 * Call this when initializing the painter or rendering the first ruler.
 *
 * @param doc - The document to inject styles into
 *
 * @example
 * ```typescript
 * // In DomPainter initialization
 * ensureRulerStyles(document);
 *
 * // Styles are now available for all ruler elements
 * const ruler = createRulerElement({ definition, doc: document });
 * ```
 */
export function ensureRulerStyles(doc: Document | null | undefined): void {
  if (rulerStylesInjected || !doc) return;

  const styleEl = doc.createElement('style');
  styleEl.setAttribute('data-superdoc-ruler-styles', 'true');
  styleEl.textContent = RULER_STYLES;
  doc.head?.appendChild(styleEl);
  rulerStylesInjected = true;
}

/**
 * Reset the injection state (useful for testing).
 * @internal
 */
export function _resetRulerStylesInjection(): void {
  rulerStylesInjected = false;
}
