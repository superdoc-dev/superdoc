/**
 * Instrumentation Module
 *
 * Provides debug logging and performance metrics collection for the headers/footers
 * page-number parity feature. All instrumentation is guarded by feature flags to
 * ensure zero overhead in production when debugging is disabled.
 *
 * Key principles:
 * 1. No-op when debug flags are disabled (zero runtime cost)
 * 2. Structured logging for easy parsing and analysis
 * 3. Performance metrics for monitoring rollout health
 * 4. Cache statistics for optimization tuning
 */

import { FeatureFlags } from './featureFlags';
import type { MeasureCacheStats } from './cache';

/**
 * Performance metrics for page token resolution.
 * Tracks timing and iteration counts for monitoring rollout health.
 */
export interface PageTokenMetrics {
  /** Total time spent in token resolution (milliseconds) */
  totalTimeMs: number;
  /** Number of convergence iterations (0 = no tokens, 1+ = resolution occurred) */
  iterations: number;
  /** Number of blocks affected by token resolution */
  affectedBlocks: number;
  /** Time spent re-measuring blocks (milliseconds) */
  remeasureTimeMs: number;
  /** Time spent re-running layout (milliseconds) */
  relayoutTimeMs: number;
  /** Whether convergence was achieved within max iterations */
  converged: boolean;
}

/**
 * Header/footer cache metrics.
 * Tracks cache performance for optimization and capacity planning.
 */
export interface HeaderFooterCacheMetrics {
  /** Cache hit count for this operation */
  hits: number;
  /** Cache miss count for this operation */
  misses: number;
  /** Hit rate percentage (0-100) */
  hitRate: number;
  /** Current cache size (number of entries) */
  cacheSize: number;
  /** Estimated memory usage (bytes) */
  memoryEstimate: number;
  /** Number of evictions due to LRU policy */
  evictions: number;
}

/**
 * Layout performance metrics.
 * High-level timing for the entire layout operation.
 */
export interface LayoutMetrics {
  /** Total layout time including all phases (milliseconds) */
  totalTimeMs: number;
  /** Measurement phase time (milliseconds) */
  measureTimeMs: number;
  /** Initial pagination time (milliseconds) */
  paginationTimeMs: number;
  /** Token resolution phase time (milliseconds) */
  tokenResolutionTimeMs: number;
  /** Header/footer layout time (milliseconds) */
  headerFooterTimeMs: number;
}

/**
 * Debug logger for page token resolution.
 * Only logs when SD_DEBUG_PAGE_TOKENS is enabled.
 */
export const PageTokenLogger = {
  /**
   * Logs the start of token resolution.
   *
   * @param iteration - Current iteration number (0-based)
   * @param totalPages - Total number of pages in the document
   */
  logIterationStart(iteration: number, totalPages: number): void {
    if (!FeatureFlags.DEBUG_PAGE_TOKENS) return;

    console.log(`[PageTokens] Iteration ${iteration}: Resolving tokens for ${totalPages} pages`);
  },

  /**
   * Logs affected blocks during token resolution.
   *
   * @param iteration - Current iteration number (0-based)
   * @param affectedBlockIds - Set of affected block IDs
   * @param blockSamples - Sample block IDs for debugging (first 5)
   */
  logAffectedBlocks(iteration: number, affectedBlockIds: Set<string>, blockSamples: string[] = []): void {
    if (!FeatureFlags.DEBUG_PAGE_TOKENS) return;

    const count = affectedBlockIds.size;
    const samples = blockSamples.slice(0, 5).join(', ');

    console.log(
      `[PageTokens] Iteration ${iteration}: ${count} blocks affected`,
      samples ? `(samples: ${samples})` : '',
    );
  },

  /**
   * Logs convergence status.
   *
   * @param iteration - Final iteration number
   * @param converged - Whether convergence was achieved
   * @param totalTimeMs - Total time spent in token resolution
   */
  logConvergence(iteration: number, converged: boolean, totalTimeMs: number): void {
    if (!FeatureFlags.DEBUG_PAGE_TOKENS) return;

    if (converged) {
      console.log(`[PageTokens] Converged after ${iteration} iterations in ${totalTimeMs.toFixed(2)}ms`);
    } else {
      console.warn(`[PageTokens] Did NOT converge after ${iteration} iterations (${totalTimeMs.toFixed(2)}ms)`);
    }
  },

  /**
   * Logs token resolution error.
   *
   * @param blockId - Block ID where error occurred
   * @param error - Error object
   */
  logError(blockId: string, error: unknown): void {
    if (!FeatureFlags.DEBUG_PAGE_TOKENS) return;

    console.error(`[PageTokens] Error resolving tokens in block ${blockId}:`, error);
  },

  /**
   * Logs re-measurement details.
   *
   * @param blockCount - Number of blocks being re-measured
   * @param timeMs - Time spent re-measuring
   */
  logRemeasure(blockCount: number, timeMs: number): void {
    if (!FeatureFlags.DEBUG_PAGE_TOKENS) return;

    console.log(`[PageTokens] Re-measured ${blockCount} blocks in ${timeMs.toFixed(2)}ms`);
  },
};

