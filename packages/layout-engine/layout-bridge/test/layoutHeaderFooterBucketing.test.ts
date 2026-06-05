/**
 * Unit tests for Header/Footer Token Resolution with Digit Bucketing
 *
 * Tests the implementation of:
 * - Digit bucketing strategy (d1, d2, d3, d4)
 * - Per-page and per-bucket header/footer resolution
 * - Page resolver integration with section-aware numbering
 * - Cache key structure with bucket information
 * - No-token fast path optimization
 * - Backward compatibility with legacy API
 */

import { describe, it, expect, vi } from 'vitest';
import type { FlowBlock, Measure, ParagraphBlock, TextRun } from '@superdoc/contracts';
import {
  layoutHeaderFooterWithCache,
  HeaderFooterLayoutCache,
  getBucketForPageNumber,
  getBucketRepresentative,
  type PageResolver,
  type DigitBucket,
} from '../src/layoutHeaderFooter';

/**
 * Helper: Create a simple paragraph block for testing
 */
const makeBlock = (id: string, text: string = 'Hello', token?: 'pageNumber' | 'totalPageCount'): FlowBlock => ({
  kind: 'paragraph',
  id,
  runs: [
    {
      text,
      fontFamily: 'Arial',
      fontSize: 16,
      token,
    } as TextRun,
  ],
});

/**
 * Helper: Create a simple measure for testing
 */
const makeMeasure = (height: number): Measure => ({
  kind: 'paragraph',
  lines: [
    {
      fromRun: 0,
      fromChar: 0,
      toRun: 0,
      toChar: 1,
      width: 100,
      ascent: height * 0.8,
      descent: height * 0.2,
      lineHeight: height,
    },
  ],
  totalHeight: height,
});

/**
 * Helper: Create a block with both page number and total page count tokens
 */
const makePageTokenBlock = (id: string): FlowBlock => ({
  kind: 'paragraph',
  id,
  runs: [
    {
      text: 'Page ',
      fontFamily: 'Arial',
      fontSize: 12,
    },
    {
      text: '0',
      token: 'pageNumber',
      fontFamily: 'Arial',
      fontSize: 12,
    } as TextRun,
    {
      text: ' of ',
      fontFamily: 'Arial',
      fontSize: 12,
    },
    {
      text: '0',
      token: 'totalPageCount',
      fontFamily: 'Arial',
      fontSize: 12,
    } as TextRun,
  ],
});

const makeFormattedPageTokenBlock = (
  id: string,
  pageNumberFieldFormat: NonNullable<TextRun['pageNumberFieldFormat']>,
): FlowBlock => ({
  kind: 'paragraph',
  id,
  runs: [
    {
      text: '0',
      token: 'pageNumber',
      pageNumberFieldFormat,
      fontFamily: 'Arial',
      fontSize: 12,
    } as TextRun,
  ],
});

describe('getBucketForPageNumber', () => {
  it('should return d1 for single-digit page numbers (1-9)', () => {
    expect(getBucketForPageNumber(1)).toBe('d1');
    expect(getBucketForPageNumber(5)).toBe('d1');
    expect(getBucketForPageNumber(9)).toBe('d1');
  });

  it('should return d2 for two-digit page numbers (10-99)', () => {
    expect(getBucketForPageNumber(10)).toBe('d2');
    expect(getBucketForPageNumber(50)).toBe('d2');
    expect(getBucketForPageNumber(99)).toBe('d2');
  });

  it('should return d3 for three-digit page numbers (100-999)', () => {
    expect(getBucketForPageNumber(100)).toBe('d3');
    expect(getBucketForPageNumber(500)).toBe('d3');
    expect(getBucketForPageNumber(999)).toBe('d3');
  });

  it('should return d4 for four or more digit page numbers (1000+)', () => {
    expect(getBucketForPageNumber(1000)).toBe('d4');
    expect(getBucketForPageNumber(5000)).toBe('d4');
    expect(getBucketForPageNumber(10000)).toBe('d4');
  });

  it('should handle boundary values correctly', () => {
    expect(getBucketForPageNumber(9)).toBe('d1');
    expect(getBucketForPageNumber(10)).toBe('d2');
    expect(getBucketForPageNumber(99)).toBe('d2');
    expect(getBucketForPageNumber(100)).toBe('d3');
    expect(getBucketForPageNumber(999)).toBe('d3');
    expect(getBucketForPageNumber(1000)).toBe('d4');
  });
});

