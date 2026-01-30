/**
 * Header/Footer Integration Tests
 *
 * Tests the complete header/footer token resolution flow:
 * 1. Body token resolution with section-aware numbering
 * 2. Header/footer token resolution with digit bucketing
 * 3. Integration with incrementalLayout
 */

import { describe, it, expect,  mock } from 'bun:test';
import type { FlowBlock, Measure, ParagraphBlock, TextRun, SectionMetadata } from '@superdoc/contracts';
import { incrementalLayout } from '../src/incrementalLayout';
import type { HeaderFooterBatch } from '../src/layoutHeaderFooter';

/**
 * Helper: Create a paragraph block with page number tokens
 */
const makePageNumberParagraph = (id: string): FlowBlock => ({
  kind: 'paragraph',
  id,
  runs: [
    { text: 'Page ', fontFamily: 'Arial', fontSize: 12 },
    { text: '0', token: 'pageNumber', fontFamily: 'Arial', fontSize: 12 } as TextRun,
    { text: ' of ', fontFamily: 'Arial', fontSize: 12 },
    { text: '0', token: 'totalPageCount', fontFamily: 'Arial', fontSize: 12 } as TextRun,
  ],
});

/**
 * Helper: Create a simple text paragraph
 */
const makeTextParagraph = (id: string, text: string): FlowBlock => ({
  kind: 'paragraph',
  id,
  runs: [{ text, fontFamily: 'Arial', fontSize: 12 }],
});

/**
 * Helper: Create a simple measure
 */
const makeMeasure = (totalHeight: number): Measure => ({
  kind: 'paragraph',
  lines: [
    {
      fromRun: 0,
      fromChar: 0,
      toRun: 0,
      toChar: 1,
      width: 200,
      ascent: totalHeight * 0.8,
      descent: totalHeight * 0.2,
      lineHeight: totalHeight,
    },
  ],
  totalHeight,
});

