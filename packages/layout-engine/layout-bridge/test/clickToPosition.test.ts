import { describe, it, expect } from 'vitest';
import { clickToPosition, hitTestPage, hitTestTableFragment } from '../src/index.ts';
import type { Layout, FlowBlock, Measure, Line, ParaFragment } from '@superdoc/contracts';
import {
  simpleLayout,
  blocks,
  measures,
  multiLineLayout,
  multiBlocks,
  multiMeasures,
  drawingLayout,
  drawingBlock,
  drawingMeasure,
  rowspanTableLayout,
  rowspanTableBlock,
  rowspanTableMeasure,
  buildTableFixtures,
  buildTableWithListFixtures,
  buildTableWithSdtFixtures,
} from './mock-data';

describe('clickToPosition', () => {
  it('maps point to PM position near start', () => {
    const result = clickToPosition(simpleLayout, blocks, measures, { x: 40, y: 60 });
    expect(result?.pos).toBeGreaterThanOrEqual(1);
    expect(result?.pos).toBeLessThan(5);
  });

  it('maps point to end of line when clicking near right edge', () => {
    const result = clickToPosition(simpleLayout, blocks, measures, { x: 320, y: 60 });
    expect(result?.pos).toBeGreaterThan(7);
  });

  it('handles multi-line layout', () => {
    const result = clickToPosition(multiLineLayout, multiBlocks, multiMeasures, { x: 50, y: 75 });
    expect(result?.pos).toBeGreaterThan(1);
    expect(result?.pos).toBeGreaterThan(9);
  });

  it('returns drawing position when clicking on drawing fragment', () => {
    const result = clickToPosition(drawingLayout, [drawingBlock], [drawingMeasure], { x: 70, y: 90 });
    expect(result?.blockId).toBe('drawing-0');
    expect(result?.pos).toBe(20);
  });
});

describe('hitTestPage with pageGap', () => {
  const twoPageLayout: Layout = {
    pageSize: { w: 400, h: 500 },
    pageGap: 24,
    pages: [
      { number: 1, fragments: [] },
      { number: 2, fragments: [] },
      { number: 3, fragments: [] },
    ],
  };

  it('correctly identifies page 0 with pageGap', () => {
    // Page 0 spans y: [0, 500)
    const result = hitTestPage(twoPageLayout, { x: 100, y: 250 });
    expect(result?.pageIndex).toBe(0);
  });

  it('correctly identifies page 1 with pageGap', () => {
    // Page 1 starts at y = 500 + 24 = 524, spans [524, 1024)
    const result = hitTestPage(twoPageLayout, { x: 100, y: 600 });
    expect(result?.pageIndex).toBe(1);
  });

  it('correctly identifies page 2 with pageGap', () => {
    // Page 2 starts at y = 2*(500 + 24) = 1048, spans [1048, 1548)
    const result = hitTestPage(twoPageLayout, { x: 100, y: 1100 });
    expect(result?.pageIndex).toBe(2);
  });

  it('snaps to nearest page when clicking in gap between pages', () => {
    // Gap between page 0 and 1 is [500, 524); should snap to nearest page center
    const result = hitTestPage(twoPageLayout, { x: 100, y: 510 });
    expect(result?.pageIndex).toBe(0);
  });

  it('handles zero pageGap correctly', () => {
    const layoutNoGap: Layout = {
      pageSize: { w: 400, h: 500 },
      pageGap: 0,
      pages: [
        { number: 1, fragments: [] },
        { number: 2, fragments: [] },
      ],
    };
    // Page 1 starts immediately at y = 500
    const result = hitTestPage(layoutNoGap, { x: 100, y: 500 });
    expect(result?.pageIndex).toBe(1);
  });

  it('handles undefined pageGap (defaults to 0)', () => {
    const layoutUndefinedGap: Layout = {
      pageSize: { w: 400, h: 500 },
      pages: [
        { number: 1, fragments: [] },
        { number: 2, fragments: [] },
      ],
    };
    // With no gap, page 1 starts at y = 500
    const result = hitTestPage(layoutUndefinedGap, { x: 100, y: 500 });
    expect(result?.pageIndex).toBe(1);
  });
});