describe('getBucketRepresentative', () => {
  it('should return representative page for d1 bucket', () => {
    expect(getBucketRepresentative('d1')).toBe(5);
  });

  it('should return representative page for d2 bucket', () => {
    expect(getBucketRepresentative('d2')).toBe(50);
  });

  it('should return representative page for d3 bucket', () => {
    expect(getBucketRepresentative('d3')).toBe(500);
  });

  it('should return representative page for d4 bucket', () => {
    expect(getBucketRepresentative('d4')).toBe(5000);
  });
});

describe('layoutHeaderFooterWithCache - Backward Compatibility', () => {
  it('should work without pageResolver (legacy mode)', async () => {
    const sections = {
      default: [makeBlock('header-1', 'Header text')],
    };

    const measureBlock = vi.fn(async () => makeMeasure(20));
    const result = await layoutHeaderFooterWithCache(
      sections,
      { width: 400, height: 80 },
      measureBlock,
      undefined,
      10, // totalPages
      undefined, // no pageResolver
    );

    expect(result.default).toBeDefined();
    expect(result.default?.layout.pages).toHaveLength(1);
    expect(measureBlock).toHaveBeenCalled();
  });

  it('should resolve tokens in legacy mode with totalPages parameter', async () => {
    const sections = {
      default: [makePageTokenBlock('header-with-tokens')],
    };

    const measureBlock = vi.fn(async () => makeMeasure(20));
    const result = await layoutHeaderFooterWithCache(
      sections,
      { width: 400, height: 80 },
      measureBlock,
      undefined,
      25, // totalPages
      undefined, // no pageResolver
    );

    expect(result.default).toBeDefined();
    const blocks = result.default?.blocks as ParagraphBlock[];
    expect(blocks[0].runs[1].text).toBe('1'); // page 1
    expect(blocks[0].runs[3].text).toBe('25'); // total 25
  });
});

describe('layoutHeaderFooterWithCache - No-Token Fast Path', () => {
  it('should skip bucketing for variants without page tokens', async () => {
    const sections = {
      default: [makeBlock('header-no-tokens', 'Static Header')],
    };

    const pageResolver: PageResolver = (pageNum) => ({
      displayText: String(pageNum),
      totalPages: 150,
    });

    const measureBlock = vi.fn(async () => makeMeasure(20));
    const result = await layoutHeaderFooterWithCache(
      sections,
      { width: 400, height: 80 },
      measureBlock,
      undefined,
      undefined,
      pageResolver,
    );

    expect(result.default).toBeDefined();
    expect(result.default?.layout.pages).toHaveLength(1); // Only one page layout
    expect(measureBlock).toHaveBeenCalledTimes(1); // Measured once
  });

  it('should not clone blocks when no tokens present', async () => {
    const originalBlock = makeBlock('header-static', 'Static');
    const sections = {
      default: [originalBlock],
    };

    const pageResolver: PageResolver = (pageNum) => ({
      displayText: String(pageNum),
      totalPages: 50,
    });

    const measureBlock = vi.fn(async () => makeMeasure(20));
    const result = await layoutHeaderFooterWithCache(
      sections,
      { width: 400, height: 80 },
      measureBlock,
      undefined,
      undefined,
      pageResolver,
    );

    // Should return original blocks without cloning
    expect(result.default?.blocks[0]).toBe(originalBlock);
  });
});

describe('layoutHeaderFooterWithCache - Per-Page Resolution (Small Docs)', () => {
  it('should create per-page layouts for documents < 100 pages', async () => {
    const sections = {
      default: [makePageTokenBlock('header-with-page')],
    };

    const pageResolver: PageResolver = (pageNum) => ({
      displayText: String(pageNum),
      totalPages: 50, // < 100 pages
    });

    const measureBlock = vi.fn(async () => makeMeasure(20));
    const result = await layoutHeaderFooterWithCache(
      sections,
      { width: 400, height: 80 },
      measureBlock,
      undefined,
      undefined,
      pageResolver,
    );

    expect(result.default).toBeDefined();
    // Should have 50 page entries (one per page)
    expect(result.default?.layout.pages).toHaveLength(50);
    // Should measure 50 times (once per page)
    expect(measureBlock).toHaveBeenCalledTimes(50);
  });

  it('should resolve tokens correctly for each page in small docs', async () => {
    const sections = {
      default: [makePageTokenBlock('header-per-page')],
    };

    const pageResolver: PageResolver = (pageNum) => ({
      displayText: String(pageNum),
      totalPages: 10,
    });

    const measureBlock = vi.fn(async () => makeMeasure(20));
    const result = await layoutHeaderFooterWithCache(
      sections,
      { width: 400, height: 80 },
      measureBlock,
      undefined,
      undefined,
      pageResolver,
    );

    expect(result.default?.layout.pages).toHaveLength(10);

    // Verify page numbers are sequential
    const pages = result.default?.layout.pages ?? [];
    expect(pages[0].number).toBe(1);
    expect(pages[4].number).toBe(5);
    expect(pages[9].number).toBe(10);
  });
});

