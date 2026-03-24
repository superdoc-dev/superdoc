/**
 * Ruler Renderer - DOM element creation for rulers
 *
 * This module handles the creation of ruler DOM elements for the DOM painter.
 * It uses the core ruler logic from ruler-core.ts to generate tick marks
 * and optionally includes interactive margin handles.
 *
 * @module ruler-renderer
 */

import type { RulerDefinition, RulerTick } from './ruler-core.js';

/**
 * CSS class names for ruler elements
 */
export const RULER_CLASS_NAMES = {
  /** Main ruler container */
  ruler: 'superdoc-ruler',
  /** Tick mark element */
  tick: 'superdoc-ruler-tick',
  /** Main (inch) tick */
  tickMain: 'superdoc-ruler-tick--main',
  /** Half-inch tick */
  tickHalf: 'superdoc-ruler-tick--half',
  /** Eighth-inch tick */
  tickEighth: 'superdoc-ruler-tick--eighth',
  /** Inch label number */
  label: 'superdoc-ruler-label',
  /** Margin handle */
  handle: 'superdoc-ruler-handle',
  /** Left margin handle */
  handleLeft: 'superdoc-ruler-handle--left',
  /** Right margin handle */
  handleRight: 'superdoc-ruler-handle--right',
  /** Vertical indicator line during drag */
  indicator: 'superdoc-ruler-indicator',
} as const;

/**
 * Options for creating a ruler element
 */
export type CreateRulerElementOptions = {
  /** The ruler definition from generateRulerDefinition() */
  definition: RulerDefinition;
  /** Document to create elements in */
  doc: Document;
  /** Whether to include interactive margin handles (default: false for per-page rulers) */
  interactive?: boolean;
  /** Callback when margin handle drag starts */
  onDragStart?: (side: 'left' | 'right', event: PointerEvent) => void;
  /** Callback when margin handle is dragged */
  onDrag?: (side: 'left' | 'right', x: number, event: PointerEvent) => void;
  /** Callback when margin handle drag ends */
  onDragEnd?: (side: 'left' | 'right', x: number, event: PointerEvent) => void;
};

/**
 * Create a ruler DOM element.
 *
 * Creates a complete ruler with tick marks and optionally interactive margin handles.
 * For per-page rulers in the painter, set `interactive: false` to render display-only rulers.
 * For the main interactive ruler overlay, set `interactive: true` and provide callbacks.
 *
 * @param options - Options for creating the ruler
 * @returns The ruler container element
 *
 * @example
 * ```typescript
 * // Display-only ruler for per-page rendering
 * const ruler = createRulerElement({
 *   definition: generateRulerDefinition({ pageSize, pageMargins }),
 *   doc: document,
 *   interactive: false,
 * });
 * pageElement.insertBefore(ruler, pageElement.firstChild);
 *
 * // Interactive ruler with margin handles
 * const interactiveRuler = createRulerElement({
 *   definition,
 *   doc: document,
 *   interactive: true,
 *   onDragEnd: (side, x) => editor.updatePageStyle({ pageMargins: { [side]: x / 96 } }),
 * });
 * ```
 */
export function createRulerElement(options: CreateRulerElementOptions): HTMLElement {
  const { definition, doc, interactive = false } = options;

  // Validate definition
  if (!Number.isFinite(definition.widthPx) || definition.widthPx <= 0) {
    console.warn(`[createRulerElement] Invalid ruler width: ${definition.widthPx}px. Using minimum width of 1px.`);
    definition.widthPx = Math.max(1, definition.widthPx || 1);
  }

  if (!definition.ticks || definition.ticks.length === 0) {
    console.warn('[createRulerElement] Ruler definition has no ticks. Ruler will be empty.');
  }

  const ruler = doc.createElement('div');
  ruler.className = RULER_CLASS_NAMES.ruler;
  ruler.style.cssText = `
    position: relative;
    width: ${definition.widthPx}px;
    height: ${definition.heightPx}px;
    display: flex;
    align-items: flex-end;
    box-sizing: border-box;
    user-select: none;
    pointer-events: ${interactive ? 'auto' : 'none'};
  `;

  // Create tick marks
  for (const tick of definition.ticks) {
    const tickEl = createTickElement(tick, doc);
    ruler.appendChild(tickEl);
  }

  // Create margin handles if interactive
  if (interactive) {
    const leftHandle = createHandleElement('left', definition.leftMarginPx, doc, options);
    const rightHandle = createHandleElement('right', definition.rightMarginPx, doc, options);
    ruler.appendChild(leftHandle);
    ruler.appendChild(rightHandle);
  }

  return ruler;
}

/**
 * Create a tick mark element.
 *
 * @param tick - Tick definition
 * @param doc - Document to create element in
 * @returns Tick element
 */
function createTickElement(tick: RulerTick, doc: Document): HTMLElement {
  const el = doc.createElement('div');

  const sizeClass =
    tick.size === 'main'
      ? RULER_CLASS_NAMES.tickMain
      : tick.size === 'half'
        ? RULER_CLASS_NAMES.tickHalf
        : RULER_CLASS_NAMES.tickEighth;

  el.className = `${RULER_CLASS_NAMES.tick} ${sizeClass}`;
  el.style.cssText = `
    position: absolute;
    left: ${tick.x}px;
    bottom: 0;
    width: 1px;
    height: ${tick.height};
    background-color: #666;
    pointer-events: none;
  `;

  // Add label for main ticks
  if (tick.label !== undefined && tick.label !== 0) {
    const label = doc.createElement('span');
    label.className = RULER_CLASS_NAMES.label;
    label.textContent = String(tick.label);
    label.style.cssText = `
      position: absolute;
      top: -16px;
      left: -2px;
      font-size: 10px;
      color: #666;
      pointer-events: none;
      user-select: none;
    `;
    el.appendChild(label);
  }

  return el;
}

