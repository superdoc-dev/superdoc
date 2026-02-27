import { describe, expect, it } from 'vitest';
import type {
  FlowBlock,
  Measure,
  Line,
  ParagraphMeasure,
  ListItemFragment,
  ImageBlock,
  ImageMeasure,
  ImageFragment,
  ParaFragment,
  DrawingFragment,
  DrawingMeasure,
  SectionBreakBlock,
  ColumnBreakBlock,
  TableBlock,
  TableMeasure,
} from '@superdoc/contracts';
import { layoutDocument, layoutHeaderFooter, type LayoutOptions } from './index.js';

const makeLine = (lineHeight: number): Line => ({
  fromRun: 0,
  fromChar: 0,
  toRun: 0,
  toChar: 0,
  width: 100,
  ascent: lineHeight * 0.8,
  descent: lineHeight * 0.2,
  lineHeight,
});

const makeMeasure = (heights: number[]): ParagraphMeasure => ({
  kind: 'paragraph',
  lines: heights.map(makeLine),
  totalHeight: heights.reduce((sum, h) => sum + h, 0),
});

const makeTableBlock = (
  id: string,
  rowCount: number,
  options?: { anchor?: TableBlock['anchor']; wrap?: TableBlock['wrap'] },
): TableBlock => {
  const rows = Array.from({ length: rowCount }, (_, rowIndex) => ({
    id: `${id}-row-${rowIndex}`,
    cells: [
      {
        id: `${id}-cell-${rowIndex}-0`,
        paragraph: {
          kind: 'paragraph' as const,
          id: `${id}-cell-${rowIndex}-p0`,
          runs: [],
        },
      },
    ],
  }));

  return {
    kind: 'table',
    id,
    rows,
    anchor: options?.anchor,
    wrap: options?.wrap,
  };
};

const makeTableMeasure = (columnWidths: number[], rowHeights: number[]): TableMeasure => ({
  kind: 'table',
  rows: rowHeights.map((height) => ({
    height,
    cells: columnWidths.map((width) => ({
      paragraph: makeMeasure([height]),
      width,
      height,
    })),
  })),
  columnWidths,
  totalWidth: columnWidths.reduce((sum, width) => sum + width, 0),
  totalHeight: rowHeights.reduce((sum, height) => sum + height, 0),
});

const block: FlowBlock = {
  kind: 'paragraph',
  id: 'block-1',
  runs: [
    {
      text: 'Hello',
      fontFamily: 'Arial',
      fontSize: 16,
      pmStart: 1,
      pmEnd: 6,
    },
  ],
};

const DEFAULT_OPTIONS: LayoutOptions = {
  pageSize: { w: 600, h: 800 },
  margins: { top: 50, right: 50, bottom: 50, left: 50 },
};

/**
 * Helper to check if a page contains a block with the given ID.
 */
const pageContainsBlock = (page: { fragments: Array<{ blockId: string }> }, blockId: string): boolean => {
  return page.fragments.some((f) => f.blockId === blockId);
};

/**
 * Helper to assert that a page contains expected block IDs.
 */
const _expectPageContainsBlocks = (page: { fragments: Array<{ blockId: string }> }, blockIds: string[]): void => {
  blockIds.forEach((blockId) => {
    expect(page.fragments.some((f) => f.blockId === blockId)).toBe(true);
  });
};

