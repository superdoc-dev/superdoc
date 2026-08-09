/**
 * Page Geometry Helper
 *
 * Provides a centralized, cached source of truth for page positions and heights
 * in a paginated layout. Handles cumulative Y calculations, per-page heights,
 * and gaps between pages.
 *
 * This helper solves selection overlay drift issues by ensuring that geometry
 * calculations (hit testing, selection rectangles) use the same page positions
 * as the DOM painter.
 *
 * @module page-geometry-helper
 */

import type { Layout } from '@superdoc/contracts';

/**
 * Configuration for page geometry calculations.
 */
export interface PageGeometryConfig {
  /** The layout containing page data */
  layout: Layout;
  /** Gap between pages in pixels (defaults to layout.pageGap ?? 0) */
  pageGap?: number;
}

/**
 * Cached data for efficient cumulative Y lookups.
 * @private
 */
interface PageGeometryCache {
  /** Cumulative Y positions for each page (top edge in container space) */
  cumulativeY: number[];
  /** Individual page heights */
  pageHeights: number[];
  /** Gap between pages */
  pageGap: number;
  /** Total height of all pages including gaps */
  totalHeight: number;
  /** Layout version this cache was built for (for invalidation) */
  layoutVersion: number;
}

/**
 * PageGeometryHelper provides efficient, cached access to page positions and heights.
 *
 * This class:
 * - Computes cumulative Y positions for each page (accounting for per-page heights and gaps)
 * - Caches calculations for O(1) lookup performance
 * - Invalidates cache when layout changes
 * - Handles mixed page sizes correctly
 *
 * **Why This Exists:**
 * Selection overlays were drifting because geometry calculations used different
 * assumptions about page spacing than the DOM painter. This helper ensures all
 * code uses the same page positions by providing a single source of truth.
 *
 * **Performance:**
 * - Initial calculation: O(n) where n = number of pages
 * - Subsequent lookups: O(1) via cached arrays
 * - Cache invalidation: O(1) version check
 *
 * **Usage:**
 * ```typescript
 * const helper = new PageGeometryHelper({ layout, pageGap: 24 });
 *
 * // Get cumulative Y position for page 5
 * const y = helper.getPageTop(5);
 *
 * // Get height of page 5
 * const height = helper.getPageHeight(5);
 *
 * // Get gap between pages
 * const gap = helper.getPageGap();
 *
 * // Update when layout changes
 * helper.updateLayout(newLayout);
 * ```
 */
export class PageGeometryHelper {
  private config: PageGeometryConfig;
  private cache: PageGeometryCache | null = null;

  /**
   * Creates a new PageGeometryHelper instance.
   *
   * @param config - Page geometry configuration
   */
  constructor(config: PageGeometryConfig) {
    this.config = config;
  }

  /**
   * Updates the layout and invalidates the cache.
   *
   * Call this whenever the layout changes (new pages, different heights, etc.)
   *
   * @param layout - New layout data
   * @param pageGap - Optional new page gap (if not provided, uses current gap)
   */
  updateLayout(layout: Layout, pageGap?: number): void {
    this.config.layout = layout;
    if (pageGap !== undefined) {
      this.config.pageGap = pageGap;
    }
    // Invalidate cache by setting it to null
    this.cache = null;
  }

  /**
   * Updates the page gap and invalidates the cache.
   *
   * @param pageGap - New gap between pages in pixels
   */
  updatePageGap(pageGap: number): void {
    if (this.config.pageGap !== pageGap) {
      this.config.pageGap = pageGap;
      this.cache = null;
    }
  }

