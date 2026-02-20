import type { FlowBlock, HeaderFooterLayout, Measure } from '@superdoc/contracts';
import { layoutHeaderFooter, type HeaderFooterConstraints } from '@superdoc/layout-engine';
import { MeasureCache } from './cache';
import { resolveHeaderFooterTokens, cloneHeaderFooterBlocks } from './resolveHeaderFooterTokens';
import { FeatureFlags } from './featureFlags';
import { HeaderFooterCacheLogger } from './instrumentation';

export type HeaderFooterBatch = Partial<Record<'default' | 'first' | 'even' | 'odd', FlowBlock[]>>;
export type MeasureResolver = (
  block: FlowBlock,
  constraints: { maxWidth: number; maxHeight: number },
) => Promise<Measure>;

export type HeaderFooterBatchResult = Partial<
  Record<'default' | 'first' | 'even' | 'odd', { blocks: FlowBlock[]; measures: Measure[]; layout: HeaderFooterLayout }>
>;

/**
 * Page resolver callback for header/footer token resolution.
 * Provides display page information for a specific physical page number.
 *
 * @param pageNumber - Physical page number (1-indexed)
 * @returns Display page information including formatted text and total pages
 */
export type PageResolver = (pageNumber: number) => {
  displayText: string;
  totalPages: number;
};

/**
 * Digit bucket for page number caching strategy.
 * Different digit lengths require different measurements due to width changes.
 */
export type DigitBucket = 'd1' | 'd2' | 'd3' | 'd4';

/**
 * Minimum document size to enable digit bucketing optimization.
 * Below this threshold, we create per-page layouts for simplicity.
 */
const MIN_PAGES_FOR_BUCKETING = 100;

/**
 * Determines the digit bucket for a given page number.
 *
 * Bucket strategy:
 * - d1: 1-9 (single digit)
 * - d2: 10-99 (two digits)
 * - d3: 100-999 (three digits)
 * - d4: 1000+ (four or more digits)
 *
 * This bucketing allows us to cache header/footer layouts by digit width,
 * reducing the number of unique layouts we need to measure and store.
 *
 * @param pageNumber - Page number to bucket (1-indexed)
 * @returns Digit bucket identifier
 *
 * @example
 * ```typescript
 * getBucketForPageNumber(5);    // 'd1'
 * getBucketForPageNumber(42);   // 'd2'
 * getBucketForPageNumber(123);  // 'd3'
 * getBucketForPageNumber(1000); // 'd4'
 * ```
 */
export function getBucketForPageNumber(pageNumber: number): DigitBucket {
  if (pageNumber < 10) return 'd1';
  if (pageNumber < 100) return 'd2';
  if (pageNumber < 1000) return 'd3';
  return 'd4';
}

/**
 * Gets a representative page number for a digit bucket.
 *
 * The representative page is used for measurement and layout.
 * We choose mid-range values to get realistic measurements:
 * - d1: 5 (middle of 1-9)
 * - d2: 50 (middle of 10-99)
 * - d3: 500 (middle of 100-999)
 * - d4: 5000 (representative of 1000+)
 *
 * @param bucket - Digit bucket identifier
 * @returns Representative page number for the bucket
 *
 * @example
 * ```typescript
 * getBucketRepresentative('d1'); // 5
 * getBucketRepresentative('d2'); // 50
 * getBucketRepresentative('d3'); // 500
 * ```
 */
export function getBucketRepresentative(bucket: DigitBucket): number {
  switch (bucket) {
    case 'd1':
      return 5;
    case 'd2':
      return 50;
    case 'd3':
      return 500;
    case 'd4':
      return 5000;
  }
}

/**
 * Checks if a variant has any page number tokens.
 *
 * This is an optimization to skip bucketing and token resolution
 * for header/footer variants that don't contain page tokens.
 *
 * @param blocks - FlowBlocks to check for tokens
 * @returns True if any block contains pageNumber or totalPageCount tokens
 */
