import { describe, it, expect } from 'vitest';
import {
  clickToPosition,
  hitTestPage,
  hitTestTableFragment,
  hitTestTextboxFragment,
  resolveTextboxContentHit,
} from '../src/index.ts';
import type {
  Layout,
  FlowBlock,
  Measure,
  Line,
  ParaFragment,
  ParagraphAttrs,
  TableBlock,
  TableMeasure,
  TableFragment,
  DrawingFragment,
  ParagraphMeasure,
} from '@superdoc/contracts';
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
  it('hit-tests textboxShape content paragraphs with insets', () => {
    const textboxParagraph: FlowBlock = {
      kind: 'paragraph',
      id: 'textbox-para',
      runs: [{ text: 'Textbox text', fontFamily: 'Arial', fontSize: 16, pmStart: 50, pmEnd: 62 }],
    };

    const textboxBlock: FlowBlock = {
      kind: 'drawing',
      id: 'textbox-0',
      drawingKind: 'textboxShape',
      geometry: { width: 140, height: 60, rotation: 0, flipH: false, flipV: false },
      contentBlocks: [textboxParagraph],
      textInsets: { top: 8, right: 10, bottom: 8, left: 12 },
      attrs: { pmStart: 49, pmEnd: 63 },
    };

    const textboxParagraphMeasure: ParagraphMeasure = {
      kind: 'paragraph',
      lines: [
        {
          fromRun: 0,
          fromChar: 0,
          toRun: 0,
          toChar: 12,
          width: 96,
          ascent: 12,
          descent: 4,
          lineHeight: 20,
        },
      ],
      totalHeight: 20,
    };

    const textboxMeasure: Measure = {
      kind: 'drawing',
      drawingKind: 'textboxShape',
      width: 140,
      height: 60,
      scale: 1,
      naturalWidth: 140,
      naturalHeight: 60,
      geometry: { width: 140, height: 60, rotation: 0, flipH: false, flipV: false },
    };

    const textboxFragment: DrawingFragment = {
      kind: 'drawing',
      blockId: 'textbox-0',
      drawingKind: 'textboxShape',
      x: 40,
      y: 70,
      width: 140,
      height: 60,
      geometry: { width: 140, height: 60, rotation: 0, flipH: false, flipV: false },
      scale: 1,
      pmStart: 49,
      pmEnd: 63,
      contentMeasures: [textboxParagraphMeasure],
    };

    const layout: Layout = {
      pageSize: { w: 400, h: 500 },
      pages: [{ number: 1, fragments: [textboxFragment] }],
    };

    const pageHit = hitTestPage(layout, { x: 64, y: 86 });
    expect(pageHit).not.toBeNull();

    const hit = hitTestTextboxFragment(pageHit!, [textboxBlock], [textboxMeasure], { x: 64, y: 86 });
    expect(hit).not.toBeNull();
    expect(hit?.contentBlock.id).toBe('textbox-para');
    expect(hit?.localX).toBe(12);
    expect(hit?.localY).toBe(8);
  });

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

  it('maps point inside textboxShape to paragraph PM position', () => {
    const textboxParagraph: FlowBlock = {
      kind: 'paragraph',
      id: 'textbox-para-2',
      runs: [{ text: 'Textbox text', fontFamily: 'Arial', fontSize: 16, pmStart: 80, pmEnd: 92 }],
    };

    const textboxBlock: FlowBlock = {
      kind: 'drawing',
      id: 'textbox-1',
      drawingKind: 'textboxShape',
      geometry: { width: 160, height: 70, rotation: 0, flipH: false, flipV: false },
      contentBlocks: [textboxParagraph],
      textInsets: { top: 8, right: 10, bottom: 8, left: 12 },
      attrs: { pmStart: 79, pmEnd: 93 },
    };

    const textboxParagraphMeasure: ParagraphMeasure = {
      kind: 'paragraph',
      lines: [
        {
          fromRun: 0,
          fromChar: 0,
          toRun: 0,
          toChar: 12,
          width: 96,
          ascent: 12,
          descent: 4,
          lineHeight: 20,
        },
      ],
      totalHeight: 20,
    };

    const textboxMeasure: Measure = {
      kind: 'drawing',
      drawingKind: 'textboxShape',
      width: 160,
      height: 70,
      scale: 1,
      naturalWidth: 160,
      naturalHeight: 70,
      geometry: { width: 160, height: 70, rotation: 0, flipH: false, flipV: false },
    };

    const textboxFragment: DrawingFragment = {
      kind: 'drawing',
      blockId: 'textbox-1',
      drawingKind: 'textboxShape',
      x: 40,
      y: 80,
      width: 160,
      height: 70,
      geometry: { width: 160, height: 70, rotation: 0, flipH: false, flipV: false },
      scale: 1,
      pmStart: 79,
      pmEnd: 93,
      contentMeasures: [textboxParagraphMeasure],
    };

    const layout: Layout = {
      pageSize: { w: 400, h: 500 },
      pages: [{ number: 1, fragments: [textboxFragment] }],
    };

    const result = clickToPosition(layout, [textboxBlock], [textboxMeasure], { x: 76, y: 96 });
    expect(result?.blockId).toBe('textbox-1');
    expect(result?.lineIndex).toBe(0);
    expect(result?.pos).toBeGreaterThanOrEqual(80);
    expect(result?.pos).toBeLessThanOrEqual(92);
  });

  it('uses table fragment columnIndex instead of visual x for multi-column overflow tables', () => {
    const cellParagraph: FlowBlock = {
      kind: 'paragraph',
      id: 'table-cell-para',
      runs: [{ text: 'Wide table', fontFamily: 'Arial', fontSize: 16, pmStart: 100, pmEnd: 110 }],
    };

    const tableBlock: TableBlock = {
      kind: 'table',
      id: 'wide-table',
      rows: [
        {
          id: 'row-0',
          cells: [{ id: 'cell-0-0', blocks: [cellParagraph] }],
        },
      ],
    };

    const cellParagraphMeasure: Measure = {
      kind: 'paragraph',
      lines: [
        {
          fromRun: 0,
          fromChar: 0,
          toRun: 0,
          toChar: 10,
          width: 120,
          ascent: 12,
          descent: 4,
          lineHeight: 20,
        },
      ],
      totalHeight: 20,
    };

    const tableMeasure: TableMeasure = {
      kind: 'table',
      rows: [
        {
          cells: [
            {
              blocks: [cellParagraphMeasure],
              paragraph: cellParagraphMeasure,
              width: 320,
              height: 28,
              gridColumnStart: 0,
              colSpan: 1,
              rowSpan: 1,
            },
          ],
          height: 28,
        },
      ],
      columnWidths: [320],
      totalWidth: 320,
      totalHeight: 28,
    };

    const tableFragment: TableFragment = {
      kind: 'table',
      blockId: 'wide-table',
      columnIndex: 1,
      fromRow: 0,
      toRow: 1,
      x: 220,
      y: 40,
      width: 320,
      height: 28,
      pmStart: 100,
      pmEnd: 110,
    };

    const layout: Layout = {
      pageSize: { w: 600, h: 800 },
      columns: { count: 2, gap: 20 },
      pages: [
        {
          number: 1,
          columns: { count: 2, gap: 20 },
          margins: { top: 0, right: 0, bottom: 0, left: 0 },
          fragments: [tableFragment],
        },
      ],
    };

    const result = clickToPosition(layout, [tableBlock], [tableMeasure], { x: 340, y: 54 });

    expect(result?.blockId).toBe('wide-table');
    expect(result?.column).toBe(1);
  });

  it('resolves an EMPTY cell paragraph to its PM position instead of null (SD-3328)', () => {
    // An empty paragraph (blank line / spacer) inside a table cell has no runs and no
    // measured lines, so findLineIndexAtY returns null. Before the fix the cell fallback
    // (`cellBlock.runs[0].pmStart`) was undefined and the hit resolved to null — which
    // aborts an in-progress drag and collapses the selection. The hit must resolve to the
    // empty paragraph's own PM position (from its attrs) so dragging across a blank line
    // keeps extending the selection.
    const emptyCellPara: FlowBlock = {
      kind: 'paragraph',
      id: 'empty-cell-para',
      runs: [],
      attrs: { pmStart: 100, pmEnd: 101 } as unknown as ParagraphAttrs,
    };

    const tableBlock: TableBlock = {
      kind: 'table',
      id: 'empty-cell-table',
      rows: [{ id: 'row-0', cells: [{ id: 'cell-0-0', blocks: [emptyCellPara] }] }],
    };

    const emptyCellMeasure: Measure = { kind: 'paragraph', lines: [], totalHeight: 20 };

    const tableMeasure: TableMeasure = {
      kind: 'table',
      rows: [
        {
          cells: [
            {
              blocks: [emptyCellMeasure],
              paragraph: emptyCellMeasure,
              width: 320,
              height: 28,
              gridColumnStart: 0,
              colSpan: 1,
              rowSpan: 1,
            },
          ],
          height: 28,
        },
      ],
      columnWidths: [320],
      totalWidth: 320,
      totalHeight: 28,
    };

    const tableFragment: TableFragment = {
      kind: 'table',
      blockId: 'empty-cell-table',
      fromRow: 0,
      toRow: 1,
      x: 30,
      y: 40,
      width: 320,
      height: 28,
      pmStart: 100,
      pmEnd: 101,
    };

    const layout: Layout = {
      pageSize: { w: 600, h: 800 },
      pages: [{ number: 1, margins: { top: 0, right: 0, bottom: 0, left: 0 }, fragments: [tableFragment] }],
    };

    const result = clickToPosition(layout, [tableBlock], [tableMeasure], { x: 120, y: 54 });

    expect(result).not.toBeNull();
    expect(result?.pos).toBe(100);
    expect(result?.blockId).toBe('empty-cell-table');
  });

  it('falls back to visual x when a table fragment has no columnIndex', () => {
    // Legacy fragments without columnIndex should still resolve a column via fragment.x.
    const cellParagraph: FlowBlock = {
      kind: 'paragraph',
      id: 'legacy-cell-para',
      runs: [{ text: 'Legacy', fontFamily: 'Arial', fontSize: 16, pmStart: 200, pmEnd: 206 }],
    };

    const tableBlock: TableBlock = {
      kind: 'table',
      id: 'legacy-table',
      rows: [{ id: 'row-0', cells: [{ id: 'cell-0-0', blocks: [cellParagraph] }] }],
    };

    const cellMeasure: Measure = {
      kind: 'paragraph',
      lines: [
        {
          fromRun: 0,
          fromChar: 0,
          toRun: 0,
          toChar: 6,
          width: 80,
          ascent: 12,
          descent: 4,
          lineHeight: 20,
        },
      ],
      totalHeight: 20,
    };

    const tableMeasure: TableMeasure = {
      kind: 'table',
      rows: [
        {
          cells: [
            {
              blocks: [cellMeasure],
              paragraph: cellMeasure,
              width: 240,
              height: 28,
              gridColumnStart: 0,
              colSpan: 1,
              rowSpan: 1,
            },
          ],
          height: 28,
        },
      ],
      columnWidths: [240],
      totalWidth: 240,
      totalHeight: 28,
    };

    // Visual x=320 puts the fragment past the column-0 right edge in a 2-col layout
    // with column width 290 ((600 - 20) / 2). determineColumn maps it to column 1.
    const tableFragment: TableFragment = {
      kind: 'table',
      blockId: 'legacy-table',
      fromRow: 0,
      toRow: 1,
      x: 320,
      y: 40,
      width: 240,
      height: 28,
      pmStart: 200,
      pmEnd: 206,
    };

    const layout: Layout = {
      pageSize: { w: 600, h: 800 },
      columns: { count: 2, gap: 20 },
      pages: [
        {
          number: 1,
          columns: { count: 2, gap: 20 },
          margins: { top: 0, right: 0, bottom: 0, left: 0 },
          fragments: [tableFragment],
        },
      ],
    };

    const result = clickToPosition(layout, [tableBlock], [tableMeasure], { x: 360, y: 54 });

    expect(result?.blockId).toBe('legacy-table');
    expect(result?.column).toBe(1);
  });

  it('clamps a table fragment columnIndex that exceeds the document column count', () => {
    // Defensive: a fragment claiming columnIndex 5 in a 2-column layout should
    // be clamped to the last valid column (1) rather than producing a stale index.
    const cellParagraph: FlowBlock = {
      kind: 'paragraph',
      id: 'oob-cell-para',
      runs: [{ text: 'Out', fontFamily: 'Arial', fontSize: 16, pmStart: 300, pmEnd: 303 }],
    };

    const tableBlock: TableBlock = {
      kind: 'table',
      id: 'oob-table',
      rows: [{ id: 'row-0', cells: [{ id: 'cell-0-0', blocks: [cellParagraph] }] }],
    };

    const cellMeasure: Measure = {
      kind: 'paragraph',
      lines: [
        {
          fromRun: 0,
          fromChar: 0,
          toRun: 0,
          toChar: 3,
          width: 40,
          ascent: 12,
          descent: 4,
          lineHeight: 20,
        },
      ],
      totalHeight: 20,
    };

    const tableMeasure: TableMeasure = {
      kind: 'table',
      rows: [
        {
          cells: [
            {
              blocks: [cellMeasure],
              paragraph: cellMeasure,
              width: 200,
              height: 28,
              gridColumnStart: 0,
              colSpan: 1,
              rowSpan: 1,
            },
          ],
          height: 28,
        },
      ],
      columnWidths: [200],
      totalWidth: 200,
      totalHeight: 28,
    };

    const tableFragment: TableFragment = {
      kind: 'table',
      blockId: 'oob-table',
      columnIndex: 5,
      fromRow: 0,
      toRow: 1,
      x: 100,
      y: 40,
      width: 200,
      height: 28,
      pmStart: 300,
      pmEnd: 303,
    };

    const layout: Layout = {
      pageSize: { w: 600, h: 800 },
      columns: { count: 2, gap: 20 },
      pages: [
        {
          number: 1,
          columns: { count: 2, gap: 20 },
          margins: { top: 0, right: 0, bottom: 0, left: 0 },
          fragments: [tableFragment],
        },
      ],
    };

    const result = clickToPosition(layout, [tableBlock], [tableMeasure], { x: 120, y: 54 });

    expect(result?.blockId).toBe('oob-table');
    expect(result?.column).toBe(1);
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

  it('chooses the nearest paragraph when clicking empty space before cell text', () => {
    const firstParagraph: FlowBlock = {
      kind: 'paragraph',
      id: 'cell-para-1',
      runs: [{ text: 'First paragraph', fontFamily: 'Arial', fontSize: 14, pmStart: 50, pmEnd: 65 }],
    };

    const secondParagraph: FlowBlock = {
      kind: 'paragraph',
      id: 'cell-para-2',
      runs: [{ text: 'Second paragraph', fontFamily: 'Arial', fontSize: 14, pmStart: 65, pmEnd: 81 }],
    };

    const multiParaTableBlock: FlowBlock = {
      kind: 'table',
      id: 'table-gap-block',
      rows: [
        {
          id: 'row-0',
          cells: [
            {
              id: 'cell-0',
              blocks: [firstParagraph, secondParagraph],
              attrs: { padding: { top: 2, bottom: 2, left: 4, right: 4 } },
            },
          ],
        },
      ],
    };

    const multiParaTableMeasure: Measure = {
      kind: 'table',
      rows: [
        {
          height: 60,
          cells: [
            {
              width: 200,
              height: 60,
              gridColumnStart: 0,
              blocks: [
                {
                  kind: 'paragraph',
                  lines: [
                    {
                      fromRun: 0,
                      fromChar: 0,
                      toRun: 0,
                      toChar: 15,
                      width: 120,
                      ascent: 10,
                      descent: 4,
                      lineHeight: 16,
                    },
                  ],
                  totalHeight: 16,
                },
                {
                  kind: 'paragraph',
                  lines: [
                    {
                      fromRun: 0,
                      fromChar: 0,
                      toRun: 0,
                      toChar: 16,
                      width: 130,
                      ascent: 10,
                      descent: 4,
                      lineHeight: 16,
                    },
                  ],
                  totalHeight: 16,
                },
              ],
            },
          ],
        },
      ],
      columnWidths: [200],
      totalWidth: 200,
      totalHeight: 60,
    };

    const gapLayout: Layout = {
      pageSize: { w: 400, h: 500 },
      pages: [
        {
          number: 1,
          fragments: [
            {
              kind: 'table',
              blockId: 'table-gap-block',
              fromRow: 0,
              toRow: 1,
              x: 30,
              y: 70,
              width: 200,
              height: 60,
            },
          ],
        },
      ],
    };

    const result = clickToPosition(gapLayout, [multiParaTableBlock], [multiParaTableMeasure], { x: 50, y: 71 });

    expect(result).not.toBeNull();
    expect(result!.blockId).toBe('table-gap-block');
    expect(result!.pos).toBeGreaterThanOrEqual(50);
    expect(result!.pos).toBeLessThanOrEqual(65);
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

// ---------------------------------------------------------------------------
// resolveTextboxContentHit — vertical alignment offset
//
// Layout: textbox at (x:20, y:10), 100px wide, 100px tall, insets all zero.
// Two paragraphs, 15px each → totalContentHeight = 30px.
//
//   top:    content starts at y=0 (relative to inset origin)
//   center: content starts at (100-30)/2 = 35px
//   bottom: content starts at 100-30 = 70px
//
// The painter renders these via CSS flex justifyContent; the hit-test must
// mirror that offset so clicks map to the correct paragraph.
// ---------------------------------------------------------------------------
describe('resolveTextboxContentHit: textVerticalAlign center and bottom', () => {
  const para1: FlowBlock = {
    kind: 'paragraph',
    id: 'vp-para-1',
    runs: [{ text: 'First', fontFamily: 'Arial', fontSize: 12, pmStart: 10, pmEnd: 15 }],
  };
  const para2: FlowBlock = {
    kind: 'paragraph',
    id: 'vp-para-2',
    runs: [{ text: 'Second', fontFamily: 'Arial', fontSize: 12, pmStart: 16, pmEnd: 22 }],
  };

  const para1Measure: ParagraphMeasure = {
    kind: 'paragraph',
    lines: [{ fromRun: 0, fromChar: 0, toRun: 0, toChar: 5, width: 40, ascent: 10, descent: 3, lineHeight: 15 }],
    totalHeight: 15,
  };
  const para2Measure: ParagraphMeasure = {
    kind: 'paragraph',
    lines: [{ fromRun: 0, fromChar: 0, toRun: 0, toChar: 6, width: 48, ascent: 10, descent: 3, lineHeight: 15 }],
    totalHeight: 15,
  };

  const makeFixture = (textVerticalAlign: 'top' | 'center' | 'bottom') => {
    const block: FlowBlock = {
      kind: 'drawing',
      id: 'vp-box',
      drawingKind: 'textboxShape',
      geometry: { width: 100, height: 100, rotation: 0, flipH: false, flipV: false },
      contentBlocks: [para1, para2],
      textInsets: { top: 0, right: 0, bottom: 0, left: 0 },
      textVerticalAlign,
      attrs: { pmStart: 9, pmEnd: 23 },
    };
    const measure: Measure = {
      kind: 'drawing',
      drawingKind: 'textboxShape',
      width: 100,
      height: 100,
      scale: 1,
      naturalWidth: 100,
      naturalHeight: 100,
      geometry: { width: 100, height: 100, rotation: 0, flipH: false, flipV: false },
    };
    const fragment: DrawingFragment = {
      kind: 'drawing',
      blockId: 'vp-box',
      drawingKind: 'textboxShape',
      x: 20,
      y: 10,
      width: 100,
      height: 100,
      geometry: { width: 100, height: 100, rotation: 0, flipH: false, flipV: false },
      scale: 1,
      pmStart: 9,
      pmEnd: 23,
      contentMeasures: [para1Measure, para2Measure],
    };
    return { block, measure, fragment };
  };

  it('top-aligned: click at content top hits paragraph 1', () => {
    const { block, measure, fragment } = makeFixture('top');
    // content starts at y=0 relative to fragment; click at fragment.y + 5 = y=15 → localY=5 → para1 (0-15)
    const hit = resolveTextboxContentHit(fragment, block as any, measure, 0, { x: 70, y: 15 });
    expect(hit?.contentBlock.id).toBe('vp-para-1');
  });

  it('top-aligned: click at para2 region hits paragraph 2', () => {
    const { block, measure, fragment } = makeFixture('top');
    // para2 starts at y=15; click at fragment.y + 20 = y=30 → localY=20 → para2 (15-30)
    const hit = resolveTextboxContentHit(fragment, block as any, measure, 0, { x: 70, y: 30 });
    expect(hit?.contentBlock.id).toBe('vp-para-2');
  });

  it('center-aligned: click above content offset snaps to nearest (para1)', () => {
    const { block, measure, fragment } = makeFixture('center');
    // contentOffset = (100-30)/2 = 35. Content: para1 at [35,50), para2 at [50,65).
    // click at fragment.y + 10 = y=20 → localY = 10 - 35 = -25, above all content → nearest = para1
    const hit = resolveTextboxContentHit(fragment, block as any, measure, 0, { x: 70, y: 20 });
    expect(hit?.contentBlock.id).toBe('vp-para-1');
  });

  it('center-aligned: click inside para1 content area hits paragraph 1', () => {
    const { block, measure, fragment } = makeFixture('center');
    // contentOffset=35. para1 spans localY [0,15). click at fragment.y + 40 = y=50 → localY = 40-35 = 5 → para1
    const hit = resolveTextboxContentHit(fragment, block as any, measure, 0, { x: 70, y: 50 });
    expect(hit?.contentBlock.id).toBe('vp-para-1');
  });

  it('center-aligned: click inside para2 content area hits paragraph 2', () => {
    const { block, measure, fragment } = makeFixture('center');
    // contentOffset=35. para2 spans localY [15,30). click at fragment.y + 55 = y=65 → localY = 55-35 = 20 → para2
    const hit = resolveTextboxContentHit(fragment, block as any, measure, 0, { x: 70, y: 65 });
    expect(hit?.contentBlock.id).toBe('vp-para-2');
  });

  it('center-aligned: click below content offset snaps to nearest (para2)', () => {
    const { block, measure, fragment } = makeFixture('center');
    // contentOffset=35. Content ends at localY=30 (fragment.y+65). click at fragment.y+90=y=100 → localY=55 → nearest=para2
    const hit = resolveTextboxContentHit(fragment, block as any, measure, 0, { x: 70, y: 100 });
    expect(hit?.contentBlock.id).toBe('vp-para-2');
  });

  it('bottom-aligned: click inside para1 content area hits paragraph 1', () => {
    const { block, measure, fragment } = makeFixture('bottom');
    // contentOffset = 100-30 = 70. para1 spans localY [0,15). click at fragment.y + 75 = y=85 → localY=75-70=5 → para1
    const hit = resolveTextboxContentHit(fragment, block as any, measure, 0, { x: 70, y: 85 });
    expect(hit?.contentBlock.id).toBe('vp-para-1');
  });

  it('bottom-aligned: click inside para2 content area hits paragraph 2', () => {
    const { block, measure, fragment } = makeFixture('bottom');
    // contentOffset=70. para2 spans localY [15,30). click at fragment.y + 90 = y=100 → localY=90-70=20 → para2
    const hit = resolveTextboxContentHit(fragment, block as any, measure, 0, { x: 70, y: 100 });
    expect(hit?.contentBlock.id).toBe('vp-para-2');
  });

  it('bottom-aligned: click above content offset snaps to nearest (para1)', () => {
    const { block, measure, fragment } = makeFixture('bottom');
    // contentOffset=70. click at fragment.y+5=y=15 → localY=5-70=-65 → nearest=para1
    const hit = resolveTextboxContentHit(fragment, block as any, measure, 0, { x: 70, y: 15 });
    expect(hit?.contentBlock.id).toBe('vp-para-1');
  });
});