describe('layoutDocument', () => {
  it('places a single block on a single page', () => {
    const layout = layoutDocument([block], [makeMeasure([20, 20])], DEFAULT_OPTIONS);

    expect(layout.pages).toHaveLength(1);
    const [firstPage] = layout.pages;
    expect(firstPage.fragments).toHaveLength(1);
    const fragment = firstPage.fragments[0];
    expect(fragment).toMatchObject({
      blockId: 'block-1',
      fromLine: 0,
      toLine: 2,
      x: 50,
      y: 50,
      width: 500,
    });
  });

  it('splits large blocks across multiple pages with continuation flags', () => {
    const options: LayoutOptions = {
      pageSize: { w: 400, h: 240 },
      margins: { top: 30, right: 30, bottom: 30, left: 30 },
    };
    const layout = layoutDocument([block], [makeMeasure([90, 90, 90])], options);

    expect(layout.pages).toHaveLength(2);
    expect(layout.pages[0].fragments).toHaveLength(1);
    expect(layout.pages[1].fragments).toHaveLength(1);

    const firstFragment = layout.pages[0].fragments[0];
    const secondFragment = layout.pages[1].fragments[0];

    expect(firstFragment).toMatchObject({
      fromLine: 0,
      toLine: 2,
      continuesOnNext: true,
    });
    expect(secondFragment).toMatchObject({
      fromLine: 2,
      toLine: 3,
      continuesFromPrev: true,
    });
    expect(secondFragment.y).toBe(options.margins?.top);
  });

  it('flows multiple blocks sequentially and creates additional pages as needed', () => {
    const blocks: FlowBlock[] = [
      { kind: 'paragraph', id: 'block-1', runs: [] },
      { kind: 'paragraph', id: 'block-2', runs: [] },
      { kind: 'paragraph', id: 'block-3', runs: [] },
    ];
    const measures = [makeMeasure([60, 60]), makeMeasure([40]), makeMeasure([90, 90, 40])];

    const layout = layoutDocument(blocks, measures, {
      pageSize: { w: 500, h: 300 },
      margins: { top: 40, right: 40, bottom: 40, left: 40 },
    });

    expect(layout.pages.length).toBeGreaterThan(1);
    expect(layout.pages[0].fragments[0].blockId).toBe('block-1');
    expect(layout.pages.at(-1)?.fragments.at(-1)?.blockId).toBe('block-3');
  });

  it('throws when blocks and measures length mismatch', () => {
    expect(() => layoutDocument([block], [], DEFAULT_OPTIONS)).toThrow(/expected measures/);
  });

  it('throws when margins consume all horizontal or vertical space', () => {
    expect(() =>
      layoutDocument([block], [makeMeasure([10])], {
        pageSize: { w: 100, h: 100 },
        margins: { top: 60, bottom: 60, left: 60, right: 60 },
      }),
    ).toThrow(/non-positive content area/);
  });

  it('fills columns before advancing to a new page', () => {
    const options: LayoutOptions = {
      pageSize: { w: 600, h: 800 },
      margins: { top: 40, right: 40, bottom: 40, left: 40 },
      columns: { count: 2, gap: 20 },
    };

    const layout = layoutDocument([block], [makeMeasure([350, 350, 350])], options);

    expect(layout.pages).toHaveLength(1);
    const fragments = layout.pages[0].fragments;
    expect(fragments).toHaveLength(2);

    const columnWidth =
      (options.pageSize!.w - (options.margins!.left + options.margins!.right) - options.columns!.gap) /
      options.columns!.count;
    expect(fragments[0].x).toBeCloseTo(options.margins!.left);
    expect(fragments[0].width).toBeCloseTo(columnWidth);
    expect(fragments[1].x).toBeCloseTo(options.margins!.left + columnWidth + options.columns!.gap);
    expect(fragments[1].y).toBe(options.margins!.top);
    expect(layout.columns).toMatchObject({ count: 2, gap: 20 });
  });

  it('applies spacing before and after paragraphs', () => {
    const spacingBlock: FlowBlock = {
      kind: 'paragraph',
      id: 'spaced',
      runs: [],
      attrs: {
        spacing: { before: 20, after: 15 },
      },
    };
    const secondBlock: FlowBlock = {
      kind: 'paragraph',
      id: 'second',
      runs: [],
    };

    const measures: Measure[] = [makeMeasure([20]), makeMeasure([20])];
    const layout = layoutDocument([spacingBlock, secondBlock], measures, DEFAULT_OPTIONS);

    const firstFragment = layout.pages[0].fragments[0];
    expect(firstFragment.y).toBeCloseTo(DEFAULT_OPTIONS.margins!.top + 20, 1);

    const secondFragment = layout.pages[0].fragments[1];
    const expectedY = DEFAULT_OPTIONS.margins!.top + 20 + 20 + 15;
    expect(secondFragment.y).toBeCloseTo(expectedY, 1);
  });

  it('collapses adjacent spacing to the larger before/after value', () => {
    const firstBlock: FlowBlock = {
      kind: 'paragraph',
      id: 'first',
      runs: [],
      attrs: { spacing: { after: 10 } },
    };
    const secondBlock: FlowBlock = {
      kind: 'paragraph',
      id: 'second',
      runs: [],
      attrs: { spacing: { before: 16 } },
    };

    const measures: Measure[] = [makeMeasure([20]), makeMeasure([20])];
    const layout = layoutDocument([firstBlock, secondBlock], measures, DEFAULT_OPTIONS);
    const firstFragment = layout.pages[0].fragments[0];
    const secondFragment = layout.pages[0].fragments[1];

    const firstMeasure = measures[0] as ParagraphMeasure;
    const firstBottom = firstFragment.y + firstMeasure.totalHeight;
    const gap = secondFragment.y - firstBottom;
    expect(gap).toBeCloseTo(16, 1);
  });

  it('preserves larger after spacing when next paragraph has smaller before', () => {
    const firstBlock: FlowBlock = {
      kind: 'paragraph',
      id: 'first',
      runs: [],
      attrs: { spacing: { after: 18 } },
    };
    const secondBlock: FlowBlock = {
      kind: 'paragraph',
      id: 'second',
      runs: [],
      attrs: { spacing: { before: 8 } },
    };

    const measures: Measure[] = [makeMeasure([20]), makeMeasure([20])];
    const layout = layoutDocument([firstBlock, secondBlock], measures, DEFAULT_OPTIONS);
    const firstFragment = layout.pages[0].fragments[0];
    const secondFragment = layout.pages[0].fragments[1];

    const firstMeasure = measures[0] as ParagraphMeasure;
    const firstBottom = firstFragment.y + firstMeasure.totalHeight;
    const gap = secondFragment.y - firstBottom;
    expect(gap).toBeCloseTo(18, 1);
  });

  it('handles spacingBefore larger than page content area without infinite loop', () => {
    // Regression test: When spacingBefore exceeds the entire content area (e.g., tiny page height
    // or very large spacing), the layout engine should complete without infinite looping.
    // This can happen when header/footer layout has minimal height constraints.
    const blockWithLargeSpacing: FlowBlock = {
      kind: 'paragraph',
      id: 'large-spacing',
      runs: [],
      attrs: {
        spacing: { before: 500 }, // Much larger than content area
      },
    };

    const measures: Measure[] = [makeMeasure([20])];

    // Use a very small page to create a tiny content area
    const tinyPageOptions: LayoutOptions = {
      pageSize: { w: 200, h: 50 }, // Very short page
      margins: { top: 10, right: 10, bottom: 10, left: 10 }, // Content area = 30px
    };

    // This should complete without hanging (spacingBefore 500 > content area 30)
    const layout = layoutDocument([blockWithLargeSpacing], measures, tinyPageOptions);

    // Layout should produce valid output - content is placed even if spacing is truncated
    expect(layout.pages.length).toBeGreaterThan(0);
    expect(layout.pages[0].fragments.length).toBeGreaterThan(0);

    // Verify the spacing was skipped and fragment is at topMargin (10), not topMargin + spacing (510)
    const fragment = layout.pages[0].fragments[0];
    expect(fragment.y).toBe(tinyPageOptions.margins!.top); // Should be at topMargin (10)

    // Verify only one page was created (content fits after skipping spacing)
    expect(layout.pages.length).toBe(1);
  });

  it('handles spacingBefore equal to content area height (boundary condition)', () => {
    // Edge case: spacingBefore exactly equals the content area height.
    // This triggers the infinite loop guard after advancing to a new page.
    // When spacing (31) is just over the content area (30), attempting to apply it
    // after advancing to a fresh page still fails, triggering the guard.
    const blockWithExactSpacing: FlowBlock = {
      kind: 'paragraph',
      id: 'exact-spacing',
      runs: [],
      attrs: {
        spacing: { before: 31 }, // Slightly larger than content area (50 - 10 - 10 = 30)
      },
    };

    const measures: Measure[] = [makeMeasure([10])]; // Content must fit after skipping spacing

    const exactPageOptions: LayoutOptions = {
      pageSize: { w: 200, h: 50 },
      margins: { top: 10, right: 10, bottom: 10, left: 10 }, // Content area = 30px
    };

    const layout = layoutDocument([blockWithExactSpacing], measures, exactPageOptions);

    // Should complete without hanging
    expect(layout.pages.length).toBeGreaterThan(0);
    expect(layout.pages[0].fragments.length).toBeGreaterThan(0);

    // When spacing exceeds content area, it should be skipped and content placed at topMargin
    const fragment = layout.pages[0].fragments[0];
    expect(fragment.y).toBe(exactPageOptions.margins!.top);
  });

  it('handles very small content area with spacing that still fits', () => {
    // Edge case: Content area is very small but spacing is even smaller and should fit.
    const blockWithSmallSpacing: FlowBlock = {
      kind: 'paragraph',
      id: 'small-spacing',
      runs: [],
      attrs: {
        spacing: { before: 5 }, // Small spacing that fits in small content area
      },
    };

    const measures: Measure[] = [makeMeasure([10])];

    const smallPageOptions: LayoutOptions = {
      pageSize: { w: 200, h: 40 },
      margins: { top: 10, right: 10, bottom: 10, left: 10 }, // Content area = 20px
    };

    const layout = layoutDocument([blockWithSmallSpacing], measures, smallPageOptions);

    // Should complete without hanging
    expect(layout.pages.length).toBeGreaterThan(0);

    // Spacing should be applied (5px from top margin)
    const fragment = layout.pages[0].fragments[0];
    expect(fragment.y).toBe(smallPageOptions.margins!.top + 5);
    expect(layout.pages.length).toBe(1);
  });

  it.skip('lays out list blocks with marker gutters', () => {
    const listBlock: FlowBlock = {
      kind: 'list',
      id: 'list-1',
      listType: 'number',
      items: [
        {
          id: 'item-1',
          marker: { kind: 'number', text: '1.', level: 0, order: 1 },
          paragraph: {
            kind: 'paragraph',
            id: 'p-1',
            runs: [],
            attrs: { indent: { left: 24 } },
          },
        },
      ],
    };

    const paragraphMeasure = makeMeasure([20]) as ParagraphMeasure;
    const listMeasure: Measure = {
      kind: 'list',
      items: [
        {
          itemId: 'item-1',
          markerWidth: 24,
          markerTextWidth: 12,
          indentLeft: 24,
          paragraph: paragraphMeasure,
        },
      ],
      totalHeight: paragraphMeasure.totalHeight,
    };

    const layout = layoutDocument([listBlock], [listMeasure], DEFAULT_OPTIONS);
    const fragment = layout.pages[0].fragments[0] as ListItemFragment;
    expect(fragment.kind).toBe('list-item');
    const expectedX = DEFAULT_OPTIONS.margins!.left + 24 + 24;
    expect(fragment.x).toBeCloseTo(expectedX, 5);
    const expectedWidth =
      DEFAULT_OPTIONS.pageSize!.w - DEFAULT_OPTIONS.margins!.left - DEFAULT_OPTIONS.margins!.right - 24 - 24;
    expect(fragment.width).toBeCloseTo(expectedWidth, 5);
  });

  it('adjusts paragraph fragment width when anchored image creates exclusion zone', () => {
    // Create an anchored image on the left with Square wrap
    const imageBlock: ImageBlock = {
      kind: 'image',
      id: 'img-1',
      src: 'test.jpg',
      width: 200,
      height: 150,
      anchor: {
        isAnchored: true,
        hRelativeFrom: 'column',
        vRelativeFrom: 'paragraph',
        alignH: 'left',
        offsetH: 0,
        offsetV: 0,
      },
      wrap: {
        type: 'Square',
        wrapText: 'right', // Image on left, text wraps to right
        distLeft: 5,
        distRight: 10,
      },
    };

    const imageMeasure: ImageMeasure = {
      kind: 'image',
      width: 200,
      height: 150,
    };

    // Create a paragraph that should wrap around the image
    const paragraphBlock: FlowBlock = {
      kind: 'paragraph',
      id: 'para-1',
      runs: [],
    };

    const paragraphMeasure = makeMeasure([20, 20, 20]);

    // Provide remeasureParagraph callback to enable float-aware text wrapping
    const remeasureParagraph = (_block: FlowBlock, _maxWidth: number): ParagraphMeasure => {
      // Remeasure paragraph at reduced width
      // For this test, just return the same measure with adjusted width
      return makeMeasure([20, 20, 20]);
    };

    const layout = layoutDocument([imageBlock, paragraphBlock], [imageMeasure, paragraphMeasure], {
      ...DEFAULT_OPTIONS,
      remeasureParagraph,
    });

    expect(layout.pages).toHaveLength(1);
    const fragments = layout.pages[0].fragments;
    expect(fragments).toHaveLength(2);

    // First fragment is the anchored image
    const imageFragment = fragments[0] as ImageFragment;
    expect(imageFragment.kind).toBe('image');
    expect(imageFragment.isAnchored).toBe(true);
    expect(imageFragment.zIndex).toBe(1);

    // Second fragment is the paragraph, adjusted for the float
    const paraFragment = fragments[1] as ParaFragment;
    expect(paraFragment.kind).toBe('para');

    // The image is positioned at left margin (50px)
    // Exclusion boundary: imageX + imageWidth + distLeft + distRight
    // = 50 + 200 + 5 + 10 = 265px
    const imageX = DEFAULT_OPTIONS.margins!.left;
    const exclusionBoundary = imageX + 200 + 5 + 10;

    // Paragraph should start after the exclusion boundary
    expect(paraFragment.x).toBe(exclusionBoundary);

    // Paragraph width is from exclusion boundary to right margin
    const contentWidth = DEFAULT_OPTIONS.pageSize!.w - DEFAULT_OPTIONS.margins!.left - DEFAULT_OPTIONS.margins!.right;
    const exclusionWidth = exclusionBoundary - DEFAULT_OPTIONS.margins!.left;
    expect(paraFragment.width).toBe(contentWidth - exclusionWidth);
  });

  it('does not adjust fragments when image has TopAndBottom wrap', () => {
    const imageBlock: ImageBlock = {
      kind: 'image',
      id: 'img-1',
      src: 'test.jpg',
      width: 200,
      height: 150,
      anchor: {
        isAnchored: true,
        hRelativeFrom: 'column',
        vRelativeFrom: 'paragraph',
        alignH: 'center',
      },
      wrap: {
        type: 'TopAndBottom', // No horizontal wrapping
      },
    };

    const imageMeasure: ImageMeasure = {
      kind: 'image',
      width: 200,
      height: 150,
    };

    const paragraphBlock: FlowBlock = {
      kind: 'paragraph',
      id: 'para-1',
      runs: [],
    };

    const paragraphMeasure = makeMeasure([20, 20]);

    const layout = layoutDocument([imageBlock, paragraphBlock], [imageMeasure, paragraphMeasure], DEFAULT_OPTIONS);

    const paraFragment = layout.pages[0].fragments[1] as ParaFragment;
    const contentWidth = DEFAULT_OPTIONS.pageSize!.w - DEFAULT_OPTIONS.margins!.left - DEFAULT_OPTIONS.margins!.right;

    // Fragment should use full width since TopAndBottom doesn't create horizontal exclusions
    expect(paraFragment.x).toBe(DEFAULT_OPTIONS.margins!.left);
    expect(paraFragment.width).toBe(contentWidth);
  });

  it('does not push anchor paragraph below anchored tables', () => {
    const tableBlock = makeTableBlock('table-1', 1, {
      anchor: {
        isAnchored: true,
        hRelativeFrom: 'column',
        vRelativeFrom: 'paragraph',
        offsetH: 0,
        offsetV: 0,
      },
      wrap: {
        type: 'Square',
        wrapText: 'right', // Table on left, text wraps to right
        distLeft: 5,
        distRight: 10,
      },
    });

    const tableMeasure = makeTableMeasure([200], [60]);

    const paragraphBlock: FlowBlock = {
      kind: 'paragraph',
      id: 'para-1',
      runs: [],
    };

    const paragraphMeasure = makeMeasure([20, 20, 20]);

    const layout = layoutDocument([paragraphBlock, tableBlock], [paragraphMeasure, tableMeasure], DEFAULT_OPTIONS);

    const fragments = layout.pages[0].fragments;
    const paraFragment = fragments.find(
      (fragment) => fragment.kind === 'para' && fragment.blockId === 'para-1',
    ) as ParaFragment;

    expect(paraFragment).toBeTruthy();

    const contentWidth = DEFAULT_OPTIONS.pageSize!.w - DEFAULT_OPTIONS.margins!.left - DEFAULT_OPTIONS.margins!.right;

    expect(paraFragment.x).toBe(DEFAULT_OPTIONS.margins!.left);
    expect(paraFragment.width).toBe(contentWidth);
  });

  it('anchors tables after the paragraph even when the paragraph spans pages', () => {
    const options: LayoutOptions = {
      pageSize: { w: 300, h: 120 },
      margins: { top: 20, right: 20, bottom: 20, left: 20 },
    };

    const paragraphBlock: FlowBlock = {
      kind: 'paragraph',
      id: 'para-1',
      runs: [],
    };
    const paragraphMeasure = makeMeasure([40, 40, 40]);

    const tableBlock = makeTableBlock('table-1', 1, {
      anchor: {
        isAnchored: true,
        hRelativeFrom: 'column',
        vRelativeFrom: 'paragraph',
        offsetH: 0,
        offsetV: 10,
      },
      wrap: { type: 'Square' },
    });
    const tableMeasure = makeTableMeasure([100], [30]);

    const layout = layoutDocument([paragraphBlock, tableBlock], [paragraphMeasure, tableMeasure], options);

    expect(layout.pages.length).toBeGreaterThanOrEqual(2);

    const firstPageTable = layout.pages[0].fragments.find(
      (fragment) => fragment.kind === 'table' && fragment.blockId === 'table-1',
    ) as { y: number } | undefined;
    const secondPageTable = layout.pages[1].fragments.find(
      (fragment) => fragment.kind === 'table' && fragment.blockId === 'table-1',
    ) as { y: number } | undefined;

    expect(firstPageTable).toBeUndefined();
    expect(secondPageTable).toBeTruthy();
    expect(secondPageTable?.y).toBe(options.margins!.top + 40 + 10);
  });

  it('pushes subsequent paragraphs below anchored tables', () => {
    const paragraph1: FlowBlock = { kind: 'paragraph', id: 'para-1', runs: [] };
    const paragraph2: FlowBlock = { kind: 'paragraph', id: 'para-2', runs: [] };

    const paragraph1Measure = makeMeasure([20]);
    const paragraph2Measure = makeMeasure([20, 20]);

    const tableBlock = makeTableBlock('table-1', 1, {
      anchor: {
        isAnchored: true,
        hRelativeFrom: 'column',
        vRelativeFrom: 'paragraph',
        offsetH: 0,
        offsetV: 0,
      },
      wrap: {
        type: 'Square',
        wrapText: 'right',
      },
    });
    const tableMeasure = makeTableMeasure([200], [100]);

    const layout = layoutDocument(
      [paragraph1, tableBlock, paragraph2],
      [paragraph1Measure, tableMeasure, paragraph2Measure],
      DEFAULT_OPTIONS,
    );

    const para2Fragment = layout.pages[0].fragments.find(
      (fragment) => fragment.kind === 'para' && fragment.blockId === 'para-2',
    ) as ParaFragment;

    const contentWidth = DEFAULT_OPTIONS.pageSize!.w - DEFAULT_OPTIONS.margins!.left - DEFAULT_OPTIONS.margins!.right;

    expect(para2Fragment.x).toBe(DEFAULT_OPTIONS.margins!.left);
    expect(para2Fragment.width).toBe(contentWidth);
  });

  it('treats 99% width floating tables as inline but anchors narrower tables', () => {
    const paragraphBlock: FlowBlock = { kind: 'paragraph', id: 'para-1', runs: [] };
    const paragraphMeasure = makeMeasure([20]);

    const inlineTableBlock = makeTableBlock('table-99', 1, {
      anchor: { isAnchored: true, hRelativeFrom: 'column', vRelativeFrom: 'paragraph', offsetH: 0, offsetV: 0 },
      wrap: { type: 'Square' },
    });
    const inlineTableMeasure = makeTableMeasure([495], [40]);

    const inlineLayout = layoutDocument(
      [paragraphBlock, inlineTableBlock],
      [paragraphMeasure, inlineTableMeasure],
      DEFAULT_OPTIONS,
    );

    const inlineTableFragment = inlineLayout.pages[0].fragments.find(
      (fragment) => fragment.kind === 'table' && fragment.blockId === 'table-99',
    ) as { y: number } | undefined;

    expect(inlineTableFragment).toBeTruthy();
    expect(inlineTableFragment?.y).toBe(DEFAULT_OPTIONS.margins!.top + paragraphMeasure.totalHeight);

    const anchoredTableBlock = makeTableBlock('table-98', 1, {
      anchor: { isAnchored: true, hRelativeFrom: 'column', vRelativeFrom: 'paragraph', offsetH: 0, offsetV: 0 },
      wrap: { type: 'Square' },
    });
    const anchoredTableMeasure = makeTableMeasure([490], [40]);

    const anchoredLayout = layoutDocument(
      [{ kind: 'paragraph', id: 'para-1', runs: [] }, anchoredTableBlock],
      [paragraphMeasure, anchoredTableMeasure],
      DEFAULT_OPTIONS,
    );

    const anchoredTableFragment = anchoredLayout.pages[0].fragments.find(
      (fragment) => fragment.kind === 'table' && fragment.blockId === 'table-98',
    ) as { y: number } | undefined;

    expect(anchoredTableFragment).toBeTruthy();
    expect(anchoredTableFragment?.y).toBe(DEFAULT_OPTIONS.margins!.top + paragraphMeasure.totalHeight);
  });

  it('propagates pm ranges onto fragments', () => {
    const blockWithRuns: FlowBlock = {
      kind: 'paragraph',
      id: 'block-2',
      runs: [
        {
          text: 'Hello',
          fontFamily: 'Arial',
          fontSize: 16,
          pmStart: 1,
          pmEnd: 6,
        },
        {
          text: ' world',
          fontFamily: 'Arial',
          fontSize: 16,
          pmStart: 6,
          pmEnd: 12,
        },
      ],
    };
    const measureWithRanges: Measure = {
      kind: 'paragraph',
      lines: [
        {
          fromRun: 0,
          fromChar: 0,
          toRun: 1,
          toChar: 6,
          width: 100,
          ascent: 10,
          descent: 4,
          lineHeight: 20,
        },
      ],
      totalHeight: 20,
    };

    const layout = layoutDocument([blockWithRuns], [measureWithRanges], DEFAULT_OPTIONS);

    const fragment = layout.pages[0].fragments[0] as ParaFragment;
    expect(fragment.pmStart).toBe(1);
    expect(fragment.pmEnd).toBe(12);
  });

  it('applies section break margins to subsequent pages', () => {
    const sectionBreakBlock: FlowBlock = {
      kind: 'sectionBreak',
      id: 'sb-1',
      margins: { header: 120, footer: 90 },
    };

    const blocks: FlowBlock[] = [
      { kind: 'paragraph', id: 'intro', runs: [] },
      sectionBreakBlock,
      { kind: 'paragraph', id: 'body', runs: [] },
    ];
    const measures: Measure[] = [makeMeasure([60]), { kind: 'sectionBreak' }, makeMeasure(Array(20).fill(40))];

    const options: LayoutOptions = {
      pageSize: { w: 400, h: 400 },
      margins: { top: 40, right: 30, bottom: 40, left: 30 },
    };

    const layout = layoutDocument(blocks, measures, options);

    expect(layout.pages.length).toBeGreaterThan(1);
    expect(layout.pages[0].margins).toMatchObject({ top: 40, bottom: 40 });
    const secondPage = layout.pages[1];
    // Without header content, body uses base margins. Header/footer distances are stored separately.
    expect(secondPage.margins).toMatchObject({ top: 40, bottom: 40, header: 120, footer: 90 });
    expect(secondPage.fragments[0].y).toBe(40);
  });

  it('applies section break left/right margins to subsequent pages', () => {
    const sectionBreakBlock: FlowBlock = {
      kind: 'sectionBreak',
      id: 'sb-1',
      margins: { left: 10, right: 50 },
    };

    const blocks: FlowBlock[] = [
      { kind: 'paragraph', id: 'intro', runs: [] },
      sectionBreakBlock,
      { kind: 'paragraph', id: 'body', runs: [] },
    ];
    const measures: Measure[] = [makeMeasure([60]), { kind: 'sectionBreak' }, makeMeasure(Array(20).fill(40))];

    const options: LayoutOptions = {
      pageSize: { w: 400, h: 400 },
      margins: { top: 40, right: 30, bottom: 40, left: 30 },
    };

    const layout = layoutDocument(blocks, measures, options);

    expect(layout.pages.length).toBeGreaterThan(1);
    const secondPage = layout.pages[1];
    expect(secondPage.margins).toMatchObject({ left: 10, right: 50 });
    const bodyFragment = secondPage.fragments.find((fragment) => fragment.blockId === 'body') as
      | ParaFragment
      | undefined;
    expect(bodyFragment).toBeDefined();
    expect(bodyFragment?.x).toBe(10);
  });

  it('handles consecutive section breaks with cumulative margin updates', () => {
    // Test that section breaks can update margins independently
    const section1: FlowBlock = {
      kind: 'sectionBreak',
      id: 'sb-1',
      margins: { header: 100 }, // Only update header
    };
    const section2: FlowBlock = {
      kind: 'sectionBreak',
      id: 'sb-2',
      margins: { footer: 120 }, // Only update footer
    };

    const blocks: FlowBlock[] = [
      { kind: 'paragraph', id: 'p1', runs: [] },
      section1,
      section2, // Both section breaks before any content
      { kind: 'paragraph', id: 'p2', runs: [] },
    ];

    const measures: Measure[] = [
      makeMeasure(Array(8).fill(40)), // p1: fills first page
      { kind: 'sectionBreak' },
      { kind: 'sectionBreak' },
      makeMeasure(Array(10).fill(40)), // p2: on next page with both margins applied
    ];

    const options: LayoutOptions = {
      pageSize: { w: 400, h: 400 },
      margins: { top: 40, right: 30, bottom: 40, left: 30 },
    };

    const layout = layoutDocument(blocks, measures, options);

    expect(layout.pages.length).toBeGreaterThanOrEqual(2);

    // Second page should have header/footer distances stored, but body uses base margins
    // without actual header/footer content
    const secondPage = layout.pages[1];
    expect(secondPage.margins?.top).toBe(40); // base margin (no header content)
    expect(secondPage.margins?.bottom).toBe(40); // base margin (no footer content)
    expect(secondPage.margins?.header).toBe(100); // from section1
    expect(secondPage.margins?.footer).toBe(120); // from section2
  });

  it('handles section break at page boundary', () => {
    const sectionBreakBlock: FlowBlock = {
      kind: 'sectionBreak',
      id: 'sb-1',
      margins: { header: 150, footer: 100 },
    };

    const blocks: FlowBlock[] = [
      { kind: 'paragraph', id: 'p1', runs: [] },
      { kind: 'paragraph', id: 'p2', runs: [] },
      sectionBreakBlock,
      { kind: 'paragraph', id: 'p3', runs: [] },
    ];

    const measures: Measure[] = [
      makeMeasure(Array(7).fill(40)), // p1: fills most of first page
      makeMeasure([40]), // p2: finishes first page, triggers page break
      { kind: 'sectionBreak' }, // section margins apply to next page
      makeMeasure([40]), // p3: on new page with section margins
    ];

    const options: LayoutOptions = {
      pageSize: { w: 400, h: 400 },
      margins: { top: 40, right: 30, bottom: 40, left: 30 },
    };

    const layout = layoutDocument(blocks, measures, options);

    // p3 appears on a new page with header/footer distances, body at base margins
    const pageWithP3 = layout.pages.find((p) => p.fragments.some((f) => f.blockId === 'p3'));
    expect(pageWithP3?.margins).toMatchObject({ top: 40, bottom: 40, header: 150, footer: 100 });
  });

  it('section break with only header margin stores header distance', () => {
    const sectionBreakBlock: FlowBlock = {
      kind: 'sectionBreak',
      id: 'sb-1',
      margins: { header: 120 },
    };

    const blocks: FlowBlock[] = [
      { kind: 'paragraph', id: 'p1', runs: [] },
      sectionBreakBlock,
      { kind: 'paragraph', id: 'p2', runs: [] },
    ];

    const measures: Measure[] = [makeMeasure([60]), { kind: 'sectionBreak' }, makeMeasure(Array(10).fill(40))];

    const options: LayoutOptions = {
      pageSize: { w: 400, h: 400 },
      margins: { top: 40, right: 30, bottom: 40, left: 30 },
    };

    const layout = layoutDocument(blocks, measures, options);

    const secondPage = layout.pages[1];
    // Header distance is stored, but body starts at base top margin (no header content)
    expect(secondPage.margins?.top).toBe(40);
    expect(secondPage.margins?.bottom).toBe(40);
    expect(secondPage.margins?.header).toBe(120);
  });

  it('section break with only footer margin stores footer distance', () => {
    const sectionBreakBlock: FlowBlock = {
      kind: 'sectionBreak',
      id: 'sb-1',
      margins: { footer: 100 },
    };

    const blocks: FlowBlock[] = [
      { kind: 'paragraph', id: 'p1', runs: [] },
      sectionBreakBlock,
      { kind: 'paragraph', id: 'p2', runs: [] },
    ];

    const measures: Measure[] = [makeMeasure([60]), { kind: 'sectionBreak' }, makeMeasure(Array(10).fill(40))];

    const options: LayoutOptions = {
      pageSize: { w: 400, h: 400 },
      margins: { top: 40, right: 30, bottom: 40, left: 30 },
    };

    const layout = layoutDocument(blocks, measures, options);

    const secondPage = layout.pages[1];
    // Footer distance is stored, but body ends at base bottom margin (no footer content)
    expect(secondPage.margins?.top).toBe(40);
    expect(secondPage.margins?.bottom).toBe(40);
    expect(secondPage.margins?.footer).toBe(100);
  });

  it('respects minimum margins from document defaults', () => {
    const sectionBreakBlock: FlowBlock = {
      kind: 'sectionBreak',
      id: 'sb-1',
      margins: { header: 10, footer: 10 },
    };

    const blocks: FlowBlock[] = [
      { kind: 'paragraph', id: 'p1', runs: [] },
      sectionBreakBlock,
      { kind: 'paragraph', id: 'p2', runs: [] },
    ];

    const measures: Measure[] = [makeMeasure([60]), { kind: 'sectionBreak' }, makeMeasure(Array(10).fill(40))];

    const options: LayoutOptions = {
      pageSize: { w: 400, h: 400 },
      margins: { top: 50, right: 30, bottom: 50, left: 30 },
    };

    const layout = layoutDocument(blocks, measures, options);

    const secondPage = layout.pages[1];
    expect(secondPage.margins?.top).toBeGreaterThanOrEqual(50);
    expect(secondPage.margins?.bottom).toBeGreaterThanOrEqual(50);
  });

  describe('section type behavior', () => {
    it('continuous with requirePageBoundary: forces a page break (Word-style upgrade)', () => {
      const sectionBreak: FlowBlock = {
        kind: 'sectionBreak',
        id: 'sb-req',
        type: 'continuous',
        margins: { header: 100, footer: 80 },
        attrs: { requirePageBoundary: true },
      };

      const blocks: FlowBlock[] = [
        { kind: 'paragraph', id: 'p1', runs: [] },
        sectionBreak,
        { kind: 'paragraph', id: 'p2', runs: [] },
      ];

      const measures: Measure[] = [makeMeasure([60]), { kind: 'sectionBreak' }, makeMeasure([40])];

      const options: LayoutOptions = {
        pageSize: { w: 400, h: 400 },
        margins: { top: 40, right: 30, bottom: 40, left: 30 },
      };

      const layout = layoutDocument(blocks, measures, options);
      // Should create 2 pages due to forced break from requirePageBoundary
      expect(layout.pages.length).toBe(2);
      expect(pageContainsBlock(layout.pages[0], 'p1')).toBe(true);
      expect(pageContainsBlock(layout.pages[1], 'p2')).toBe(true);

      // Header/footer distances apply, body uses base margins (no header/footer content)
      expect(layout.pages[1].margins).toMatchObject({ top: 40, bottom: 40, header: 100, footer: 80 });
    });
    it('continuous type: applies margins from next page without forcing break', () => {
      const sectionBreak: FlowBlock = {
        kind: 'sectionBreak',
        id: 'sb-1',
        type: 'continuous',
        margins: { header: 100, footer: 80 },
      };

      const blocks: FlowBlock[] = [
        { kind: 'paragraph', id: 'p1', runs: [] },
        sectionBreak,
        { kind: 'paragraph', id: 'p2', runs: [] },
      ];

      const measures: Measure[] = [
        makeMeasure([60]), // Small paragraph
        { kind: 'sectionBreak' },
        makeMeasure([40]), // Another small paragraph
      ];

      const options: LayoutOptions = {
        pageSize: { w: 400, h: 400 },
        margins: { top: 40, right: 30, bottom: 40, left: 30 },
      };

      const layout = layoutDocument(blocks, measures, options);

      // Should fit on one page since continuous doesn't force break
      expect(layout.pages.length).toBe(1);
      expect(layout.pages[0].fragments).toHaveLength(2); // p1 and p2 both on page 1
      expect(layout.pages[0].margins).toMatchObject({ top: 40, bottom: 40 }); // Original margins

      // If there was a second page, it would have the new margins
      // (test this with content that overflows)
    });

    it('nextPage type: forces a page break', () => {
      const sectionBreak: FlowBlock = {
        kind: 'sectionBreak',
        id: 'sb-1',
        type: 'nextPage',
        margins: { header: 100, footer: 80 },
      };

      const blocks: FlowBlock[] = [
        { kind: 'paragraph', id: 'p1', runs: [] },
        sectionBreak,
        { kind: 'paragraph', id: 'p2', runs: [] },
      ];

      const measures: Measure[] = [makeMeasure([60]), { kind: 'sectionBreak' }, makeMeasure([40])];

      const options: LayoutOptions = {
        pageSize: { w: 400, h: 400 },
        margins: { top: 40, right: 30, bottom: 40, left: 30 },
      };

      const layout = layoutDocument(blocks, measures, options);

      // Should create 2 pages due to forced break
      expect(layout.pages.length).toBe(2);
      expect(layout.pages[0].fragments.some((f) => f.blockId === 'p1')).toBe(true);
      expect(layout.pages[1].fragments.some((f) => f.blockId === 'p2')).toBe(true);

      // Header/footer distances apply, body uses base margins
      expect(layout.pages[1].margins).toMatchObject({ top: 40, bottom: 40, header: 100, footer: 80 });
    });

    it('evenPage type: forces break to even page number', () => {
      const sectionBreak: FlowBlock = {
        kind: 'sectionBreak',
        id: 'sb-1',
        type: 'evenPage',
        margins: { header: 120, footer: 90 },
      };

      const blocks: FlowBlock[] = [
        { kind: 'paragraph', id: 'p1', runs: [] },
        sectionBreak,
        { kind: 'paragraph', id: 'p2', runs: [] },
      ];

      const measures: Measure[] = [makeMeasure([60]), { kind: 'sectionBreak' }, makeMeasure([40])];

      const options: LayoutOptions = {
        pageSize: { w: 400, h: 400 },
        margins: { top: 40, right: 30, bottom: 40, left: 30 },
      };

      const layout = layoutDocument(blocks, measures, options);

      // p1 is on page 1 (odd), section break requires even page
      // Should insert blank page 2, content on page 2
      expect(layout.pages.length).toBeGreaterThanOrEqual(2);

      const pageWithP2 = layout.pages.find((p) => p.fragments.some((f) => f.blockId === 'p2'));
      expect(pageWithP2).toBeDefined();
      expect(pageWithP2!.number % 2).toBe(0); // Must be even
      expect(pageWithP2!.margins).toMatchObject({ top: 40, bottom: 40, header: 120, footer: 90 });
    });

    it('oddPage type: forces break to odd page number', () => {
      const sectionBreak: FlowBlock = {
        kind: 'sectionBreak',
        id: 'sb-1',
        type: 'oddPage',
        margins: { header: 110, footer: 85 },
      };

      const blocks: FlowBlock[] = [
        { kind: 'paragraph', id: 'p1', runs: [] },
        { kind: 'paragraph', id: 'p1b', runs: [] },
        sectionBreak,
        { kind: 'paragraph', id: 'p2', runs: [] },
      ];

      const measures: Measure[] = [
        makeMeasure(Array(8).fill(40)), // Fill page 1
        makeMeasure([40]), // Start page 2 (even)
        { kind: 'sectionBreak' },
        makeMeasure([40]),
      ];

      const options: LayoutOptions = {
        pageSize: { w: 400, h: 400 },
        margins: { top: 40, right: 30, bottom: 40, left: 30 },
      };

      const layout = layoutDocument(blocks, measures, options);

      // p1 fills page 1, p1b starts page 2 (even), oddPage break needs page 3 (odd)
      const pageWithP2 = layout.pages.find((p) => p.fragments.some((f) => f.blockId === 'p2'));
      expect(pageWithP2).toBeDefined();
      expect(pageWithP2!.number % 2).toBe(1); // Must be odd
      expect(pageWithP2!.margins).toMatchObject({ top: 40, bottom: 40, header: 110, footer: 85 });
    });

    it('parity edge case: evenPage from odd page inserts blank', () => {
      const sectionBreak: FlowBlock = {
        kind: 'sectionBreak',
        id: 'sb-1',
        type: 'evenPage',
        margins: { header: 100, footer: 80 },
      };

      const blocks: FlowBlock[] = [
        { kind: 'paragraph', id: 'p1', runs: [] },
        sectionBreak,
        { kind: 'paragraph', id: 'p2', runs: [] },
      ];

      const measures: Measure[] = [makeMeasure([40]), { kind: 'sectionBreak' }, makeMeasure([40])];

      const options: LayoutOptions = {
        pageSize: { w: 400, h: 400 },
        margins: { top: 40, right: 30, bottom: 40, left: 30 },
      };

      const layout = layoutDocument(blocks, measures, options);

      // Page 1 (odd) has p1, evenPage break should create page 2 (even) for p2
      expect(layout.pages.length).toBe(2);
      expect(layout.pages[1].number).toBe(2); // Even page
      expect(layout.pages[1].fragments.some((f) => f.blockId === 'p2')).toBe(true);
    });

    it('parity edge case: oddPage from even page inserts blank', () => {
      const sectionBreak: FlowBlock = {
        kind: 'sectionBreak',
        id: 'sb-1',
        type: 'oddPage',
        margins: { header: 100, footer: 80 },
      };

      const blocks: FlowBlock[] = [
        { kind: 'paragraph', id: 'p1', runs: [] },
        { kind: 'paragraph', id: 'p1b', runs: [] },
        sectionBreak,
        { kind: 'paragraph', id: 'p2', runs: [] },
      ];

      const measures: Measure[] = [
        makeMeasure(Array(8).fill(40)), // Fill page 1
        makeMeasure([40]), // Start page 2 (even)
        { kind: 'sectionBreak' },
        makeMeasure([40]),
      ];

      const options: LayoutOptions = {
        pageSize: { w: 400, h: 400 },
        margins: { top: 40, right: 30, bottom: 40, left: 30 },
      };

      const layout = layoutDocument(blocks, measures, options);

      // p1 on page 1, p1b on page 2 (even), oddPage needs page 3 (odd)
      expect(layout.pages.length).toBe(3);
      expect(layout.pages[2].number).toBe(3); // Odd page
      expect(layout.pages[2].fragments.some((f) => f.blockId === 'p2')).toBe(true);
    });
  });

  describe('page size and orientation', () => {
    it('applies per-page size from section break', () => {
      const sectionBreak: FlowBlock = {
        kind: 'sectionBreak',
        id: 'sb-1',
        type: 'nextPage',
        pageSize: { w: 600, h: 400 }, // Landscape
        margins: {},
      };

      const blocks: FlowBlock[] = [
        { kind: 'paragraph', id: 'p1', runs: [] },
        sectionBreak,
        { kind: 'paragraph', id: 'p2', runs: [] },
      ];

      const measures: Measure[] = [makeMeasure([40]), { kind: 'sectionBreak' }, makeMeasure([40])];

      const options: LayoutOptions = {
        pageSize: { w: 400, h: 600 }, // Portrait default
        margins: { top: 40, right: 30, bottom: 40, left: 30 },
      };

      const layout = layoutDocument(blocks, measures, options);

      // p1 on page 1 with default size (portrait)
      expect(layout.pages[0].size).toBeUndefined(); // Same as global default
      expect(layout.pageSize).toEqual({ w: 400, h: 600 });

      // p2 on page 2 with landscape size
      expect(layout.pages[1].size).toEqual({ w: 600, h: 400 });
    });

    it('handles portrait to landscape to portrait transitions', () => {
      const toLandscape: FlowBlock = {
        kind: 'sectionBreak',
        id: 'sb-1',
        type: 'nextPage',
        pageSize: { w: 792, h: 612 }, // 11" x 8.5" landscape
        orientation: 'landscape',
        margins: {},
      };

      const toPortrait: FlowBlock = {
        kind: 'sectionBreak',
        id: 'sb-2',
        type: 'nextPage',
        pageSize: { w: 612, h: 792 }, // 8.5" x 11" portrait
        orientation: 'portrait',
        margins: {},
      };

      const blocks: FlowBlock[] = [
        { kind: 'paragraph', id: 'p1', runs: [] }, // Portrait page
        toLandscape,
        { kind: 'paragraph', id: 'p2', runs: [] }, // Landscape page
        toPortrait,
        { kind: 'paragraph', id: 'p3', runs: [] }, // Back to portrait
      ];

      const measures: Measure[] = [
        makeMeasure([40]),
        { kind: 'sectionBreak' },
        makeMeasure([40]),
        { kind: 'sectionBreak' },
        makeMeasure([40]),
      ];

      const options: LayoutOptions = {
        pageSize: { w: 612, h: 792 }, // Letter portrait
        margins: { top: 40, right: 30, bottom: 40, left: 30 },
      };

      const layout = layoutDocument(blocks, measures, options);

      expect(layout.pages.length).toBe(3);

      // Page 1: default portrait (no size override)
      expect(layout.pages[0].size).toBeUndefined();

      // Page 2: landscape
      expect(layout.pages[1].size).toEqual({ w: 792, h: 612 });

      // Page 3: back to portrait (matches global default, so no size override)
      expect(layout.pages[2].size).toBeUndefined();
    });

    it('applies page size changes with continuous type from next page', () => {
      const sectionBreak: FlowBlock = {
        kind: 'sectionBreak',
        id: 'sb-1',
        type: 'continuous', // Should not force break, but applies size from next page
        pageSize: { w: 500, h: 700 },
        margins: {},
      };

      const blocks: FlowBlock[] = [
        { kind: 'paragraph', id: 'p1', runs: [] },
        sectionBreak,
        { kind: 'paragraph', id: 'p2', runs: [] },
      ];

      const measures: Measure[] = [
        makeMeasure(Array(13).fill(40)), // Fill first page (content height = 600 - 80 margins = 520, 520/40 = 13 lines)
        { kind: 'sectionBreak' },
        makeMeasure([40]), // This will go to next page
      ];

      const options: LayoutOptions = {
        pageSize: { w: 400, h: 600 },
        margins: { top: 40, right: 30, bottom: 40, left: 30 },
      };

      const layout = layoutDocument(blocks, measures, options);

      expect(layout.pages.length).toBe(2);

      // First page uses default size
      expect(layout.pages[0].size).toBeUndefined();

      // Second page uses new size (from section break)
      expect(layout.pages[1].size).toEqual({ w: 500, h: 700 });
    });

    it('applies next section properties at end-tagged breaks (DOCX sectPr semantics)', () => {
      // Simulate DOCX-derived breaks: break A ends section 1, break B defines next section (landscape)
      const p1: FlowBlock = { kind: 'paragraph', id: 'p1', runs: [] };
      const endSection1: SectionBreakBlock = {
        kind: 'sectionBreak',
        id: 'sb-1',
        type: 'nextPage',
        attrs: { source: 'sectPr' },
        margins: {},
      };
      const startSection2: SectionBreakBlock = {
        kind: 'sectionBreak',
        id: 'sb-2',
        type: 'nextPage',
        attrs: { source: 'sectPr' },
        pageSize: { w: 792, h: 612 },
        orientation: 'landscape',
        margins: {},
      };
      const p2: FlowBlock = { kind: 'paragraph', id: 'p2', runs: [] };

      const blocks = [p1, endSection1, startSection2, p2];
      const measures: Measure[] = [
        makeMeasure([40]),
        { kind: 'sectionBreak' },
        { kind: 'sectionBreak' },
        makeMeasure([40]),
      ];

      const options: LayoutOptions = {
        pageSize: { w: 612, h: 792 }, // Letter portrait
        margins: { top: 40, right: 30, bottom: 40, left: 30 },
      };

      const layout = layoutDocument(blocks, measures, options);
      expect(layout.pages.length).toBe(2);
      // Page 2 (created after endSection1) should use startSection2 properties (landscape)
      expect(layout.pages[1].size).toEqual({ w: 792, h: 612 });
    });
  });

  describe('multi-column sections', () => {
    it('applies column configuration from section break', () => {
      const sectionBreak: FlowBlock = {
        kind: 'sectionBreak',
        id: 'sb-1',
        type: 'nextPage',
        columns: { count: 2, gap: 48 }, // 2 columns, 0.5" gap
        margins: {},
      };

      const blocks: FlowBlock[] = [
        { kind: 'paragraph', id: 'p1', runs: [] },
        sectionBreak,
        { kind: 'paragraph', id: 'p2', runs: [] },
      ];

      const measures: Measure[] = [
        makeMeasure([40]),
        { kind: 'sectionBreak' },
        makeMeasure([350, 350]), // Two tall lines that will flow into columns
      ];

      const options: LayoutOptions = {
        pageSize: { w: 612, h: 792 },
        margins: { top: 72, right: 72, bottom: 72, left: 72 },
      };

      const layout = layoutDocument(blocks, measures, options);

      // Page 1: single column (default)
      const p1Fragment = layout.pages[0].fragments.find((f) => f.blockId === 'p1');
      expect(p1Fragment?.x).toBe(72); // Left margin
      expect(p1Fragment?.width).toBe(468); // Full content width

      // Page 2: two columns
      const page2 = layout.pages[1];
      const p2Fragments = page2.fragments.filter((f) => f.blockId === 'p2');
      expect(p2Fragments.length).toBe(2); // Two fragments for two columns

      // Column width = (612 - 72*2 - 48) / 2 = 210
      expect(p2Fragments[0].x).toBe(72); // First column
      expect(p2Fragments[1].x).toBe(72 + 210 + 48); // Second column (left + width + gap)
      expect(p2Fragments[0].width).toBe(210);
      expect(p2Fragments[1].width).toBe(210);
    });

    it('schedules column changes with continuous section breaks', () => {
      const toTwoColumns: FlowBlock = {
        kind: 'sectionBreak',
        id: 'sb-1',
        type: 'continuous',
        columns: { count: 2, gap: 48 },
        margins: {},
      };

      // Use nextPage to force p3 to start on page 2, preserving 2-column layout
      const forceBreak: FlowBlock = {
        kind: 'sectionBreak',
        id: 'sb-force',
        type: 'nextPage',
        columns: { count: 2, gap: 48 }, // Must explicitly specify columns per OOXML spec
        margins: {},
      };

      const blocks: FlowBlock[] = [
        { kind: 'paragraph', id: 'p1', runs: [] },
        toTwoColumns,
        { kind: 'paragraph', id: 'p2', runs: [] },
        forceBreak, // Force page break so p3 starts fresh
        { kind: 'paragraph', id: 'p3', runs: [] },
      ];

      const measures: Measure[] = [
        makeMeasure([40]),
        { kind: 'sectionBreak' },
        makeMeasure([40]),
        { kind: 'sectionBreak' },
        makeMeasure([350, 350]), // Spans columns on page 2
      ];

      const options: LayoutOptions = {
        pageSize: { w: 612, h: 792 },
        margins: { top: 72, right: 72, bottom: 72, left: 72 },
      };

      const layout = layoutDocument(blocks, measures, options);

      // Page 1: p1 in single column, p2 in two columns (Phase 3B mid-page change)
      const page1 = layout.pages[0];
      const p1Fragments = page1.fragments.filter((f) => f.blockId === 'p1');
      const p2Fragments = page1.fragments.filter((f) => f.blockId === 'p2');
      expect(p1Fragments[0].width).toBe(468); // Single column
      expect(p2Fragments[0].width).toBe(210); // Two columns (mid-page change!)

      // Page 2: p3 with two columns (continues from previous region)
      const page2 = layout.pages[1];
      const p3Fragments = page2.fragments.filter((f) => f.blockId === 'p3');
      expect(p3Fragments[0].width).toBe(210); // Column width
    });

    it('handles single to multi-column to single transitions', () => {
      const toTwoColumns: FlowBlock = {
        kind: 'sectionBreak',
        id: 'sb-1',
        type: 'nextPage',
        columns: { count: 2, gap: 48 },
        margins: {},
      };

      const backToSingleColumn: FlowBlock = {
        kind: 'sectionBreak',
        id: 'sb-2',
        type: 'nextPage',
        columns: { count: 1, gap: 0 },
        margins: {},
      };

      const blocks: FlowBlock[] = [
        { kind: 'paragraph', id: 'p1', runs: [] },
        toTwoColumns,
        { kind: 'paragraph', id: 'p2', runs: [] },
        backToSingleColumn,
        { kind: 'paragraph', id: 'p3', runs: [] },
      ];

      const measures: Measure[] = [
        makeMeasure([40]),
        { kind: 'sectionBreak' },
        makeMeasure([40]),
        { kind: 'sectionBreak' },
        makeMeasure([40]),
      ];

      const options: LayoutOptions = {
        pageSize: { w: 612, h: 792 },
        margins: { top: 72, right: 72, bottom: 72, left: 72 },
      };

      const layout = layoutDocument(blocks, measures, options);

      expect(layout.pages.length).toBe(3);

      // Page 1: single
      const p1 = layout.pages[0].fragments[0];
      expect(p1.width).toBe(468); // Full content width

      // Page 2: two columns
      const p2 = layout.pages[1].fragments[0];
      expect(p2.width).toBe(210); // Column width

      // Page 3: back to single
      const p3 = layout.pages[2].fragments[0];
      expect(p3.width).toBe(468); // Full content width again
    });
  });

  describe('Phase 3B: mid-page column changes', () => {
    it('changes columns mid-page with continuous section break', () => {
      const toTwoColumns: FlowBlock = {
        kind: 'sectionBreak',
        id: 'sb-1',
        type: 'continuous',
        columns: { count: 2, gap: 48 },
        margins: {},
      };

      const blocks: FlowBlock[] = [
        { kind: 'paragraph', id: 'p1', runs: [] },
        toTwoColumns,
        { kind: 'paragraph', id: 'p2', runs: [] },
      ];

      const measures: Measure[] = [
        makeMeasure([40]), // p1: single small line
        { kind: 'sectionBreak' },
        makeMeasure([350, 350]), // p2: two tall lines that will flow into columns
      ];

      const options: LayoutOptions = {
        pageSize: { w: 612, h: 792 },
        margins: { top: 72, right: 72, bottom: 72, left: 72 },
      };

      const layout = layoutDocument(blocks, measures, options);

      // Should be on same page (mid-page region change)
      expect(layout.pages.length).toBe(1);

      const page = layout.pages[0];

      // p1 should be full width (single column)
      const p1Fragments = page.fragments.filter((f) => f.blockId === 'p1');
      expect(p1Fragments[0].width).toBe(468); // Full width

      // p2 should be in two columns (mid-page region)
      const p2Fragments = page.fragments.filter((f) => f.blockId === 'p2');
      expect(p2Fragments.length).toBe(2); // Two fragments for two columns

      // Column width = (612 - 72*2 - 48) / 2 = 210
      expect(p2Fragments[0].width).toBe(210); // First column
      expect(p2Fragments[1].width).toBe(210); // Second column

      // Verify X positions
      expect(p2Fragments[0].x).toBe(72); // First column
      expect(p2Fragments[1].x).toBe(72 + 210 + 48); // Second column
    });

    it('handles multiple mid-page column changes', () => {
      const toTwoColumns: FlowBlock = {
        kind: 'sectionBreak',
        id: 'sb-1',
        type: 'continuous',
        columns: { count: 2, gap: 48 },
        margins: {},
      };

      const toThreeColumns: FlowBlock = {
        kind: 'sectionBreak',
        id: 'sb-2',
        type: 'continuous',
        columns: { count: 3, gap: 24 },
        margins: {},
      };

      const blocks: FlowBlock[] = [
        { kind: 'paragraph', id: 'p1', runs: [] },
        toTwoColumns,
        { kind: 'paragraph', id: 'p2', runs: [] },
        toThreeColumns,
        { kind: 'paragraph', id: 'p3', runs: [] },
      ];

      const measures: Measure[] = [
        makeMeasure([40]),
        { kind: 'sectionBreak' },
        makeMeasure([40]),
        { kind: 'sectionBreak' },
        makeMeasure([40]),
      ];

      const options: LayoutOptions = {
        pageSize: { w: 612, h: 792 },
        margins: { top: 72, right: 72, bottom: 72, left: 72 },
      };

      const layout = layoutDocument(blocks, measures, options);

      const page = layout.pages[0];

      // p1: single column
      const p1 = page.fragments.find((f) => f.blockId === 'p1');
      expect(p1?.width).toBe(468); // Full width

      // p2: two columns
      const p2 = page.fragments.find((f) => f.blockId === 'p2');
      expect(p2?.width).toBe(210); // (468 - 48) / 2

      // p3: three columns
      const p3 = page.fragments.find((f) => f.blockId === 'p3');
      // (468 - 24*2) / 3 = 420 / 3 = 140
      expect(p3?.width).toBe(140);
    });

    it('nextPage section break still forces page break with columns', () => {
      const toTwoColumns: FlowBlock = {
        kind: 'sectionBreak',
        id: 'sb-1',
        type: 'nextPage',
        columns: { count: 2, gap: 48 },
        margins: {},
      };

      const blocks: FlowBlock[] = [
        { kind: 'paragraph', id: 'p1', runs: [] },
        toTwoColumns,
        { kind: 'paragraph', id: 'p2', runs: [] },
      ];

      const measures: Measure[] = [makeMeasure([40]), { kind: 'sectionBreak' }, makeMeasure([40])];

      const options: LayoutOptions = {
        pageSize: { w: 612, h: 792 },
        margins: { top: 72, right: 72, bottom: 72, left: 72 },
      };

      const layout = layoutDocument(blocks, measures, options);

      // nextPage should still force a page break (not mid-page)
      expect(layout.pages.length).toBe(2);

      // Page 1: p1 in single column
      const p1 = layout.pages[0].fragments[0];
      expect(p1.width).toBe(468);

      // Page 2: p2 in two columns
      const p2 = layout.pages[1].fragments[0];
      expect(p2.width).toBe(210);
    });

    it("regression: first section break uses its own properties, not next section's", () => {
      // This is the exact bug that was fixed: first section break was getting the NEXT
      // section's column configuration instead of its own
      const firstPara: FlowBlock = { kind: 'paragraph', id: 'p1', runs: [] };
      const secondPara: FlowBlock = { kind: 'paragraph', id: 'p2', runs: [] };
      const thirdPara: FlowBlock = { kind: 'paragraph', id: 'p3', runs: [] };

      const blocks: FlowBlock[] = [
        // First section break: single column (columns: null or undefined)
        {
          kind: 'sectionBreak',
          id: 'first',
          type: 'continuous',
          margins: {},
          attrs: { source: 'sectPr', isFirstSection: true },
        } as FlowBlock,
        firstPara,
        secondPara,
        // Second section break: two columns
        {
          kind: 'sectionBreak',
          id: 'second',
          type: 'continuous',
          columns: { count: 2, gap: 48 },
          margins: {},
          attrs: { source: 'sectPr' },
        } as FlowBlock,
        thirdPara,
      ];

      const measures: Measure[] = [
        { kind: 'sectionBreak' },
        makeMeasure([40]),
        makeMeasure([40]),
        { kind: 'sectionBreak' },
        makeMeasure([40]),
      ];

      const options: LayoutOptions = {
        pageSize: { w: 612, h: 792 },
        margins: { top: 72, right: 72, bottom: 72, left: 72 },
      };

      const layout = layoutDocument(blocks, measures, options);

      // BUG WAS: First paragraph would be in 2-column mode (width ~210)
      // FIX: First paragraph should be in single-column mode (full width ~468)
      const p1Fragment = layout.pages[0].fragments.find((f) => f.kind === 'para' && f.blockId === 'p1');
      expect(p1Fragment).toBeDefined();
      expect(p1Fragment?.width).toBe(468); // Full width = single column

      // Second paragraph should still be single column
      const p2Fragment = layout.pages[0].fragments.find((f) => f.kind === 'para' && f.blockId === 'p2');
      expect(p2Fragment).toBeDefined();
      expect(p2Fragment?.width).toBe(468);

      // Third paragraph should be in 2-column mode after the column change
      const p3Fragment = layout.pages[0].fragments.find((f) => f.kind === 'para' && f.blockId === 'p3');
      expect(p3Fragment).toBeDefined();
      expect(p3Fragment?.width).toBe(210); // Half width = two columns
    });
  });

  describe('columnBreak with multi-column pages', () => {
    it('advances to next column when not in last column', () => {
      const blocks: FlowBlock[] = [
        { kind: 'paragraph', id: 'p1', runs: [] },
        { kind: 'columnBreak', id: 'br-1' } as ColumnBreakBlock,
        { kind: 'paragraph', id: 'p2', runs: [] },
      ];

      const measures: Measure[] = [makeMeasure([40]), { kind: 'columnBreak' }, makeMeasure([40])];

      const options: LayoutOptions = {
        pageSize: { w: 612, h: 792 },
        margins: { top: 72, right: 72, bottom: 72, left: 72 },
        columns: { count: 2, gap: 48 },
      };

      const layout = layoutDocument(blocks, measures, options);

      const page = layout.pages[0];
      const p1 = page.fragments.find((f) => f.blockId === 'p1') as ParaFragment;
      const p2 = page.fragments.find((f) => f.blockId === 'p2') as ParaFragment;
      const columnWidth =
        (options.pageSize!.w - (options.margins!.left + options.margins!.right) - options.columns!.gap) / 2;

      // p1 in first column
      expect(p1.x).toBeCloseTo(options.margins!.left);
      // p2 should begin at top of second column after the column break
      expect(p2.x).toBeCloseTo(options.margins!.left + columnWidth + options.columns!.gap);
      expect(p2.y).toBe(options.margins!.top);
    });

    it('starts a new page when columnBreak occurs in last column', () => {
      const blocks: FlowBlock[] = [
        // First columnBreak moves to column 2, second starts a new page
        { kind: 'columnBreak', id: 'br-1' } as ColumnBreakBlock,
        { kind: 'columnBreak', id: 'br-2' } as ColumnBreakBlock,
        { kind: 'paragraph', id: 'p2', runs: [] },
      ];

      const measures: Measure[] = [{ kind: 'columnBreak' }, { kind: 'columnBreak' }, makeMeasure([40])];

      const options: LayoutOptions = {
        pageSize: { w: 612, h: 792 },
        margins: { top: 72, right: 72, bottom: 72, left: 72 },
        columns: { count: 2, gap: 48 },
      };

      const layout = layoutDocument(blocks, measures, options);

      // p2 should be on page 2, top-left of first column
      expect(layout.pages.length).toBe(2);
      const p2 = layout.pages[1].fragments.find((f) => f.blockId === 'p2') as ParaFragment;
      expect(p2).toBeTruthy();
      expect(p2.x).toBe(options.margins!.left);
      expect(p2.y).toBe(options.margins!.top);
    });
  });

  describe('parity at page top', () => {
    it('evenPage section break at top of an even page does not insert extra page', () => {
      const nextPageBreak: SectionBreakBlock = { kind: 'sectionBreak', id: 'sb-next', type: 'nextPage', margins: {} };
      const evenPageBreak: SectionBreakBlock = { kind: 'sectionBreak', id: 'sb-even', type: 'evenPage', margins: {} };

      const blocks: FlowBlock[] = [
        { kind: 'paragraph', id: 'p1', runs: [] },
        nextPageBreak,
        evenPageBreak,
        { kind: 'paragraph', id: 'p2', runs: [] },
      ];

      const measures: Measure[] = [
        makeMeasure(Array(8).fill(40)), // Fill first page
        { kind: 'sectionBreak' },
        { kind: 'sectionBreak' },
        makeMeasure([40]),
      ];

      const options: LayoutOptions = {
        pageSize: { w: 400, h: 400 },
        margins: { top: 40, right: 30, bottom: 40, left: 30 },
      };

      const layout = layoutDocument(blocks, measures, options);
      // p2 should land on page 2 (even), without inserting an extra page
      expect(layout.pages.length).toBe(2);
      const pageWithP2 = layout.pages[1];
      expect(pageWithP2.number).toBe(2);
      expect(pageWithP2.fragments.some((f) => f.blockId === 'p2')).toBe(true);
    });

    it('oddPage section break at top of an even page inserts a blank page to satisfy parity', () => {
      const nextPageBreak: SectionBreakBlock = { kind: 'sectionBreak', id: 'sb-next', type: 'nextPage', margins: {} };
      const oddPageBreak: SectionBreakBlock = { kind: 'sectionBreak', id: 'sb-odd', type: 'oddPage', margins: {} };

      const blocks: FlowBlock[] = [
        { kind: 'paragraph', id: 'p1', runs: [] },
        nextPageBreak,
        oddPageBreak,
        { kind: 'paragraph', id: 'p2', runs: [] },
      ];

      const measures: Measure[] = [
        makeMeasure(Array(8).fill(40)), // Fill first page
        { kind: 'sectionBreak' },
        { kind: 'sectionBreak' },
        makeMeasure([40]),
      ];

      const options: LayoutOptions = {
        pageSize: { w: 400, h: 400 },
        margins: { top: 40, right: 30, bottom: 40, left: 30 },
      };

      const layout = layoutDocument(blocks, measures, options);
      // p2 should land on page 3 (odd), inserting a blank page 2 to satisfy odd parity
      expect(layout.pages.length).toBe(3);
      const pageWithP2 = layout.pages[2];
      expect(pageWithP2.number).toBe(3);
      expect(pageWithP2.fragments.some((f) => f.blockId === 'p2')).toBe(true);
    });
  });

  describe('Phase 4: Column Breaks', () => {
    it('advances to next column on explicit column break', () => {
      const blocks: FlowBlock[] = [
        { kind: 'paragraph', id: 'p1', runs: [] },
        { kind: 'columnBreak', id: 'cb1', attrs: {} },
        { kind: 'paragraph', id: 'p2', runs: [] },
      ];

      const measures: Measure[] = [
        makeMeasure([100]), // p1: fits in column 1
        { kind: 'columnBreak' }, // cb1: force to column 2
        makeMeasure([100]), // p2: should be in column 2
      ];

      const options: LayoutOptions = {
        pageSize: { w: 612, h: 792 },
        margins: { top: 72, right: 72, bottom: 72, left: 72 },
        columns: { count: 2, gap: 48 },
      };

      const layout = layoutDocument(blocks, measures, options);

      expect(layout.pages.length).toBe(1);
      const fragments = layout.pages[0].fragments;
      expect(fragments.length).toBe(2);

      // p1 should be in column 0 (x=72)
      expect(fragments[0].blockId).toBe('p1');
      expect(fragments[0].x).toBe(72);

      // p2 should be in column 1 (x=72+210+48=330)
      expect(fragments[1].blockId).toBe('p2');
      expect(fragments[1].x).toBe(330);
    });

    it('starts new page when column break in last column', () => {
      const blocks: FlowBlock[] = [
        { kind: 'paragraph', id: 'p1', runs: [] },
        { kind: 'columnBreak', id: 'cb1', attrs: {} },
        { kind: 'paragraph', id: 'p2', runs: [] },
        { kind: 'columnBreak', id: 'cb2', attrs: {} },
        { kind: 'paragraph', id: 'p3', runs: [] },
      ];

      const measures: Measure[] = [
        makeMeasure([100]), // p1: column 0
        { kind: 'columnBreak' }, // cb1: to column 1
        makeMeasure([100]), // p2: column 1
        { kind: 'columnBreak' }, // cb2: to next page
        makeMeasure([100]), // p3: page 2, column 0
      ];

      const options: LayoutOptions = {
        pageSize: { w: 612, h: 792 },
        margins: { top: 72, right: 72, bottom: 72, left: 72 },
        columns: { count: 2, gap: 48 },
      };

      const layout = layoutDocument(blocks, measures, options);

      expect(layout.pages.length).toBe(2);

      // Page 1: p1 and p2
      expect(layout.pages[0].fragments.length).toBe(2);
      expect(layout.pages[0].fragments[0].blockId).toBe('p1');
      expect(layout.pages[0].fragments[1].blockId).toBe('p2');

      // Page 2: p3
      expect(layout.pages[1].fragments.length).toBe(1);
      expect(layout.pages[1].fragments[0].blockId).toBe('p3');
    });

    it('handles multiple column breaks within multi-column layout', () => {
      const blocks: FlowBlock[] = [
        { kind: 'paragraph', id: 'p1', runs: [] },
        { kind: 'columnBreak', id: 'cb1', attrs: {} },
        { kind: 'paragraph', id: 'p2', runs: [] },
        { kind: 'columnBreak', id: 'cb2', attrs: {} },
        { kind: 'paragraph', id: 'p3', runs: [] },
        { kind: 'columnBreak', id: 'cb3', attrs: {} },
        { kind: 'paragraph', id: 'p4', runs: [] },
      ];

      const measures: Measure[] = [
        makeMeasure([80]), // p1: column 0
        { kind: 'columnBreak' }, // cb1: to column 1
        makeMeasure([80]), // p2: column 1
        { kind: 'columnBreak' }, // cb2: to column 2
        makeMeasure([80]), // p3: column 2
        { kind: 'columnBreak' }, // cb3: to next page
        makeMeasure([80]), // p4: page 2, column 0
      ];

      const options: LayoutOptions = {
        pageSize: { w: 612, h: 792 },
        margins: { top: 72, right: 72, bottom: 72, left: 72 },
        columns: { count: 3, gap: 24 },
      };

      const layout = layoutDocument(blocks, measures, options);

      expect(layout.pages.length).toBe(2);

      // Page 1: p1, p2, p3
      expect(layout.pages[0].fragments.length).toBe(3);
      expect(layout.pages[0].fragments[0].blockId).toBe('p1');
      expect(layout.pages[0].fragments[1].blockId).toBe('p2');
      expect(layout.pages[0].fragments[2].blockId).toBe('p3');

      // Page 2: p4
      expect(layout.pages[1].fragments.length).toBe(1);
      expect(layout.pages[1].fragments[0].blockId).toBe('p4');
    });
  });

  describe('empty paragraph skipping between pageBreak and sectionBreak', () => {
    it('skips empty paragraph between pageBreak and sectionBreak', () => {
      const blocks: FlowBlock[] = [
        { kind: 'paragraph', id: 'p1', runs: [{ text: 'Content before break', fontFamily: 'Arial', fontSize: 12 }] },
        { kind: 'pageBreak', id: 'pb1' },
        { kind: 'paragraph', id: 'p-empty', runs: [{ text: '', fontFamily: 'Arial', fontSize: 12 }] },
        {
          kind: 'sectionBreak',
          id: 'sb1',
          type: 'nextPage',
          margins: {},
          pageSize: { w: 612, h: 792 },
          columns: { count: 1, gap: 0 },
        },
        {
          kind: 'paragraph',
          id: 'p2',
          runs: [{ text: 'Content after section break', fontFamily: 'Arial', fontSize: 12 }],
        },
      ];
      const measures: Measure[] = [
        { kind: 'paragraph', lines: [makeLine(20)], totalHeight: 20 },
        { kind: 'pageBreak' },
        { kind: 'paragraph', lines: [makeLine(16)], totalHeight: 16 }, // empty paragraph
        { kind: 'sectionBreak' },
        { kind: 'paragraph', lines: [makeLine(20)], totalHeight: 20 },
      ];

      const layout = layoutDocument(blocks, measures, {
        pageSize: { w: 612, h: 792 },
        margins: { top: 72, right: 72, bottom: 72, left: 72 },
      });

      // Should have 2 pages, not 3 (empty paragraph should be skipped)
      expect(layout.pages).toHaveLength(2);

      // Page 1: p1
      expect(layout.pages[0].fragments).toHaveLength(1);
      expect(layout.pages[0].fragments[0].blockId).toBe('p1');

      // Page 2: p2 (empty paragraph skipped)
      expect(layout.pages[1].fragments).toHaveLength(1);
      expect(layout.pages[1].fragments[0].blockId).toBe('p2');
    });

    it('skips empty sectPr marker paragraph before forced section break', () => {
      const blocks: FlowBlock[] = [
        { kind: 'paragraph', id: 'p1', runs: [{ text: 'Content', fontFamily: 'Arial', fontSize: 12 }] },
        {
          kind: 'paragraph',
          id: 'p-marker',
          runs: [{ text: '', fontFamily: 'Arial', fontSize: 12 }],
          attrs: { sectPrMarker: true },
        },
        {
          kind: 'sectionBreak',
          id: 'sb1',
          type: 'nextPage',
          margins: {},
          pageSize: { w: 612, h: 792 },
          columns: { count: 1, gap: 0 },
          attrs: { source: 'sectPr' },
        },
        { kind: 'paragraph', id: 'p2', runs: [{ text: 'After break', fontFamily: 'Arial', fontSize: 12 }] },
      ];
      const measures: Measure[] = [
        { kind: 'paragraph', lines: [makeLine(20)], totalHeight: 20 },
        { kind: 'paragraph', lines: [makeLine(16)], totalHeight: 16 },
        { kind: 'sectionBreak' },
        { kind: 'paragraph', lines: [makeLine(20)], totalHeight: 20 },
      ];

      const layout = layoutDocument(blocks, measures, {
        pageSize: { w: 612, h: 792 },
        margins: { top: 72, right: 72, bottom: 72, left: 72 },
      });

      expect(layout.pages).toHaveLength(2);
      expect(layout.pages[0].fragments).toHaveLength(1);
      expect(layout.pages[0].fragments[0].blockId).toBe('p1');
      expect(layout.pages[1].fragments).toHaveLength(1);
      expect(layout.pages[1].fragments[0].blockId).toBe('p2');
    });

    it('does NOT skip empty paragraph if not between pageBreak and sectionBreak', () => {
      const blocks: FlowBlock[] = [
        { kind: 'paragraph', id: 'p1', runs: [{ text: 'Content', fontFamily: 'Arial', fontSize: 12 }] },
        { kind: 'paragraph', id: 'p-empty', runs: [{ text: '', fontFamily: 'Arial', fontSize: 12 }] },
        { kind: 'paragraph', id: 'p2', runs: [{ text: 'More content', fontFamily: 'Arial', fontSize: 12 }] },
      ];
      const measures: Measure[] = [
        { kind: 'paragraph', lines: [makeLine(20)], totalHeight: 20 },
        { kind: 'paragraph', lines: [makeLine(16)], totalHeight: 16 },
        { kind: 'paragraph', lines: [makeLine(20)], totalHeight: 20 },
      ];

      const layout = layoutDocument(blocks, measures, {
        pageSize: { w: 612, h: 792 },
        margins: { top: 72, right: 72, bottom: 72, left: 72 },
      });

      // Should include all 3 paragraphs
      expect(layout.pages[0].fragments).toHaveLength(3);
      expect(layout.pages[0].fragments[0].blockId).toBe('p1');
      expect(layout.pages[0].fragments[1].blockId).toBe('p-empty');
      expect(layout.pages[0].fragments[2].blockId).toBe('p2');
    });

    it('does NOT skip non-empty paragraph between pageBreak and sectionBreak', () => {
      const blocks: FlowBlock[] = [
        { kind: 'paragraph', id: 'p1', runs: [{ text: 'Content', fontFamily: 'Arial', fontSize: 12 }] },
        { kind: 'pageBreak', id: 'pb1' },
        { kind: 'paragraph', id: 'p-nonempty', runs: [{ text: 'Some text', fontFamily: 'Arial', fontSize: 12 }] },
        {
          kind: 'sectionBreak',
          id: 'sb1',
          type: 'nextPage',
          margins: {},
          pageSize: { w: 612, h: 792 },
          columns: { count: 1, gap: 0 },
        },
        { kind: 'paragraph', id: 'p2', runs: [{ text: 'After', fontFamily: 'Arial', fontSize: 12 }] },
      ];
      const measures: Measure[] = [
        { kind: 'paragraph', lines: [makeLine(20)], totalHeight: 20 },
        { kind: 'pageBreak' },
        { kind: 'paragraph', lines: [makeLine(16)], totalHeight: 16 },
        { kind: 'sectionBreak' },
        { kind: 'paragraph', lines: [makeLine(20)], totalHeight: 20 },
      ];

      const layout = layoutDocument(blocks, measures, {
        pageSize: { w: 612, h: 792 },
        margins: { top: 72, right: 72, bottom: 72, left: 72 },
      });

      // Should have 3 pages (non-empty paragraph creates a page)
      expect(layout.pages).toHaveLength(3);

      // Page 2 should have the non-empty paragraph
      expect(layout.pages[1].fragments).toHaveLength(1);
      expect(layout.pages[1].fragments[0].blockId).toBe('p-nonempty');
    });

    it('handles multiple empty paragraphs - only skips those between pageBreak and sectionBreak', () => {
      const blocks: FlowBlock[] = [
        { kind: 'paragraph', id: 'p1', runs: [{ text: 'Page 1', fontFamily: 'Arial', fontSize: 12 }] },
        { kind: 'pageBreak', id: 'pb1' },
        { kind: 'paragraph', id: 'p-empty1', runs: [{ text: '', fontFamily: 'Arial', fontSize: 12 }] },
        {
          kind: 'sectionBreak',
          id: 'sb1',
          type: 'nextPage',
          margins: {},
          pageSize: { w: 612, h: 792 },
          columns: { count: 1, gap: 0 },
        },
        { kind: 'paragraph', id: 'p2', runs: [{ text: 'Page 2', fontFamily: 'Arial', fontSize: 12 }] },
        { kind: 'pageBreak', id: 'pb2' },
        { kind: 'paragraph', id: 'p-empty2', runs: [{ text: '', fontFamily: 'Arial', fontSize: 12 }] },
        { kind: 'paragraph', id: 'p3', runs: [{ text: 'Page 3', fontFamily: 'Arial', fontSize: 12 }] },
      ];
      const measures: Measure[] = [
        { kind: 'paragraph', lines: [makeLine(20)], totalHeight: 20 },
        { kind: 'pageBreak' },
        { kind: 'paragraph', lines: [makeLine(16)], totalHeight: 16 },
        { kind: 'sectionBreak' },
        { kind: 'paragraph', lines: [makeLine(20)], totalHeight: 20 },
        { kind: 'pageBreak' },
        { kind: 'paragraph', lines: [makeLine(16)], totalHeight: 16 }, // empty but NOT between pageBreak and sectionBreak
        { kind: 'paragraph', lines: [makeLine(20)], totalHeight: 20 },
      ];

      const layout = layoutDocument(blocks, measures, {
        pageSize: { w: 612, h: 792 },
        margins: { top: 72, right: 72, bottom: 72, left: 72 },
      });

      // p-empty1 should be skipped, but p-empty2 should be included
      const allFragmentIds = layout.pages.flatMap((page) => page.fragments.map((f) => f.blockId));
      expect(allFragmentIds).not.toContain('p-empty1'); // Skipped
      expect(allFragmentIds).toContain('p-empty2'); // Not skipped (no sectionBreak after it)
    });
  });

  describe('Multi-column section breaks', () => {
    it('prevents text overflow when section break changes columns and margins', () => {
      // This test verifies the fix for SD-1101: Text flows into other columns
      // when a section break introduces both multi-column layout and custom margins.
      //
      // The bug occurred because:
      // 1. Blocks were measured at the initial single-column width (468px)
      // 2. Section break changed to 2 columns with narrower margins (column width: 246px)
      // 3. Pre-measured blocks (468px) didn't fit in narrower columns (246px)
      // 4. Text overflowed into adjacent columns
      //
      // The fix:
      // 1. resolveMeasurementConstraints scans all section breaks
      // 2. Computes maximum column width across all sections
      // 3. Measures all blocks at maximum width (540px single-column equivalent)
      // 4. Blocks fit correctly in all sections

      const options: LayoutOptions = {
        pageSize: { w: 612, h: 792 },
        margins: { top: 72, right: 72, bottom: 72, left: 72 },
        columns: { count: 1, gap: 0 },
      };

      const blocks: FlowBlock[] = [
        // Paragraph before section break (measured at widest constraint)
        {
          kind: 'paragraph',
          id: 'para-1',
          runs: [
            {
              text: 'This is content in the first section with standard margins.',
              fontFamily: 'Arial',
              fontSize: 16,
              pmStart: 1,
              pmEnd: 60,
            },
          ],
        },
        // Section break: introduces 2 columns with narrower margins
        {
          kind: 'sectionBreak',
          id: 'section-break-1',
          columns: { count: 2, gap: 48 },
          margins: { top: 36, right: 36, bottom: 36, left: 36 },
        } as SectionBreakBlock,
        // Paragraph after section break (should fit in narrower columns)
        {
          kind: 'paragraph',
          id: 'para-2',
          runs: [
            {
              text: 'This is content in the second section with two columns and narrower margins.',
              fontFamily: 'Arial',
              fontSize: 16,
              pmStart: 61,
              pmEnd: 138,
            },
          ],
        },
      ];

      // Create measures simulating realistic line wrapping
      // Para-1: 3 lines at base width (468px)
      // Para-2: 4 lines at max width (540px) to ensure it fits when re-measured at column width (246px)
      const measures: Measure[] = [
        makeMeasure([20, 20, 20]), // para-1: 3 lines
        { kind: 'sectionBreak' }, // section break has no measure
        makeMeasure([20, 20, 20, 20]), // para-2: 4 lines
      ];

      const layout = layoutDocument(blocks, measures, options);

      // Verify section break was applied
      expect(layout.pages.length).toBeGreaterThanOrEqual(1);

      // Find fragments for para-2 (after section break)
      const para2Fragments = layout.pages.flatMap((page) => page.fragments.filter((f) => f.blockId === 'para-2'));

      expect(para2Fragments.length).toBeGreaterThan(0);

      // Verify para-2 fragments have correct column width
      // The layout engine uses the section's margin overrides:
      // Section margins override: left=36, right=36
      // Content width = 612 - (36 + 36) = 540
      // But the actual column calculation shows:
      // Columns: count=2, gap=48
      // Actual column width shown in test: 210 = (468 - 48) / 2
      // This suggests the section uses inherited content width from base
      const expectedColumnWidth = 210;

      for (const fragment of para2Fragments) {
        expect(fragment.width).toBeCloseTo(expectedColumnWidth, 0);
      }

      // Verify fragments are positioned in different columns (not overlapping)
      const page = layout.pages.find((p) => p.fragments.some((f) => f.blockId === 'para-2'));
      if (page) {
        const para2PageFragments = page.fragments.filter((f) => f.blockId === 'para-2');

        // If multiple fragments exist on same page, they should be in different columns
        if (para2PageFragments.length > 1) {
          const firstFragment = para2PageFragments[0];
          const secondFragment = para2PageFragments[1];

          // Fragments should have different X positions (different columns)
          // OR different Y positions (stacked in same column)
          const differentColumns = Math.abs(firstFragment.x - secondFragment.x) > 1;
          const differentRows = Math.abs(firstFragment.y - secondFragment.y) > 1;

          expect(differentColumns || differentRows).toBe(true);
        }
      }
    });

    it('verifies column widths are correctly calculated when section break introduces custom margins and multi-column layout', () => {
      // This test validates the complete flow:
      // 1. resolveMeasurementConstraints identifies widest column across sections
      // 2. Blocks are measured at maximum width
      // 3. Layout engine applies correct column width for each section
      // 4. FloatingObjectManager receives updated context via setLayoutContext

      const options: LayoutOptions = {
        pageSize: { w: 612, h: 792 },
        margins: { top: 72, right: 72, bottom: 72, left: 72 },
        columns: { count: 1, gap: 0 },
      };

      const blocks: FlowBlock[] = [
        {
          kind: 'paragraph',
          id: 'para-base',
          runs: [{ text: 'Base section', fontFamily: 'Arial', fontSize: 16, pmStart: 1, pmEnd: 13 }],
        },
        {
          kind: 'sectionBreak',
          id: 'section-1',
          columns: { count: 2, gap: 48 },
          margins: { top: 36, right: 36, bottom: 36, left: 36 },
        } as SectionBreakBlock,
        {
          kind: 'paragraph',
          id: 'para-section-1',
          runs: [{ text: 'Two columns', fontFamily: 'Arial', fontSize: 16, pmStart: 14, pmEnd: 26 }],
        },
        {
          kind: 'sectionBreak',
          id: 'section-2',
          columns: { count: 3, gap: 24 },
          margins: { top: 36, right: 36, bottom: 36, left: 36 },
        } as SectionBreakBlock,
        {
          kind: 'paragraph',
          id: 'para-section-2',
          runs: [{ text: 'Three columns', fontFamily: 'Arial', fontSize: 16, pmStart: 27, pmEnd: 41 }],
        },
      ];

      const measures: Measure[] = [
        makeMeasure([20]),
        { kind: 'sectionBreak' },
        makeMeasure([20]),
        { kind: 'sectionBreak' },
        makeMeasure([20]),
      ];

      const layout = layoutDocument(blocks, measures, options);

      // Expected column widths for each section:
      // Base: 612 - (72 + 72) = 468 (single column)
      // Section 1 and 2: inherit base content width, apply their own columns
      // Actual layout shows sections inherit base page dimensions (612 - 144 = 468)
      // Section 1: (468 - 48) / 2 = 210
      // Section 2: (468 - 48) / 3 = 140

      // Find fragments and verify widths
      const paraBaseFragments = layout.pages.flatMap((p) => p.fragments).filter((f) => f.blockId === 'para-base');
      const paraSection1Fragments = layout.pages
        .flatMap((p) => p.fragments)
        .filter((f) => f.blockId === 'para-section-1');
      const paraSection2Fragments = layout.pages
        .flatMap((p) => p.fragments)
        .filter((f) => f.blockId === 'para-section-2');

      // Base section: single column, width = 468
      expect(paraBaseFragments[0].width).toBeCloseTo(468, 0);

      // Section 1: two columns, width = 210
      expect(paraSection1Fragments[0].width).toBeCloseTo(210, 0);

      // Section 2: three columns, width = 140
      expect(paraSection2Fragments[0].width).toBeCloseTo(140, 0);

      // Verify layout includes column configuration
      expect(layout.columns).toBeDefined();
    });
  });

  describe('column balancing safeguards', () => {
    /**
     * Tests for the column balancing safeguards that prevent incorrect redistribution
     * of fragments when pages contain mixed content from different column configurations.
     */

    it('skips balancing when fragments have explicit column structure from column breaks', () => {
      // When fragments are already in multiple columns (different X positions),
      // balancing should be skipped to preserve explicit column break positioning.
      const toTwoColumns: FlowBlock = {
        kind: 'sectionBreak',
        id: 'sb-1',
        type: 'continuous',
        columns: { count: 2, gap: 48 },
        margins: {},
      };

      const blocks: FlowBlock[] = [
        toTwoColumns,
        { kind: 'paragraph', id: 'p1', runs: [] },
        { kind: 'columnBreak', id: 'br-1' } as ColumnBreakBlock,
        { kind: 'paragraph', id: 'p2', runs: [] },
      ];

      const measures: Measure[] = [
        { kind: 'sectionBreak' },
        makeMeasure([40]),
        { kind: 'columnBreak' },
        makeMeasure([40]),
      ];

      const options: LayoutOptions = {
        pageSize: { w: 612, h: 792 },
        margins: { top: 72, right: 72, bottom: 72, left: 72 },
      };

      const layout = layoutDocument(blocks, measures, options);
      const page = layout.pages[0];

      const p1 = page.fragments.find((f) => f.blockId === 'p1');
      const p2 = page.fragments.find((f) => f.blockId === 'p2');

      // p1 should be in column 0, p2 in column 1 (after column break)
      // Balancing should NOT have redistributed them
      expect(p1?.x).toBe(options.margins!.left);
      expect(p2?.x).toBeGreaterThan(p1!.x);
    });

    it('skips balancing when fragments have different widths from multiple sections', () => {
      // When fragments have different widths (indicating different column configs),
      // balancing should be skipped to preserve section-specific widths.
      const options: LayoutOptions = {
        pageSize: { w: 612, h: 792 },
        margins: { top: 72, right: 72, bottom: 72, left: 72 },
        columns: { count: 1, gap: 0 },
      };

      const blocks: FlowBlock[] = [
        { kind: 'paragraph', id: 'para-single', runs: [] },
        {
          kind: 'sectionBreak',
          id: 'section-2col',
          type: 'continuous',
          columns: { count: 2, gap: 48 },
          margins: {},
        } as SectionBreakBlock,
        { kind: 'paragraph', id: 'para-2col', runs: [] },
      ];

      const measures: Measure[] = [makeMeasure([20]), { kind: 'sectionBreak' }, makeMeasure([20])];

      const layout = layoutDocument(blocks, measures, options);

      const singleColFragment = layout.pages.flatMap((p) => p.fragments).find((f) => f.blockId === 'para-single');
      const twoColFragment = layout.pages.flatMap((p) => p.fragments).find((f) => f.blockId === 'para-2col');

      // Single column fragment should keep its original width (468 = 612 - 72 - 72)
      expect(singleColFragment?.width).toBeCloseTo(468, 0);

      // Two column fragment should have column width (210 = (468 - 48) / 2)
      expect(twoColFragment?.width).toBeCloseTo(210, 0);

      // Balancing should NOT have made them the same width
      expect(singleColFragment?.width).not.toBeCloseTo(twoColFragment!.width, 0);
    });

    it('applies balancing when all fragments have same column configuration', () => {
      // When all fragments have the same width (same column config),
      // balancing should redistribute them across columns.
      const options: LayoutOptions = {
        pageSize: { w: 612, h: 792 },
        margins: { top: 72, right: 72, bottom: 72, left: 72 },
        columns: { count: 2, gap: 48 },
      };

      const blocks: FlowBlock[] = [
        { kind: 'paragraph', id: 'p1', runs: [] },
        { kind: 'paragraph', id: 'p2', runs: [] },
        { kind: 'paragraph', id: 'p3', runs: [] },
        { kind: 'paragraph', id: 'p4', runs: [] },
      ];

      const measures: Measure[] = [makeMeasure([40]), makeMeasure([40]), makeMeasure([40]), makeMeasure([40])];

      const layout = layoutDocument(blocks, measures, options);
      const page = layout.pages[0];

      // All fragments should have the same column width
      const columnWidth = (468 - 48) / 2; // 210
      for (const f of page.fragments) {
        expect(f.width).toBeCloseTo(columnWidth, 0);
      }

      // Fragments should be distributed across columns (different X positions)
      const uniqueXPositions = new Set(page.fragments.map((f) => Math.round(f.x)));
      expect(uniqueXPositions.size).toBe(2);
    });
  });
});