function hasPageTokens(blocks: FlowBlock[]): boolean {
  for (const block of blocks) {
    if (block.kind !== 'paragraph') continue;
    for (const run of block.runs) {
      if ('token' in run && (run.token === 'pageNumber' || run.token === 'totalPageCount')) {
        return true;
      }
    }
  }
  return false;
}

export class HeaderFooterLayoutCache {
  private readonly cache = new MeasureCache<Measure>();

  public async measureBlocks(
    blocks: FlowBlock[],
    constraints: { width: number; height: number },
    measureBlock: MeasureResolver,
  ): Promise<Measure[]> {
    const measures: Measure[] = [];
    for (const block of blocks) {
      const cached = this.cache.get(block, constraints.width, constraints.height);
      if (cached) {
        measures.push(cached);
        continue;
      }
      const measurement = await measureBlock(block, {
        maxWidth: constraints.width,
        maxHeight: constraints.height,
      });
      this.cache.set(block, constraints.width, constraints.height, measurement);
      measures.push(measurement);
    }
    return measures;
  }

  public invalidate(blockIds: string[]): void {
    this.cache.invalidate(blockIds);
  }

  /**
   * Gets cache statistics for monitoring and debugging.
   *
   * @returns Cache statistics object
   */
  public getStats(): ReturnType<MeasureCache<Measure>['getStats']> {
    return this.cache.getStats();
  }
}

const sharedHeaderFooterCache = new HeaderFooterLayoutCache();

/**
 * Layouts header/footer variants with intelligent caching and page number resolution.
 *
 * Features:
 * - Resolves page tokens using section-aware display page numbers
 * - Uses digit bucketing to optimize caching for large documents
 * - Clones blocks per page/bucket to avoid mutating shared source data
 * - Produces HeaderFooterLayout with per-page fragments
 *
 * Key behaviors:
 * 1. If no pageResolver provided: falls back to simple single-page layout (backward compatibility)
 * 2. If variant has no tokens: creates one layout reused across all pages (fast path)
 * 3. For small docs (<100 pages): creates per-page layouts
 * 4. For large docs (>=100 pages): uses digit bucketing (d1, d2, d3, d4)
 *
 * @param sections - Header/footer variants (default, first, even, odd)
 * @param constraints - Layout constraints (width, height, margins)
 * @param measureBlock - Function to measure individual blocks
 * @param cache - Measurement cache instance (optional, uses shared cache by default)
 * @param totalPages - Total page count for backward compatibility (deprecated, use pageResolver)
 * @param pageResolver - Callback to resolve display page info for a physical page number
 * @returns Batch result with layouts, blocks, and measures for each variant
 */