describe('layoutHeaderFooterWithCache - Digit Bucketing (Large Docs)', () => {
  it('should use bucketing for documents >= 100 pages', async () => {
    const sections = {
      default: [makePageTokenBlock('header-bucketed')],
    };

    const pageResolver: PageResolver = (pageNum) => ({
      displayText: String(pageNum),
      totalPages: 150, // >= 100 pages
    });

    const measureBlock = vi.fn(async () => makeMeasure(20));
    const result = await layoutHeaderFooterWithCache(
      sections,
      { width: 400, height: 80 },
      measureBlock,
      undefined,
      undefined,
      pageResolver,
    );

    expect(result.default).toBeDefined();

    // For 150 pages, we need buckets: d1 (1-9), d2 (10-99), d3 (100-150)
    // Representatives: 5, 50, 500 (but 500 > 150, so still use 500 for layout)
    // Should have 3 page entries (one per bucket)
    expect(result.default?.layout.pages).toHaveLength(3);

    // Should measure 3 times (once per bucket)
    expect(measureBlock).toHaveBeenCalledTimes(3);
  });

  it('should create layouts for bucket representatives', async () => {
    const sections = {
      default: [makePageTokenBlock('header-buckets')],
    };

    const pageResolver: PageResolver = (pageNum) => ({
      displayText: String(pageNum),
      totalPages: 1500, // All 4 buckets needed
    });

    const measureBlock = vi.fn(async () => makeMeasure(20));
    const result = await layoutHeaderFooterWithCache(
      sections,
      { width: 400, height: 80 },
      measureBlock,
      undefined,
      undefined,
      pageResolver,
    );

    const pages = result.default?.layout.pages ?? [];

    // Should have 4 pages (one per bucket: d1, d2, d3, d4)
    expect(pages).toHaveLength(4);

    // Verify representative page numbers
    const pageNumbers = pages.map((p) => p.number).sort((a, b) => a - b);
    expect(pageNumbers).toEqual([5, 50, 500, 5000]); // Representatives
  });

  it('should handle documents with only some buckets', async () => {
    const sections = {
      default: [makePageTokenBlock('header-partial-buckets')],
    };

    const pageResolver: PageResolver = (pageNum) => ({
      displayText: String(pageNum),
      totalPages: 250, // Only d1, d2, d3 needed
    });

    const measureBlock = vi.fn(async () => makeMeasure(20));
    const result = await layoutHeaderFooterWithCache(
      sections,
      { width: 400, height: 80 },
      measureBlock,
      undefined,
      undefined,
      pageResolver,
    );

    const pages = result.default?.layout.pages ?? [];

    // Should have 3 pages (d1, d2, d3)
    expect(pages).toHaveLength(3);

    // Verify no d4 bucket
    const pageNumbers = pages.map((p) => p.number);
    expect(pageNumbers).toContain(5); // d1
    expect(pageNumbers).toContain(50); // d2
    expect(pageNumbers).toContain(500); // d3
    expect(pageNumbers).not.toContain(5000); // d4 not needed
  });

  it('should not digit-bucket explicitly formatted page-number tokens', async () => {
    const block = makePageTokenBlock('header-formatted-page');
    const pageNumberRun = (block as ParagraphBlock).runs[1] as TextRun;
    pageNumberRun.pageNumberFieldFormat = { format: 'lowerRoman' };

    const pageResolver: PageResolver = (pageNum) => ({
      displayText: String(pageNum),
      displayNumber: pageNum,
      totalPages: 150,
    });

    const measureBlock = vi.fn(async () => makeMeasure(20));
    const result = await layoutHeaderFooterWithCache(
      { default: [block] },
      { width: 400, height: 80 },
      measureBlock,
      undefined,
      undefined,
      pageResolver,
    );

    expect(result.default?.layout.pages).toHaveLength(150);
    expect(measureBlock).toHaveBeenCalledTimes(150);
  });

  it('should digit-bucket zero-padded decimal page-number tokens', async () => {
    const block = makePageTokenBlock('header-zero-padded-page');
    const pageNumberRun = (block as ParagraphBlock).runs[1] as TextRun;
    pageNumberRun.pageNumberFieldFormat = { format: 'decimal', zeroPadding: 3 };

    const pageResolver: PageResolver = (pageNum) => ({
      displayText: String(pageNum),
      displayNumber: pageNum,
      totalPages: 150,
    });

    const measureBlock = vi.fn(async () => makeMeasure(20));
    const result = await layoutHeaderFooterWithCache(
      { default: [block] },
      { width: 400, height: 80 },
      measureBlock,
      undefined,
      undefined,
      pageResolver,
    );

    expect(result.default?.layout.pages).toHaveLength(3);
    expect(measureBlock).toHaveBeenCalledTimes(3);
    expect((result.default?.layout.pages[0].blocks?.[0] as ParagraphBlock).runs[1].text).toBe('005');
  });

  it('should disable bucketing for chapter-prefixed page number text', async () => {
    const sections = {
      default: [makePageTokenBlock('header-chapter-page')],
    };

    const pageResolver: PageResolver = (pageNum) => ({
      displayText: pageNum < 75 ? `1-${pageNum}` : `12-${pageNum}`,
      displayNumber: pageNum,
      totalPages: 150,
      pageFormat: 'decimal',
      chapterNumberText: pageNum < 75 ? '1' : '12',
      chapterSeparator: 'hyphen',
    });

    const measureBlock = vi.fn(async () => makeMeasure(20));
    const result = await layoutHeaderFooterWithCache(
      sections,
      { width: 400, height: 80 },
      measureBlock,
      undefined,
      undefined,
      pageResolver,
    );

    expect(result.default?.layout.pages).toHaveLength(150);
    expect(measureBlock).toHaveBeenCalledTimes(150);
    expect(result.default?.layout.pages[0].numberText).toBe('1-1');
    expect(result.default?.layout.pages[100].numberText).toBe('12-101');
  });

  it('should disable bucketing for section-restarted page number text', async () => {
    const sections = {
      default: [makePageTokenBlock('header-section-restart')],
    };

    const pageResolver: PageResolver = (pageNum) => ({
      displayText: String(pageNum >= 100 ? pageNum - 99 : pageNum),
      displayNumber: pageNum >= 100 ? pageNum - 99 : pageNum,
      totalPages: 150,
    });

    const measureBlock = vi.fn(async () => makeMeasure(20));
    const result = await layoutHeaderFooterWithCache(
      sections,
      { width: 400, height: 80 },
      measureBlock,
      undefined,
      undefined,
      pageResolver,
    );

    expect(result.default?.layout.pages).toHaveLength(150);
    expect(measureBlock.mock.calls.length).toBeGreaterThan(3);
    expect(result.default?.layout.pages[99].numberText).toBe('1');
  });

  it('should keep bucketing for total-page-count tokens with chapter-prefixed page number text', async () => {
    const sections = {
      default: [makeBlock('header-numpages-only', '0', 'totalPageCount')],
    };

    const pageResolver: PageResolver = (pageNum) => ({
      displayText: pageNum < 75 ? `1-${pageNum}` : `12-${pageNum}`,
      displayNumber: pageNum,
      totalPages: 150,
      pageFormat: 'decimal',
      chapterNumberText: pageNum < 75 ? '1' : '12',
      chapterSeparator: 'hyphen',
    });

    const measureBlock = vi.fn(async () => makeMeasure(20));
    const result = await layoutHeaderFooterWithCache(
      sections,
      { width: 400, height: 80 },
      measureBlock,
      undefined,
      undefined,
      pageResolver,
    );

    expect(result.default?.layout.pages).toHaveLength(3);
    expect(measureBlock).toHaveBeenCalledTimes(1);
    expect((result.default?.layout.pages[0].blocks?.[0] as ParagraphBlock).runs[0].text).toBe('150');
  });
  it.each([
    ['decimal', { format: 'decimal' }],
    ['numberInDash', { format: 'numberInDash' }],
  ] as const)('should keep bucketing for %s run-local page number format', async (_name, pageNumberFieldFormat) => {
    const sections = {
      default: [makeFormattedPageTokenBlock(`header-${pageNumberFieldFormat.format}`, pageNumberFieldFormat)],
    };

    const pageResolver: PageResolver = (pageNum) => ({
      displayText: String(pageNum),
      displayNumber: pageNum,
      totalPages: 150,
    });

    const measureBlock = vi.fn(async () => makeMeasure(20));
    const result = await layoutHeaderFooterWithCache(
      sections,
      { width: 400, height: 80 },
      measureBlock,
      undefined,
      undefined,
      pageResolver,
    );

    expect(result.default?.layout.pages).toHaveLength(3);
    expect(measureBlock).toHaveBeenCalledTimes(3);
  });

  it('should disable bucketing for chapter-prefixed run-local page number formats', async () => {
    const sections = {
      default: [makeFormattedPageTokenBlock('header-decimal-chapter', { format: 'decimal' })],
    };

    const pageResolver: PageResolver = (pageNum) => ({
      displayText: pageNum < 75 ? `1-${pageNum}` : `12-${pageNum}`,
      displayNumber: pageNum,
      totalPages: 150,
      pageFormat: 'decimal',
      chapterNumberText: pageNum < 75 ? '1' : '12',
      chapterSeparator: 'hyphen',
    });

    const measureBlock = vi.fn(async () => makeMeasure(20));
    const result = await layoutHeaderFooterWithCache(
      sections,
      { width: 400, height: 80 },
      measureBlock,
      undefined,
      undefined,
      pageResolver,
    );

    expect(result.default?.layout.pages).toHaveLength(150);
    expect(measureBlock).toHaveBeenCalledTimes(150);
    expect(result.default?.layout.pages[0].numberText).toBe('1-1');
    expect(result.default?.layout.pages[100].numberText).toBe('12-101');
  });
});