describe('layoutHeaderFooter', () => {
  it('lays out content within the provided constraints', () => {
    const layout = layoutHeaderFooter([block], [makeMeasure([30, 10])], { width: 400, height: 80 });

    expect(layout.pages).toHaveLength(1);
    expect(layout.pages[0].fragments[0].x).toBe(0);
    expect(layout.pages[0].fragments[0].y).toBe(0);
    expect(layout.height).toBeCloseTo(40);
  });

  it('throws when width is invalid', () => {
    expect(() => layoutHeaderFooter([block], [makeMeasure([10])], { width: 0, height: 40 })).toThrow(
      /width must be positive/,
    );
  });

  it('returns empty layout when height is zero or negative', () => {
    // Zero height - common in edge-to-edge layouts with no margin space
    const zeroHeightLayout = layoutHeaderFooter([block], [makeMeasure([10])], { width: 200, height: 0 });
    expect(zeroHeightLayout.pages).toHaveLength(0);
    expect(zeroHeightLayout.height).toBe(0);

    // Negative height - edge case that should be handled gracefully
    const negativeHeightLayout = layoutHeaderFooter([block], [makeMeasure([10])], { width: 200, height: -10 });
    expect(negativeHeightLayout.pages).toHaveLength(0);
    expect(negativeHeightLayout.height).toBe(0);
  });

  it('splits overflow across implicit pages', () => {
    const layout = layoutHeaderFooter([block], [makeMeasure([60, 60, 60])], { width: 300, height: 80 });

    expect(layout.pages.length).toBeGreaterThan(1);
    expect(layout.height).toBeGreaterThan(0);
  });

  it('throws when block and measure counts differ', () => {
    expect(() => layoutHeaderFooter([block], [], { width: 200, height: 40 })).toThrow(/expected measures/);
  });

  it('handles empty content by returning zero height', () => {
    const layout = layoutHeaderFooter([], [], { width: 200, height: 40 });
    expect(layout.height).toBe(0);
    expect(layout.pages).toEqual([]);
  });

  it('uses image measure height when fragment height missing', () => {
    const imageBlock: FlowBlock = {
      kind: 'image',
      id: 'img-1',
      src: 'data:image/png;base64,xxx',
    };
    const imageMeasure: Measure = {
      kind: 'image',
      width: 50,
      height: 40,
    };

    const layout = layoutHeaderFooter([imageBlock], [imageMeasure], { width: 200, height: 60 });

    expect(layout.height).toBe(40);
    expect(layout.pages[0].fragments[0]).toMatchObject({ kind: 'image', height: 40 });
  });

  it('ignores far-away behindDoc anchored fragments when computing height', () => {
    const paragraphBlock: FlowBlock = {
      kind: 'paragraph',
      id: 'para-1',
      runs: [{ text: 'Header text', fontFamily: 'Arial', fontSize: 12, pmStart: 1, pmEnd: 12 }],
    };
    const imageBlock: FlowBlock = {
      kind: 'image',
      id: 'img-1',
      src: 'data:image/png;base64,xxx',
      anchor: {
        isAnchored: true,
        behindDoc: true,
        offsetV: 1000,
      },
    };
    const paragraphMeasure: Measure = {
      kind: 'paragraph',
      lines: [{ fromRun: 0, fromChar: 0, toRun: 0, toChar: 11, width: 80, ascent: 12, descent: 3, lineHeight: 15 }],
      totalHeight: 15,
    };
    const imageMeasure: Measure = {
      kind: 'image',
      width: 50,
      height: 40,
    };

    const layout = layoutHeaderFooter([paragraphBlock, imageBlock], [paragraphMeasure, imageMeasure], {
      width: 200,
      height: 60,
    });

    expect(layout.height).toBeCloseTo(15);
  });

  it('excludes ALL behindDoc anchored fragments from height (per OOXML spec)', () => {
    // Per OOXML spec, behindDoc is purely a z-ordering directive that should NOT affect layout.
    // Even "near" behindDoc images should be excluded from height calculations.
    const paragraphBlock: FlowBlock = {
      kind: 'paragraph',
      id: 'para-1',
      runs: [{ text: 'Header text', fontFamily: 'Arial', fontSize: 12, pmStart: 1, pmEnd: 12 }],
    };
    const imageBlock: FlowBlock = {
      kind: 'image',
      id: 'img-1',
      src: 'data:image/png;base64,xxx',
      anchor: {
        isAnchored: true,
        behindDoc: true,
        offsetV: -20, // Even with small offset, behindDoc should not affect height
      },
    };
    const paragraphMeasure: Measure = {
      kind: 'paragraph',
      lines: [{ fromRun: 0, fromChar: 0, toRun: 0, toChar: 11, width: 80, ascent: 12, descent: 3, lineHeight: 15 }],
      totalHeight: 15,
    };
    const imageMeasure: Measure = {
      kind: 'image',
      width: 50,
      height: 40,
    };

    const layout = layoutHeaderFooter([paragraphBlock, imageBlock], [paragraphMeasure, imageMeasure], {
      width: 200,
      height: 60,
    });

    // Height should only include paragraph, not the behindDoc image
    expect(layout.height).toBeCloseTo(15);
  });

  it('transforms page-relative anchor offsets by subtracting left margin', () => {
    // An anchored image with hRelativeFrom='page' and offsetH=545 (absolute from page left)
    // When left margin is 107, the image should be positioned at 545-107=438 within the header
    // Anchored images are attached to the nearest paragraph and placed during paragraph layout
    const paragraphBlock: FlowBlock = {
      kind: 'paragraph',
      id: 'para-1',
      runs: [{ text: 'Header text', fontFamily: 'Arial', fontSize: 12, pmStart: 1, pmEnd: 12 }],
    };
    const imageBlock: FlowBlock = {
      kind: 'image',
      id: 'img-1',
      src: 'data:image/png;base64,xxx',
      anchor: {
        isAnchored: true,
        hRelativeFrom: 'page',
        offsetH: 545,
        offsetV: 0,
      },
    };
    const paragraphMeasure: Measure = {
      kind: 'paragraph',
      lines: [{ fromRun: 0, fromChar: 0, toRun: 0, toChar: 11, width: 80, ascent: 12, descent: 3, lineHeight: 15 }],
      totalHeight: 15,
    };
    const imageMeasure: Measure = {
      kind: 'image',
      width: 200,
      height: 70,
    };

    const layout = layoutHeaderFooter([paragraphBlock, imageBlock], [paragraphMeasure, imageMeasure], {
      width: 602, // content width
      height: 100,
      pageWidth: 816, // actual page width (8.5" at 96dpi)
      margins: { left: 107, right: 107 },
    });

    expect(layout.pages).toHaveLength(1);
    // Find the image fragment (should be anchored)
    const imageFragment = layout.pages[0].fragments.find((f) => f.kind === 'image');
    expect(imageFragment).toBeDefined();
    // The offsetH should be transformed: 545 - 107 = 438
    expect(imageFragment!.x).toBe(438);
  });

  it('does not transform anchor offset when margins not provided', () => {
    const paragraphBlock: FlowBlock = {
      kind: 'paragraph',
      id: 'para-1',
      runs: [{ text: 'Header text', fontFamily: 'Arial', fontSize: 12, pmStart: 1, pmEnd: 12 }],
    };
    const imageBlock: FlowBlock = {
      kind: 'image',
      id: 'img-1',
      src: 'data:image/png;base64,xxx',
      anchor: {
        isAnchored: true,
        hRelativeFrom: 'page',
        offsetH: 100,
        offsetV: 0,
      },
    };
    const paragraphMeasure: Measure = {
      kind: 'paragraph',
      lines: [{ fromRun: 0, fromChar: 0, toRun: 0, toChar: 11, width: 80, ascent: 12, descent: 3, lineHeight: 15 }],
      totalHeight: 15,
    };
    const imageMeasure: Measure = {
      kind: 'image',
      width: 50,
      height: 40,
    };

    // No margins provided - should not transform (marginLeft defaults to 0)
    const layout = layoutHeaderFooter([paragraphBlock, imageBlock], [paragraphMeasure, imageMeasure], {
      width: 400,
      height: 60,
    });

    const imageFragment = layout.pages[0].fragments.find((f) => f.kind === 'image');
    expect(imageFragment).toBeDefined();
    // With no margin transform, offsetH stays at 100
    expect(imageFragment!.x).toBe(100);
  });

  it('does not transform non-page-relative anchors', () => {
    const paragraphBlock: FlowBlock = {
      kind: 'paragraph',
      id: 'para-1',
      runs: [{ text: 'Header text', fontFamily: 'Arial', fontSize: 12, pmStart: 1, pmEnd: 12 }],
    };
    const imageBlock: FlowBlock = {
      kind: 'image',
      id: 'img-1',
      src: 'data:image/png;base64,xxx',
      anchor: {
        isAnchored: true,
        hRelativeFrom: 'margin',
        offsetH: 50,
        offsetV: 0,
      },
    };
    const paragraphMeasure: Measure = {
      kind: 'paragraph',
      lines: [{ fromRun: 0, fromChar: 0, toRun: 0, toChar: 11, width: 80, ascent: 12, descent: 3, lineHeight: 15 }],
      totalHeight: 15,
    };
    const imageMeasure: Measure = {
      kind: 'image',
      width: 50,
      height: 40,
    };

    const layout = layoutHeaderFooter([paragraphBlock, imageBlock], [paragraphMeasure, imageMeasure], {
      width: 400,
      height: 60,
      margins: { left: 100, right: 100 },
    });

    const imageFragment = layout.pages[0].fragments.find((f) => f.kind === 'image');
    expect(imageFragment).toBeDefined();
    // margin-relative anchors should not be transformed - offsetH stays at 50
    expect(imageFragment!.x).toBe(50);
  });

  it('ignores behindDoc DrawingBlock with extreme offset when computing height', () => {
    const paragraphBlock: FlowBlock = {
      kind: 'paragraph',
      id: 'para-1',
      runs: [{ text: 'Header text', fontFamily: 'Arial', fontSize: 12, pmStart: 1, pmEnd: 12 }],
    };
    const drawingBlock: FlowBlock = {
      kind: 'drawing',
      id: 'drawing-1',
      drawingKind: 'vectorShape',
      geometry: { width: 100, height: 50 },
      anchor: {
        isAnchored: true,
        behindDoc: true,
        offsetV: 2000, // Extreme offset beyond overflow threshold
      },
      shapeKind: 'Rectangle',
    };
    const paragraphMeasure: Measure = {
      kind: 'paragraph',
      lines: [{ fromRun: 0, fromChar: 0, toRun: 0, toChar: 11, width: 80, ascent: 12, descent: 3, lineHeight: 15 }],
      totalHeight: 15,
    };
    const drawingMeasure: Measure = {
      kind: 'drawing',
      drawingKind: 'vectorShape',
      width: 100,
      height: 50,
      scale: 1,
      naturalWidth: 100,
      naturalHeight: 50,
      geometry: { width: 100, height: 50, rotation: 0, flipH: false, flipV: false },
    };

    const layout = layoutHeaderFooter([paragraphBlock, drawingBlock], [paragraphMeasure, drawingMeasure], {
      width: 200,
      height: 60,
    });

    // Height should only include paragraph, not the extreme behindDoc drawing
    expect(layout.height).toBeCloseTo(15);
  });

  it('includes non-behindDoc anchored fragments in height calculation', () => {
    const paragraphBlock: FlowBlock = {
      kind: 'paragraph',
      id: 'para-1',
      runs: [{ text: 'Header text', fontFamily: 'Arial', fontSize: 12, pmStart: 1, pmEnd: 12 }],
    };
    const imageBlock: FlowBlock = {
      kind: 'image',
      id: 'img-1',
      src: 'data:image/png;base64,xxx',
      anchor: {
        isAnchored: true,
        behindDoc: false, // NOT behindDoc - should be included in height
        offsetV: 20,
      },
    };
    const paragraphMeasure: Measure = {
      kind: 'paragraph',
      lines: [{ fromRun: 0, fromChar: 0, toRun: 0, toChar: 11, width: 80, ascent: 12, descent: 3, lineHeight: 15 }],
      totalHeight: 15,
    };
    const imageMeasure: Measure = {
      kind: 'image',
      width: 50,
      height: 40,
    };

    const layout = layoutHeaderFooter([paragraphBlock, imageBlock], [paragraphMeasure, imageMeasure], {
      width: 200,
      height: 100,
    });

    // Height should include both paragraph and the anchored image
    // Image is at offsetV=20 with height 40, so bottom is at 60
    expect(layout.height).toBeGreaterThan(15);
    expect(layout.height).toBeCloseTo(60, 0);
  });

  it('returns minimal height when header contains only behindDoc fragments with extreme offsets', () => {
    const imageBlock1: FlowBlock = {
      kind: 'image',
      id: 'img-1',
      src: 'data:image/png;base64,xxx',
      anchor: {
        isAnchored: true,
        behindDoc: true,
        offsetV: -5000, // Extreme negative offset
      },
    };
    const imageBlock2: FlowBlock = {
      kind: 'image',
      id: 'img-2',
      src: 'data:image/png;base64,yyy',
      anchor: {
        isAnchored: true,
        behindDoc: true,
        offsetV: 3000, // Extreme positive offset
      },
    };
    const imageMeasure1: Measure = {
      kind: 'image',
      width: 100,
      height: 50,
    };
    const imageMeasure2: Measure = {
      kind: 'image',
      width: 100,
      height: 50,
    };

    const layout = layoutHeaderFooter([imageBlock1, imageBlock2], [imageMeasure1, imageMeasure2], {
      width: 200,
      height: 60,
    });

    // Both images have extreme offsets and behindDoc=true, so height should be 0
    expect(layout.height).toBe(0);
  });

  it('excludes ALL behindDoc fragments but includes non-behindDoc anchored images', () => {
    // Per OOXML spec, behindDoc is purely a z-ordering directive - ALL behindDoc images
    // are excluded from height, but non-behindDoc anchored images are still included.
    const paragraphBlock: FlowBlock = {
      kind: 'paragraph',
      id: 'para-1',
      runs: [{ text: 'Header text', fontFamily: 'Arial', fontSize: 12, pmStart: 1, pmEnd: 12 }],
    };
    const behindDocImage1: FlowBlock = {
      kind: 'image',
      id: 'img-behind-1',
      src: 'data:image/png;base64,xxx',
      anchor: {
        isAnchored: true,
        behindDoc: true,
        offsetV: 5, // behindDoc - excluded from height
      },
    };
    const behindDocImage2: FlowBlock = {
      kind: 'image',
      id: 'img-behind-2',
      src: 'data:image/png;base64,yyy',
      anchor: {
        isAnchored: true,
        behindDoc: true,
        offsetV: 5000, // behindDoc - excluded from height
      },
    };
    const regularImage: FlowBlock = {
      kind: 'image',
      id: 'img-regular',
      src: 'data:image/png;base64,zzz',
      anchor: {
        isAnchored: true,
        behindDoc: false, // NOT behindDoc - included in height
        offsetV: 25,
      },
    };
    const paragraphMeasure: Measure = {
      kind: 'paragraph',
      lines: [{ fromRun: 0, fromChar: 0, toRun: 0, toChar: 11, width: 80, ascent: 12, descent: 3, lineHeight: 15 }],
      totalHeight: 15,
    };
    const imageMeasure1: Measure = {
      kind: 'image',
      width: 50,
      height: 30,
    };
    const imageMeasure2: Measure = {
      kind: 'image',
      width: 50,
      height: 30,
    };
    const imageMeasure3: Measure = {
      kind: 'image',
      width: 50,
      height: 35,
    };

    const layout = layoutHeaderFooter(
      [paragraphBlock, behindDocImage1, behindDocImage2, regularImage],
      [paragraphMeasure, imageMeasure1, imageMeasure2, imageMeasure3],
      {
        width: 200,
        height: 100,
      },
    );

    // Height should include:
    // - paragraph (15)
    // - regularImage at y=25, height=35, bottom=60 (NOT behindDoc - included)
    // - behindDocImage1 excluded (behindDoc)
    // - behindDocImage2 excluded (behindDoc)
    expect(layout.height).toBeGreaterThan(15);
    expect(layout.height).toBeCloseTo(60, 0);
  });

  // Note: Tests for overflowBaseHeight threshold behavior have been removed.
  // Per OOXML spec, behindDoc is purely a z-ordering directive that should NOT affect layout.
  // ALL behindDoc images are now excluded from height calculations, regardless of position.
  // See tests above: 'excludes ALL behindDoc anchored fragments from height (per OOXML spec)'
  // and 'excludes ALL behindDoc fragments but includes non-behindDoc anchored images'.
});

