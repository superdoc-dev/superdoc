import type {
  FlowBlock,
  HeaderFooterLayout,
  ListBlock,
  Measure,
  PageNumberFieldFormat,
  PageNumberChapterSeparator,
  PageNumberFormat,
  ParagraphBlock,
  ParagraphMeasure,
  TableBlock,
  TextRun,
} from '@superdoc/contracts';
import { formatChapterPageNumberText } from '@superdoc/contracts';
import { formatPageNumberFieldValue, layoutHeaderFooter, type HeaderFooterConstraints } from '@superdoc/layout-engine';
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
  displayNumber?: number;
  totalPages: number;
  sectionPageCount?: number;
  pageFormat?: PageNumberFormat;
  chapterNumberText?: string;
  chapterSeparator?: PageNumberChapterSeparator;
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

function getBucketForDigitCount(digitCount: number): DigitBucket {
  if (digitCount <= 1) return 'd1';
  if (digitCount === 2) return 'd2';
  if (digitCount === 3) return 'd3';
  return 'd4';
}

function getBucketForRenderedPageNumberText(text: string): DigitBucket | null {
  const digitCount = (text.match(/\d/g) ?? []).length;
  if (digitCount <= 0) return null;
  return getBucketForDigitCount(digitCount);
}

type PageNumberBucketingStrategy =
  | { kind: 'displayText' }
  | { kind: 'fieldFormat'; fieldFormat: PageNumberFieldFormat };

function forEachPageNumberRun(blocks: FlowBlock[], visit: (run: TextRun) => void): void {
  for (const block of blocks) {
    if (block.kind === 'paragraph') {
      const paraBlock = block as ParagraphBlock;
      for (const run of paraBlock.runs) {
        if ('token' in run && run.token === 'pageNumber') {
          visit(run as TextRun);
        }
      }
    } else if (block.kind === 'list') {
      const list = block as ListBlock;
      for (const item of list.items ?? []) {
        for (const run of item.paragraph.runs) {
          if ('token' in run && run.token === 'pageNumber') {
            visit(run as TextRun);
          }
        }
      }
    } else if (block.kind === 'table') {
      const table = block as TableBlock;
      for (const row of table.rows ?? []) {
        for (const cell of row.cells ?? []) {
          const cellBlocks: FlowBlock[] = cell.blocks
            ? (cell.blocks as FlowBlock[])
            : cell.paragraph
              ? [cell.paragraph]
              : [];
          forEachPageNumberRun(cellBlocks, visit);
        }
      }
    }
  }
}

function buildCompatibleFieldFormatKey(fieldFormat: PageNumberFieldFormat): string {
  return `${fieldFormat.format ?? 'decimal'}:${fieldFormat.zeroPadding ?? ''}`;
}

function getPageNumberBucketingStrategy(blocks: FlowBlock[]): PageNumberBucketingStrategy | null {
  let sawImplicitPageNumber = false;
  const explicitFieldFormats = new Map<string, PageNumberFieldFormat>();

  forEachPageNumberRun(blocks, (run) => {
    const fieldFormat = run.pageNumberFieldFormat;
    if (!fieldFormat) {
      sawImplicitPageNumber = true;
      return;
    }

    if (!isDigitBucketCompatiblePageNumberFormat(fieldFormat.format)) {
      explicitFieldFormats.clear();
      sawImplicitPageNumber = true;
      return;
    }

    explicitFieldFormats.set(buildCompatibleFieldFormatKey(fieldFormat), fieldFormat);
  });

  if (explicitFieldFormats.size === 0) {
    return sawImplicitPageNumber ? { kind: 'displayText' } : null;
  }

  if (sawImplicitPageNumber || explicitFieldFormats.size > 1) {
    return null;
  }

  return { kind: 'fieldFormat', fieldFormat: explicitFieldFormats.values().next().value! };
}