describe('layoutHeaderFooterWithCache - Section-Aware Token Resolution', () => {
  it('should use pageResolver display text for token resolution', async () => {
    const sections = {
      default: [makePageTokenBlock('header-roman')],
    };

    // Simulate roman numeral page numbering
    const pageResolver: PageResolver = (pageNum) => {
      const romanMap: Record<number, string> = {
        1: 'i',
        2: 'ii',
        3: 'iii',
        5: 'v',
        50: 'l',
      };
      return {
        displayText: romanMap[pageNum] ?? String(pageNum),
        totalPages: 10,
      };
    };

    const measureBlock = vi.fn(async () => makeMeasure(20));
    const result = await layoutHeaderFooterWithCache(
      sections,
      { width: 400, height: 80 },
      measureBlock,
      undefined,
      undefined,
      pageResolver,
    );

    expect(result.default).toBeDefined();
    // Should create layouts for pages 1-10
    expect(result.default?.layout.pages).toHaveLength(10);
  });

  it('should handle displayText that is not purely numeric', async () => {
    const sections = {
      default: [makePageTokenBlock('header-alpha')],
    };

    // Simulate letter-based page numbering (A, B, C, ...)
    const pageResolver: PageResolver = (pageNum) => {
      const letter = String.fromCharCode(64 + pageNum); // A=65, B=66, ...
      return {
        displayText: letter,
        totalPages: 26,
      };
    };

    const measureBlock = vi.fn(async () => makeMeasure(20));
    const result = await layoutHeaderFooterWithCache(
      sections,
      { width: 400, height: 80 },
      measureBlock,
      undefined,
      undefined,
      pageResolver,
    );

    expect(result.default).toBeDefined();
    expect(result.default?.layout.pages).toHaveLength(26);
  });

  it('falls back to per-page layouts when section-aware display text escapes the physical digit bucket', async () => {
    const sections = {
      default: [makePageTokenBlock('header-section-restart')],
    };
    const cache = new HeaderFooterLayoutCache();

    const pageResolver: PageResolver = (pageNum) => ({
      displayText: pageNum <= 150 ? (pageNum < 100 ? String(pageNum) : String(900 + pageNum)) : String(pageNum),
      displayNumber: pageNum <= 150 ? (pageNum < 100 ? pageNum : 900 + pageNum) : pageNum,
      totalPages: 150,
    });

    const measureBlock = vi.fn(async () => makeMeasure(20));
    const result = await layoutHeaderFooterWithCache(
      sections,
      { width: 400, height: 80 },
      measureBlock,
      cache,
      undefined,
      pageResolver,
    );

    expect(result.default?.layout.pages).toHaveLength(150);
    expect(measureBlock).toHaveBeenCalledTimes(150);
    expect(result.default?.layout.pages[99]).toMatchObject({
      number: 100,
      displayNumber: 1000,
      numberText: '1000',
    });
  });
});

