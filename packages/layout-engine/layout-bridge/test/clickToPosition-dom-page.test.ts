/**
 * @vitest-environment jsdom
 *
 * Tests for DOM-based page-relative coordinate resolution in clickToPosition.
 *
 * When the geometry fallback is used (DOM mapping returns null for fragment/line),
 * clickToPosition must compute page-relative Y from the actual DOM page element
 * position, not from geometry-based page-top calculations. This is critical on
 * page 2+ where container-space Y diverges from page-relative Y.
 *
 * Scenario (SD-2024): A paragraph sits just above a table on page 2. Clicking on
 * the paragraph's left margin (where no fragment/line is found by elementsFromPoint)
 * triggers the geometry fallback. If container-space Y is used as page-relative Y,
 * the click resolves to a position far below the paragraph — inside or past the
 * table. The fix computes page-relative Y directly from the page element's
 * bounding rect.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { clickToPosition } from '../src/index.ts';
import type { Layout, FlowBlock, Measure } from '@superdoc/contracts';

/**
 * Helper: temporarily mock document.elementsFromPoint for the duration of `run()`.
 */
function withMockedElementsFromPoint(elements: Element[], run: () => void): void {
  const originalElementsFromPoint = document.elementsFromPoint;
  document.elementsFromPoint = (_x: number, _y: number) => elements;

  try {
    run();
  } finally {
    document.elementsFromPoint = originalElementsFromPoint;
  }
}