/**
 * Debug logger for header/footer cache operations.
 * Only logs when SD_DEBUG_HF_CACHE is enabled.
 */
export const HeaderFooterCacheLogger = {
  /**
   * Logs cache hit for a header/footer variant.
   *
   * @param variantType - Variant type (default, first, even, odd)
   * @param pageNumber - Page number being cached
   * @param bucket - Digit bucket (d1, d2, d3, d4) or 'exact'
   */
  logCacheHit(variantType: string, pageNumber: number, bucket: string): void {
    if (!FeatureFlags.DEBUG_HF_CACHE) return;

    console.log(`[HF Cache] HIT: variant=${variantType}, page=${pageNumber}, bucket=${bucket}`);
  },

  /**
   * Logs cache miss for a header/footer variant.
   *
   * @param variantType - Variant type (default, first, even, odd)
   * @param pageNumber - Page number being cached
   * @param bucket - Digit bucket (d1, d2, d3, d4) or 'exact'
   */
  logCacheMiss(variantType: string, pageNumber: number, bucket: string): void {
    if (!FeatureFlags.DEBUG_HF_CACHE) return;

    console.log(`[HF Cache] MISS: variant=${variantType}, page=${pageNumber}, bucket=${bucket}`);
  },

  /**
   * Logs cache invalidation.
   *
   * @param reason - Reason for invalidation
   * @param affectedBlockIds - Block IDs being invalidated
   */
  logInvalidation(reason: string, affectedBlockIds: string[]): void {
    if (!FeatureFlags.DEBUG_HF_CACHE) return;

    console.log(`[HF Cache] INVALIDATE: reason=${reason}, blocks=${affectedBlockIds.length}`);
  },

  /**
   * Logs cache statistics.
   *
   * @param stats - Cache statistics object
   */
  logStats(stats: MeasureCacheStats): void {
    if (!FeatureFlags.DEBUG_HF_CACHE) return;

    const hitRate =
      stats.hits + stats.misses > 0 ? ((stats.hits / (stats.hits + stats.misses)) * 100).toFixed(1) : '0.0';

    console.log(
      `[HF Cache] Stats: hits=${stats.hits}, misses=${stats.misses}, hitRate=${hitRate}%, size=${stats.size}, evictions=${stats.evictions}`,
    );
  },

  /**
   * Logs bucketing decision for large documents.
   *
   * @param totalPages - Total number of pages
   * @param useBucketing - Whether bucketing is being used
   * @param buckets - Buckets needed (if bucketing enabled)
   */
  logBucketingDecision(totalPages: number, useBucketing: boolean, buckets?: string[]): void {
    if (!FeatureFlags.DEBUG_HF_CACHE) return;

    if (useBucketing && buckets) {
      console.log(`[HF Cache] Bucketing enabled: ${totalPages} pages, buckets=${buckets.join(', ')}`);
    } else {
      console.log(`[HF Cache] Bucketing disabled: ${totalPages} pages (per-page layouts)`);
    }
  },
};