describe('clickToPosition with fragment.lines', () => {
  // Tests for multi-column documents where fragments have remeasured lines
  // that differ from measure.lines.
  //
  // Example scenario - paragraph "Hello world" in a two-column layout:
  //
  // Original measure (full page width):     Remeasured for column width:
  // ┌────────────────────────────────┐      ┌──────────────┐
  // │ Hello world                    │      │ Hello        │  ← line 0
  // └────────────────────────────────┘      │ world        │  ← line 1
  //           (1 line)                      └──────────────┘
  //                                              (2 lines)
  //
  // measure.lines = [line0]                 fragment.lines = [line0, line1]
  //
  // The bug: using measure.lines with fragment.fromLine/toLine indices
  // caused out-of-bounds access when the fragment had more lines than measure.

  // ─────────────────────────────────────────────────────────────────────────────
  // REMEASURED LINES
  // ─────────────────────────────────────────────────────────────────────────────
  // These represent the line breaks after remeasuring at column width.
  // The paragraph "Hello world" wraps into two lines:
  //
  //   remeasuredLine1: "Hello "    (run 0, chars 0-5)
  //   remeasuredLine2: "world"     (run 0 char 5 → run 1 char 5)
  //
  //   ┌──────────────┐
  //   │ H e l l o    │  ← remeasuredLine1 (y: 0-20)
  //   │ w o r l d    │  ← remeasuredLine2 (y: 20-40)
  //   └──────────────┘
  //
  const remeasuredLine1: Line = {
    fromRun: 0,
    fromChar: 0,
    toRun: 0,
    toChar: 5, // "Hello" (5 chars, space trimmed)
    width: 100,
    ascent: 12,
    descent: 4,
    lineHeight: 20,
  };

  const remeasuredLine2: Line = {
    fromRun: 0,
    fromChar: 5, // continues from end of line 1
    toRun: 1,
    toChar: 5, // "world" (5 chars)
    width: 100,
    ascent: 12,
    descent: 4,
    lineHeight: 20,
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // FLOW BLOCK (ProseMirror content)
  // ─────────────────────────────────────────────────────────────────────────────
  // The source paragraph content with two runs:
  //
  //   run 0: "Hello "  (pmStart: 1, pmEnd: 7)
  //   run 1: "world"   (pmStart: 7, pmEnd: 12)
  //
  //   PM positions:  1  2  3  4  5  6  7  8  9  10 11 12
  //   Characters:    H  e  l  l  o     w  o  r  l  d
  //                  └─── run 0 ───┘   └─── run 1 ───┘
  //
  const twoColumnBlock: FlowBlock = {
    kind: 'paragraph',
    id: 'two-column-para',
    runs: [
      { text: 'Hello ', fontFamily: 'Arial', fontSize: 16, pmStart: 1, pmEnd: 7 },
      { text: 'world', fontFamily: 'Arial', fontSize: 16, pmStart: 7, pmEnd: 12 },
    ],
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // ORIGINAL MEASURE (full page width)
  // ─────────────────────────────────────────────────────────────────────────────
  // When measured at full page width, the entire paragraph fits on one line:
  //
  //   ┌────────────────────────────────────────┐
  //   │ H e l l o   w o r l d                  │  ← single line (y: 0-20)
  //   └────────────────────────────────────────┘
  //
  //   measure.lines.length = 1
  //
  const originalMeasure: Measure = {
    kind: 'paragraph',
    lines: [
      {
        fromRun: 0,
        fromChar: 0,
        toRun: 1,
        toChar: 5, // entire paragraph: "Hello world"
        width: 200,
        ascent: 12,
        descent: 4,
        lineHeight: 20,
      },
    ],
    totalHeight: 20,
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // FRAGMENT (positioned on page, with remeasured lines)
  // ─────────────────────────────────────────────────────────────────────────────
  // This fragment is placed in column 2 of a two-column layout.
  // It contains `lines` array with the remeasured line breaks.
  //
  // Page layout (600px wide):
  //
  //   x=0        x=290  x=310       x=600
  //   ┌──────────┐      ┌──────────┐
  //   │ Column 1 │      │ Column 2 │
  //   │          │      │┌────────┐│
  //   │          │      ││ Hello  ││ ← fragment at (300, 40)
  //   │          │      ││ world  ││
  //   │          │      │└────────┘│
  //   └──────────┘      └──────────┘
  //
  // THE BUG: fragment.fromLine=0, fragment.toLine=2 are indices into
  // fragment.lines (length 2), but the old code used these to access
  // measure.lines (length 1), causing measure.lines[1] → undefined
  //
  const fragmentWithRemeasuredLines: ParaFragment = {
    kind: 'para',
    blockId: 'two-column-para',
    fromLine: 0, // index into fragment.lines (NOT measure.lines)
    toLine: 2, // would be out-of-bounds for measure.lines!
    x: 300, // positioned in column 2
    y: 40,
    width: 150,
    pmStart: 1,
    pmEnd: 12,
    lines: [remeasuredLine1, remeasuredLine2], // the remeasured lines for this fragment
  };

  const twoColumnLayout: Layout = {
    pageSize: { w: 600, h: 800 },
    columns: { count: 2, gap: 20 },
    pages: [
      {
        number: 1,
        fragments: [fragmentWithRemeasuredLines],
      },
    ],
  };

  it('uses fragment.lines when available instead of measure.lines', () => {
    // ───────────────────────────────────────────────────────────────────────
    // Click in the first line of the fragment:
    //
    //   Click point: (350, 50)
    //
    //   Fragment at (300, 40):
    //   y=40  ┌──────────────┐
    //         │ Hello    ← * │  click y=50 hits line 1 (y: 40-60)
    //   y=60  │ world        │
    //   y=80  └──────────────┘
    //              x=350
    //
    // Without the fix: TypeError because measure.lines[1] is undefined
    // With the fix: uses fragment.lines to find line, returns valid position
    // ───────────────────────────────────────────────────────────────────────
    const result = clickToPosition(twoColumnLayout, [twoColumnBlock], [originalMeasure], { x: 350, y: 50 });

    expect(result).not.toBeNull();
    expect(result?.blockId).toBe('two-column-para');
    expect(result?.pos).toBeGreaterThanOrEqual(1);
    expect(result?.pos).toBeLessThanOrEqual(12);
  });

  it('correctly maps click position in second line of fragment with remeasured lines', () => {
    // ───────────────────────────────────────────────────────────────────────
    // Click in the second line of the fragment:
    //
    //   Click point: (350, 65)
    //
    //   Fragment at (300, 40):
    //   y=40  ┌──────────────┐
    //         │ Hello        │
    //   y=60  │ world    ← * │  click y=65 hits line 2 (y: 60-80)
    //   y=80  └──────────────┘
    //              x=350
    //
    // This tests that we correctly index into fragment.lines[1] ("world")
    // ───────────────────────────────────────────────────────────────────────
    const result = clickToPosition(twoColumnLayout, [twoColumnBlock], [originalMeasure], { x: 350, y: 65 });

    expect(result).not.toBeNull();
    expect(result?.blockId).toBe('two-column-para');
    // The click should map to a position in the second line's range ("world" starts at position 7)
    expect(result?.pos).toBeGreaterThanOrEqual(7);
    expect(result?.pos).toBeLessThanOrEqual(12);
  });

  it('handles fragment without lines array (uses measure.lines)', () => {
    // ───────────────────────────────────────────────────────────────────────
    // Fallback test: fragment WITHOUT remeasured lines
    //
    // When fragment.lines is absent, we fall back to measure.lines.
    // This is the common case for single-column layouts.
    //
    //   Fragment at (30, 40), width=200 (full width, no remeasure):
    //   y=40  ┌────────────────────────────────┐
    //         │ Hello world                ← * │  click y=50 hits line 1
    //   y=60  └────────────────────────────────┘
    //                    x=100
    //
    // ───────────────────────────────────────────────────────────────────────
    const fragmentWithoutLines: ParaFragment = {
      kind: 'para',
      blockId: 'two-column-para',
      fromLine: 0,
      toLine: 1,
      x: 30,
      y: 40,
      width: 200,
      pmStart: 1,
      pmEnd: 12,
      // No `lines` property - should fall back to measure.lines
    };

    const layoutWithoutFragmentLines: Layout = {
      pageSize: { w: 400, h: 500 },
      pages: [
        {
          number: 1,
          fragments: [fragmentWithoutLines],
        },
      ],
    };

    const result = clickToPosition(layoutWithoutFragmentLines, [twoColumnBlock], [originalMeasure], { x: 100, y: 50 });

    expect(result).not.toBeNull();
    expect(result?.blockId).toBe('two-column-para');
  });
});

describe('hitTestTableFragment with rowspan (SD-1626 / IT-22)', () => {
  // Table is at x:30, y:60, width:300, height:48
  // Row 0: y:60-84 (height 24) - has 3 cells
  // Row 1: y:84-108 (height 24) - has 2 cells starting at gridColumnStart=1

  it('selects first cell when clicking in rowspanned area, not last cell', () => {
    // Table structure:
    // Row 0: [Cell A (rowspan=2)] [Cell B] [Cell C]
    // Row 1:                      [Cell D] [Cell E]
    //
    // When clicking in the rowspanned area (column 0) on row 1,
    // the first cell in row 1 (Cell D at index 0) should be selected,
    // NOT the last cell (Cell E at index 1).

    // Click at x=80 (in column 0 area), y=90 (in row 1)
    const pageHit = hitTestPage(rowspanTableLayout, { x: 80, y: 90 });
    expect(pageHit).not.toBeNull();

    if (pageHit) {
      // x=80 -> localX=50 (in rowspanned area, column 0 is 0-100)
      // y=90 -> localY=30 (row 1 starts at y=24 relative to table)
      const result = hitTestTableFragment(pageHit, [rowspanTableBlock], [rowspanTableMeasure], { x: 80, y: 90 });

      expect(result).not.toBeNull();
      if (result) {
        // Should select first cell (index 0), not last cell (index 1)
        expect(result.cellColIndex).toBe(0);
        // Row should be 1 (the row we clicked on)
        expect(result.cellRowIndex).toBe(1);
      }
    }
  });

  it('still selects last cell when clicking right of all columns', () => {
    // Click at x=320 (right edge of table but still inside), y=90 (row 1)
    // Table ends at x=330, so x=320 is still inside
    const pageHit = hitTestPage(rowspanTableLayout, { x: 320, y: 90 });
    expect(pageHit).not.toBeNull();

    if (pageHit) {
      // x=320 -> localX=290 (right of all cells: col0=0-100, col1=100-200, col2=200-300)
      // But row 1 cells start at gridColumnStart=1, so they span 100-300
      // localX=290 is within cell at gridColumnStart=2 (200-300)
      const result = hitTestTableFragment(pageHit, [rowspanTableBlock], [rowspanTableMeasure], { x: 320, y: 90 });

      expect(result).not.toBeNull();
      if (result) {
        // Should select the cell at gridColumnStart=2 (last cell in row 1)
        expect(result.cellColIndex).toBe(1); // Last cell in row 1
        expect(result.cellRowIndex).toBe(1);
      }
    }
  });
});

describe('clickToPosition: table cell empty space', () => {
  // Table with tall cells (80px) but small text (18px line height).
  // Clicking in the empty space below the text line should still resolve
  // to a position in the table cell, NOT snap to a nearby paragraph.
  const { block: tableBlock, measure: tableMeasure } = buildTableFixtures({
    cellWidth: 200,
    cellHeight: 80,
    lineHeight: 18,
    pmStart: 50,
    pmEnd: 59,
  });

  // Paragraph above the table (snap-to-nearest candidate)
  const paraBlock: FlowBlock = {
    kind: 'paragraph',
    id: 'para-above',
    runs: [{ text: 'Above text', fontFamily: 'Arial', fontSize: 14, pmStart: 1, pmEnd: 11 }],
  };

  const paraMeasure: Measure = {
    kind: 'paragraph',
    lines: [
      {
        fromRun: 0,
        fromChar: 0,
        toRun: 0,
        toChar: 10,
        width: 80,
        ascent: 10,
        descent: 4,
        lineHeight: 20,
      },
    ],
    totalHeight: 20,
  };

  // Layout: paragraph at y=30 (height=20), table at y=70 (height=80)
  const layout: Layout = {
    pageSize: { w: 400, h: 500 },
    pages: [
      {
        number: 1,
        fragments: [
          {
            kind: 'para',
            blockId: 'para-above',
            fromLine: 0,
            toLine: 1,
            x: 30,
            y: 30,
            width: 300,
            pmStart: 1,
            pmEnd: 11,
          },
          {
            kind: 'table',
            blockId: 'table-block',
            fromRow: 0,
            toRow: 1,
            x: 30,
            y: 70,
            width: 200,
            height: 80,
          },
        ],
      },
    ],
  };

  const allBlocks = [paraBlock, tableBlock];
  const allMeasures = [paraMeasure, tableMeasure];

  it('resolves to table cell position when clicking below text in cell', () => {
    // Click at (50, 130) — inside the table fragment (y=70 to y=150)
    // but well below the text line which ends around y=70+2(padding)+18(line)=90
    // localY within table = 130-70 = 60, well below the 18px text line
    const result = clickToPosition(layout, allBlocks, allMeasures, { x: 50, y: 130 });

    expect(result).not.toBeNull();
    // Should resolve to a position within the table cell's PM range (50-59)
    expect(result!.pos).toBeGreaterThanOrEqual(50);
    expect(result!.pos).toBeLessThanOrEqual(59);
    expect(result!.blockId).toBe('table-block');
  });

  it('does not snap to nearby paragraph when clicking empty table cell space', () => {
    // Click at (50, 140) — inside table fragment, far below text
    const result = clickToPosition(layout, allBlocks, allMeasures, { x: 50, y: 140 });

    expect(result).not.toBeNull();
    // Must NOT resolve to the paragraph above (PM range 1-11)
    expect(result!.pos).toBeGreaterThanOrEqual(50);
    expect(result!.blockId).toBe('table-block');
  });
});

describe('clickToPosition: table cell on page 2 (multi-page)', () => {
  // Table on page 2 with empty space below text line.
  // Tests the geometry path with container-space coordinates on page 2+.
  const tableCellPara = {
    kind: 'paragraph' as const,
    id: 'page2-cell-para',
    runs: [{ text: 'Page 2 text', fontFamily: 'Arial', fontSize: 14, pmStart: 100, pmEnd: 111 }],
  };

  const tableBlock: FlowBlock = {
    kind: 'table',
    id: 'page2-table',
    rows: [
      {
        id: 'row-0',
        cells: [
          {
            id: 'cell-0',
            blocks: [tableCellPara],
            attrs: { padding: { top: 2, bottom: 2, left: 4, right: 4 } },
          },
        ],
      },
    ],
  };

  const tableMeasure: Measure = {
    kind: 'table',
    rows: [
      {
        height: 80,
        cells: [
          {
            width: 200,
            height: 80,
            gridColumnStart: 0,
            blocks: [
              {
                kind: 'paragraph',
                lines: [
                  {
                    fromRun: 0,
                    fromChar: 0,
                    toRun: 0,
                    toChar: 11,
                    width: 80,
                    ascent: 10,
                    descent: 4,
                    lineHeight: 18,
                  },
                ],
                totalHeight: 18,
              },
            ],
          },
        ],
      },
    ],
    columnWidths: [200],
    totalWidth: 200,
    totalHeight: 80,
  };

  // Page 1 paragraph filler, page 2 has the table
  const page1Para: FlowBlock = {
    kind: 'paragraph',
    id: 'page1-para',
    runs: [{ text: 'Page 1 content', fontFamily: 'Arial', fontSize: 14, pmStart: 1, pmEnd: 15 }],
  };

  const page1Measure: Measure = {
    kind: 'paragraph',
    lines: [
      {
        fromRun: 0,
        fromChar: 0,
        toRun: 0,
        toChar: 14,
        width: 100,
        ascent: 10,
        descent: 4,
        lineHeight: 20,
      },
    ],
    totalHeight: 20,
  };

  // Two-page layout: page 1 has a paragraph, page 2 has a table
  const layout: Layout = {
    pageSize: { w: 400, h: 500 },
    pages: [
      {
        number: 1,
        fragments: [
          {
            kind: 'para',
            blockId: 'page1-para',
            fromLine: 0,
            toLine: 1,
            x: 30,
            y: 30,
            width: 300,
            pmStart: 1,
            pmEnd: 15,
          },
        ],
      },
      {
        number: 2,
        fragments: [
          {
            kind: 'table',
            blockId: 'page2-table',
            fromRow: 0,
            toRow: 1,
            x: 30,
            y: 50,
            width: 200,
            height: 80,
          },
        ],
      },
    ],
  };

  const allBlocks = [page1Para, tableBlock];
  const allMeasures = [page1Measure, tableMeasure];

  it('resolves to table cell on page 2 with container-space coordinates', () => {
    // Page 2 starts at y=500. Table is at y=50 within page 2 = container y=550.
    // Click at y=590, which is 90 within page 2, inside table (50 to 130), below text.
    const result = clickToPosition(layout, allBlocks, allMeasures, { x: 50, y: 590 });

    expect(result).not.toBeNull();
    expect(result!.pos).toBeGreaterThanOrEqual(100);
    expect(result!.pos).toBeLessThanOrEqual(111);
    expect(result!.blockId).toBe('page2-table');
    expect(result!.pageIndex).toBe(1);
  });

  it('resolves to table cell on page 2 when clicking below text line', () => {
    // Click at y=610, which is 110 within page 2, inside table (50 to 130), far below 18px text
    const result = clickToPosition(layout, allBlocks, allMeasures, { x: 50, y: 610 });

    expect(result).not.toBeNull();
    expect(result!.pos).toBeGreaterThanOrEqual(100);
    expect(result!.pos).toBeLessThanOrEqual(111);
    expect(result!.blockId).toBe('page2-table');
    expect(result!.pageIndex).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Table cells with list markers (PR 0 safety rails)
// ---------------------------------------------------------------------------

describe('clickToPosition: table cells with list markers', () => {
  const { block: tableBlock, measure: tableMeasure } = buildTableWithListFixtures({
    cellWidth: 200,
    pmStart: 60,
    pmEnd: 69,
    text: 'List text',
    markerWidth: 18,
  });

  const layout: Layout = {
    pageSize: { w: 400, h: 500 },
    pages: [
      {
        number: 1,
        fragments: [
          {
            kind: 'table',
            blockId: 'table-list-block',
            fromRow: 0,
            toRow: 1,
            x: 30,
            y: 40,
            width: 200,
            height: 24,
          },
        ],
      },
    ],
  };

  it('resolves click on marker region to correct PM position', () => {
    // Click at x=35 (within the table fragment, near the left edge where marker lives)
    const result = clickToPosition(layout, [tableBlock], [tableMeasure], { x: 35, y: 52 });
    expect(result).not.toBeNull();
    expect(result!.blockId).toBe('table-list-block');
    expect(result!.pos).toBeGreaterThanOrEqual(60);
    expect(result!.pos).toBeLessThanOrEqual(69);
  });

  it('resolves click on text after marker to correct PM position', () => {
    // Click at x=100 (well past the marker region, into text content)
    const markerResult = clickToPosition(layout, [tableBlock], [tableMeasure], { x: 35, y: 52 });
    const result = clickToPosition(layout, [tableBlock], [tableMeasure], { x: 100, y: 52 });
    expect(markerResult).not.toBeNull();
    expect(result).not.toBeNull();
    expect(result!.blockId).toBe('table-list-block');
    expect(result!.pos).toBeGreaterThanOrEqual(60);
    expect(result!.pos).toBeLessThanOrEqual(69);
    expect(result!.pos).toBeGreaterThanOrEqual(markerResult!.pos);
  });
});

// ---------------------------------------------------------------------------
// Table cells with SDT wrappers (PR 0 safety rails)
// ---------------------------------------------------------------------------

describe('clickToPosition: table cells with SDT wrappers', () => {
  const { block: tableBlock, measure: tableMeasure } = buildTableWithSdtFixtures({
    cellWidth: 200,
    pmStart: 70,
    pmEnd: 78,
    text: 'SDT text',
  });

  const layout: Layout = {
    pageSize: { w: 400, h: 500 },
    pages: [
      {
        number: 1,
        fragments: [
          {
            kind: 'table',
            blockId: 'table-sdt-block',
            fromRow: 0,
            toRow: 1,
            x: 30,
            y: 40,
            width: 200,
            height: 24,
          },
        ],
      },
    ],
  };

  it('resolves click inside SDT wrapper to correct PM position', () => {
    const result = clickToPosition(layout, [tableBlock], [tableMeasure], { x: 80, y: 52 });
    expect(result).not.toBeNull();
    expect(result!.blockId).toBe('table-sdt-block');
    expect(result!.pos).toBeGreaterThanOrEqual(70);
    expect(result!.pos).toBeLessThanOrEqual(78);
  });
});