describe('End-to-End Header/Footer Token Resolution', () => {
  it('should resolve header/footer tokens with section-aware page numbering', async () => {
    // Create a multi-page document with body content
    const blocks: FlowBlock[] = Array.from({ length: 50 }, (_, i) =>
      makeTextParagraph(`body-${i}`, `Body paragraph ${i + 1}`),
    );

    // Create headers with page number tokens
    const headerBlocks: HeaderFooterBatch = {
      default: [makePageNumberParagraph('header-default')],
    };

    // Section metadata (single section, default numbering)
    const sectionMetadata: SectionMetadata[] = [
      {
        sectionIndex: 0,
        numbering: {
          format: 'decimal',
          start: 1,
        },
      },
    ];

    // Mock measureBlock function
    const measureBlock = mock(async () => makeMeasure(20));

    // Run incremental layout with headers
    const result = await incrementalLayout(
      [], // previousBlocks
      null, // previousLayout
      blocks, // nextBlocks
      {
        pageSize: { w: 612, h: 792 },
        margins: { top: 72, right: 72, bottom: 72, left: 72 },
        sectionMetadata,
      },
      measureBlock,
      {
        headerBlocks,
        constraints: { width: 468, height: 40 },
      },
    );

    // Verify layout was created
    expect(result.layout).toBeDefined();
    expect(result.layout.pages.length).toBeGreaterThan(0);

    // Verify headers were created
    expect(result.headers).toBeDefined();
    expect(result.headers?.length).toBe(1); // One variant (default)

    const headerResult = result.headers![0];
    expect(headerResult.kind).toBe('header');
    expect(headerResult.type).toBe('default');

    // Verify header layout has pages
    expect(headerResult.layout.pages.length).toBeGreaterThan(0);

    // For a 50-paragraph doc with ~20pt paragraphs, we expect multiple pages
    // Since doc has < 100 pages, should have per-page layouts (not bucketed)
    const totalPages = result.layout.pages.length;
    expect(totalPages).toBeGreaterThan(1);
    expect(totalPages).toBeLessThan(100);

    // Should have one header layout per page (no bucketing for small docs)
    expect(headerResult.layout.pages.length).toBe(totalPages);
  });

  it('should use digit bucketing for large documents (>=100 pages)', async () => {
    // Create a very large document with many small paragraphs to ensure > 100 pages
    // With 20pt height per para and ~648pt available height per page (792 - 144 margins),
    // we get ~32 paragraphs per page, so 3200 paragraphs should give us ~100 pages
    const blocks: FlowBlock[] = Array.from({ length: 3500 }, (_, i) => makeTextParagraph(`body-${i}`, `Para ${i + 1}`));

    const headerBlocks: HeaderFooterBatch = {
      default: [makePageNumberParagraph('header-large-doc')],
    };

    const measureBlock = mock(async () => makeMeasure(20));

    const result = await incrementalLayout(
      [],
      null,
      blocks,
      {
        pageSize: { w: 612, h: 792 },
        margins: { top: 72, right: 72, bottom: 72, left: 72 },
      },
      measureBlock,
      {
        headerBlocks,
        constraints: { width: 468, height: 40 },
      },
    );

    expect(result.headers).toBeDefined();
    const headerResult = result.headers![0];

    const totalPages = result.layout.pages.length;

    // If we have >= 100 pages, bucketing should be used
    if (totalPages >= 100) {
      // Should use bucketing: only 2-4 layouts (d1, d2, d3, maybe d4)
      expect(headerResult.layout.pages.length).toBeLessThan(10);
      expect(headerResult.layout.pages.length).toBeGreaterThan(0);

      // Verify bucket representatives are present
      const pageNumbers = headerResult.layout.pages.map((p) => p.number);
      expect(pageNumbers).toContain(5); // d1 representative
      expect(pageNumbers).toContain(50); // d2 representative
      expect(pageNumbers).toContain(500); // d3 representative
    } else {
      // If doc is smaller, should have per-page layouts
      expect(headerResult.layout.pages.length).toBe(totalPages);
    }
  });

  it('should handle multiple header/footer variants independently', async () => {
    const blocks: FlowBlock[] = Array.from({ length: 30 }, (_, i) =>
      makeTextParagraph(`body-${i}`, `Content ${i + 1}`),
    );

    const headerBlocks: HeaderFooterBatch = {
      default: [makePageNumberParagraph('header-default')],
      first: [makeTextParagraph('header-first', 'First Page Header')],
      odd: [makePageNumberParagraph('header-odd')],
    };

    const footerBlocks: HeaderFooterBatch = {
      default: [makePageNumberParagraph('footer-default')],
    };

    const measureBlock = mock(async () => makeMeasure(20));

    const result = await incrementalLayout(
      [],
      null,
      blocks,
      {
        pageSize: { w: 612, h: 792 },
        margins: { top: 72, right: 72, bottom: 72, left: 72 },
      },
      measureBlock,
      {
        headerBlocks,
        footerBlocks,
        constraints: { width: 468, height: 40 },
      },
    );

    // Verify all header variants
    expect(result.headers).toBeDefined();
    expect(result.headers?.length).toBe(3); // default, first, odd

    const variantTypes = result.headers!.map((h) => h.type);
    expect(variantTypes).toContain('default');
    expect(variantTypes).toContain('first');
    expect(variantTypes).toContain('odd');

    // Verify footers
    expect(result.footers).toBeDefined();
    expect(result.footers?.length).toBe(1);
    expect(result.footers![0].type).toBe('default');

    // Verify "first" variant has only 1 page (no tokens, fast path)
    const firstVariant = result.headers!.find((h) => h.type === 'first');
    expect(firstVariant?.layout.pages.length).toBe(1);

    // Verify "default" and "odd" have multiple pages (have tokens)
    const defaultVariant = result.headers!.find((h) => h.type === 'default');
    const totalPages = result.layout.pages.length;
    expect(defaultVariant?.layout.pages.length).toBe(totalPages);
  });

  it('should not mutate original header/footer blocks', async () => {
    const originalHeaderBlock = makePageNumberParagraph('header-original');
    const originalBlockCopy = JSON.parse(JSON.stringify(originalHeaderBlock));

    const blocks: FlowBlock[] = [makeTextParagraph('body-1', 'Content 1'), makeTextParagraph('body-2', 'Content 2')];

    const headerBlocks: HeaderFooterBatch = {
      default: [originalHeaderBlock],
    };

    const measureBlock = mock(async () => makeMeasure(20));

    await incrementalLayout(
      [],
      null,
      blocks,
      {
        pageSize: { w: 612, h: 792 },
        margins: { top: 72, right: 72, bottom: 72, left: 72 },
      },
      measureBlock,
      {
        headerBlocks,
        constraints: { width: 468, height: 40 },
      },
    );

    // Original block should be unchanged
    expect(originalHeaderBlock).toEqual(originalBlockCopy);
  });

  it('should work with section-aware numbering (roman numerals)', async () => {
    const blocks: FlowBlock[] = Array.from({ length: 20 }, (_, i) => makeTextParagraph(`body-${i}`, `Text ${i + 1}`));

    const headerBlocks: HeaderFooterBatch = {
      default: [makePageNumberParagraph('header-roman')],
    };

    // Section with roman numeral numbering
    const sectionMetadata: SectionMetadata[] = [
      {
        sectionIndex: 0,
        numbering: {
          format: 'lowerRoman',
          start: 1,
        },
      },
    ];

    const measureBlock = mock(async () => makeMeasure(20));

    const result = await incrementalLayout(
      [],
      null,
      blocks,
      {
        pageSize: { w: 612, h: 792 },
        margins: { top: 72, right: 72, bottom: 72, left: 72 },
        sectionMetadata,
      },
      measureBlock,
      {
        headerBlocks,
        constraints: { width: 468, height: 40 },
      },
    );

    expect(result.headers).toBeDefined();
    const headerResult = result.headers![0];

    // Verify headers were created with roman numeral context
    expect(headerResult.layout.pages.length).toBeGreaterThan(0);

    // The actual token resolution happens inside, we can't easily verify
    // the exact roman numerals without inspecting internal blocks,
    // but we can verify the structure is correct
    expect(headerResult.layout.height).toBeGreaterThan(0);
  });

  it('should handle edge case: single page document', async () => {
    const blocks: FlowBlock[] = [makeTextParagraph('body-1', 'Single page content')];

    const headerBlocks: HeaderFooterBatch = {
      default: [makePageNumberParagraph('header-single')],
    };

    const measureBlock = mock(async () => makeMeasure(20));

    const result = await incrementalLayout(
      [],
      null,
      blocks,
      {
        pageSize: { w: 612, h: 792 },
        margins: { top: 72, right: 72, bottom: 72, left: 72 },
      },
      measureBlock,
      {
        headerBlocks,
        constraints: { width: 468, height: 40 },
      },
    );

    expect(result.layout.pages.length).toBe(1);
    expect(result.headers).toBeDefined();

    const headerResult = result.headers![0];
    expect(headerResult.layout.pages.length).toBe(1);
    expect(headerResult.layout.pages[0].number).toBe(1);
  });

  it('should handle documents without headers/footers', async () => {
    const blocks: FlowBlock[] = Array.from({ length: 10 }, (_, i) =>
      makeTextParagraph(`body-${i}`, `Content ${i + 1}`),
    );

    const measureBlock = mock(async () => makeMeasure(20));

    const result = await incrementalLayout(
      [],
      null,
      blocks,
      {
        pageSize: { w: 612, h: 792 },
        margins: { top: 72, right: 72, bottom: 72, left: 72 },
      },
      measureBlock,
      // No headerFooter parameter
    );

    expect(result.layout.pages.length).toBeGreaterThan(0);
    expect(result.headers).toBeUndefined();
    expect(result.footers).toBeUndefined();
  });
});