  /**
   * Gets the cumulative Y position (top edge) of a page in container space.
   *
   * The returned value is the distance from the top of the container to the
   * top of the specified page, accounting for all previous pages and gaps.
   *
   * @param pageIndex - Zero-based page index
   * @returns Y position in pixels, or 0 if page index is invalid
   *
   * @example
   * ```typescript
   * // Get Y position of page 0 (first page)
   * const y0 = helper.getPageTop(0); // Returns 0
   *
   * // Get Y position of page 2 (third page)
   * // Assumes page 0 height = 1000, page 1 height = 1200, gap = 24
   * const y2 = helper.getPageTop(2); // Returns 1000 + 24 + 1200 + 24 = 2248
   * ```
   */
  getPageTop(pageIndex: number): number {
    this.ensureCache();
    if (pageIndex < 0 || pageIndex >= this.cache!.cumulativeY.length) {
      return 0;
    }
    return this.cache!.cumulativeY[pageIndex];
  }

  /**
   * Gets the height of a specific page.
   *
   * Uses per-page height if available (from layout.pages[i].size?.h),
   * otherwise falls back to layout.pageSize.h.
   *
   * @param pageIndex - Zero-based page index
   * @returns Page height in pixels, or 0 if page index is invalid
   *
   * @example
   * ```typescript
   * const height = helper.getPageHeight(0); // Returns page-specific height
   * ```
   */
  getPageHeight(pageIndex: number): number {
    this.ensureCache();
    if (pageIndex < 0 || pageIndex >= this.cache!.pageHeights.length) {
      return 0;
    }
    return this.cache!.pageHeights[pageIndex];
  }

  /**
   * Gets the gap between pages.
   *
   * @returns Gap in pixels
   *
   * @example
   * ```typescript
   * const gap = helper.getPageGap(); // Returns 24
   * ```
   */
  getPageGap(): number {
    this.ensureCache();
    return this.cache!.pageGap;
  }

  /**
   * Gets the total height of all pages including gaps.
   *
   * Total height = sum of all page heights + (pageCount - 1) * gap
   *
   * @returns Total height in pixels
   *
   * @example
   * ```typescript
   * // 3 pages: heights [1000, 1200, 1000], gap = 24
   * const total = helper.getTotalHeight();
   * // Returns 1000 + 24 + 1200 + 24 + 1000 = 3248
   * ```
   */
  getTotalHeight(): number {
    this.ensureCache();
    return this.cache!.totalHeight;
  }

  /**
   * Gets the number of pages in the layout.
   *
   * @returns Page count
   */
  getPageCount(): number {
    return this.config.layout.pages.length;
  }

  /**
   * Finds the page index containing a given Y coordinate.
   *
   * This performs a linear search through cached cumulative positions.
   * For large documents, consider adding binary search optimization.
   *
   * @param containerY - Y coordinate in container space
   * @returns Page index, or null if Y is outside all pages
   *
   * @example
   * ```typescript
   * // Find which page contains Y = 1500
   * const pageIndex = helper.getPageIndexAtY(1500);
   * // Returns 1 (second page) if first page ends at Y=1024
   * ```
   */
  getPageIndexAtY(containerY: number): number | null {
    this.ensureCache();

    const cache = this.cache!;
    for (let i = 0; i < cache.cumulativeY.length; i++) {
      const pageTop = cache.cumulativeY[i];
      const pageBottom = pageTop + cache.pageHeights[i];

      if (containerY >= pageTop && containerY < pageBottom) {
        return i;
      }
    }

    return null;
  }