describe('layoutHeaderFooterWithCache - Cache Behavior', () => {
  it('should cache measurements across multiple calls with same constraints', async () => {
    const cache = new HeaderFooterLayoutCache();
    const sections = {
      default: [makePageTokenBlock('header-cached')],
    };

    const pageResolver: PageResolver = (pageNum) => ({
      displayText: String(pageNum),
      totalPages: 50,
    });

    const measureBlock = vi.fn(async () => makeMeasure(20));

    // First call
    await layoutHeaderFooterWithCache(
      sections,
      { width: 400, height: 80 },
      measureBlock,
      cache,
      undefined,
      pageResolver,
    );

    const firstCallCount = measureBlock.mock.calls.length;

    // Second call with same data
    await layoutHeaderFooterWithCache(
      sections,
      { width: 400, height: 80 },
      measureBlock,
      cache,
      undefined,
      pageResolver,
    );

    const secondCallCount = measureBlock.mock.calls.length;

    // Should not measure again (all cached)
    expect(secondCallCount).toBe(firstCallCount);
  });

  it('should invalidate cache when block IDs change', async () => {
    const cache = new HeaderFooterLayoutCache();

    const sections1 = {
      default: [makeBlock('header-1', 'Version 1')],
    };

    const sections2 = {
      default: [makeBlock('header-2', 'Version 2')],
    };

    const pageResolver: PageResolver = (pageNum) => ({
      displayText: String(pageNum),
      totalPages: 10,
    });

    const measureBlock = vi.fn(async () => makeMeasure(20));

    // First call
    await layoutHeaderFooterWithCache(
      sections1,
      { width: 400, height: 80 },
      measureBlock,
      cache,
      undefined,
      pageResolver,
    );

    const firstCallCount = measureBlock.mock.calls.length;

    // Invalidate
    cache.invalidate(['header-1']);

    // Second call with different block
    await layoutHeaderFooterWithCache(
      sections2,
      { width: 400, height: 80 },
      measureBlock,
      cache,
      undefined,
      pageResolver,
    );

    const secondCallCount = measureBlock.mock.calls.length;

    // Should measure again
    expect(secondCallCount).toBeGreaterThan(firstCallCount);
  });
});

