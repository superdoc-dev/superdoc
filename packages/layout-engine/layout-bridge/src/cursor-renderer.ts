/**
 * Cursor Renderer
 *
 * Renders cursor and selection overlays as positioned div elements.
 * Provides smooth cursor blinking and instant updates without DOM measurements.
 *
 * @module cursor-renderer
 */

/**
 * Standard cursor blink rate in milliseconds.
 * 530ms is the typical blink rate used by most text editors and matches OS defaults.
 * This creates a comfortable rhythm: on for 530ms, off for 530ms (1.06s full cycle).
 */
const DEFAULT_CURSOR_BLINK_RATE_MS = 530;

/**
 * Cursor position rectangle for rendering.
 */
export interface CursorRect {
  /** Page index where cursor is located */
  pageIndex: number;
  /** X position within the page */
  x: number;
  /** Y position within the page */
  y: number;
  /** Height of the cursor line */
  height: number;
  /**
   * Width of the selection rectangle.
   *
   * **Semantics:**
   * - When undefined: Represents a collapsed cursor (zero-width selection). Rendered as a thin
   *   vertical line at the cursor position. Typically uses the configured cursorWidth (default 2px).
   * - When defined: Represents a selection span (from !== to). Width indicates the horizontal
   *   extent of selected text or content.
   *
   * **Use Cases:**
   * - Cursor rendering: width should be undefined or omitted
   * - Selection highlighting: width should be the measured pixel width of the selected text/content
   * - Collapsed selections: Some renderers treat width=0 as equivalent to undefined
   *
   * **Rendering Behavior:**
   * The CursorRenderer uses this field to distinguish between cursor (thin line) and selection
   * (filled rectangle). When width is undefined, it falls back to cursorWidth for rendering.
   */
  width?: number;
}

/**
 * Configuration options for cursor rendering.
 */
export interface CursorRendererOptions {
  /** Container element to render cursor within */
  container: HTMLElement;
  /** Width of cursor line in pixels (default: 2) */
  cursorWidth?: number;
  /** Color of cursor (default: 'black') */
  cursorColor?: string;
  /** Cursor blink rate in milliseconds (default: 530) */
  blinkRate?: number;
  /** Selection background color (default: 'rgba(0, 123, 255, 0.3)') */
  selectionColor?: string;
}

/**
 * CursorRenderer renders cursor and selection overlays using positioned divs.
 *
 * This approach avoids browser's native cursor rendering and provides:
 * - Instant cursor updates without DOM measurements
 * - Precise positioning using calculated coordinates
 * - Smooth cursor blinking
 * - Multi-rect selection rendering
 *
 * Usage:
 * ```typescript
 * const renderer = new CursorRenderer({
 *   container: editorElement,
 *   cursorWidth: 2,
 *   cursorColor: 'black',
 *   blinkRate: 530
 * });
 *
 * // Render cursor at calculated position
 * renderer.render(cursorRect);
 *
 * // Render selection
 * renderer.renderSelection(selectionRects);
 *
 * // Clean up
 * renderer.destroy();
 * ```
 */
export class CursorRenderer {
  private container: HTMLElement;
  private cursorWidth: number;
  private cursorColor: string;
  private blinkRate: number;
  private selectionColor: string;

  private cursorElement: HTMLDivElement | null = null;
  private selectionElements: HTMLDivElement[] = [];
  private blinkInterval: ReturnType<typeof setInterval> | null = null;
  private isBlinkVisible: boolean = true;
  private isCursorVisible: boolean = true;

  /**
   * Creates a new CursorRenderer instance.
   *
   * @param options - Cursor rendering options
   */
  constructor(options: CursorRendererOptions) {
    this.container = options.container;
    this.cursorWidth = options.cursorWidth ?? 2;
    this.cursorColor = options.cursorColor ?? 'black';
    this.blinkRate = options.blinkRate ?? DEFAULT_CURSOR_BLINK_RATE_MS;
    this.selectionColor = options.selectionColor ?? 'rgba(0, 123, 255, 0.3)';

    this.initializeCursorElement();
  }

  /**
   * Initialize the cursor DOM element.
   * @private
   */
  private initializeCursorElement(): void {
    this.cursorElement = document.createElement('div');
    this.cursorElement.style.position = 'absolute';
    this.cursorElement.style.width = `${this.cursorWidth}px`;
    this.cursorElement.style.backgroundColor = this.cursorColor;
    this.cursorElement.style.pointerEvents = 'none';
    this.cursorElement.style.zIndex = '1000';
    this.cursorElement.style.transition = 'none';
    this.cursorElement.setAttribute('data-cursor', 'true');
    this.container.appendChild(this.cursorElement);
  }

  /**
   * Render cursor at calculated position.
   *
   * @param rect - Cursor rectangle or null to hide cursor
   */
  render(rect: CursorRect | null): void {
    if (!this.cursorElement) {
      return;
    }

    if (!rect || !this.isCursorVisible) {
      this.cursorElement.style.display = 'none';
      return;
    }

    // Update cursor position and size
    this.cursorElement.style.display = 'block';
    this.cursorElement.style.left = `${rect.x}px`;
    this.cursorElement.style.top = `${rect.y}px`;
    this.cursorElement.style.height = `${rect.height}px`;

    // Reset blink state when cursor moves
    this.resetBlink();
  }