function canUseDigitBucketingForVariant(
  blocks: FlowBlock[],
  docTotalPages: number,
  pageResolver: PageResolver,
): boolean {
  const strategy = getPageNumberBucketingStrategy(blocks);
  if (!strategy) return false;

  const renderedBucketForPage = (pageNumber: number): DigitBucket | null => {
    const pageInfo = pageResolver(pageNumber);
    const renderedText =
      strategy.kind === 'fieldFormat'
        ? Number.isFinite(pageInfo.displayNumber)
          ? formatChapterPageNumberText({
              pageComponent: formatPageNumberFieldValue(pageInfo.displayNumber ?? pageNumber, strategy.fieldFormat),
              chapterNumberText: pageInfo.chapterNumberText,
              chapterSeparator: pageInfo.chapterSeparator,
            })
          : null
        : pageInfo.displayText;
    return renderedText ? getBucketForRenderedPageNumberText(renderedText) : null;
  };

  const expectedRenderedBuckets = new Map<DigitBucket, DigitBucket>();
  for (let pageNumber = 1; pageNumber <= docTotalPages; pageNumber += 1) {
    const physicalBucket = getBucketForPageNumber(pageNumber);
    const renderedBucket = renderedBucketForPage(pageNumber);
    if (!renderedBucket) {
      return false;
    }
    const expectedBucket = expectedRenderedBuckets.get(physicalBucket);
    if (!expectedBucket) {
      expectedRenderedBuckets.set(physicalBucket, renderedBucket);
      continue;
    }
    if (expectedBucket !== renderedBucket) {
      return false;
    }
  }

  for (const [physicalBucket, expectedRenderedBucket] of expectedRenderedBuckets) {
    const representativeBucket = renderedBucketForPage(getBucketRepresentative(physicalBucket));
    if (representativeBucket !== expectedRenderedBucket) {
      return false;
    }
  }

  return true;
}

/**
 * Checks if a variant has any page number tokens.
 *
 * This is an optimization to skip bucketing and token resolution
 * for header/footer variants that don't contain page tokens.
 *
 * @param blocks - FlowBlocks to check for tokens
 * @returns True if any block contains pageNumber, totalPageCount, or sectionPageCount tokens
 */
function paragraphHasPageToken(para: ParagraphBlock): boolean {
  for (const run of para.runs) {
    if (
      'token' in run &&
      (run.token === 'pageNumber' || run.token === 'totalPageCount' || run.token === 'sectionPageCount')
    ) {
      return true;
    }
  }
  return false;
}

function paragraphHasSectionPageCountToken(para: ParagraphBlock): boolean {
  for (const run of para.runs) {
    if ('token' in run && run.token === 'sectionPageCount') {
      return true;
    }
  }
  return false;
}

function paragraphHasPageNumberToken(para: ParagraphBlock): boolean {
  for (const run of para.runs) {
    if ('token' in run && run.token === 'pageNumber') {
      return true;
    }
  }
  return false;
}

function isDigitBucketCompatiblePageNumberFormat(format?: string): boolean {
  return !format || format === 'decimal' || format === 'numberInDash';
}

function paragraphRequiresPerPageLayout(para: ParagraphBlock): boolean {
  for (const run of para.runs) {
    if (
      'token' in run &&
      run.token === 'pageNumber' &&
      run.pageNumberFieldFormat &&
      !isDigitBucketCompatiblePageNumberFormat(run.pageNumberFieldFormat.format)
    ) {
      return true;
    }
  }
  return false;
}

function hasPageTokens(blocks: FlowBlock[]): boolean {
  for (const block of blocks) {
    if (block.kind === 'paragraph') {
      if (paragraphHasPageToken(block as ParagraphBlock)) return true;
    } else if (block.kind === 'list') {
      const list = block as ListBlock;
      for (const item of list.items ?? []) {
        if (paragraphHasPageToken(item.paragraph)) return true;
      }
    } else if (block.kind === 'table') {
      // SD-1332: PAGE fields can live inside table cells in headers/footers
      // (Word's typical layout). Skipping tables here would take the
      // "no tokens" fast path and reuse a single layout for every page,
      // so the digit would never substitute per page.
      const table = block as TableBlock;
      for (const row of table.rows ?? []) {
        for (const cell of row.cells ?? []) {
          const cellBlocks: FlowBlock[] = cell.blocks
            ? (cell.blocks as FlowBlock[])
            : cell.paragraph
              ? [cell.paragraph]
              : [];
          if (hasPageTokens(cellBlocks)) return true;
        }
      }
    }
  }
  return false;
}