export async function layoutHeaderFooterWithCache(
  sections: HeaderFooterBatch,
  constraints: HeaderFooterConstraints,
  measureBlock: MeasureResolver,
  cache: HeaderFooterLayoutCache = sharedHeaderFooterCache,
  totalPages?: number,
  pageResolver?: PageResolver,
): Promise<HeaderFooterBatchResult> {
  const result: HeaderFooterBatchResult = {};

  // Backward compatibility: If no pageResolver, use simple single-page layout
  if (!pageResolver) {
    const numPages = totalPages ?? 1;

    for (const [type, blocks] of Object.entries(sections) as [keyof HeaderFooterBatch, FlowBlock[] | undefined][]) {
      if (!blocks || blocks.length === 0) continue;

      // Clone blocks to avoid mutating the original shared data structure
      const clonedBlocks = cloneHeaderFooterBlocks(blocks);

      // Resolve page number tokens BEFORE measurement
      resolveHeaderFooterTokens(clonedBlocks, 1, numPages);

      const measures = await cache.measureBlocks(clonedBlocks, constraints, measureBlock);
      const layout = layoutHeaderFooter(clonedBlocks, measures, constraints);

      result[type] = { blocks: clonedBlocks, measures, layout };
    }
    return result;
  }

  // Page resolver path with digit bucketing
  const { totalPages: docTotalPages } = pageResolver(1);
  const useBucketing = FeatureFlags.HF_DIGIT_BUCKETING && docTotalPages >= MIN_PAGES_FOR_BUCKETING;

  for (const [type, blocks] of Object.entries(sections) as [keyof HeaderFooterBatch, FlowBlock[] | undefined][]) {
    if (!blocks || blocks.length === 0) {
      continue;
    }

    // Fast path: if variant has no page tokens, create one layout for all pages
    const hasTokens = hasPageTokens(blocks);
    if (!hasTokens) {
      const measures = await cache.measureBlocks(blocks, constraints, measureBlock);
      const layout = layoutHeaderFooter(blocks, measures, constraints);
      result[type] = { blocks, measures, layout };
      continue;
    }

    // Determine which pages to create layouts for
    let pagesToLayout: number[];

    if (!useBucketing) {
      // Small doc: create layout for every page
      pagesToLayout = Array.from({ length: docTotalPages }, (_, i) => i + 1);
      HeaderFooterCacheLogger.logBucketingDecision(docTotalPages, false);
    } else {
      // Large doc: create layouts for bucket representatives
      // Determine which buckets are needed
      const bucketsNeeded = new Set<DigitBucket>();
      for (let p = 1; p <= docTotalPages; p++) {
        bucketsNeeded.add(getBucketForPageNumber(p));
      }

      // Map each bucket to its representative page
      pagesToLayout = Array.from(bucketsNeeded).map((bucket) => getBucketRepresentative(bucket));
      HeaderFooterCacheLogger.logBucketingDecision(docTotalPages, true, Array.from(bucketsNeeded));
    }

    // Create layouts for each page (or bucket representative)
    const pages: Array<{
      number: number;
      blocks: FlowBlock[];
      measures: Measure[];
      fragments: HeaderFooterLayout['pages'][0]['fragments'];
    }> = [];

    for (const pageNum of pagesToLayout) {
      // Clone blocks for this page
      const clonedBlocks = cloneHeaderFooterBlocks(blocks);

      // Resolve page number tokens for this specific page
      const { displayText, totalPages: totalPagesForPage } = pageResolver(pageNum);

      resolveHeaderFooterTokens(clonedBlocks, pageNum, totalPagesForPage, displayText);

      // Measure and layout
      const measures = await cache.measureBlocks(clonedBlocks, constraints, measureBlock);
      const pageLayout = layoutHeaderFooter(clonedBlocks, measures, constraints);
      const measuresById = new Map<string, Measure>();
      for (let i = 0; i < clonedBlocks.length; i += 1) {
        measuresById.set(clonedBlocks[i].id, measures[i]);
      }
      const fragmentsWithLines =
        pageLayout.pages[0]?.fragments.map((fragment) => {
          if (fragment.kind !== 'para') {
            return fragment;
          }
          const measure = measuresById.get(fragment.blockId);
          if (!measure || measure.kind !== 'paragraph') {
            return fragment;
          }
          return {
            ...fragment,
            lines: measure.lines.slice(fragment.fromLine, fragment.toLine),
          };
        }) ?? [];

      // Store page-specific data
      pages.push({
        number: pageNum,
        blocks: clonedBlocks,
        measures,
        fragments: fragmentsWithLines,
      });
    }

    // Construct final HeaderFooterLayout with all pages
    // Use the first page's measurements for overall dimensions
    const firstPageLayout = pages[0]
      ? layoutHeaderFooter(pages[0].blocks, pages[0].measures, constraints)
      : { height: 0, pages: [] };

    const finalLayout: HeaderFooterLayout = {
      height: firstPageLayout.height,
      minY: firstPageLayout.minY,
      maxY: firstPageLayout.maxY,
      pages: pages.map((p) => ({
        number: p.number,
        fragments: p.fragments,
      })),
    };

    // Return the first page's blocks and measures for backward compatibility
    // Painters will use layout.pages to find the correct fragments per page
    result[type] = {
      blocks: pages[0]?.blocks ?? blocks,
      measures: pages[0]?.measures ?? [],
      layout: finalLayout,
    };
  }

  return result;
}