  /**
   * Finds the nearest page index to a given Y coordinate (snap-to-nearest).
   *
   * Returns the page containing Y when inside a page; otherwise returns the
   * closest page based on distance to page center. Useful for dragging through
   * page gaps where getPageIndexAtY would return null.
   *
   * @param containerY - Y coordinate in container space
   * @returns Nearest page index, or null if there are no pages
   */
  getNearestPageIndex(containerY: number): number | null {
    this.ensureCache();
    const cache = this.cache!;
    const pageCount = cache.pageHeights.length;
    if (pageCount === 0) return null;

    // First try exact hit
    const direct = this.getPageIndexAtY(containerY);
    if (direct !== null) return direct;

    // Otherwise snap to the closest page center
    let nearestIndex = 0;
    let nearestDistance = Infinity;
    for (let i = 0; i < pageCount; i++) {
      const top = cache.cumulativeY[i];
      const height = cache.pageHeights[i];
      const center = top + height / 2;
      const distance = Math.abs(containerY - center);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestIndex = i;
      }
    }
    return nearestIndex;
  }

  /**
   * Ensures the cache is built and up-to-date.
   * Validates cache state and rebuilds if needed.
   * @private
   * @throws Never throws - handles errors gracefully with fallback values
   */
  private ensureCache(): void {
    if (this.cache !== null) {
      // Validate cache integrity
      if (!Array.isArray(this.cache.cumulativeY) || !Array.isArray(this.cache.pageHeights)) {
        console.warn('[PageGeometryHelper] Cache corruption detected, rebuilding cache');
        this.cache = null;
      } else {
        return;
      }
    }

    this.buildCache();
  }

  /**
   * Builds the geometry cache from current layout data.
   * Handles errors gracefully by providing fallback values.
   * @private
   * @throws Never throws - catches all errors and provides safe defaults
   */
  private buildCache(): void {
    try {
      const layout = this.config.layout;

      // Validate layout structure
      if (!layout || !Array.isArray(layout.pages)) {
        throw new Error('Invalid layout: missing or invalid pages array');
      }

      const pageGap = this.config.pageGap ?? layout.pageGap ?? 0;
      const pageCount = layout.pages.length;

      // Validate pageGap is a finite number
      if (!Number.isFinite(pageGap) || pageGap < 0) {
        throw new Error(`Invalid pageGap: ${pageGap} (must be non-negative finite number)`);
      }

      const cumulativeY: number[] = new Array(pageCount);
      const pageHeights: number[] = new Array(pageCount);

      let currentY = 0;

      for (let i = 0; i < pageCount; i++) {
        const page = layout.pages[i];

        // Validate page exists
        if (!page) {
          throw new Error(`Invalid page at index ${i}: page is null or undefined`);
        }

        // Use per-page height if available, otherwise use layout.pageSize.h
        const pageHeight = page.size?.h ?? layout.pageSize.h;

        // Validate page height is a finite number
        if (!Number.isFinite(pageHeight) || pageHeight < 0) {
          throw new Error(`Invalid page height at index ${i}: ${pageHeight} (must be non-negative finite number)`);
        }

        cumulativeY[i] = currentY;
        pageHeights[i] = pageHeight;

        // Add page height + gap for next iteration (gap appears after each page)
        currentY += pageHeight;
        if (i < pageCount - 1) {
          currentY += pageGap;
        }
      }

      const totalHeight = currentY;

      this.cache = {
        cumulativeY,
        pageHeights,
        pageGap,
        totalHeight,
        layoutVersion: 0, // Placeholder for future version tracking
      };
    } catch (error) {
      // Log error and create a safe fallback cache with empty data
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[PageGeometryHelper] Cache build failed: ${errorMessage}. Using fallback empty cache.`);

      // Provide safe fallback cache with no pages
      this.cache = {
        cumulativeY: [],
        pageHeights: [],
        pageGap: 0,
        totalHeight: 0,
        layoutVersion: 0,
      };
    }
  }

  /**
   * Clears the cache, forcing recalculation on next access.
   * Useful for testing or manual cache invalidation.
   */
  clearCache(): void {
    this.cache = null;
  }

  /**
   * Gets debug information about the current cache state.
   * @internal
   */
  getDebugInfo(): {
    isCached: boolean;
    pageCount: number;
    pageGap: number;
    totalHeight: number;
    cumulativeY: number[];
    pageHeights: number[];
  } {
    this.ensureCache();
    return {
      isCached: this.cache !== null,
      pageCount: this.config.layout.pages.length,
      pageGap: this.cache!.pageGap,
      totalHeight: this.cache!.totalHeight,
      cumulativeY: [...this.cache!.cumulativeY],
      pageHeights: [...this.cache!.pageHeights],
    };
  }
}
