/**
 * ProseMirror DOM Fallback
 *
 * Provides cursor positioning using ProseMirror's native DOM coordinate system
 * when layout data is stale. Transforms PM's coordinates into paginated space.
 *
 * This is a fallback mechanism used when:
 * - Layout is currently being recalculated
 * - Layout version is behind PM document version
 * - Need immediate cursor positioning before layout completes
 *
 * @module pm-dom-fallback
 */

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
  /** Width of the selection rectangle (optional for cursor, required for selections) */
  width?: number;
}

/**
 * Page transformation information for converting coordinates.
 */
export interface PageTransform {
  /** Index of the page */
  pageIndex: number;
  /** X offset of the page in container */
  x: number;
  /** Y offset of the page in container */
  y: number;
  /** Scale factor applied to the page */
  scale: number;
  /**
   * Height of the page in pixels (before scaling).
   *
   * **When Present:**
   * - The page has a known, measured height (e.g., from layout calculation or DOM measurement)
   * - Used to calculate page bottom boundary: pageBottom = y + height / scale
   * - Enables accurate hit testing when determining which page contains a cursor
   *
   * **When Absent (undefined):**
   * - Page height is unknown or not yet calculated
   * - Falls back to a conservative default (e.g., 1000px) for coordinate transformation
   * - May occur during initial layout before page heights are measured
   * - May occur for pages that haven't been rendered yet
   *
   * **Impact on Cursor Visibility:**
   * When height is absent, coordinate mapping uses a fallback value which may be incorrect
   * for unusually tall or short pages. This can affect:
   * - Cursor positioning accuracy when layout is stale
   * - Page boundary detection for multi-page cursors
   * - Scroll-to-cursor behavior near page boundaries
   *
   * **Recommendation:**
   * Always provide height when available to ensure accurate cursor positioning. The fallback
   * is safe but may result in minor positioning errors for non-standard page sizes.
   */
  height?: number;
}

/**
 * Minimal interface for ProseMirror EditorView.
 * Only includes the methods we need for fallback positioning.
 */
export interface PmEditorView {
  /**
   * Get DOM coordinates for a PM position.
   * Returns null if position is not currently rendered.
   */
  coordsAtPos(pos: number): { left: number; top: number; bottom: number } | null;

  /**
   * Get the DOM node for the editor.
   */
  dom: HTMLElement;
}

/**
 * PmDomFallback provides cursor positioning using ProseMirror's DOM
 * coordinate system when layout is stale.
 *
 * This class bridges between PM's viewport-relative coordinates and
 * the paginated layout coordinate system.
 *
 * Usage:
 * ```typescript
 * const fallback = new PmDomFallback(pmView, getPageTransforms);
 *
 * // When layout is stale, use DOM-based positioning
 * const cursorRect = fallback.getCursorRect(pmPos);
 * if (cursorRect) {
 *   renderer.render(cursorRect);
 * }
 * ```
 */
export class PmDomFallback {
  private pmView: PmEditorView;
  private getPageTransforms: () => PageTransform[];

  /**
   * Creates a new PmDomFallback instance.
   *
   * @param pmView - ProseMirror editor view
   * @param getPageTransforms - Function to get current page transformations
   */
  constructor(pmView: PmEditorView, getPageTransforms: () => PageTransform[]) {
    this.pmView = pmView;
    this.getPageTransforms = getPageTransforms;
  }

  /**
   * Get cursor rect using PM's coordsAtPos, transformed to page space.
   * Use when layout is stale.
   *
   * @param pmPos - ProseMirror position
   * @returns Cursor rectangle in page space, or null if position not rendered
   */
  getCursorRect(pmPos: number): CursorRect | null {
    // Get DOM coordinates from ProseMirror
    const coords = this.pmView.coordsAtPos(pmPos);
    if (!coords) {
      return null;
    }

    // Transform to page space
    return this.mapToPageSpace(coords);
  }

