/**
 * Cache Warmer
 *
 * Proactively warms font metrics and paragraph line caches to reduce
 * layout calculation time during initial document load and scrolling.
 *
 * Warming Strategy:
 * 1. Pre-measure fonts on document load
 * 2. Pre-calculate line breaks for visible paragraphs
 * 3. Warm adjacent pages as user scrolls
 * 4. Track warming progress for UI feedback
 *
 * @module cache-warmer
 */

import type { FontMetricsCache } from './font-metrics-cache';
import type { ParagraphLineCache } from './paragraph-line-cache';

/**
 * Configuration for cache warming.
 */
export interface WarmingConfig {
  /** Font keys to pre-warm */
  fonts: string[];
  /** Page indices currently in viewport */
  viewportPages: number[];
  /** Whether to prefetch adjacent pages */
  prefetchAdjacent: boolean;
}

/**
 * Information about a paragraph for cache warming.
 */
export interface ParagraphWarmInfo {
  /** Paragraph block index */
  index: number;
  /** Paragraph text content */
  text: string;
  /** Font key for this paragraph */
  fontKey: string;
  /** Maximum width for line breaking */
  maxWidth: number;
}

/**
 * CacheWarmer proactively populates caches to improve performance.
 */
export class CacheWarmer {
  private fontMetricsCache: FontMetricsCache;
  private paragraphLineCache: ParagraphLineCache;
  private warmingProgress = { fontsCached: 0, paragraphsCached: 0, total: 0 };

  constructor(fontMetricsCache: FontMetricsCache, paragraphLineCache: ParagraphLineCache) {
    this.fontMetricsCache = fontMetricsCache;
    this.paragraphLineCache = paragraphLineCache;
  }

  /**
   * Warm caches on document load.
   *
   * @param config - Warming configuration
   */
  async warmOnLoad(config: WarmingConfig): Promise<void> {
    this.warmingProgress.total = config.fonts.length;
    this.warmingProgress.fontsCached = 0;

    // Warm font metrics cache
    for (const fontKey of config.fonts) {
      if (!this.fontMetricsCache.has(fontKey)) {
        this.fontMetricsCache.measureChar(fontKey, ' '); // Triggers font measurement
      }
      this.warmingProgress.fontsCached++;
    }

    // Prefetch adjacent pages if enabled
    if (config.prefetchAdjacent) {
      for (const pageIndex of config.viewportPages) {
        this.warmForScroll(pageIndex);
      }
    }
  }

  /**
   * Warm caches for adjacent pages as user scrolls.
   *
   * @param currentPage - Current page index
   */
  warmForScroll(_currentPage: number): void {
    // In a real implementation, this would prefetch layout data
    // for pages currentPage-1, currentPage, currentPage+1
    // For now, this is a placeholder for the infrastructure
  }

  /**
   * Pre-calculate line breaks for visible paragraphs.
   *
   * @param paragraphs - Array of paragraphs to warm
   */
  precalculateLines(paragraphs: ParagraphWarmInfo[]): void {
    this.warmingProgress.total = paragraphs.length;
    this.warmingProgress.paragraphsCached = 0;

    for (const para of paragraphs) {
      // Check if already cached
      const cached = this.paragraphLineCache.getLines(para.index);

      if (!cached) {
        // In real implementation, would calculate and cache line breaks
        // For now, this is infrastructure placeholder
      }

      this.warmingProgress.paragraphsCached++;
    }
  }

  /**
   * Get warming progress for UI feedback.
   *
   * @returns Progress statistics
   */
  getProgress(): { fontsCached: number; paragraphsCached: number; total: number } {
    return { ...this.warmingProgress };
  }

  /**
   * Reset warming progress counters.
   */
  resetProgress(): void {
    this.warmingProgress = { fontsCached: 0, paragraphsCached: 0, total: 0 };
  }

  /**
   * Estimate completion percentage.
   *
   * @returns Completion percentage (0-100)
   */
  getCompletionPercentage(): number {
    if (this.warmingProgress.total === 0) return 100;

    const completed = this.warmingProgress.fontsCached + this.warmingProgress.paragraphsCached;
    return Math.min(100, Math.round((completed / this.warmingProgress.total) * 100));
  }
}
