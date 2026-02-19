/**
 * Fragment dispatch coverage tests.
 *
 * Verifies that renderFragment routes each fragment kind to the correct
 * renderer method. Uses prototype spying + paint() to test the real
 * dispatch chain, not synthetic calls.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createDomPainter } from './index.js';
import { DomPainter } from './renderer.js';
import type { FlowBlock, Measure, Layout } from '@superdoc/contracts';

// ---------------------------------------------------------------------------
// Minimal fixtures per fragment kind
// ---------------------------------------------------------------------------

function paragraphFixtures() {
  const block: FlowBlock = {
    kind: 'paragraph',
    id: 'para-dispatch',
    runs: [{ text: 'Hello', fontFamily: 'Arial', fontSize: 12, pmStart: 1, pmEnd: 6 }],
  };
  const measure: Measure = {
    kind: 'paragraph',
    lines: [{ fromRun: 0, fromChar: 0, toRun: 0, toChar: 5, width: 50, ascent: 10, descent: 4, lineHeight: 16 }],
    totalHeight: 16,
  };
  const layout: Layout = {
    pageSize: { w: 400, h: 500 },
    pages: [
      {
        number: 1,
        fragments: [
          {
            kind: 'para',
            blockId: 'para-dispatch',
            fromLine: 0,
            toLine: 1,
            x: 0,
            y: 0,
            width: 300,
            pmStart: 1,
            pmEnd: 6,
          },
        ],
      },
    ],
  };
  return { blocks: [block], measures: [measure], layout };
}

function listItemFixtures() {
  const block: FlowBlock = {
    kind: 'list',
    id: 'list-dispatch',
    listType: 'bullet',
    items: [
      {
        id: 'item-dispatch',
        marker: { kind: 'bullet', text: '•', level: 0 },
        paragraph: {
          kind: 'paragraph',
          id: 'list-para-dispatch',
          runs: [{ text: 'Item', fontFamily: 'Arial', fontSize: 12, pmStart: 1, pmEnd: 5 }],
        },
      },
    ],
  };
  const measure: Measure = {
    kind: 'list',
    items: [
      {
        itemId: 'item-dispatch',
        markerWidth: 20,
        markerTextWidth: 10,
        indentLeft: 36,
        paragraph: {
          kind: 'paragraph',
          lines: [{ fromRun: 0, fromChar: 0, toRun: 0, toChar: 4, width: 40, ascent: 10, descent: 4, lineHeight: 16 }],
          totalHeight: 16,
        },
      },
    ],
    totalHeight: 16,
  };
  const layout: Layout = {
    pageSize: { w: 400, h: 500 },
    pages: [
      {
        number: 1,
        fragments: [
          {
            kind: 'list-item',
            blockId: 'list-dispatch',
            itemId: 'item-dispatch',
            fromLine: 0,
            toLine: 1,
            x: 50,
            y: 0,
            width: 250,
            markerWidth: 20,
          },
        ],
      },
    ],
  };
  return { blocks: [block], measures: [measure], layout };
}

function imageFixtures() {
  const block: FlowBlock = {
    kind: 'image',
    id: 'img-dispatch',
    src: 'data:image/gif;base64,R0lGODlhAQABAAAAACw=',
    attrs: { pmStart: 1, pmEnd: 2 },
  };
  const measure: Measure = {
    kind: 'image',
    width: 100,
    height: 80,
    scale: 1,
    naturalWidth: 100,
    naturalHeight: 80,
  };
  const layout: Layout = {
    pageSize: { w: 400, h: 500 },
    pages: [
      {
        number: 1,
        fragments: [
          {
            kind: 'image',
            blockId: 'img-dispatch',
            x: 0,
            y: 0,
            width: 100,
            height: 80,
            pmStart: 1,
            pmEnd: 2,
          },
        ],
      },
    ],
  };
  return { blocks: [block], measures: [measure], layout };
}

function drawingFixtures() {
  const block: FlowBlock = {
    kind: 'drawing',
    id: 'drawing-dispatch',
    drawingKind: 'vectorShape',
    geometry: { width: 60, height: 40, rotation: 0, flipH: false, flipV: false },
    attrs: { pmStart: 1, pmEnd: 2 },
  };
  const measure: Measure = {
    kind: 'drawing',
    drawingKind: 'vectorShape',
    width: 60,
    height: 40,
    scale: 1,
    naturalWidth: 60,
    naturalHeight: 40,
    geometry: { width: 60, height: 40, rotation: 0, flipH: false, flipV: false },
  };
  const layout: Layout = {
    pageSize: { w: 400, h: 500 },
    pages: [
      {
        number: 1,
        fragments: [
          {
            kind: 'drawing',
            blockId: 'drawing-dispatch',
            drawingKind: 'vectorShape',
            x: 0,
            y: 0,
            width: 60,
            height: 40,
            geometry: { width: 60, height: 40, rotation: 0, flipH: false, flipV: false },
            scale: 1,
            pmStart: 1,
            pmEnd: 2,
          },
        ],
      },
    ],
  };
  return { blocks: [block], measures: [measure], layout };
}

function tableFixtures() {
  const block: FlowBlock = {
    kind: 'table',
    id: 'table-dispatch',
    rows: [
      {
        id: 'row-0',
        cells: [
          {
            id: 'cell-0',
            blocks: [
              {
                kind: 'paragraph',
                id: 'table-para-dispatch',
                runs: [{ text: 'Cell', fontFamily: 'Arial', fontSize: 12, pmStart: 1, pmEnd: 5 }],
              },
            ],
            attrs: {},
          },
        ],
      },
    ],
  };
  const measure: Measure = {
    kind: 'table',
    rows: [
      {
        height: 24,
        cells: [
          {
            width: 120,
            height: 24,
            gridColumnStart: 0,
            blocks: [
              {
                kind: 'paragraph',
                lines: [
                  { fromRun: 0, fromChar: 0, toRun: 0, toChar: 4, width: 40, ascent: 10, descent: 4, lineHeight: 16 },
                ],
                totalHeight: 16,
              },
            ],
          },
        ],
      },
    ],
    columnWidths: [120],
    totalWidth: 120,
    totalHeight: 24,
  };
  const layout: Layout = {
    pageSize: { w: 400, h: 500 },
    pages: [
      {
        number: 1,
        fragments: [
          {
            kind: 'table',
            blockId: 'table-dispatch',
            fromRow: 0,
            toRow: 1,
            x: 0,
            y: 0,
            width: 120,
            height: 24,
          },
        ],
      },
    ],
  };
  return { blocks: [block], measures: [measure], layout };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('renderFragment dispatch', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('routes para fragment to renderParagraphFragment', () => {
    const dummyDiv = document.createElement('div');
    const spy = vi.spyOn(DomPainter.prototype as any, 'renderParagraphFragment').mockReturnValue(dummyDiv);
    const { blocks, measures, layout } = paragraphFixtures();
    const painter = createDomPainter({ blocks, measures });
    painter.paint(layout, container);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0]![0].kind).toBe('para');
  });

  it('routes list-item fragment to renderListItemFragment', () => {
    const dummyDiv = document.createElement('div');
    const spy = vi.spyOn(DomPainter.prototype as any, 'renderListItemFragment').mockReturnValue(dummyDiv);
    const { blocks, measures, layout } = listItemFixtures();
    const painter = createDomPainter({ blocks, measures });
    painter.paint(layout, container);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0]![0].kind).toBe('list-item');
  });

  it('routes image fragment to renderImageFragment', () => {
    const dummyDiv = document.createElement('div');
    const spy = vi.spyOn(DomPainter.prototype as any, 'renderImageFragment').mockReturnValue(dummyDiv);
    const { blocks, measures, layout } = imageFixtures();
    const painter = createDomPainter({ blocks, measures });
    painter.paint(layout, container);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0]![0].kind).toBe('image');
  });

  it('routes drawing fragment to renderDrawingFragment', () => {
    const dummyDiv = document.createElement('div');
    const spy = vi.spyOn(DomPainter.prototype as any, 'renderDrawingFragment').mockReturnValue(dummyDiv);
    const { blocks, measures, layout } = drawingFixtures();
    const painter = createDomPainter({ blocks, measures });
    painter.paint(layout, container);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0]![0].kind).toBe('drawing');
  });

  it('routes table fragment to renderTableFragment', () => {
    const dummyDiv = document.createElement('div');
    const spy = vi.spyOn(DomPainter.prototype as any, 'renderTableFragment').mockReturnValue(dummyDiv);
    const { blocks, measures, layout } = tableFixtures();
    const painter = createDomPainter({ blocks, measures });
    painter.paint(layout, container);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0]![0].kind).toBe('table');
  });

  it('throws for unknown fragment kind', () => {
    const { blocks, measures } = paragraphFixtures();
    const layout: Layout = {
      pageSize: { w: 400, h: 500 },
      pages: [
        {
          number: 1,
          fragments: [
            {
              kind: 'unknown' as any,
              blockId: 'para-dispatch',
              x: 0,
              y: 0,
              width: 100,
            } as any,
          ],
        },
      ],
    };
    const painter = createDomPainter({ blocks, measures });
    expect(() => painter.paint(layout, container)).toThrow('unsupported fragment kind');
  });
});