/**
 * Metrics collector for performance monitoring.
 * Collects metrics even when debug logging is disabled, for production monitoring.
 */
export class MetricsCollector {
  private pageTokenMetrics: PageTokenMetrics | null = null;
  private headerFooterCacheMetrics: HeaderFooterCacheMetrics | null = null;
  private layoutMetrics: LayoutMetrics | null = null;

  /**
   * Records page token resolution metrics.
   *
   * @param metrics - Page token metrics
   */
  recordPageTokenMetrics(metrics: PageTokenMetrics): void {
    this.pageTokenMetrics = { ...metrics };

    // Check for rollback triggers
    this.checkPageTokenRollbackTriggers(metrics);
  }

  /**
   * Records header/footer cache metrics.
   *
   * @param stats - Cache statistics
   */
  recordHeaderFooterCacheMetrics(stats: MeasureCacheStats): void {
    const hitRate = stats.hits + stats.misses > 0 ? (stats.hits / (stats.hits + stats.misses)) * 100 : 0;

    this.headerFooterCacheMetrics = {
      hits: stats.hits,
      misses: stats.misses,
      hitRate,
      cacheSize: stats.size,
      memoryEstimate: stats.memorySizeEstimate,
      evictions: stats.evictions,
    };

    // Check for rollback triggers
    this.checkCacheRollbackTriggers(this.headerFooterCacheMetrics);
  }

  /**
   * Records overall layout metrics.
   *
   * @param metrics - Layout metrics
   */
  recordLayoutMetrics(metrics: LayoutMetrics): void {
    this.layoutMetrics = { ...metrics };
  }

  /**
   * Gets all collected metrics.
   *
   * @returns Object with all metrics or null if not collected
   */
  getMetrics(): {
    pageTokens: PageTokenMetrics | null;
    headerFooterCache: HeaderFooterCacheMetrics | null;
    layout: LayoutMetrics | null;
  } {
    return {
      pageTokens: this.pageTokenMetrics,
      headerFooterCache: this.headerFooterCacheMetrics,
      layout: this.layoutMetrics,
    };
  }

  /**
   * Resets all collected metrics.
   */
  reset(): void {
    this.pageTokenMetrics = null;
    this.headerFooterCacheMetrics = null;
    this.layoutMetrics = null;
  }

  /**
   * Checks for page token rollback triggers and logs warnings.
   *
   * Rollback triggers (from plan):
   * - Convergence > 2 iterations
   * - Token resolution time > 100ms per layout run
   *
   * @param metrics - Page token metrics
   */
  private checkPageTokenRollbackTriggers(metrics: PageTokenMetrics): void {
    // Trigger 1: Too many iterations
    if (metrics.iterations > 2 && !metrics.converged) {
      console.warn(
        `[Rollback Trigger] Page token resolution did not converge after ${metrics.iterations} iterations. ` +
          `Consider disabling SD_BODY_PAGE_TOKENS if this persists.`,
      );
    }

    // Trigger 2: Slow token resolution
    if (metrics.totalTimeMs > 100 && metrics.iterations > 0) {
      console.warn(
        `[Rollback Trigger] Page token resolution took ${metrics.totalTimeMs.toFixed(2)}ms (>100ms threshold). ` +
          `Consider disabling SD_BODY_PAGE_TOKENS if performance is unacceptable.`,
      );
    }
  }