/**
 * Create a margin handle element with drag interaction.
 *
 * @param side - Which side ('left' or 'right')
 * @param x - Initial X position in pixels
 * @param doc - Document to create element in
 * @param options - Ruler creation options with callbacks
 * @returns Handle element
 */
function createHandleElement(
  side: 'left' | 'right',
  x: number,
  doc: Document,
  options: CreateRulerElementOptions,
): HTMLElement {
  const handle = doc.createElement('div');
  const sideClass = side === 'left' ? RULER_CLASS_NAMES.handleLeft : RULER_CLASS_NAMES.handleRight;

  handle.className = `${RULER_CLASS_NAMES.handle} ${sideClass}`;
  handle.dataset.side = side;
  handle.style.cssText = `
    position: absolute;
    left: ${x}px;
    top: 0;
    width: 5px;
    height: 20px;
    margin-left: -2px;
    background-color: #ccc;
    border-radius: 4px 4px 0 0;
    cursor: grab;
    transition: background-color 150ms ease;
    z-index: 10;
  `;

  // Add hover effect
  handle.addEventListener('mouseenter', () => {
    if (!handle.dataset.dragging) {
      handle.style.backgroundColor = 'rgba(37, 99, 235, 0.4)';
    }
  });
  handle.addEventListener('mouseleave', () => {
    if (!handle.dataset.dragging) {
      handle.style.backgroundColor = '#ccc';
    }
  });

  // Add drag interaction
  if (options.onDragStart || options.onDrag || options.onDragEnd) {
    setupHandleDrag(handle, side, options);
  }

  return handle;
}

/**
 * Set up drag interaction for a margin handle.
 *
 * @param handle - Handle element
 * @param side - Which side ('left' or 'right')
 * @param options - Ruler creation options with callbacks
 */
function setupHandleDrag(handle: HTMLElement, side: 'left' | 'right', options: CreateRulerElementOptions): void {
  let offsetX = 0;

  const onPointerDown = (event: PointerEvent) => {
    event.preventDefault();
    handle.dataset.dragging = 'true';
    handle.style.backgroundColor = 'rgba(37, 99, 235, 0.4)';
    handle.style.cursor = 'grabbing';

    const rect = handle.getBoundingClientRect();
    offsetX = event.clientX - rect.left - rect.width / 2;

    handle.setPointerCapture(event.pointerId);
    options.onDragStart?.(side, event);
  };

  const onPointerMove = (event: PointerEvent) => {
    if (handle.dataset.dragging !== 'true') return;

    const ruler = handle.parentElement;
    if (!ruler) return;

    const rulerRect = ruler.getBoundingClientRect();
    const newX = event.clientX - rulerRect.left - offsetX;

    options.onDrag?.(side, newX, event);
  };

  const onPointerUp = (event: PointerEvent) => {
    if (handle.dataset.dragging !== 'true') return;

    handle.dataset.dragging = '';
    handle.style.backgroundColor = '#ccc';
    handle.style.cursor = 'grab';
    handle.releasePointerCapture(event.pointerId);

    const ruler = handle.parentElement;
    if (!ruler) return;

    const rulerRect = ruler.getBoundingClientRect();
    const finalX = event.clientX - rulerRect.left - offsetX;

    options.onDragEnd?.(side, finalX, event);
  };

  handle.addEventListener('pointerdown', onPointerDown);
  handle.addEventListener('pointermove', onPointerMove);
  handle.addEventListener('pointerup', onPointerUp);
  handle.addEventListener('pointercancel', onPointerUp);
}

/**
 * Update a handle's position.
 *
 * @param ruler - Ruler container element
 * @param side - Which handle to update
 * @param x - New X position in pixels
 */
export function updateHandlePosition(ruler: HTMLElement, side: 'left' | 'right', x: number): void {
  const handle = ruler.querySelector(
    `.${side === 'left' ? RULER_CLASS_NAMES.handleLeft : RULER_CLASS_NAMES.handleRight}`,
  ) as HTMLElement | null;
  if (handle) {
    handle.style.left = `${x}px`;
  }
}

/**
 * Create a vertical indicator line element for drag feedback.
 *
 * @param doc - Document to create element in
 * @param height - Height of the indicator in pixels
 * @returns Indicator element
 */
export function createIndicatorElement(doc: Document, height: number): HTMLElement {
  const indicator = doc.createElement('div');
  indicator.className = RULER_CLASS_NAMES.indicator;
  indicator.style.cssText = `
    position: absolute;
    top: 20px;
    width: 1px;
    height: ${height}px;
    background-color: #aaa;
    pointer-events: none;
    z-index: 100;
    display: none;
  `;
  return indicator;
}

/**
 * Show/hide and position the vertical indicator.
 *
 * @param indicator - Indicator element
 * @param visible - Whether to show the indicator
 * @param x - X position in pixels (only used when visible)
 */
export function updateIndicator(indicator: HTMLElement, visible: boolean, x?: number): void {
  indicator.style.display = visible ? 'block' : 'none';
  if (visible && x !== undefined) {
    indicator.style.left = `${x}px`;
  }
}
