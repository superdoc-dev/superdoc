import { describe, it, expect } from 'vitest';
import { selectionToRects, getFragmentAtPosition } from '../src/index.ts';
import type { FlowBlock, Layout, Measure } from '@superdoc/contracts';
import {
  simpleLayout,
  simpleBlock,
  simpleMeasure,
  blocks,
  measures,
  multiLineLayout,
  multiBlocks,
  multiMeasures,
  columnsLayout,
  drawingLayout,
  drawingBlock,
  drawingMeasure,
  tableLayout,
  tableBlock,
  tableMeasure,
} from './mock-data';
import { PageGeometryHelper } from '../src/page-geometry-helper';

describe('selectionToRects', () => {
  it('returns rect for single-line range', () => {
    const rects = selectionToRects(simpleLayout, blocks, measures, 2, 10);
    expect(rects.length).toBe(1);
  });

  it('returns multiple rects for multi-line range', () => {
    const rects = selectionToRects(multiLineLayout, multiBlocks, multiMeasures, 2, 20);
    expect(rects.length).toBeGreaterThan(1);
  });

  it('returns rects in each column when selection spans columns', () => {
    const rects = selectionToRects(columnsLayout, blocks, measures, 2, 10);
    expect(rects.some((rect) => rect.x < 200)).toBe(true);
    expect(rects.some((rect) => rect.x > 200)).toBe(true);
  });

  it('returns rect for drawing fragments when selection covers node', () => {
    const rects = selectionToRects(drawingLayout, [drawingBlock], [drawingMeasure], 20, 21);
    expect(rects).toHaveLength(1);
    expect(rects[0].width).toBeCloseTo(60);
  });

  it('returns rects for selections inside table cells', () => {
    const rects = selectionToRects(tableLayout, [tableBlock], [tableMeasure], 2, 8);
    expect(rects.length).toBeGreaterThan(0);
    expect(rects[0].x).toBeGreaterThan(tableLayout.pages[0].fragments[0].x);
  });

  describe('firstLineIndentMode integration', () => {
    it('uses textStartPx for first line of list with firstLineIndentMode', () => {
      // Create a list item with firstLineIndentMode and textStartPx
      const listBlock: FlowBlock = {
        kind: 'paragraph',
        id: 'list-item-1',
        runs: [
          { text: 'First line ', fontFamily: 'Arial', fontSize: 16, pmStart: 1, pmEnd: 12 },
          { text: 'content', fontFamily: 'Arial', fontSize: 16, pmStart: 12, pmEnd: 19 },
        ],
        attrs: {
          indent: {
            left: 36, // paraIndentLeft
            firstLine: 0,
            hanging: 18,
          },
          wordLayout: {
            firstLineIndentMode: true,
            textStartPx: 56, // Pre-calculated position: paraIndentLeft + markerWidth + tabWidth
            marker: {
              markerText: '1.',
              markerX: 36,
              textStartX: 56,
            },
          },
        },
      };

      const listMeasure: Measure = {
        kind: 'paragraph',
        lines: [
          {
            fromRun: 0,
            fromChar: 0,
            toRun: 1,
            toChar: 7,
            width: 150,
            ascent: 12,
            descent: 4,
            lineHeight: 20,
          },
        ],
        totalHeight: 20,
        marker: {
          markerWidth: 20,
        },
      };

      const listLayout: Layout = {
        pageSize: { w: 400, h: 500 },
        pages: [
          {
            number: 1,
            fragments: [
              {
                kind: 'para',
                blockId: 'list-item-1',
                fromLine: 0,
                toLine: 1,
                x: 30,
                y: 40,
                width: 300,
                pmStart: 1,
                pmEnd: 19,
                markerWidth: 20,
              },
            ],
          },
        ],
      };

      const rects = selectionToRects(listLayout, [listBlock], [listMeasure], 1, 19);

      expect(rects).toHaveLength(1);
      // Rect x should be: fragment.x (30) + textStartPx (56) + startX offset
      // textStartPx is the indent adjustment for first line in firstLineIndentMode
      // At the start of the line, startX offset is 0, so x = 30 + 56 = 86
      expect(rects[0].x).toBeGreaterThanOrEqual(30 + 56);
      expect(rects[0].x).toBeLessThan(30 + 56 + 150); // Should be within line width
    });

    it('uses paraIndentLeft for second line of list with firstLineIndentMode', () => {
      // Create a multi-line list item with firstLineIndentMode
      const multiLineListBlock: FlowBlock = {
        kind: 'paragraph',
        id: 'list-item-multiline',
        runs: [
          { text: 'First line text ', fontFamily: 'Arial', fontSize: 16, pmStart: 1, pmEnd: 17 },
          { text: 'second line text', fontFamily: 'Arial', fontSize: 16, pmStart: 17, pmEnd: 33 },
        ],
        attrs: {
          indent: {
            left: 36,
            firstLine: 0,
            hanging: 18,
          },
          wordLayout: {
            firstLineIndentMode: true,
            textStartPx: 56, // Only applies to first line
            marker: {
              markerText: '1.',
              markerX: 36,
              textStartX: 56,
            },
          },
        },
      };

      const multiLineListMeasure: Measure = {
        kind: 'paragraph',
        lines: [
          {
            fromRun: 0,
            fromChar: 0,
            toRun: 0,
            toChar: 16,
            width: 200,
            ascent: 12,
            descent: 4,
            lineHeight: 20,
          },
          {
            fromRun: 1,
            fromChar: 0,
            toRun: 1,
            toChar: 16,
            width: 220,
            ascent: 12,
            descent: 4,
            lineHeight: 20,
          },
        ],
        totalHeight: 40,
        marker: {
          markerWidth: 20,
        },
      };

      const multiLineListLayout: Layout = {
        pageSize: { w: 400, h: 500 },
        pages: [
          {
            number: 1,
            fragments: [
              {
                kind: 'para',
                blockId: 'list-item-multiline',
                fromLine: 0,
                toLine: 2,
                x: 30,
                y: 40,
                width: 300,
                pmStart: 1,
                pmEnd: 33,
                markerWidth: 20,
              },
            ],
          },
        ],
      };

      // Select only the second line
      const rects = selectionToRects(multiLineListLayout, [multiLineListBlock], [multiLineListMeasure], 17, 33);

      expect(rects).toHaveLength(1);
      // Second line should use paraIndentLeft (36), not textStartPx (56)
      // Rect x should be: fragment.x (30) + paraIndentLeft (36) + startX offset
      const expectedMinX = 30 + 36; // fragment.x + paraIndentLeft
      expect(rects[0].x).toBeGreaterThanOrEqual(expectedMinX);
      expect(rects[0].x).toBeLessThan(30 + 56); // Should not use textStartPx
    });

    it('correctly positions selection rects for standard hanging indent list', () => {
      // Create a standard list item WITHOUT firstLineIndentMode
      const standardListBlock: FlowBlock = {
        kind: 'paragraph',
        id: 'standard-list-item',
        runs: [{ text: 'Standard list content', fontFamily: 'Arial', fontSize: 16, pmStart: 1, pmEnd: 22 }],
        attrs: {
          indent: {
            left: 36,
            firstLine: 0,
            hanging: 18,
          },
          // No wordLayout.firstLineIndentMode
        },
      };

      const standardListMeasure: Measure = {
        kind: 'paragraph',
        lines: [
          {
            fromRun: 0,
            fromChar: 0,
            toRun: 0,
            toChar: 21,
            width: 180,
            ascent: 12,
            descent: 4,
            lineHeight: 20,
          },
        ],
        totalHeight: 20,
        marker: {
          markerWidth: 20,
        },
      };

      const standardListLayout: Layout = {
        pageSize: { w: 400, h: 500 },
        pages: [
          {
            number: 1,
            fragments: [
              {
                kind: 'para',
                blockId: 'standard-list-item',
                fromLine: 0,
                toLine: 1,
                x: 30,
                y: 40,
                width: 300,
                pmStart: 1,
                pmEnd: 22,
                markerWidth: 20,
              },
            ],
          },
        ],
      };

      const rects = selectionToRects(standardListLayout, [standardListBlock], [standardListMeasure], 1, 22);

      expect(rects).toHaveLength(1);
      // Standard list uses paraIndentLeft (36) for text positioning
      // Rect x should be: fragment.x (30) + paraIndentLeft (36) + startX offset
      const expectedMinX = 30 + 36;
      expect(rects[0].x).toBeGreaterThanOrEqual(expectedMinX);
    });

    it('handles edge case with textStartPx=0 in firstLineIndentMode', () => {
      // Test edge case where textStartPx is explicitly 0
      const zeroTextStartBlock: FlowBlock = {
        kind: 'paragraph',
        id: 'zero-textstart-list',
        runs: [{ text: 'Zero textStart', fontFamily: 'Arial', fontSize: 16, pmStart: 1, pmEnd: 15 }],
        attrs: {
          indent: {
            left: 0,
            firstLine: 0,
            hanging: 0,
          },
          wordLayout: {
            firstLineIndentMode: true,
            textStartPx: 0, // Explicitly 0
            marker: {
              markerText: '•',
            },
          },
        },
      };

      const zeroMeasure: Measure = {
        kind: 'paragraph',
        lines: [
          {
            fromRun: 0,
            fromChar: 0,
            toRun: 0,
            toChar: 14,
            width: 120,
            ascent: 12,
            descent: 4,
            lineHeight: 20,
          },
        ],
        totalHeight: 20,
        marker: {
          markerWidth: 10,
        },
      };

      const zeroLayout: Layout = {
        pageSize: { w: 400, h: 500 },
        pages: [
          {
            number: 1,
            fragments: [
              {
                kind: 'para',
                blockId: 'zero-textstart-list',
                fromLine: 0,
                toLine: 1,
                x: 30,
                y: 40,
                width: 300,
                pmStart: 1,
                pmEnd: 15,
                markerWidth: 10,
              },
            ],
          },
        ],
      };

      const rects = selectionToRects(zeroLayout, [zeroTextStartBlock], [zeroMeasure], 1, 15);

      expect(rects).toHaveLength(1);
      // With textStartPx=0, indent adjustment is 0, so rect x is fragment.x + startX
      expect(rects[0].x).toBeGreaterThanOrEqual(30);
    });

    it('handles missing wordLayout gracefully (non-list paragraph)', () => {
      // Ensure non-list paragraphs work correctly without wordLayout
      const regularBlock: FlowBlock = {
        kind: 'paragraph',
        id: 'regular-para',
        runs: [{ text: 'Regular paragraph', fontFamily: 'Arial', fontSize: 16, pmStart: 1, pmEnd: 18 }],
        attrs: {
          indent: {
            left: 36,
            firstLine: 18, // First-line indent for non-list
            hanging: 0,
          },
          // No wordLayout
        },
      };

      const regularMeasure: Measure = {
        kind: 'paragraph',
        lines: [
          {
            fromRun: 0,
            fromChar: 0,
            toRun: 0,
            toChar: 17,
            width: 160,
            ascent: 12,
            descent: 4,
            lineHeight: 20,
          },
        ],
        totalHeight: 20,
      };

      const regularLayout: Layout = {
        pageSize: { w: 400, h: 500 },
        pages: [
          {
            number: 1,
            fragments: [
              {
                kind: 'para',
                blockId: 'regular-para',
                fromLine: 0,
                toLine: 1,
                x: 30,
                y: 40,
                width: 300,
                pmStart: 1,
                pmEnd: 18,
              },
            ],
          },
        ],
      };

      const rects = selectionToRects(regularLayout, [regularBlock], [regularMeasure], 1, 18);

      expect(rects).toHaveLength(1);
      // Non-list paragraph: indent adjustment is paraIndentLeft + firstLineOffset
      // firstLineOffset = firstLineIndent (18) - hanging (0) = 18
      // Expected indent adjustment: 36 + 18 = 54
      const expectedMinX = 30 + 54;
      expect(rects[0].x).toBeGreaterThanOrEqual(expectedMinX);
    });
  });

  it('uses per-page heights and gaps for Y offsets (mixed page sizes)', () => {
    const layout = {
      pageSize: { w: 400, h: 400 },
      pageGap: 30,
      pages: [
        {
          number: 1,
          size: { w: 400, h: 400 },
          fragments: [
            {
              kind: 'para',
              blockId: '0-paragraph',
              fromLine: 0,
              toLine: 1,
              x: 0,
              y: 0,
              width: 300,
              pmStart: 1,
              pmEnd: 12,
            },
          ],
        },
        {
          number: 2,
          size: { w: 400, h: 600 },
          fragments: [
            {
              kind: 'para',
              blockId: '0-paragraph',
              fromLine: 0,
              toLine: 1,
              x: 0,
              y: 0,
              width: 300,
              pmStart: 1,
              pmEnd: 12,
            },
          ],
        },
      ],
    } as Layout;

    const helper = new PageGeometryHelper({ layout, pageGap: layout.pageGap });
    const rects = selectionToRects(layout, [simpleBlock], [simpleMeasure], 1, 5, helper);
    expect(rects).toHaveLength(2);
    // Second page rect should start at pageTop (400 + 30) + fragment.y (0)
    expect(rects[1].y).toBe(430);
  });
});

describe('getFragmentAtPosition', () => {
  it('finds fragment covering position', () => {
    const hit = getFragmentAtPosition(simpleLayout, blocks, measures, 3);
    expect(hit?.fragment.blockId).toBe('0-paragraph');
  });

  it('returns drawing fragment for drawing positions', () => {
    const hit = getFragmentAtPosition(drawingLayout, [drawingBlock], [drawingMeasure], 20);
    expect(hit?.fragment.kind).toBe('drawing');
    expect(hit?.block.id).toBe('drawing-0');
  });
});