  /**
   * Checks for cache rollback triggers and logs warnings.
   *
   * Rollback triggers (from plan):
   * - Cache thrash (hit rate below 30%)
   * - Excessive memory usage (>1MB per 100 pages)
   *
   * @param metrics - Header/footer cache metrics
   */
  private checkCacheRollbackTriggers(metrics: HeaderFooterCacheMetrics): void {
    const MIN_HIT_RATE = 30; // 30% minimum hit rate
    const MAX_MEMORY_PER_100_PAGES = 1_000_000; // 1MB per 100 pages

    // Trigger 1: Low hit rate (cache thrash)
    if (metrics.hits + metrics.misses > 10 && metrics.hitRate < MIN_HIT_RATE) {
      console.warn(
        `[Rollback Trigger] Header/footer cache hit rate is low (${metrics.hitRate.toFixed(1)}% < ${MIN_HIT_RATE}%). ` +
          `Consider disabling SD_HF_DIGIT_BUCKETING if cache thrashing persists.`,
      );
    }

    // Trigger 2: Excessive memory usage (approximate check)
    // Note: This is a rough heuristic - actual page count would need to be passed in
    if (metrics.memoryEstimate > MAX_MEMORY_PER_100_PAGES) {
      console.warn(
        `[Rollback Trigger] Header/footer cache memory usage is high (${(metrics.memoryEstimate / 1_000_000).toFixed(2)}MB). ` +
          `Monitor for excessive growth.`,
      );
    }
  }
}

/**
 * Global metrics collector instance.
 * Can be accessed for monitoring and debugging.
 */
export const globalMetrics = new MetricsCollector();

/**
 * Logger for layout version events.
 * Guards all logging behind SD_DEBUG_LAYOUT_VERSION flag for zero overhead in production.
 */
export const LayoutVersionLogger = {
  /**
   * Log when selection overlay attempts to use stale layout.
   *
   * @param versionGap - Number of PM versions ahead of layout
   * @param stalenessDuration - How long layout has been stale (ms)
   */
  logStaleLayoutRead(versionGap: number, stalenessDuration: number): void {
    if (!FeatureFlags.DEBUG_LAYOUT_VERSION) return;

    console.warn(
      `[LayoutVersion] Selection overlay using STALE layout ` +
        `(gap: ${versionGap} versions, stale for: ${stalenessDuration}ms)`,
    );
  },

  /**
   * Log when geometry fallback is used due to missing pmStart/pmEnd.
   *
   * @param reason - Why fallback was needed
   * @param pos - PM position that failed
   */
  logGeometryFallback(reason: string, pos: number): void {
    if (!FeatureFlags.DEBUG_LAYOUT_VERSION) return;

    console.warn(`[LayoutVersion] Geometry fallback used: ${reason} (pos: ${pos})`);
  },

  /**
   * Log when layout catches up to current PM state.
   *
   * @param versionGap - How many versions layout was behind
   * @param stalenessDuration - Total duration layout was stale (ms)
   */
  logLayoutCaughtUp(versionGap: number, stalenessDuration: number): void {
    if (!FeatureFlags.DEBUG_LAYOUT_VERSION) return;

    if (versionGap > 0) {
      console.log(`[LayoutVersion] Layout caught up after ${versionGap} versions (stale for ${stalenessDuration}ms)`);
    }
  },

  /**
   * Log PM transaction that increments version.
   *
   * @param newVersion - New PM version after transaction
   */
  logPmTransaction(newVersion: number): void {
    if (!FeatureFlags.DEBUG_LAYOUT_VERSION) return;

    console.log(`[LayoutVersion] PM transaction → v${newVersion}`);
  },

  /**
   * Log layout completion.
   *
   * @param version - Version of the completed layout
   * @param isStale - Whether layout is still stale after this completion
   */
  logLayoutComplete(version: number, isStale: boolean): void {
    if (!FeatureFlags.DEBUG_LAYOUT_VERSION) return;

    const status = isStale ? 'STALE' : 'CURRENT';
    console.log(`[LayoutVersion] Layout complete → v${version} (${status})`);
  },
};
