import { describe, it, expect } from 'vitest';
import { clickToPosition, hitTestPage } from '../src/index.ts';
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