  /**
   * Map PM coords to page-local coordinates.
   *
   * Takes viewport-relative coordinates from PM and transforms them
   * into page-local coordinates accounting for:
   * - Page positioning in the layout
   * - Zoom/scale transformations
   * - Multi-page layout
   *
   * **Behavioral Change (Selection Polish):**
   * This function now returns null when the cursor is outside all pages, rather than
   * falling back to the first page. This change improves cursor positioning accuracy
   * when layout is stale.
   *
   * **Why null is preferred over fallback-to-first-page:**
   * 1. **Accuracy:** When layout is stale, showing no cursor is better than showing it
   *    at the wrong position. A missing cursor prompts layout refresh; a misplaced cursor
   *    causes user confusion and incorrect editing.
   * 2. **Temporary State:** Layout staleness is temporary - typically resolves within
   *    100-200ms. Hiding the cursor briefly is less disruptive than showing it incorrectly.
   * 3. **User Expectations:** Users expect the cursor to appear where they clicked. If we
   *    can't determine that position accurately, hiding it is more honest than guessing.
   * 4. **Prevents Drift:** Fallback positioning can cause selection drift where the visual
   *    cursor and actual PM selection position diverge, leading to incorrect edits.
   *
   * **Impact on Cursor Visibility:**
   * - Cursor may briefly disappear during layout recalculation (typically < 200ms)
   * - Cursor will not appear when clicking in gaps between pages (expected behavior)
   * - Cursor will not appear for positions outside the document bounds (expected behavior)
   * - When layout catches up, cursor will reappear at the correct position
   *
   * **Migration Notes:**
   * Code relying on the old fallback behavior should handle null returns gracefully:
   * ```typescript
   * const cursorRect = fallback.getCursorRect(pmPos);
   * if (cursorRect) {
   *   renderer.render(cursorRect);
   * } else {
   *   renderer.hide(); // Cursor is outside all pages - hide it
   * }
   * ```
   *
   * @param coords - PM viewport coordinates
   * @returns Cursor rectangle in page space, or null if outside all pages (including gaps)
   */
  mapToPageSpace(coords: { left: number; top: number; bottom: number }): CursorRect | null {
    // Get editor container bounding box
    const editorRect = this.pmView.dom.getBoundingClientRect();

    // Convert viewport coords to container-relative coords
    const containerX = coords.left - editorRect.left;
    const containerY = coords.top - editorRect.top;
    const height = coords.bottom - coords.top;

    // Get page transforms
    const pageTransforms = this.getPageTransforms();

    // Find which page contains this Y coordinate
    for (const transform of pageTransforms) {
      const pageTop = transform.y;
      // Use real page height from transform if available, otherwise use a conservative default
      const pageHeightUnscaled = transform.height ?? 1000;
      const pageBottom = transform.y + pageHeightUnscaled / transform.scale;

      if (containerY >= pageTop && containerY < pageBottom) {
        // Found the page containing this cursor
        return {
          x: (containerX - transform.x) / transform.scale,
          y: (containerY - transform.y) / transform.scale,
          height: height / transform.scale,
          pageIndex: transform.pageIndex,
        };
      }
    }

    // Cursor is outside all pages - suppress rendering rather than guessing
    // This prevents drawing at wrong offsets when layout is stale
    // Changed from fallback-to-first-page to null return for better accuracy
    return null;
  }

  /**
   * Check if a PM position is currently visible in the viewport.
   *
   * @param pmPos - ProseMirror position
   * @returns True if position is rendered and visible
   */
  isPositionVisible(pmPos: number): boolean {
    const coords = this.pmView.coordsAtPos(pmPos);
    if (!coords) {
      return false;
    }

    // Check if coords are within viewport
    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;

    return coords.top >= 0 && coords.top <= viewportHeight && coords.left >= 0 && coords.left <= viewportWidth;
  }

  /**
   * Get selection rectangles using PM's DOM for a range.
   *
   * @param from - Start PM position
   * @param to - End PM position
   * @returns Array of cursor rectangles for the selection
   */
  getSelectionRects(from: number, to: number): CursorRect[] {
    if (from === to) {
      return [];
    }

    // Ensure from < to
    if (from > to) {
      [from, to] = [to, from];
    }

    const rects: CursorRect[] = [];

    // Sample positions along the range to generate selection rectangles
    // For now, just get start and end positions
    // A more sophisticated implementation could sample more positions

    const startRect = this.getCursorRect(from);
    if (startRect) {
      rects.push(startRect);
    }

    // If selection spans significant distance, add intermediate points
    const distance = to - from;
    if (distance > 10) {
      // Sample a few points in the middle
      const sampleCount = Math.min(5, Math.floor(distance / 10));
      for (let i = 1; i < sampleCount; i++) {
        const samplePos = from + Math.floor((distance * i) / sampleCount);
        const rect = this.getCursorRect(samplePos);
        if (rect) {
          rects.push(rect);
        }
      }
    }

    const endRect = this.getCursorRect(to);
    if (endRect) {
      rects.push(endRect);
    }

    return rects;
  }
}