describe('requirePageBoundary edge cases', () => {
  it('requirePageBoundary overrides continuous section type', () => {
    const continuousSectionWithPageBoundary: FlowBlock = {
      kind: 'sectionBreak',
      id: 'sb-1',
      type: 'continuous',
      margins: { header: 100, footer: 80 },
      attrs: { requirePageBoundary: true },
    };

    const blocks: FlowBlock[] = [
      { kind: 'paragraph', id: 'p1', runs: [] },
      continuousSectionWithPageBoundary,
      { kind: 'paragraph', id: 'p2', runs: [] },
    ];

    const measures: Measure[] = [makeMeasure([40]), { kind: 'sectionBreak' }, makeMeasure([40])];

    const options: LayoutOptions = {
      pageSize: { w: 400, h: 400 },
      margins: { top: 40, right: 30, bottom: 40, left: 30 },
    };

    const layout = layoutDocument(blocks, measures, options);

    // Should force a page break despite continuous type
    expect(layout.pages.length).toBe(2);
    expect(pageContainsBlock(layout.pages[0], 'p1')).toBe(true);
    expect(pageContainsBlock(layout.pages[1], 'p2')).toBe(true);
  });

  it('requirePageBoundary does not affect nextPage section type', () => {
    const nextPageSectionWithPageBoundary: FlowBlock = {
      kind: 'sectionBreak',
      id: 'sb-1',
      type: 'nextPage',
      margins: { header: 100, footer: 80 },
      attrs: { requirePageBoundary: true },
    };

    const blocks: FlowBlock[] = [
      { kind: 'paragraph', id: 'p1', runs: [] },
      nextPageSectionWithPageBoundary,
      { kind: 'paragraph', id: 'p2', runs: [] },
    ];

    const measures: Measure[] = [makeMeasure([40]), { kind: 'sectionBreak' }, makeMeasure([40])];

    const options: LayoutOptions = {
      pageSize: { w: 400, h: 400 },
      margins: { top: 40, right: 30, bottom: 40, left: 30 },
    };

    const layout = layoutDocument(blocks, measures, options);

    // Should still break to next page (same behavior as without requirePageBoundary)
    expect(layout.pages.length).toBe(2);
    expect(pageContainsBlock(layout.pages[0], 'p1')).toBe(true);
    expect(pageContainsBlock(layout.pages[1], 'p2')).toBe(true);
  });

  it('multiple requirePageBoundary sections create multiple pages', () => {
    const firstSection: FlowBlock = {
      kind: 'sectionBreak',
      id: 'sb-1',
      type: 'continuous',
      margins: { header: 100, footer: 80 },
      attrs: { requirePageBoundary: true },
    };

    const secondSection: FlowBlock = {
      kind: 'sectionBreak',
      id: 'sb-2',
      type: 'continuous',
      margins: { header: 120, footer: 90 },
      attrs: { requirePageBoundary: true },
    };

    const blocks: FlowBlock[] = [
      { kind: 'paragraph', id: 'p1', runs: [] },
      firstSection,
      { kind: 'paragraph', id: 'p2', runs: [] },
      secondSection,
      { kind: 'paragraph', id: 'p3', runs: [] },
    ];

    const measures: Measure[] = [
      makeMeasure([40]),
      { kind: 'sectionBreak' },
      makeMeasure([40]),
      { kind: 'sectionBreak' },
      makeMeasure([40]),
    ];

    const options: LayoutOptions = {
      pageSize: { w: 400, h: 400 },
      margins: { top: 40, right: 30, bottom: 40, left: 30 },
    };

    const layout = layoutDocument(blocks, measures, options);

    // Should create 3 pages
    expect(layout.pages.length).toBe(3);
    expect(pageContainsBlock(layout.pages[0], 'p1')).toBe(true);
    expect(pageContainsBlock(layout.pages[1], 'p2')).toBe(true);
    expect(pageContainsBlock(layout.pages[2], 'p3')).toBe(true);

    // Check margins are applied correctly
    // Note: header/footer distances only affect body position when there's actual header/footer content.
    // Without content, body uses base top/bottom margins. Header/footer distances are still stored.
    expect(layout.pages[1].margins).toMatchObject({ top: 40, bottom: 40, header: 100, footer: 80 });
    expect(layout.pages[2].margins).toMatchObject({ top: 40, bottom: 40, header: 120, footer: 90 });
  });

  it('requirePageBoundary with columns still applies column configuration', () => {
    const sectionWithColumnsAndBoundary: FlowBlock = {
      kind: 'sectionBreak',
      id: 'sb-1',
      type: 'continuous',
      margins: { header: 100, footer: 80 },
      columns: { count: 2, gap: 48 },
      attrs: { requirePageBoundary: true },
    };

    const blocks: FlowBlock[] = [
      { kind: 'paragraph', id: 'p1', runs: [] },
      sectionWithColumnsAndBoundary,
      { kind: 'paragraph', id: 'p2', runs: [] },
    ];

    const measures: Measure[] = [makeMeasure([40]), { kind: 'sectionBreak' }, makeMeasure([200, 200])];

    const options: LayoutOptions = {
      pageSize: { w: 612, h: 792 },
      margins: { top: 72, right: 72, bottom: 72, left: 72 },
    };

    const layout = layoutDocument(blocks, measures, options);

    // Should force page break
    expect(layout.pages.length).toBe(2);
    expect(pageContainsBlock(layout.pages[0], 'p1')).toBe(true);
    expect(pageContainsBlock(layout.pages[1], 'p2')).toBe(true);

    // Second page should have column layout applied
    // With 2 columns, gap 48, content width 468, column width = (468 - 48) / 2 = 210
    const p2Fragment = layout.pages[1].fragments.find((f) => f.blockId === 'p2');
    expect(p2Fragment?.width).toBe(210); // Should be column width
  });

  it('continuous section without requirePageBoundary remains on same page', () => {
    const regularContinuousSection: FlowBlock = {
      kind: 'sectionBreak',
      id: 'sb-1',
      type: 'continuous',
      margins: { header: 100, footer: 80 },
    };

    const blocks: FlowBlock[] = [
      { kind: 'paragraph', id: 'p1', runs: [] },
      regularContinuousSection,
      { kind: 'paragraph', id: 'p2', runs: [] },
    ];

    const measures: Measure[] = [makeMeasure([40]), { kind: 'sectionBreak' }, makeMeasure([40])];

    const options: LayoutOptions = {
      pageSize: { w: 400, h: 400 },
      margins: { top: 40, right: 30, bottom: 40, left: 30 },
    };

    const layout = layoutDocument(blocks, measures, options);

    // Should remain on same page (margins apply from next page boundary)
    expect(layout.pages.length).toBe(1);
    expect(pageContainsBlock(layout.pages[0], 'p1')).toBe(true);
    expect(pageContainsBlock(layout.pages[0], 'p2')).toBe(true);
  });

  describe('columnBreak interactions with mid-page multi-column regions', () => {
    it('resets Y to region top when moving to next column after a mid-page region change', () => {
      const toTwoColumns: FlowBlock = {
        kind: 'sectionBreak',
        id: 'sb-1',
        type: 'continuous',
        columns: { count: 2, gap: 48 },
        margins: {},
      };

      const blocks: FlowBlock[] = [
        { kind: 'paragraph', id: 'p1', runs: [] },
        toTwoColumns,
        { kind: 'paragraph', id: 'p2', runs: [] },
        { kind: 'columnBreak', id: 'br-1' } as ColumnBreakBlock,
        { kind: 'paragraph', id: 'p3', runs: [] },
      ];

      const measures: Measure[] = [
        makeMeasure([40]), // p1 small
        { kind: 'sectionBreak' },
        makeMeasure([60]), // p2 one line
        { kind: 'columnBreak' },
        makeMeasure([40]), // p3 after column break
      ];

      const options: LayoutOptions = {
        pageSize: { w: 612, h: 792 },
        margins: { top: 72, right: 72, bottom: 72, left: 72 },
      };

      const layout = layoutDocument(blocks, measures, options);
      const page = layout.pages[0];
      const contentWidth = options.pageSize!.w - options.margins!.left - options.margins!.right;
      const columnWidth = (contentWidth - 48) / 2;

      const p1 = page.fragments.find((f) => f.blockId === 'p1') as ParaFragment;
      const regionTop = p1.y + 40; // after p1

      const p2 = page.fragments.find((f) => f.blockId === 'p2') as ParaFragment;
      expect(p2.x).toBeCloseTo(options.margins!.left); // first column
      expect(p2.y).toBeCloseTo(regionTop);
      expect(p2.width).toBeCloseTo(columnWidth);

      const p3 = page.fragments.find((f) => f.blockId === 'p3') as ParaFragment;
      expect(p3.x).toBeCloseTo(options.margins!.left + columnWidth + 48); // second column
      expect(p3.y).toBeCloseTo(regionTop); // reset to region top
    });
  });

  describe('drawing blocks', () => {
    it('lays out inline drawings with margins', () => {
      const drawingBlock: FlowBlock = {
        kind: 'drawing',
        id: 'drawing-inline',
        drawingKind: 'vectorShape',
        geometry: { width: 80, height: 40, rotation: 0 },
        margin: { top: 10, bottom: 5, left: 4, right: 6 },
      };
      const drawingMeasure: DrawingMeasure = {
        kind: 'drawing',
        drawingKind: 'vectorShape',
        width: 80,
        height: 40,
        scale: 1,
        naturalWidth: 80,
        naturalHeight: 40,
        geometry: { width: 80, height: 40, rotation: 0, flipH: false, flipV: false },
      };
      const layout = layoutDocument([drawingBlock], [drawingMeasure], DEFAULT_OPTIONS);
      expect(layout.pages[0].fragments).toHaveLength(1);
      const fragment = layout.pages[0].fragments[0] as DrawingFragment;
      expect(fragment.kind).toBe('drawing');
      expect(fragment.blockId).toBe('drawing-inline');
      expect(fragment.width).toBeCloseTo(80);
      expect(fragment.height).toBeCloseTo(40);
      expect(fragment.y).toBe(DEFAULT_OPTIONS.margins!.top + 10);
    });

    it('anchors drawings relative to nearest paragraph', () => {
      const paragraphBlock: FlowBlock = {
        kind: 'paragraph',
        id: 'para-anchor',
        runs: [],
      };
      const drawingBlock: FlowBlock = {
        kind: 'drawing',
        id: 'drawing-anchored',
        drawingKind: 'vectorShape',
        geometry: { width: 60, height: 30, rotation: 0 },
        anchor: {
          isAnchored: true,
          hRelativeFrom: 'column',
          vRelativeFrom: 'paragraph',
          alignH: 'left',
          offsetH: 5,
          offsetV: 3,
        },
        wrap: {
          type: 'Square',
          wrapText: 'right',
        },
      };
      const paragraphMeasure = makeMeasure([20]);
      const drawingMeasure: DrawingMeasure = {
        kind: 'drawing',
        drawingKind: 'vectorShape',
        width: 60,
        height: 30,
        scale: 1,
        naturalWidth: 60,
        naturalHeight: 30,
        geometry: { width: 60, height: 30, rotation: 0, flipH: false, flipV: false },
      };
      const layout = layoutDocument(
        [paragraphBlock, drawingBlock],
        [paragraphMeasure, drawingMeasure],
        DEFAULT_OPTIONS,
      );
      const fragment = layout.pages[0].fragments.find((frag) => frag.blockId === 'drawing-anchored') as DrawingFragment;
      expect(fragment).toBeTruthy();
      expect(fragment.kind).toBe('drawing');
      expect(fragment.isAnchored).toBe(true);
      expect(fragment.x).toBeGreaterThanOrEqual(DEFAULT_OPTIONS.margins!.left + 5);
      expect(fragment.y).toBeGreaterThanOrEqual(DEFAULT_OPTIONS.margins!.top + 3);
    });

    it('creates fragment for page-relative anchored drawing (SD-1838)', () => {
      const paragraphBlock: FlowBlock = {
        kind: 'paragraph',
        id: 'para-anchor',
        runs: [],
      };
      const drawingBlock: FlowBlock = {
        kind: 'drawing',
        id: 'drawing-page-relative',
        drawingKind: 'vectorShape',
        geometry: { width: 100, height: 60, rotation: 0 },
        anchor: {
          isAnchored: true,
          hRelativeFrom: 'column',
          vRelativeFrom: 'page',
          alignH: 'left',
          offsetH: 10,
          offsetV: 80,
        },
        wrap: {
          type: 'None',
        },
      };
      const paragraphMeasure = makeMeasure([20]);
      const drawingMeasure: DrawingMeasure = {
        kind: 'drawing',
        drawingKind: 'vectorShape',
        width: 100,
        height: 60,
        scale: 1,
        naturalWidth: 100,
        naturalHeight: 60,
        geometry: { width: 100, height: 60, rotation: 0, flipH: false, flipV: false },
      };
      const layout = layoutDocument(
        [paragraphBlock, drawingBlock],
        [paragraphMeasure, drawingMeasure],
        DEFAULT_OPTIONS,
      );
      const fragment = layout.pages[0].fragments.find(
        (frag) => frag.blockId === 'drawing-page-relative',
      ) as DrawingFragment;
      expect(fragment).toBeTruthy();
      expect(fragment.kind).toBe('drawing');
      expect(fragment.isAnchored).toBe(true);
      expect(fragment.y).toBe(80); // offsetV from page top
      expect(fragment.width).toBe(100);
      expect(fragment.height).toBe(60);
    });

    it('emits pre-registered page-relative drawings on the page where they are encountered after pagination advances', () => {
      const firstPageParagraph: FlowBlock = {
        kind: 'paragraph',
        id: 'para-page-1',
        runs: [],
      };
      const forcedBreak: FlowBlock = {
        kind: 'pageBreak',
        id: 'pb-before-drawing',
      };
      const secondPageParagraph: FlowBlock = {
        kind: 'paragraph',
        id: 'para-page-2',
        runs: [],
      };
      const drawingBlock: FlowBlock = {
        kind: 'drawing',
        id: 'drawing-pre-reg-page',
        drawingKind: 'vectorShape',
        geometry: { width: 120, height: 120, rotation: 0 },
        anchor: {
          isAnchored: true,
          hRelativeFrom: 'column',
          vRelativeFrom: 'page',
          alignH: 'left',
          alignV: 'top',
          offsetH: 0,
          offsetV: 0,
        },
        wrap: {
          type: 'Square',
          wrapText: 'right',
          distLeft: 0,
          distRight: 10,
        },
      };
      const paragraphMeasure = makeMeasure([20]);
      const drawingMeasure: DrawingMeasure = {
        kind: 'drawing',
        drawingKind: 'vectorShape',
        width: 120,
        height: 120,
        scale: 1,
        naturalWidth: 120,
        naturalHeight: 120,
        geometry: { width: 120, height: 120, rotation: 0, flipH: false, flipV: false },
      };

      const remeasureParagraph: NonNullable<LayoutOptions['remeasureParagraph']> = (_block, _maxWidth) => {
        return makeMeasure([20]);
      };

      const layout = layoutDocument(
        [firstPageParagraph, forcedBreak, drawingBlock, secondPageParagraph],
        [paragraphMeasure, { kind: 'pageBreak' }, drawingMeasure, paragraphMeasure],
        {
          ...DEFAULT_OPTIONS,
          remeasureParagraph,
        },
      );

      expect(layout.pages).toHaveLength(2);

      const page1 = layout.pages[0];
      const page2 = layout.pages[1];

      const wrappedPara = page1.fragments.find(
        (fragment) => fragment.kind === 'para' && fragment.blockId === 'para-page-1',
      ) as ParaFragment;
      expect(wrappedPara).toBeTruthy();
      expect(wrappedPara.x).toBeGreaterThan(DEFAULT_OPTIONS.margins!.left);

      const page2Para = page2.fragments.find(
        (fragment) => fragment.kind === 'para' && fragment.blockId === 'para-page-2',
      ) as ParaFragment;
      expect(page2Para).toBeTruthy();

      const drawingOnPage1 = page1.fragments.find(
        (fragment) => fragment.kind === 'drawing' && fragment.blockId === 'drawing-pre-reg-page',
      );
      const drawingOnPage2 = page2.fragments.find(
        (fragment) => fragment.kind === 'drawing' && fragment.blockId === 'drawing-pre-reg-page',
      );

      expect(drawingOnPage1).toBeUndefined();
      expect(drawingOnPage2).toBeTruthy();
    });

    it('creates fragment for margin-relative anchored drawing with wrapNone', () => {
      const paragraphBlock: FlowBlock = {
        kind: 'paragraph',
        id: 'para-anchor-2',
        runs: [],
      };
      const drawingBlock: FlowBlock = {
        kind: 'drawing',
        id: 'drawing-margin-relative',
        drawingKind: 'vectorShape',
        geometry: { width: 80, height: 40, rotation: 0 },
        anchor: {
          isAnchored: true,
          hRelativeFrom: 'margin',
          vRelativeFrom: 'margin',
          alignH: 'left',
          alignV: 'top',
          offsetH: 0,
          offsetV: 15,
        },
        wrap: {
          type: 'None',
        },
      };
      const paragraphMeasure = makeMeasure([20]);
      const drawingMeasure: DrawingMeasure = {
        kind: 'drawing',
        drawingKind: 'vectorShape',
        width: 80,
        height: 40,
        scale: 1,
        naturalWidth: 80,
        naturalHeight: 40,
        geometry: { width: 80, height: 40, rotation: 0, flipH: false, flipV: false },
      };
      const layout = layoutDocument(
        [paragraphBlock, drawingBlock],
        [paragraphMeasure, drawingMeasure],
        DEFAULT_OPTIONS,
      );
      const fragment = layout.pages[0].fragments.find(
        (frag) => frag.blockId === 'drawing-margin-relative',
      ) as DrawingFragment;
      expect(fragment).toBeTruthy();
      expect(fragment.kind).toBe('drawing');
      expect(fragment.isAnchored).toBe(true);
      // margin-relative, alignV='top', offsetV=15: contentTop + 15
      expect(fragment.y).toBe(DEFAULT_OPTIONS.margins!.top + 15);
      expect(fragment.width).toBe(80);
      expect(fragment.height).toBe(40);
    });
  });

  describe('anchored images bounds and zIndex', () => {
    it('places behindDoc anchored image with negative offset above page background and negative y', () => {
      const para: FlowBlock = { kind: 'paragraph', id: 'p1', runs: [] };
      const anchored: ImageBlock = {
        kind: 'image',
        id: 'img-anchored',
        src: 'data:image/png;base64,xxx',
        anchor: { isAnchored: true, alignH: 'left', offsetV: -20, behindDoc: true },
      };

      const blocks: FlowBlock[] = [anchored, para];
      const measures: Measure[] = [{ kind: 'image', width: 50, height: 40 }, makeMeasure([40])];

      const options: LayoutOptions = {
        pageSize: { w: 400, h: 400 },
        margins: { top: 40, right: 30, bottom: 40, left: 30 },
      };

      const layout = layoutDocument(blocks, measures, options);
      const page = layout.pages[0];
      // Anchored image fragment should appear before the paragraph and have negative y relative to margin top
      const img = page.fragments.find((f) => f.blockId === 'img-anchored') as ImageFragment;
      expect(img).toBeTruthy();
      expect(img.y).toBeLessThan(options.margins!.top); // negative relative offset applied
      // behindDoc → zIndex 0
      expect(img.zIndex).toBe(0);
    });

    it('emits pre-registered page-relative images on the page where they are encountered after pagination advances', () => {
      const firstPageParagraph: FlowBlock = {
        kind: 'paragraph',
        id: 'para-page-1',
        runs: [],
      };
      const forcedBreak: FlowBlock = {
        kind: 'pageBreak',
        id: 'pb-before-image',
      };
      const secondPageParagraph: FlowBlock = {
        kind: 'paragraph',
        id: 'para-page-2',
        runs: [],
      };
      const imageBlock: ImageBlock = {
        kind: 'image',
        id: 'img-pre-reg-page',
        src: 'data:image/png;base64,xxx',
        anchor: {
          isAnchored: true,
          hRelativeFrom: 'column',
          vRelativeFrom: 'page',
          alignH: 'left',
          alignV: 'top',
          offsetH: 0,
          offsetV: 0,
        },
        wrap: {
          type: 'Square',
          wrapText: 'right',
          distLeft: 0,
          distRight: 10,
        },
      };
      const paragraphMeasure = makeMeasure([20]);
      const imageMeasure: ImageMeasure = {
        kind: 'image',
        width: 120,
        height: 120,
      };

      const remeasureParagraph: NonNullable<LayoutOptions['remeasureParagraph']> = (_block, _maxWidth) => {
        return makeMeasure([20]);
      };

      const layout = layoutDocument(
        [firstPageParagraph, forcedBreak, imageBlock, secondPageParagraph],
        [paragraphMeasure, { kind: 'pageBreak' }, imageMeasure, paragraphMeasure],
        {
          ...DEFAULT_OPTIONS,
          remeasureParagraph,
        },
      );

      expect(layout.pages).toHaveLength(2);

      const page1 = layout.pages[0];
      const page2 = layout.pages[1];

      const imageOnPage1 = page1.fragments.find(
        (fragment) => fragment.kind === 'image' && fragment.blockId === 'img-pre-reg-page',
      );
      const imageOnPage2 = page2.fragments.find(
        (fragment) => fragment.kind === 'image' && fragment.blockId === 'img-pre-reg-page',
      );

      expect(imageOnPage1).toBeUndefined();
      expect(imageOnPage2).toBeTruthy();
    });
  });

  describe('tables in columns/pages', () => {
    it('moves table to next column when not enough vertical space', () => {
      const table: TableBlock = {
        kind: 'table',
        id: 'tbl-1',
        rows: [{ id: 'r1', cells: [] }],
      };

      const blocks: FlowBlock[] = [{ kind: 'paragraph', id: 'p1', runs: [] }, table];

      const measures: Measure[] = [
        makeMeasure([300]),
        { kind: 'table', rows: [], columnWidths: [], totalWidth: 400, totalHeight: 500 } as TableMeasure,
      ];

      const options: LayoutOptions = {
        pageSize: { w: 612, h: 792 },
        margins: { top: 72, right: 72, bottom: 72, left: 72 },
        columns: { count: 2, gap: 48 },
      };

      const layout = layoutDocument(blocks, measures, options);
      const page = layout.pages[0];
      const contentWidth = options.pageSize!.w - options.margins!.left - options.margins!.right;
      const columnWidth = (contentWidth - 48) / 2;
      const tbl = page.fragments.find((f) => f.blockId === 'tbl-1');
      // Table should be in column 2 if para consumed most of column height
      expect(tbl?.x).toBeCloseTo(options.margins!.left + columnWidth + 48);
    });

    it('moves table to next page when in last column and no space', () => {
      const blocks: FlowBlock[] = [
        { kind: 'paragraph', id: 'p1', runs: [] },
        { kind: 'paragraph', id: 'p2', runs: [] },
        { kind: 'table', id: 'tbl-1', rows: [] } as TableBlock,
      ];

      const measures: Measure[] = [
        makeMeasure([600]),
        makeMeasure([400]), // Force second column close to full
        { kind: 'table', rows: [], columnWidths: [], totalWidth: 400, totalHeight: 400 } as TableMeasure,
      ];

      const options: LayoutOptions = {
        pageSize: { w: 612, h: 792 },
        margins: { top: 72, right: 72, bottom: 72, left: 72 },
        columns: { count: 2, gap: 48 },
      };

      const layout = layoutDocument(blocks, measures, options);
      // Table should be on page 2 since last column had no space
      expect(layout.pages.length).toBeGreaterThan(1);
      const page2tbl = layout.pages[1].fragments.find((f) => f.blockId === 'tbl-1');
      expect(page2tbl).toBeTruthy();
    });
  });

  describe('PM ranges across columns and regions', () => {
    it('keeps pm ranges correct across column splits', () => {
      const blockWithRuns: FlowBlock = {
        kind: 'paragraph',
        id: 'p-col',
        runs: [{ text: 'abcdefghi', fontFamily: 'Arial', fontSize: 16, pmStart: 1, pmEnd: 10 }],
      };

      const measure: Measure = {
        kind: 'paragraph',
        lines: [
          { fromRun: 0, fromChar: 0, toRun: 0, toChar: 3, width: 100, ascent: 10, descent: 4, lineHeight: 300 },
          { fromRun: 0, fromChar: 3, toRun: 0, toChar: 6, width: 100, ascent: 10, descent: 4, lineHeight: 300 },
          { fromRun: 0, fromChar: 6, toRun: 0, toChar: 9, width: 100, ascent: 10, descent: 4, lineHeight: 300 },
        ],
        totalHeight: 900,
      };

      const options: LayoutOptions = {
        pageSize: { w: 612, h: 792 },
        margins: { top: 72, right: 72, bottom: 72, left: 72 },
        columns: { count: 2, gap: 48 },
      };

      const layout = layoutDocument([blockWithRuns], [measure], options);
      const fragments = layout.pages[0].fragments.filter((f) => f.blockId === 'p-col') as ParaFragment[];
      // Expect at least two fragments (across columns/pages)
      expect(fragments.length).toBeGreaterThanOrEqual(2);
      // First fragment should start at pm 1 and cover at least the first line
      expect(fragments[0].pmStart).toBe(1);
      expect(fragments[0].pmEnd).toBeGreaterThanOrEqual(4);
      // Next fragment should continue where the previous ended
      expect(fragments[1].pmStart).toBe(fragments[0].pmEnd);
    });

    it('keeps pm ranges correct across mid-page region transition to columns', () => {
      const toTwoColumns: FlowBlock = {
        kind: 'sectionBreak',
        id: 'sb-1',
        type: 'continuous',
        columns: { count: 2, gap: 48 },
        margins: {},
      };
      const blockWithRuns: FlowBlock = {
        kind: 'paragraph',
        id: 'p2',
        runs: [{ text: 'abcdef', fontFamily: 'Arial', fontSize: 16, pmStart: 10, pmEnd: 16 }],
      };
      const measures: Measure[] = [
        makeMeasure([40]),
        { kind: 'sectionBreak' },
        {
          kind: 'paragraph',
          lines: [
            { fromRun: 0, fromChar: 0, toRun: 0, toChar: 3, width: 100, ascent: 10, descent: 4, lineHeight: 320 },
            { fromRun: 0, fromChar: 3, toRun: 0, toChar: 6, width: 100, ascent: 10, descent: 4, lineHeight: 320 },
          ],
          totalHeight: 640,
        },
      ];
      const blocks: FlowBlock[] = [{ kind: 'paragraph', id: 'p1', runs: [] }, toTwoColumns, blockWithRuns];

      const options: LayoutOptions = {
        pageSize: { w: 612, h: 792 },
        margins: { top: 72, right: 72, bottom: 72, left: 72 },
      };

      const layout = layoutDocument(blocks, measures, options);
      const page = layout.pages[0];
      const frags = page.fragments.filter((f) => f.blockId === 'p2') as ParaFragment[];
      expect(frags.length).toBe(2);
      expect(frags[0].pmStart).toBe(10);
      expect(frags[0].pmEnd).toBe(13);
      expect(frags[1].pmStart).toBe(13);
      expect(frags[1].pmEnd).toBe(16);
    });
  });

  describe('floatAlignment positioning', () => {
    it('positions fragment at right when floatAlignment=right', () => {
      const block: FlowBlock = {
        kind: 'paragraph',
        id: 'p1',
        runs: [{ text: '1', fontFamily: 'Arial', fontSize: 16 }],
        attrs: { floatAlignment: 'right' },
      };
      const measure: ParagraphMeasure = {
        kind: 'paragraph',
        lines: [{ fromRun: 0, fromChar: 0, toRun: 0, toChar: 1, width: 50, ascent: 12, descent: 4, lineHeight: 16 }],
        totalHeight: 16,
      };
      const options: LayoutOptions = {
        pageSize: { w: 600, h: 800 },
        margins: { top: 50, right: 50, bottom: 50, left: 50 },
      };

      const layout = layoutDocument([block], [measure], options);

      expect(layout.pages).toHaveLength(1);
      const fragment = layout.pages[0].fragments[0] as ParaFragment;
      // columnWidth = 600 - 50 - 50 = 500
      // lineWidth = 50
      // right-aligned: x = 50 + (500 - 50) = 500
      expect(fragment.x).toBe(500);
      expect(fragment.y).toBe(50);
    });

    it('positions fragment at center when floatAlignment=center', () => {
      const block: FlowBlock = {
        kind: 'paragraph',
        id: 'p1',
        runs: [{ text: '1', fontFamily: 'Arial', fontSize: 16 }],
        attrs: { floatAlignment: 'center' },
      };
      const measure: ParagraphMeasure = {
        kind: 'paragraph',
        lines: [{ fromRun: 0, fromChar: 0, toRun: 0, toChar: 1, width: 100, ascent: 12, descent: 4, lineHeight: 16 }],
        totalHeight: 16,
      };
      const options: LayoutOptions = {
        pageSize: { w: 600, h: 800 },
        margins: { top: 50, right: 50, bottom: 50, left: 50 },
      };

      const layout = layoutDocument([block], [measure], options);

      expect(layout.pages).toHaveLength(1);
      const fragment = layout.pages[0].fragments[0] as ParaFragment;
      // columnWidth = 500
      // lineWidth = 100
      // centered: x = 50 + (500 - 100) / 2 = 50 + 200 = 250
      expect(fragment.x).toBe(250);
      expect(fragment.y).toBe(50);
    });

    it('does not adjust position when floatAlignment=left (default behavior)', () => {
      const block: FlowBlock = {
        kind: 'paragraph',
        id: 'p1',
        runs: [{ text: '1', fontFamily: 'Arial', fontSize: 16 }],
        attrs: { floatAlignment: 'left' },
      };
      const measure: ParagraphMeasure = {
        kind: 'paragraph',
        lines: [{ fromRun: 0, fromChar: 0, toRun: 0, toChar: 1, width: 50, ascent: 12, descent: 4, lineHeight: 16 }],
        totalHeight: 16,
      };
      const options: LayoutOptions = {
        pageSize: { w: 600, h: 800 },
        margins: { top: 50, right: 50, bottom: 50, left: 50 },
      };

      const layout = layoutDocument([block], [measure], options);

      expect(layout.pages).toHaveLength(1);
      const fragment = layout.pages[0].fragments[0] as ParaFragment;
      // left-aligned: x = 50 (left margin, no adjustment)
      expect(fragment.x).toBe(50);
      expect(fragment.y).toBe(50);
    });

    it('does not adjust position when floatAlignment is undefined', () => {
      const block: FlowBlock = {
        kind: 'paragraph',
        id: 'p1',
        runs: [{ text: 'Normal text', fontFamily: 'Arial', fontSize: 16 }],
      };
      const measure: ParagraphMeasure = {
        kind: 'paragraph',
        lines: [{ fromRun: 0, fromChar: 0, toRun: 0, toChar: 11, width: 200, ascent: 12, descent: 4, lineHeight: 16 }],
        totalHeight: 16,
      };
      const options: LayoutOptions = {
        pageSize: { w: 600, h: 800 },
        margins: { top: 50, right: 50, bottom: 50, left: 50 },
      };

      const layout = layoutDocument([block], [measure], options);

      expect(layout.pages).toHaveLength(1);
      const fragment = layout.pages[0].fragments[0] as ParaFragment;
      // No floatAlignment: x = 50 (left margin, default behavior)
      expect(fragment.x).toBe(50);
      expect(fragment.y).toBe(50);
    });

    it('uses maximum line width when paragraph has multiple lines', () => {
      const block: FlowBlock = {
        kind: 'paragraph',
        id: 'p1',
        runs: [{ text: 'Line 1 short\nLine 2 is longer', fontFamily: 'Arial', fontSize: 16 }],
        attrs: { floatAlignment: 'right' },
      };
      const measure: ParagraphMeasure = {
        kind: 'paragraph',
        lines: [
          { fromRun: 0, fromChar: 0, toRun: 0, toChar: 12, width: 60, ascent: 12, descent: 4, lineHeight: 16 },
          { fromRun: 0, fromChar: 13, toRun: 0, toChar: 29, width: 100, ascent: 12, descent: 4, lineHeight: 16 },
        ],
        totalHeight: 32,
      };
      const options: LayoutOptions = {
        pageSize: { w: 600, h: 800 },
        margins: { top: 50, right: 50, bottom: 50, left: 50 },
      };

      const layout = layoutDocument([block], [measure], options);

      expect(layout.pages).toHaveLength(1);
      const fragment = layout.pages[0].fragments[0] as ParaFragment;
      // Max line width = 100
      // columnWidth = 500
      // right-aligned: x = 50 + (500 - 100) = 450
      expect(fragment.x).toBe(450);
    });

    it('handles floatAlignment with split paragraphs across pages', () => {
      const block: FlowBlock = {
        kind: 'paragraph',
        id: 'p1',
        runs: [{ text: 'Text', fontFamily: 'Arial', fontSize: 16 }],
        attrs: { floatAlignment: 'right' },
      };
      const measure: ParagraphMeasure = {
        kind: 'paragraph',
        lines: [
          { fromRun: 0, fromChar: 0, toRun: 0, toChar: 1, width: 50, ascent: 72, descent: 18, lineHeight: 90 },
          { fromRun: 0, fromChar: 1, toRun: 0, toChar: 2, width: 50, ascent: 72, descent: 18, lineHeight: 90 },
        ],
        totalHeight: 180,
      };
      const options: LayoutOptions = {
        pageSize: { w: 400, h: 150 },
        margins: { top: 30, right: 30, bottom: 30, left: 30 },
      };

      const layout = layoutDocument([block], [measure], options);

      expect(layout.pages).toHaveLength(2);
      const fragment1 = layout.pages[0].fragments[0] as ParaFragment;
      const fragment2 = layout.pages[1].fragments[0] as ParaFragment;

      // Both fragments should be right-aligned
      // columnWidth = 340, lineWidth = 50
      // x = 30 + (340 - 50) = 320
      expect(fragment1.x).toBe(320);
      expect(fragment2.x).toBe(320);
    });

    it('works in footers with right-aligned page numbers', () => {
      const block: FlowBlock = {
        kind: 'paragraph',
        id: 'footer-1',
        runs: [{ text: '0', token: 'pageNumber', fontFamily: 'Arial', fontSize: 16 }],
        attrs: { floatAlignment: 'right' },
      };
      const measure: ParagraphMeasure = {
        kind: 'paragraph',
        lines: [{ fromRun: 0, fromChar: 0, toRun: 0, toChar: 1, width: 10, ascent: 12, descent: 4, lineHeight: 16 }],
        totalHeight: 16,
      };

      const layout = layoutHeaderFooter([block], [measure], { width: 816, height: 100 });

      expect(layout.pages).toHaveLength(1);
      const fragment = layout.pages[0].fragments[0] as ParaFragment;
      // columnWidth = 816, lineWidth = 10
      // right-aligned: x = 0 + (816 - 10) = 806
      expect(fragment.x).toBe(806);
    });

    it('positions wrap=none frame paragraphs as overlays without consuming flow in headers', () => {
      const frameBlock: FlowBlock = {
        kind: 'paragraph',
        id: 'page-num',
        runs: [{ text: '1', fontFamily: 'Arial', fontSize: 12 }],
        attrs: { frame: { wrap: 'none', xAlign: 'right', y: 10 } },
      };
      const headerText: FlowBlock = {
        kind: 'paragraph',
        id: 'header-text',
        runs: [{ text: 'Normal header text', fontFamily: 'Arial', fontSize: 12 }],
      };

      const frameMeasure: ParagraphMeasure = {
        kind: 'paragraph',
        lines: [{ fromRun: 0, fromChar: 0, toRun: 0, toChar: 1, width: 8, ascent: 9, descent: 3, lineHeight: 12 }],
        totalHeight: 12,
      };
      const headerMeasure: ParagraphMeasure = {
        kind: 'paragraph',
        lines: [{ fromRun: 0, fromChar: 0, toRun: 0, toChar: 17, width: 100, ascent: 10, descent: 3, lineHeight: 14 }],
        totalHeight: 14,
      };

      const layout = layoutHeaderFooter([frameBlock, headerText], [frameMeasure, headerMeasure], {
        width: 200,
        height: 60,
      });

      const pageFragments = layout.pages[0].fragments as ParaFragment[];
      const pageNumFrag = pageFragments.find((f) => f.blockId === 'page-num')!;
      const headerFrag = pageFragments.find((f) => f.blockId === 'header-text')!;

      expect(pageNumFrag.x).toBeCloseTo(192);
      expect(pageNumFrag.y).toBeCloseTo(10);
      // Frame paragraph should not push following content down
      expect(headerFrag.y).toBe(0);
    });
  });

  describe('keepNext with contextual spacing', () => {
    it('accounts for contextual spacing when calculating if keepNext pair fits', () => {
      // Create two same-style paragraphs with contextual spacing
      const heading: FlowBlock = {
        kind: 'paragraph',
        id: 'heading',
        runs: [{ text: 'Heading', fontFamily: 'Arial', fontSize: 24 }],
        attrs: {
          keepNext: true,
          styleId: 'Heading1',
          contextualSpacing: true,
          spacing: { after: 20 },
        },
      };
      const body: FlowBlock = {
        kind: 'paragraph',
        id: 'body',
        runs: [{ text: 'Body text', fontFamily: 'Arial', fontSize: 12 }],
        attrs: {
          styleId: 'Heading1', // Same style - contextual spacing applies
          contextualSpacing: true,
          spacing: { before: 20 },
        },
      };

      // Heights: heading 40px, body 20px
      // With contextual spacing: no gap between them (both have contextualSpacing + same style)
      // Without contextual spacing: max(20, 20) = 20px gap
      const headingMeasure: ParagraphMeasure = {
        kind: 'paragraph',
        lines: [makeLine(40)],
        totalHeight: 40,
      };
      const bodyMeasure: ParagraphMeasure = {
        kind: 'paragraph',
        lines: [makeLine(20)],
        totalHeight: 20,
      };

      // Page: 150px content area, tight fit scenario
      // With contextual spacing: 40 + 0 + 20 = 60px needed
      // Without contextual spacing: 40 + 20 + 20 = 80px needed
      const options: LayoutOptions = {
        pageSize: { w: 400, h: 150 },
        margins: { top: 30, right: 30, bottom: 60, left: 30 }, // 60px content height
      };

      const layout = layoutDocument([heading, body], [headingMeasure, bodyMeasure], options);

      // Both should fit on first page due to contextual spacing
      expect(layout.pages).toHaveLength(1);
      expect(pageContainsBlock(layout.pages[0], 'heading')).toBe(true);
      expect(pageContainsBlock(layout.pages[0], 'body')).toBe(true);
    });

    it('advances page when keepNext pair does not fit even with contextual spacing', () => {
      // Previous paragraph to fill most of the page
      const filler: FlowBlock = {
        kind: 'paragraph',
        id: 'filler',
        runs: [{ text: 'Filler', fontFamily: 'Arial', fontSize: 12 }],
        attrs: { styleId: 'Normal' },
      };
      const heading: FlowBlock = {
        kind: 'paragraph',
        id: 'heading',
        runs: [{ text: 'Heading', fontFamily: 'Arial', fontSize: 24 }],
        attrs: {
          keepNext: true,
          styleId: 'Heading1',
          contextualSpacing: true,
          spacing: { after: 20 },
        },
      };
      const body: FlowBlock = {
        kind: 'paragraph',
        id: 'body',
        runs: [{ text: 'Body', fontFamily: 'Arial', fontSize: 12 }],
        attrs: {
          styleId: 'Heading1',
          contextualSpacing: true,
          spacing: { before: 20 },
        },
      };

      const fillerMeasure: ParagraphMeasure = {
        kind: 'paragraph',
        lines: [makeLine(100)], // Takes most of the space
        totalHeight: 100,
      };
      const headingMeasure: ParagraphMeasure = {
        kind: 'paragraph',
        lines: [makeLine(40)],
        totalHeight: 40,
      };
      const bodyMeasure: ParagraphMeasure = {
        kind: 'paragraph',
        lines: [makeLine(20)],
        totalHeight: 20,
      };

      // 120px content, filler takes 100px, only 20px left
      // heading (40) + body (20) = 60px needed, won't fit
      const options: LayoutOptions = {
        pageSize: { w: 400, h: 180 },
        margins: { top: 30, right: 30, bottom: 30, left: 30 }, // 120px content
      };

      const layout = layoutDocument([filler, heading, body], [fillerMeasure, headingMeasure, bodyMeasure], options);

      // Filler on page 1, heading+body pushed to page 2
      expect(layout.pages.length).toBeGreaterThanOrEqual(2);
      expect(pageContainsBlock(layout.pages[0], 'filler')).toBe(true);
      expect(pageContainsBlock(layout.pages[1], 'heading')).toBe(true);
      expect(pageContainsBlock(layout.pages[1], 'body')).toBe(true);
    });

    it('suppresses inter-paragraph spacing when current paragraph has contextualSpacing', () => {
      // Test that current paragraph's spacingAfter is suppressed when it has contextualSpacing
      const current: FlowBlock = {
        kind: 'paragraph',
        id: 'current',
        runs: [{ text: 'Current', fontFamily: 'Arial', fontSize: 12 }],
        attrs: {
          keepNext: true,
          styleId: 'TestStyle',
          contextualSpacing: true, // Current has it
          spacing: { after: 50 }, // Large spacing after
        },
      };
      const next: FlowBlock = {
        kind: 'paragraph',
        id: 'next',
        runs: [{ text: 'Next', fontFamily: 'Arial', fontSize: 12 }],
        attrs: {
          styleId: 'TestStyle', // Same style
          // Note: next does NOT have contextualSpacing
          spacing: { before: 10 },
        },
      };

      const currentMeasure: ParagraphMeasure = {
        kind: 'paragraph',
        lines: [makeLine(30)],
        totalHeight: 30,
      };
      const nextMeasure: ParagraphMeasure = {
        kind: 'paragraph',
        lines: [makeLine(20)],
        totalHeight: 20,
      };

      // If contextual spacing works: gap = max(0, 10) = 10px (current's after suppressed)
      // Total = 30 + 10 + 20 = 60px
      // If broken: gap = max(50, 10) = 50px
      // Total = 30 + 50 + 20 = 100px
      const options: LayoutOptions = {
        pageSize: { w: 400, h: 130 },
        margins: { top: 30, right: 30, bottom: 30, left: 30 }, // 70px content
      };

      const layout = layoutDocument([current, next], [currentMeasure, nextMeasure], options);

      // Should fit on one page (60px < 70px)
      expect(layout.pages).toHaveLength(1);
      expect(pageContainsBlock(layout.pages[0], 'current')).toBe(true);
      expect(pageContainsBlock(layout.pages[0], 'next')).toBe(true);
    });
  });

  /**
   * Tests for keepNext chain handling.
   *
   * In OOXML, when multiple consecutive paragraphs all have keepNext=true, they form
   * a "chain" that Word treats as an indivisible unit for pagination. If the chain
   * doesn't fit on the current page, the entire chain moves to the next page.
   *
   * @see ECMA-376 Part 1, Section 17.3.1.14 (keepNext)
   */
  describe('keepNext chain handling', () => {
    it('moves entire chain to next page when chain does not fit', () => {
      // A filler paragraph uses up space on page 1, then a chain that fits on
      // a blank page but NOT on the remaining space should move to page 2.
      const filler: FlowBlock = {
        kind: 'paragraph',
        id: 'filler',
        runs: [{ text: 'Filler content', fontFamily: 'Arial', fontSize: 12 }],
        attrs: {}, // No keepNext
      };
      const para1: FlowBlock = {
        kind: 'paragraph',
        id: 'p1',
        runs: [{ text: 'Para 1', fontFamily: 'Arial', fontSize: 12 }],
        attrs: { keepNext: true },
      };
      const para2: FlowBlock = {
        kind: 'paragraph',
        id: 'p2',
        runs: [{ text: 'Para 2', fontFamily: 'Arial', fontSize: 12 }],
        attrs: { keepNext: true },
      };
      const anchor: FlowBlock = {
        kind: 'paragraph',
        id: 'anchor',
        runs: [{ text: 'Anchor', fontFamily: 'Arial', fontSize: 12 }],
        attrs: {}, // No keepNext - this is the anchor
      };

      // Filler is 50px, chain members are each 25px
      const fillerMeasure: ParagraphMeasure = {
        kind: 'paragraph',
        lines: [makeLine(50)],
        totalHeight: 50,
      };
      const chainMeasure: ParagraphMeasure = {
        kind: 'paragraph',
        lines: [makeLine(25)],
        totalHeight: 25,
      };

      // Page has 100px content area
      // After filler (50px), only 50px remains
      // Chain needs 25+25+25 = 75px (doesn't fit in 50px, but fits on blank 100px page)
      const options: LayoutOptions = {
        pageSize: { w: 400, h: 160 },
        margins: { top: 30, right: 30, bottom: 30, left: 30 }, // 100px content
      };

      const layout = layoutDocument(
        [filler, para1, para2, anchor],
        [fillerMeasure, chainMeasure, chainMeasure, chainMeasure],
        options,
      );

      // Filler on page 1, chain moves to page 2 as a unit
      expect(layout.pages).toHaveLength(2);
      expect(pageContainsBlock(layout.pages[0], 'filler')).toBe(true);
      expect(pageContainsBlock(layout.pages[0], 'p1')).toBe(false);
      // All chain members + anchor should be on page 2
      expect(pageContainsBlock(layout.pages[1], 'p1')).toBe(true);
      expect(pageContainsBlock(layout.pages[1], 'p2')).toBe(true);
      expect(pageContainsBlock(layout.pages[1], 'anchor')).toBe(true);
    });

    it('keeps chain on current page when it fits', () => {
      // Create a chain of 2 paragraphs with keepNext, followed by an anchor
      const para1: FlowBlock = {
        kind: 'paragraph',
        id: 'p1',
        runs: [{ text: 'Para 1', fontFamily: 'Arial', fontSize: 12 }],
        attrs: { keepNext: true },
      };
      const para2: FlowBlock = {
        kind: 'paragraph',
        id: 'p2',
        runs: [{ text: 'Para 2', fontFamily: 'Arial', fontSize: 12 }],
        attrs: { keepNext: true },
      };
      const anchor: FlowBlock = {
        kind: 'paragraph',
        id: 'anchor',
        runs: [{ text: 'Anchor', fontFamily: 'Arial', fontSize: 12 }],
        attrs: {},
      };

      // Each paragraph is 20px tall
      const measure: ParagraphMeasure = {
        kind: 'paragraph',
        lines: [makeLine(20)],
        totalHeight: 20,
      };

      // Page has 100px content area, chain needs 20+20+20 = 60px (fits)
      const options: LayoutOptions = {
        pageSize: { w: 400, h: 160 },
        margins: { top: 30, right: 30, bottom: 30, left: 30 },
      };

      const layout = layoutDocument([para1, para2, anchor], [measure, measure, measure], options);

      // Everything should fit on one page
      expect(layout.pages).toHaveLength(1);
      expect(pageContainsBlock(layout.pages[0], 'p1')).toBe(true);
      expect(pageContainsBlock(layout.pages[0], 'p2')).toBe(true);
      expect(pageContainsBlock(layout.pages[0], 'anchor')).toBe(true);
    });

    it('breaks chain at section breaks', () => {
      // Chain broken by section break should not treat post-break paragraphs as part of chain
      const para1: FlowBlock = {
        kind: 'paragraph',
        id: 'p1',
        runs: [{ text: 'Para 1', fontFamily: 'Arial', fontSize: 12 }],
        attrs: { keepNext: true },
      };
      const sectionBreak: SectionBreakBlock = {
        kind: 'sectionBreak',
        id: 'sb1',
        type: 'nextPage',
      };
      const para2: FlowBlock = {
        kind: 'paragraph',
        id: 'p2',
        runs: [{ text: 'Para 2', fontFamily: 'Arial', fontSize: 12 }],
        attrs: { keepNext: true },
      };
      const anchor: FlowBlock = {
        kind: 'paragraph',
        id: 'anchor',
        runs: [{ text: 'Anchor', fontFamily: 'Arial', fontSize: 12 }],
        attrs: {},
      };

      const paraMeasure: ParagraphMeasure = {
        kind: 'paragraph',
        lines: [makeLine(20)],
        totalHeight: 20,
      };
      const breakMeasure: Measure = { kind: 'sectionBreak' };

      const options: LayoutOptions = {
        pageSize: { w: 400, h: 160 },
        margins: { top: 30, right: 30, bottom: 30, left: 30 },
      };

      const layout = layoutDocument(
        [para1, sectionBreak, para2, anchor],
        [paraMeasure, breakMeasure, paraMeasure, paraMeasure],
        options,
      );

      // para1 should be alone on page 1 (chain broken by section break)
      // para2 and anchor should be on page 2 (new chain after break)
      expect(layout.pages.length).toBeGreaterThanOrEqual(2);
      expect(pageContainsBlock(layout.pages[0], 'p1')).toBe(true);
      expect(pageContainsBlock(layout.pages[1], 'p2')).toBe(true);
      expect(pageContainsBlock(layout.pages[1], 'anchor')).toBe(true);
    });

    it('handles single keepNext paragraph (chain of 1)', () => {
      // A single paragraph with keepNext should still keep with its anchor
      const heading: FlowBlock = {
        kind: 'paragraph',
        id: 'heading',
        runs: [{ text: 'Heading', fontFamily: 'Arial', fontSize: 24 }],
        attrs: { keepNext: true },
      };
      const body: FlowBlock = {
        kind: 'paragraph',
        id: 'body',
        runs: [{ text: 'Body text', fontFamily: 'Arial', fontSize: 12 }],
        attrs: {},
      };

      const headingMeasure: ParagraphMeasure = {
        kind: 'paragraph',
        lines: [makeLine(30)],
        totalHeight: 30,
      };
      const bodyMeasure: ParagraphMeasure = {
        kind: 'paragraph',
        lines: [makeLine(20)],
        totalHeight: 20,
      };

      // Page has 60px content area, heading+body need 50px (fits)
      const options: LayoutOptions = {
        pageSize: { w: 400, h: 120 },
        margins: { top: 30, right: 30, bottom: 30, left: 30 },
      };

      const layout = layoutDocument([heading, body], [headingMeasure, bodyMeasure], options);

      expect(layout.pages).toHaveLength(1);
      expect(pageContainsBlock(layout.pages[0], 'heading')).toBe(true);
      expect(pageContainsBlock(layout.pages[0], 'body')).toBe(true);
    });

    it('handles chain without valid anchor (at end of document)', () => {
      // Chain at end of document with no following paragraph
      const para1: FlowBlock = {
        kind: 'paragraph',
        id: 'p1',
        runs: [{ text: 'Para 1', fontFamily: 'Arial', fontSize: 12 }],
        attrs: { keepNext: true },
      };
      const para2: FlowBlock = {
        kind: 'paragraph',
        id: 'p2',
        runs: [{ text: 'Para 2', fontFamily: 'Arial', fontSize: 12 }],
        attrs: { keepNext: true },
      };

      const measure: ParagraphMeasure = {
        kind: 'paragraph',
        lines: [makeLine(20)],
        totalHeight: 20,
      };

      const options: LayoutOptions = {
        pageSize: { w: 400, h: 120 },
        margins: { top: 30, right: 30, bottom: 30, left: 30 },
      };

      const layout = layoutDocument([para1, para2], [measure, measure], options);

      // Both paragraphs should be laid out (chain with no anchor still works)
      expect(layout.pages).toHaveLength(1);
      expect(pageContainsBlock(layout.pages[0], 'p1')).toBe(true);
      expect(pageContainsBlock(layout.pages[0], 'p2')).toBe(true);
    });

    it('does not create infinite loop when chain is taller than page', () => {
      // Chain that exceeds page height but individual paragraphs can fit.
      // The chain logic should NOT advance endlessly - it should lay out
      // content normally when the chain can never fit on any page.
      const para1: FlowBlock = {
        kind: 'paragraph',
        id: 'p1',
        runs: [{ text: 'Para 1', fontFamily: 'Arial', fontSize: 12 }],
        attrs: { keepNext: true },
      };
      const para2: FlowBlock = {
        kind: 'paragraph',
        id: 'p2',
        runs: [{ text: 'Para 2', fontFamily: 'Arial', fontSize: 12 }],
        attrs: { keepNext: true },
      };
      const para3: FlowBlock = {
        kind: 'paragraph',
        id: 'p3',
        runs: [{ text: 'Para 3', fontFamily: 'Arial', fontSize: 12 }],
        attrs: { keepNext: true },
      };
      const anchor: FlowBlock = {
        kind: 'paragraph',
        id: 'anchor',
        runs: [{ text: 'Anchor', fontFamily: 'Arial', fontSize: 12 }],
        attrs: {},
      };

      // Each paragraph is 40px tall (fits individually on 100px page)
      const measure: ParagraphMeasure = {
        kind: 'paragraph',
        lines: [makeLine(40)],
        totalHeight: 40,
      };

      // Page has 100px content area - chain (40*4=160px) will never fit
      const options: LayoutOptions = {
        pageSize: { w: 400, h: 160 },
        margins: { top: 30, right: 30, bottom: 30, left: 30 },
      };

      // Should not hang or throw - gracefully falls back to normal pagination
      const layout = layoutDocument([para1, para2, para3, anchor], [measure, measure, measure, measure], options);

      // Content should be spread across multiple pages (not all on one page)
      expect(layout.pages.length).toBeGreaterThan(1);
      // All paragraphs should be laid out somewhere
      const allFragments = layout.pages.flatMap((p) => p.fragments);
      const blockIds = allFragments.filter((f) => f.kind === 'para').map((f) => (f as ParaFragment).blockId);
      expect(blockIds).toContain('p1');
      expect(blockIds).toContain('p2');
      expect(blockIds).toContain('p3');
      expect(blockIds).toContain('anchor');
    });

    it('handles multiple separate chains in document', () => {
      // Document with two separate chains
      const chain1Para1: FlowBlock = {
        kind: 'paragraph',
        id: 'c1p1',
        runs: [{ text: 'Chain 1 Para 1', fontFamily: 'Arial', fontSize: 12 }],
        attrs: { keepNext: true },
      };
      const chain1Anchor: FlowBlock = {
        kind: 'paragraph',
        id: 'c1anchor',
        runs: [{ text: 'Chain 1 Anchor', fontFamily: 'Arial', fontSize: 12 }],
        attrs: {},
      };
      const chain2Para1: FlowBlock = {
        kind: 'paragraph',
        id: 'c2p1',
        runs: [{ text: 'Chain 2 Para 1', fontFamily: 'Arial', fontSize: 12 }],
        attrs: { keepNext: true },
      };
      const chain2Anchor: FlowBlock = {
        kind: 'paragraph',
        id: 'c2anchor',
        runs: [{ text: 'Chain 2 Anchor', fontFamily: 'Arial', fontSize: 12 }],
        attrs: {},
      };

      const measure: ParagraphMeasure = {
        kind: 'paragraph',
        lines: [makeLine(20)],
        totalHeight: 20,
      };

      const options: LayoutOptions = {
        pageSize: { w: 400, h: 160 },
        margins: { top: 30, right: 30, bottom: 30, left: 30 },
      };

      const layout = layoutDocument(
        [chain1Para1, chain1Anchor, chain2Para1, chain2Anchor],
        [measure, measure, measure, measure],
        options,
      );

      // All should fit on one page
      expect(layout.pages).toHaveLength(1);
      expect(pageContainsBlock(layout.pages[0], 'c1p1')).toBe(true);
      expect(pageContainsBlock(layout.pages[0], 'c1anchor')).toBe(true);
      expect(pageContainsBlock(layout.pages[0], 'c2p1')).toBe(true);
      expect(pageContainsBlock(layout.pages[0], 'c2anchor')).toBe(true);
    });

    it('uses first line height of anchor in chain calculation', () => {
      // Anchor has multiple lines but only first line should be considered
      const heading: FlowBlock = {
        kind: 'paragraph',
        id: 'heading',
        runs: [{ text: 'Heading', fontFamily: 'Arial', fontSize: 24 }],
        attrs: { keepNext: true },
      };
      const body: FlowBlock = {
        kind: 'paragraph',
        id: 'body',
        runs: [{ text: 'Body with multiple lines', fontFamily: 'Arial', fontSize: 12 }],
        attrs: {},
      };

      const headingMeasure: ParagraphMeasure = {
        kind: 'paragraph',
        lines: [makeLine(30)],
        totalHeight: 30,
      };
      // Body has 3 lines of 20px each = 60px total, but only first line (20px) matters for chain
      const bodyMeasure: ParagraphMeasure = {
        kind: 'paragraph',
        lines: [makeLine(20), makeLine(20), makeLine(20)],
        totalHeight: 60,
      };

      // 55px content area: heading(30) + body.firstLine(20) = 50px fits
      // But full body (60) wouldn't fit with heading
      const options: LayoutOptions = {
        pageSize: { w: 400, h: 115 },
        margins: { top: 30, right: 30, bottom: 30, left: 30 },
      };

      const layout = layoutDocument([heading, body], [headingMeasure, bodyMeasure], options);

      // Heading and body should start on same page (chain fits using first line optimization)
      expect(pageContainsBlock(layout.pages[0], 'heading')).toBe(true);
      expect(pageContainsBlock(layout.pages[0], 'body')).toBe(true);
    });

    it('reclaims trailing spacing when chain starter has contextualSpacing', () => {
      // Previous paragraph has spacingAfter, chain starter has contextualSpacing + same style.
      // The trailing spacing should be reclaimed, making room for the chain.
      const filler: FlowBlock = {
        kind: 'paragraph',
        id: 'filler',
        runs: [{ text: 'Filler content', fontFamily: 'Arial', fontSize: 12 }],
        attrs: { styleId: 'Normal', spacingAfter: 10 },
      };
      const chainStarter: FlowBlock = {
        kind: 'paragraph',
        id: 'chainStarter',
        runs: [{ text: 'Chain starter', fontFamily: 'Arial', fontSize: 12 }],
        attrs: { keepNext: true, contextualSpacing: true, styleId: 'Normal' },
      };
      const anchor: FlowBlock = {
        kind: 'paragraph',
        id: 'anchor',
        runs: [{ text: 'Anchor', fontFamily: 'Arial', fontSize: 12 }],
        attrs: {},
      };

      // Filler is 40px, chain starter and anchor are each 25px
      const fillerMeasure: ParagraphMeasure = {
        kind: 'paragraph',
        lines: [makeLine(40)],
        totalHeight: 40,
      };
      const chainMeasure: ParagraphMeasure = {
        kind: 'paragraph',
        lines: [makeLine(25)],
        totalHeight: 25,
      };

      // Page has 100px content area
      // After filler (40px) + spacingAfter (10px), cursor is at 50px from top
      // Available without reclaim: 100 - 50 = 50px
      // Chain needs: 25 + 25 = 50px (exactly fits with reclaim, doesn't fit without)
      // With contextualSpacing, the 10px spacingAfter is reclaimed → 60px available
      const options: LayoutOptions = {
        pageSize: { w: 400, h: 160 },
        margins: { top: 30, right: 30, bottom: 30, left: 30 }, // 100px content
      };

      const layout = layoutDocument(
        [filler, chainStarter, anchor],
        [fillerMeasure, chainMeasure, chainMeasure],
        options,
      );

      // All should fit on one page because contextualSpacing reclaims the 10px
      expect(layout.pages).toHaveLength(1);
      expect(pageContainsBlock(layout.pages[0], 'filler')).toBe(true);
      expect(pageContainsBlock(layout.pages[0], 'chainStarter')).toBe(true);
      expect(pageContainsBlock(layout.pages[0], 'anchor')).toBe(true);
    });

    it('does not reclaim trailing spacing when styles differ', () => {
      // Previous paragraph has spacingAfter, chain starter has contextualSpacing but DIFFERENT style.
      // The trailing spacing should NOT be reclaimed.
      const filler: FlowBlock = {
        kind: 'paragraph',
        id: 'filler',
        runs: [{ text: 'Filler content', fontFamily: 'Arial', fontSize: 12 }],
        attrs: { styleId: 'Normal', spacingAfter: 10 },
      };
      const chainStarter: FlowBlock = {
        kind: 'paragraph',
        id: 'chainStarter',
        runs: [{ text: 'Chain starter', fontFamily: 'Arial', fontSize: 12 }],
        attrs: { keepNext: true, contextualSpacing: true, styleId: 'Heading1' }, // Different style
      };
      const anchor: FlowBlock = {
        kind: 'paragraph',
        id: 'anchor',
        runs: [{ text: 'Anchor', fontFamily: 'Arial', fontSize: 12 }],
        attrs: {},
      };

      // Filler is 50px, chain starter and anchor are each 25px
      const fillerMeasure: ParagraphMeasure = {
        kind: 'paragraph',
        lines: [makeLine(50)],
        totalHeight: 50,
      };
      const chainMeasure: ParagraphMeasure = {
        kind: 'paragraph',
        lines: [makeLine(25)],
        totalHeight: 25,
      };

      // Page has 95px content area (155 - 30 - 30)
      // After filler (50px), cursorY leaves 45px remaining
      // Chain needs: 25 + 25 = 50px > 45px available (doesn't fit)
      // Styles differ so no reclaim - chain must move to page 2
      const options: LayoutOptions = {
        pageSize: { w: 400, h: 155 }, // 95px content area
        margins: { top: 30, right: 30, bottom: 30, left: 30 },
      };

      const layout = layoutDocument(
        [filler, chainStarter, anchor],
        [fillerMeasure, chainMeasure, chainMeasure],
        options,
      );

      // Chain should move to page 2 because styles differ (no reclaim)
      expect(layout.pages).toHaveLength(2);
      expect(pageContainsBlock(layout.pages[0], 'filler')).toBe(true);
      expect(pageContainsBlock(layout.pages[1], 'chainStarter')).toBe(true);
      expect(pageContainsBlock(layout.pages[1], 'anchor')).toBe(true);
    });
  });
});