describe('layoutHeaderFooterWithCache - Per-Variant Cloning', () => {
  it('should not mutate original blocks when resolving tokens', async () => {
    const originalBlock = makePageTokenBlock('original-header');
    const originalBlockCopy = JSON.parse(JSON.stringify(originalBlock));

    const sections = {
      default: [originalBlock],
    };

    const pageResolver: PageResolver = (pageNum) => ({
      displayText: String(pageNum),
      totalPages: 5,
    });

    const measureBlock = vi.fn(async () => makeMeasure(20));

    await layoutHeaderFooterWithCache(
      sections,
      { width: 400, height: 80 },
      measureBlock,
      undefined,
      undefined,
      pageResolver,
    );

    // Original block should be unchanged
    expect(originalBlock).toEqual(originalBlockCopy);
  });

  it('should create independent clones for each page', async () => {
    const sections = {
      default: [makePageTokenBlock('multi-page')],
    };

    const pageResolver: PageResolver = (pageNum) => ({
      displayText: String(pageNum),
      totalPages: 3,
    });

    const capturedBlocks: FlowBlock[][] = [];
    const measureBlock = vi.fn(async (block: FlowBlock) => {
      capturedBlocks.push([block]);
      return makeMeasure(20);
    });

    await layoutHeaderFooterWithCache(
      sections,
      { width: 400, height: 80 },
      measureBlock,
      undefined,
      undefined,
      pageResolver,
    );

    // Should have measured 3 times (one per page)
    expect(capturedBlocks).toHaveLength(3);

    // Each block should be a different instance
    expect(capturedBlocks[0][0]).not.toBe(capturedBlocks[1][0]);
    expect(capturedBlocks[1][0]).not.toBe(capturedBlocks[2][0]);
  });
});