  /**
   * Render selection rectangles.
   *
   * Creates or updates div elements for each selection rectangle.
   *
   * @param rects - Array of selection rectangles
   */
  renderSelection(rects: CursorRect[]): void {
    // Remove excess selection elements
    while (this.selectionElements.length > rects.length) {
      const elem = this.selectionElements.pop();
      if (elem && elem.parentNode) {
        elem.parentNode.removeChild(elem);
      }
    }

    // Create additional selection elements if needed
    while (this.selectionElements.length < rects.length) {
      const elem = document.createElement('div');
      elem.style.position = 'absolute';
      elem.style.backgroundColor = this.selectionColor;
      elem.style.pointerEvents = 'none';
      elem.style.zIndex = '999'; // Below cursor
      elem.setAttribute('data-selection', 'true');
      this.container.appendChild(elem);
      this.selectionElements.push(elem);
    }

    // Update positions of selection elements
    for (let i = 0; i < rects.length; i++) {
      const rect = rects[i];
      const elem = this.selectionElements[i];

      elem.style.left = `${rect.x}px`;
      elem.style.top = `${rect.y}px`;
      // Use rect.width if provided, otherwise fall back to a minimal width
      // Collapsed selections (from === to) should render as a thin cursor (2px)
      const width = rect.width ?? this.cursorWidth;
      elem.style.width = `${Math.max(1, width)}px`;
      elem.style.height = `${rect.height}px`;
    }
  }

  /**
   * Show or hide the cursor.
   *
   * @param visible - Whether cursor should be visible
   */
  setVisible(visible: boolean): void {
    this.isCursorVisible = visible;

    if (!this.cursorElement) {
      return;
    }

    if (!visible) {
      this.cursorElement.style.display = 'none';
      this.stopBlink();
    } else {
      this.cursorElement.style.display = 'block';
      this.startBlink();
    }
  }

  /**
   * Start cursor blink animation.
   */
  startBlink(): void {
    if (this.blinkInterval !== null) {
      return; // Already blinking
    }

    this.isBlinkVisible = true;
    this.updateBlinkState();

    this.blinkInterval = setInterval(() => {
      this.isBlinkVisible = !this.isBlinkVisible;
      this.updateBlinkState();
    }, this.blinkRate);
  }

  /**
   * Stop cursor blink animation.
   */
  stopBlink(): void {
    if (this.blinkInterval !== null) {
      clearInterval(this.blinkInterval);
      this.blinkInterval = null;
    }

    // Reset to visible state
    this.isBlinkVisible = true;
    this.updateBlinkState();
  }

  /**
   * Reset blink animation (show cursor and restart timer).
   * Call this when cursor moves to provide immediate visual feedback.
   * @private
   */
  private resetBlink(): void {
    if (this.blinkInterval !== null) {
      this.stopBlink();
      this.startBlink();
    }
  }

  /**
   * Update cursor visibility based on blink state.
   * @private
   */
  private updateBlinkState(): void {
    if (!this.cursorElement) {
      return;
    }

    this.cursorElement.style.opacity = this.isBlinkVisible ? '1' : '0';
  }

  /**
   * Update cursor color.
   *
   * @param color - New cursor color
   */
  setCursorColor(color: string): void {
    this.cursorColor = color;
    if (this.cursorElement) {
      this.cursorElement.style.backgroundColor = color;
    }
  }

  /**
   * Update selection color.
   *
   * @param color - New selection color
   */
  setSelectionColor(color: string): void {
    this.selectionColor = color;
    for (const elem of this.selectionElements) {
      elem.style.backgroundColor = color;
    }
  }

  /**
   * Update cursor width.
   *
   * @param width - New cursor width in pixels
   */
  setCursorWidth(width: number): void {
    this.cursorWidth = width;
    if (this.cursorElement) {
      this.cursorElement.style.width = `${width}px`;
    }
  }

  /**
   * Update blink rate.
   *
   * @param rate - New blink rate in milliseconds
   */
  setBlinkRate(rate: number): void {
    this.blinkRate = rate;

    // Restart blinking with new rate if currently blinking
    if (this.blinkInterval !== null) {
      this.stopBlink();
      this.startBlink();
    }
  }

  /**
   * Clean up and remove all cursor and selection elements.
   */
  destroy(): void {
    this.stopBlink();

    if (this.cursorElement && this.cursorElement.parentNode) {
      this.cursorElement.parentNode.removeChild(this.cursorElement);
      this.cursorElement = null;
    }

    for (const elem of this.selectionElements) {
      if (elem.parentNode) {
        elem.parentNode.removeChild(elem);
      }
    }
    this.selectionElements = [];
  }

  /**
   * Check if cursor is currently visible (not hidden by user).
   *
   * @returns True if cursor is set to visible
   */
  isVisible(): boolean {
    return this.isCursorVisible;
  }

  /**
   * Check if cursor is currently blinking.
   *
   * @returns True if blink animation is running
   */
  isBlinking(): boolean {
    return this.blinkInterval !== null;
  }

  /**
   * Get current cursor position.
   *
   * @returns Current cursor rectangle or null if not rendered
   */
  getCurrentPosition(): { x: number; y: number; height: number } | null {
    if (!this.cursorElement || this.cursorElement.style.display === 'none') {
      return null;
    }

    return {
      x: parseFloat(this.cursorElement.style.left) || 0,
      y: parseFloat(this.cursorElement.style.top) || 0,
      height: parseFloat(this.cursorElement.style.height) || 0,
    };
  }

  /**
   * Get count of currently rendered selection rectangles.
   *
   * @returns Number of selection rects
   */
  getSelectionCount(): number {
    return this.selectionElements.length;
  }
}