describe('clickToPosition: DOM-based page-relative Y on page 2+ (SD-2024)', () => {
  let container: HTMLElement;

  // Layout: page 1 has a filler paragraph, page 2 has a paragraph followed by a table.
  // The paragraph on page 2 is at y=40 (page-relative), table at y=120.
  const paraBlock: FlowBlock = {
    kind: 'paragraph',
    id: 'page2-para',
    runs: [{ text: 'In witness to the commitment', fontFamily: 'Arial', fontSize: 11, pmStart: 100, pmEnd: 128 }],
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
            blocks: [
              {
                kind: 'paragraph',
                id: 'cell-para',
                runs: [{ text: 'Signature', fontFamily: 'Arial', fontSize: 11, pmStart: 130, pmEnd: 139 }],
              },
            ],
            attrs: { padding: { top: 2, bottom: 2, left: 4, right: 4 } },
          },
        ],
      },
    ],
  };

  const paraMeasure: Measure = {
    kind: 'paragraph',
    lines: [
      {
        fromRun: 0,
        fromChar: 0,
        toRun: 0,
        toChar: 28,
        width: 300,
        ascent: 10,
        descent: 4,
        lineHeight: 16,
      },
    ],
    totalHeight: 16,
  };

  const tableMeasure: Measure = {
    kind: 'table',
    rows: [
      {
        height: 40,
        cells: [
          {
            width: 200,
            height: 40,
            gridColumnStart: 0,
            blocks: [
              {
                kind: 'paragraph',
                lines: [
                  {
                    fromRun: 0,
                    fromChar: 0,
                    toRun: 0,
                    toChar: 9,
                    width: 80,
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
    totalHeight: 40,
  };

  const page1Para: FlowBlock = {
    kind: 'paragraph',
    id: 'page1-para',
    runs: [{ text: 'Page 1 content here', fontFamily: 'Arial', fontSize: 11, pmStart: 1, pmEnd: 20 }],
  };

  const page1Measure: Measure = {
    kind: 'paragraph',
    lines: [
      {
        fromRun: 0,
        fromChar: 0,
        toRun: 0,
        toChar: 19,
        width: 150,
        ascent: 10,
        descent: 4,
        lineHeight: 16,
      },
    ],
    totalHeight: 16,
  };

  // Page 2 paragraph at y=40, table at y=120 (page-relative)
  const layout: Layout = {
    pageSize: { w: 600, h: 800 },
    pageGap: 24,
    pages: [
      {
        number: 1,
        fragments: [
          {
            kind: 'para',
            blockId: 'page1-para',
            fromLine: 0,
            toLine: 1,
            x: 72,
            y: 40,
            width: 456,
            pmStart: 1,
            pmEnd: 20,
          },
        ],
      },
      {
        number: 2,
        fragments: [
          {
            kind: 'para',
            blockId: 'page2-para',
            fromLine: 0,
            toLine: 1,
            x: 72,
            y: 40,
            width: 456,
            pmStart: 100,
            pmEnd: 128,
          },
          {
            kind: 'table',
            blockId: 'page2-table',
            fromRow: 0,
            toRow: 1,
            x: 72,
            y: 120,
            width: 200,
            height: 40,
          },
        ],
      },
    ],
  };

  const allBlocks = [page1Para, paraBlock, tableBlock];
  const allMeasures = [page1Measure, paraMeasure, tableMeasure];

  beforeEach(() => {
    container = document.createElement('div');
    container.style.position = 'absolute';
    container.style.left = '0px';
    container.style.top = '0px';
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  it('resolves click on page 2 paragraph to paragraph position, not table', () => {
    // Set up DOM with two page elements.
    // Page 1 is at DOM top=0, height=800.
    // Page 2 is at DOM top=824 (800 + 24 gap), height=800.
    container.innerHTML = `
      <div class="superdoc-page" data-page-index="0"
           style="position:absolute; top:0px; left:0px; width:600px; height:800px;"></div>
      <div class="superdoc-page" data-page-index="1"
           style="position:absolute; top:824px; left:0px; width:600px; height:800px;"></div>
    `;

    const page2El = container.querySelectorAll('.superdoc-page')[1] as HTMLElement;

    // Mock elementsFromPoint to return only the page element (no fragment/line found).
    // This simulates clicking on the left margin of the paragraph where no fragment
    // DOM element is under the pointer.
    withMockedElementsFromPoint([page2El, container], () => {
      // clientY = 864 → page 2 top (824) + 40 = paragraph Y on page 2
      // container-space Y = 864 (same as clientY at zoom=1 with no offset)
      // Page-relative Y should be 864 - 824 = 40 (where the paragraph is)
      const result = clickToPosition(
        layout,
        allBlocks,
        allMeasures,
        { x: 72, y: 864 }, // container-space point
        container, // DOM container
        72, // clientX
        864, // clientY
      );

      expect(result).not.toBeNull();
      // Should resolve to the paragraph (PM 100-128), NOT the table (PM 130-139)
      expect(result!.pos).toBeGreaterThanOrEqual(100);
      expect(result!.pos).toBeLessThanOrEqual(128);
      expect(result!.blockId).toBe('page2-para');
      expect(result!.pageIndex).toBe(1);
    });
  });

  it('falls back to geometry when no DOM container is provided', () => {
    // Without DOM container, uses pure geometry path.
    // container-space Y = 864, geometry page 2 top = 824 (800 + 24 gap)
    // page-relative Y = 864 - 824 = 40 → should hit the paragraph
    const result = clickToPosition(
      layout,
      allBlocks,
      allMeasures,
      { x: 72, y: 864 }, // container-space point
      // No DOM container — geometry fallback
    );

    expect(result).not.toBeNull();
    expect(result!.pos).toBeGreaterThanOrEqual(100);
    expect(result!.pos).toBeLessThanOrEqual(128);
    expect(result!.blockId).toBe('page2-para');
    expect(result!.pageIndex).toBe(1);
  });

  it('DOM-based Y handles zoom correctly', () => {
    // At 2x zoom, DOM page height is 1600px but layout height is 800.
    // Page 2 DOM top = (800*2) + 24*2 = 1648
    // clientY = 1728 → page-relative = (1728 - 1648) / 2 = 40
    container.innerHTML = `
      <div class="superdoc-page" data-page-index="0"
           style="position:absolute; top:0px; left:0px; width:1200px; height:1600px;"></div>
      <div class="superdoc-page" data-page-index="1"
           style="position:absolute; top:1648px; left:0px; width:1200px; height:1600px;"></div>
    `;

    const page2El = container.querySelectorAll('.superdoc-page')[1] as HTMLElement;

    withMockedElementsFromPoint([page2El, container], () => {
      const result = clickToPosition(
        layout,
        allBlocks,
        allMeasures,
        { x: 72, y: 864 }, // container-space (layout coordinates, not zoomed)
        container,
        144, // clientX at 2x
        1728, // clientY at 2x: page2 DOM top (1648) + 40*2 = 1728
      );

      expect(result).not.toBeNull();
      // Should still resolve to the paragraph
      expect(result!.pos).toBeGreaterThanOrEqual(100);
      expect(result!.pos).toBeLessThanOrEqual(128);
      expect(result!.blockId).toBe('page2-para');
    });
  });
});