describe('layoutHeaderFooterWithCache - Multiple Variants', () => {
  it('should handle multiple header/footer variants independently', async () => {
    const sections = {
      default: [makePageTokenBlock('default-header')],
      first: [makePageTokenBlock('first-header')],
      even: [makePageTokenBlock('even-header')],
    };

    const pageResolver: PageResolver = (pageNum) => ({
      displayText: String(pageNum),
      totalPages: 20,
    });

    const measureBlock = vi.fn(async () => makeMeasure(20));

    const result = await layoutHeaderFooterWithCache(
      sections,
      { width: 400, height: 80 },
      measureBlock,
      undefined,
      undefined,
      pageResolver,
    );

    // All three variants should be present
    expect(result.default).toBeDefined();
    expect(result.first).toBeDefined();
    expect(result.even).toBeDefined();

    // Each variant should have layouts
    expect(result.default?.layout.pages).toHaveLength(20);
    expect(result.first?.layout.pages).toHaveLength(20);
    expect(result.even?.layout.pages).toHaveLength(20);
  });

  it('should apply fast path per variant (some with tokens, some without)', async () => {
    const sections = {
      default: [makePageTokenBlock('has-tokens')], // Has tokens
      first: [makeBlock('no-tokens', 'Static First Page')], // No tokens
    };

    const pageResolver: PageResolver = (pageNum) => ({
      displayText: String(pageNum),
      totalPages: 50,
    });

    const measureBlock = vi.fn(async () => makeMeasure(20));

    const result = await layoutHeaderFooterWithCache(
      sections,
      { width: 400, height: 80 },
      measureBlock,
      undefined,
      undefined,
      pageResolver,
    );

    // Default should have per-page layouts
    expect(result.default?.layout.pages).toHaveLength(50);

    // First should have single layout (fast path)
    expect(result.first?.layout.pages).toHaveLength(1);
  });
});

describe('layoutHeaderFooterWithCache - Edge Cases', () => {
  it('should handle empty sections', async () => {
    const sections = {};

    const pageResolver: PageResolver = (pageNum) => ({
      displayText: String(pageNum),
      totalPages: 10,
    });

    const measureBlock = vi.fn(async () => makeMeasure(20));

    const result = await layoutHeaderFooterWithCache(
      sections,
      { width: 400, height: 80 },
      measureBlock,
      undefined,
      undefined,
      pageResolver,
    );

    expect(result).toEqual({});
    expect(measureBlock).not.toHaveBeenCalled();
  });

  it('should handle single-page documents', async () => {
    const sections = {
      default: [makePageTokenBlock('single-page')],
    };

    const pageResolver: PageResolver = (pageNum) => ({
      displayText: '1',
      totalPages: 1,
    });

    const measureBlock = vi.fn(async () => makeMeasure(20));

    const result = await layoutHeaderFooterWithCache(
      sections,
      { width: 400, height: 80 },
      measureBlock,
      undefined,
      undefined,
      pageResolver,
    );

    expect(result.default?.layout.pages).toHaveLength(1);
    expect(result.default?.layout.pages[0].number).toBe(1);
  });

  it('should handle very large documents efficiently with bucketing', async () => {
    const sections = {
      default: [makePageTokenBlock('huge-doc')],
    };

    const pageResolver: PageResolver = (pageNum) => ({
      displayText: String(pageNum),
      totalPages: 10000, // Very large document
    });

    const measureBlock = vi.fn(async () => makeMeasure(20));

    const result = await layoutHeaderFooterWithCache(
      sections,
      { width: 400, height: 80 },
      measureBlock,
      undefined,
      undefined,
      pageResolver,
    );

    // Should only have 4 layouts (one per bucket)
    expect(result.default?.layout.pages).toHaveLength(4);

    // Should only measure 4 times
    expect(measureBlock).toHaveBeenCalledTimes(4);
  });

  it('should handle blocks array with undefined elements', async () => {
    const sections = {
      default: undefined,
      first: [makeBlock('valid-block')],
    };

    const pageResolver: PageResolver = (pageNum) => ({
      displayText: String(pageNum),
      totalPages: 5,
    });

    const measureBlock = vi.fn(async () => makeMeasure(20));

    const result = await layoutHeaderFooterWithCache(
      sections,
      { width: 400, height: 80 },
      measureBlock,
      undefined,
      undefined,
      pageResolver,
    );

    // Should only process 'first' variant
    expect(result.default).toBeUndefined();
    expect(result.first).toBeDefined();
  });
});