function hasSectionPageCountTokens(blocks: FlowBlock[]): boolean {
  for (const block of blocks) {
    if (block.kind === 'paragraph') {
      if (paragraphHasSectionPageCountToken(block as ParagraphBlock)) return true;
    } else if (block.kind === 'list') {
      const list = block as ListBlock;
      for (const item of list.items ?? []) {
        if (paragraphHasSectionPageCountToken(item.paragraph)) return true;
      }
    } else if (block.kind === 'table') {
      const table = block as TableBlock;
      for (const row of table.rows ?? []) {
        for (const cell of row.cells ?? []) {
          const cellBlocks: FlowBlock[] = cell.blocks
            ? (cell.blocks as FlowBlock[])
            : cell.paragraph
              ? [cell.paragraph]
              : [];
          if (hasSectionPageCountTokens(cellBlocks)) return true;
        }
      }
    }
  }
  return false;
}

function hasPageNumberTokens(blocks: FlowBlock[]): boolean {
  for (const block of blocks) {
    if (block.kind === 'paragraph') {
      if (paragraphHasPageNumberToken(block as ParagraphBlock)) return true;
    } else if (block.kind === 'list') {
      const list = block as ListBlock;
      for (const item of list.items ?? []) {
        if (paragraphHasPageNumberToken(item.paragraph)) return true;
      }
    } else if (block.kind === 'table') {
      const table = block as TableBlock;
      for (const row of table.rows ?? []) {
        for (const cell of row.cells ?? []) {
          const cellBlocks: FlowBlock[] = cell.blocks
            ? (cell.blocks as FlowBlock[])
            : cell.paragraph
              ? [cell.paragraph]
              : [];
          if (hasPageNumberTokens(cellBlocks)) return true;
        }
      }
    }
  }
  return false;
}
function hasPageNumberTokensRequiringPerPageLayout(blocks: FlowBlock[]): boolean {
  for (const block of blocks) {
    if (block.kind === 'paragraph') {
      if (paragraphRequiresPerPageLayout(block as ParagraphBlock)) return true;
    } else if (block.kind === 'list') {
      const list = block as ListBlock;
      for (const item of list.items ?? []) {
        if (paragraphRequiresPerPageLayout(item.paragraph)) return true;
      }
    } else if (block.kind === 'table') {
      const table = block as TableBlock;
      for (const row of table.rows ?? []) {
        for (const cell of row.cells ?? []) {
          const cellBlocks: FlowBlock[] = cell.blocks
            ? (cell.blocks as FlowBlock[])
            : cell.paragraph
              ? [cell.paragraph]
              : [];
          if (hasPageNumberTokensRequiringPerPageLayout(cellBlocks)) return true;
        }
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
    // The document resolver's mapping signature. This cache is a cross-document singleton, so the
    // signature must key it - otherwise two documents that map the same logical header font
    // differently would share one measure. Defaults to '' (no overrides => all default docs share).
    fontSignature: string = '',
  ): Promise<Measure[]> {
    const measures: Measure[] = [];
    for (const block of blocks) {
      const cached = this.cache.get(block, constraints.width, constraints.height, fontSignature);
      if (cached) {
        measures.push(cached);
        continue;
      }
      const measurement = await measureBlock(block, {
        maxWidth: constraints.width,
        maxHeight: constraints.height,
      });
      this.cache.set(block, constraints.width, constraints.height, measurement, fontSignature);
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

/** Invalidate header/footer measure cache entries for the given block IDs. */
export function invalidateHeaderFooterMeasureCache(blockIds: string[]): void {
  sharedHeaderFooterCache.invalidate(blockIds);
}

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
 *    unless PAGE tokens use non-decimal field formatting
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
  kind?: 'header' | 'footer',
  // The calling document's font-mapping signature, forwarded to the (cross-document) measure cache
  // so header/footer measures cannot leak between documents with different mappings. '' = default.
  fontSignature: string = '',
  remeasureParagraph?: (block: ParagraphBlock, maxWidth: number, firstLineIndent?: number) => ParagraphMeasure,
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

      const measures = await cache.measureBlocks(clonedBlocks, constraints, measureBlock, fontSignature);
      const layout = layoutHeaderFooter(clonedBlocks, measures, constraints, kind, remeasureParagraph);

      result[type] = { blocks: clonedBlocks, measures, layout };
    }
    return result;
  }

  // Page resolver path with digit bucketing
  const { totalPages: docTotalPages } = pageResolver(1);
  if (!Number.isFinite(docTotalPages) || docTotalPages <= 0) {
    return result;
  }
  const useBucketing = FeatureFlags.HF_DIGIT_BUCKETING && docTotalPages >= MIN_PAGES_FOR_BUCKETING;

  for (const [type, blocks] of Object.entries(sections) as [keyof HeaderFooterBatch, FlowBlock[] | undefined][]) {
    if (!blocks || blocks.length === 0) {
      continue;
    }

    // Fast path: if variant has no page tokens, create one layout for all pages
    const hasTokens = hasPageTokens(blocks);
    if (!hasTokens) {
      const measures = await cache.measureBlocks(blocks, constraints, measureBlock, fontSignature);
      const layout = layoutHeaderFooter(blocks, measures, constraints, kind, remeasureParagraph);
      result[type] = { blocks, measures, layout };
      continue;
    }

    // Determine which pages to create layouts for
    let pagesToLayout: number[];
    const hasPageNumberToken = hasPageNumberTokens(blocks);

    const useBucketingForVariant =
      useBucketing &&
      !hasPageNumberTokensRequiringPerPageLayout(blocks) &&
      !hasSectionPageCountTokens(blocks) &&
      (!hasPageNumberToken || canUseDigitBucketingForVariant(blocks, docTotalPages, pageResolver));

    if (!useBucketingForVariant) {
      // Per-page layout: small docs, disabled bucketing, SECTIONPAGES, or PAGE variants
      // whose rendered digit buckets diverge within one physical-page bucket.
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
      displayNumber?: number;
      blocks: FlowBlock[];
      measures: Measure[];
      fragments: HeaderFooterLayout['pages'][0]['fragments'];
      layout: HeaderFooterLayout;
      numberText?: string;
      pageNumberFormat?: PageNumberFormat;
      pageNumberChapterText?: string;
      pageNumberChapterSeparator?: PageNumberChapterSeparator;
    }> = [];

    for (const pageNum of pagesToLayout) {
      // Clone blocks for this page
      const clonedBlocks = cloneHeaderFooterBlocks(blocks);

      // Resolve page number tokens for this specific page
      const {
        displayText,
        displayNumber,
        totalPages: totalPagesForPage,
        sectionPageCount,
        pageFormat,
        chapterNumberText,
        chapterSeparator,
      } = pageResolver(pageNum);

      resolveHeaderFooterTokens(
        clonedBlocks,
        pageNum,
        totalPagesForPage,
        displayText,
        displayNumber,
        sectionPageCount,
        pageFormat,
        chapterNumberText,
        chapterSeparator,
      );

      // Measure and layout
      const measures = await cache.measureBlocks(clonedBlocks, constraints, measureBlock, fontSignature);
      const pageLayout = layoutHeaderFooter(clonedBlocks, measures, constraints, kind, remeasureParagraph);
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
        displayNumber,
        blocks: clonedBlocks,
        measures,
        fragments: fragmentsWithLines,
        layout: pageLayout,
        numberText: displayText,
        // Mirrored from body page metadata for layout contract parity. Paint
        // reads chapter fields from the body page context; measurement above
        // has already resolved these tokens into page-local HF blocks.
        pageNumberFormat: pageFormat,
        pageNumberChapterText: chapterNumberText,
        pageNumberChapterSeparator: chapterSeparator,
      });
    }

    // Construct final HeaderFooterLayout with all pages
    // Use the widest visual/measurement bounds from the page-specific layouts.
    const pageLayouts = pages.map((page) => page.layout);
    const minYValues = pageLayouts.map((layout) => layout.minY).filter((value): value is number => value !== undefined);
    const maxYValues = pageLayouts.map((layout) => layout.maxY).filter((value): value is number => value !== undefined);
    const minY = minYValues.length > 0 ? Math.min(...minYValues) : undefined;
    const maxY = maxYValues.length > 0 ? Math.max(...maxYValues) : undefined;
    const renderHeight = minY !== undefined && maxY !== undefined ? maxY - minY : undefined;

    const finalLayout: HeaderFooterLayout = {
      height: pageLayouts.reduce((maxHeight, layout) => Math.max(maxHeight, layout.height), 0),
      minY,
      maxY,
      renderHeight,
      pages: pages.map((p) => ({
        number: p.number,
        displayNumber: p.displayNumber,
        fragments: p.fragments,
        numberText: p.numberText,
        pageNumberFormat: p.pageNumberFormat,
        pageNumberChapterText: p.pageNumberChapterText,
        pageNumberChapterSeparator: p.pageNumberChapterSeparator,
        blocks: p.blocks,
        measures: p.measures,
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
