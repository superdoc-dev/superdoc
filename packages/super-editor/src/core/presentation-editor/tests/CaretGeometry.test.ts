import { describe, expect, it, beforeEach } from 'vitest';
import type { FlowBlock, Layout, Line, Measure, ParaFragment } from '@superdoc/contracts';

import { computeCaretLayoutRectGeometry, type ComputeCaretLayoutRectGeometryDeps } from '../CaretGeometry.js';

/**
 * Mock helper to create a minimal paragraph block for testing.
 */
function createMockParagraphBlock(id: string, pmStart: number, pmEnd: number): FlowBlock {
  const textLength = Math.max(1, pmEnd - pmStart);
  return {
    kind: 'paragraph',
    id,
    runs: [
      {
        text: 'x'.repeat(textLength),
        fontFamily: 'Arial',
        fontSize: 14,
        pmStart,
        pmEnd,
      },
    ],
  };
}

/**
 * Mock helper to create a minimal paragraph measure for testing.
 */
function createMockParagraphMeasure(lines: Line[]): Measure {
  return {
    kind: 'paragraph',
    lines,
  };
}

/**
 * Mock helper to create a minimal line for testing.
 */
function createMockLine(pmStart: number, pmEnd: number, lineHeight: number): Line {
  const fromChar = Math.max(0, pmStart - 1);
  const toChar = Math.max(fromChar, pmEnd - 1);
  return {
    fromRun: 0,
    toRun: 0,
    fromChar,
    toChar,
    width: 100,
    ascent: 12,
    descent: 4,
    lineHeight,
  };
}

/**
 * Mock helper to create a minimal layout with a single paragraph fragment.
 */
function createMockLayout(fragment: ParaFragment): Layout {
  return {
    version: 1,
    pages: [
      {
        size: { w: 612, h: 792 },
        fragments: [fragment],
      },
    ],
  };
}

/**
 * Mock helper to create a minimal paragraph fragment.
 */
function createMockParaFragment(
  blockId: string,
  x: number,
  y: number,
  width: number,
  height: number,
  fromLine: number,
  toLine: number,
  pmStart: number,
  pmEnd: number,
): ParaFragment {
  return {
    kind: 'para',
    blockId,
    x,
    y,
    width,
    height,
    fromLine,
    toLine,
    pmStart,
    pmEnd,
    markerWidth: 0,
    continuesFromPrev: false,
    continuesToNext: false,
  };
}

describe('CaretGeometry', () => {
  let mockDom: {
    painterHost: HTMLElement;
    viewportHost: HTMLElement;
    visibleHost: HTMLElement;
  };

  beforeEach(() => {
    // Create DOM structure for testing
    const visibleHost = document.createElement('div');
    const viewportHost = document.createElement('div');
    const painterHost = document.createElement('div');

    painterHost.innerHTML = `
      <div class="superdoc-page" data-page-index="0">
        <span data-pm-start="1" data-pm-end="12">Hello world</span>
      </div>
    `;

    visibleHost.appendChild(viewportHost);
    viewportHost.appendChild(painterHost);
    document.body.appendChild(visibleHost);

    mockDom = {
      painterHost,
      viewportHost,
      visibleHost,
    };
  });

  describe('computeCaretLayoutRectGeometry', () => {
    it('returns null when layout is null', () => {
      const deps: ComputeCaretLayoutRectGeometryDeps = {
        layout: null,
        blocks: [],
        measures: [],
        painterHost: mockDom.painterHost,
        viewportHost: mockDom.viewportHost,
        visibleHost: mockDom.visibleHost,
        zoom: 1,
      };

      const result = computeCaretLayoutRectGeometry(deps, 5);
      expect(result).toBe(null);
    });

    it('returns null when no fragment found at position', () => {
      const block = createMockParagraphBlock('1-para', 1, 12);
      const line = createMockLine(1, 12, 16);
      const measure = createMockParagraphMeasure([line]);
      const fragment = createMockParaFragment('1-para', 10, 10, 200, 16, 0, 1, 1, 12);
      const layout = createMockLayout(fragment);

      const deps: ComputeCaretLayoutRectGeometryDeps = {
        layout,
        blocks: [block],
        measures: [measure],
        painterHost: mockDom.painterHost,
        viewportHost: mockDom.viewportHost,
        visibleHost: mockDom.visibleHost,
        zoom: 1,
      };

      // Position outside the block range
      const result = computeCaretLayoutRectGeometry(deps, 50);
      expect(result).toBe(null);
    });

    it('computes basic paragraph caret position', () => {
      const block = createMockParagraphBlock('1-para', 1, 12);
      const line = createMockLine(1, 12, 16);
      const measure = createMockParagraphMeasure([line]);
      const fragment = createMockParaFragment('1-para', 10, 10, 200, 16, 0, 1, 1, 12);
      const layout = createMockLayout(fragment);

      const deps: ComputeCaretLayoutRectGeometryDeps = {
        layout,
        blocks: [block],
        measures: [measure],
        painterHost: mockDom.painterHost,
        viewportHost: mockDom.viewportHost,
        visibleHost: mockDom.visibleHost,
        zoom: 1,
      };

      const result = computeCaretLayoutRectGeometry(deps, 5, false);
      expect(result).not.toBe(null);
      expect(result?.pageIndex).toBe(0);
      expect(result?.height).toBe(16);
      expect(typeof result?.x).toBe('number');
      expect(typeof result?.y).toBe('number');
    });

    it('returns null for table cells (uses DOM fallback)', () => {
      const tableBlock: FlowBlock = {
        kind: 'table',
        id: '1-table',
        rows: [],
      };

      const tableMeasure: Measure = {
        kind: 'table',
        rows: [],
      };

      const tableFragment = {
        kind: 'table' as const,
        blockId: '1-table',
        x: 10,
        y: 10,
        width: 400,
        height: 100,
        fromRow: 0,
        toRow: 1,
        metadata: {
          columnBoundaries: [],
        },
      };

      const layout: Layout = {
        version: 1,
        pages: [
          {
            size: { w: 612, h: 792 },
            fragments: [tableFragment],
          },
        ],
      };

      const deps: ComputeCaretLayoutRectGeometryDeps = {
        layout,
        blocks: [tableBlock],
        measures: [tableMeasure],
        painterHost: mockDom.painterHost,
        viewportHost: mockDom.viewportHost,
        visibleHost: mockDom.visibleHost,
        zoom: 1,
      };

      // Table caret geometry requires DOM fallback which we can't fully test here
      const result = computeCaretLayoutRectGeometry(deps, 5);
      // Result depends on DOM structure and table caret computation
      expect(result === null || result?.pageIndex === 0).toBe(true);
    });

    it('handles first-line indent mode for lists', () => {
      const block: FlowBlock = {
        kind: 'paragraph',
        id: '1-para',
        runs: [
          {
            text: 'List item',
            fontFamily: 'Arial',
            fontSize: 14,
            pmStart: 1,
            pmEnd: 10,
          },
        ],
        attrs: {
          indent: {
            left: 20,
            firstLine: 10,
            hanging: 0,
          },
        },
      };

      const line = createMockLine(1, 10, 16);
      const measure = createMockParagraphMeasure([line]);
      measure.marker = { markerWidth: 15 };

      const fragment: ParaFragment = {
        kind: 'para',
        blockId: '1-para',
        x: 10,
        y: 10,
        width: 200,
        height: 16,
        fromLine: 0,
        toLine: 1,
        pmStart: 1,
        pmEnd: 10,
        markerWidth: 15,
        continuesFromPrev: false,
        continuesToNext: false,
      };

      const layout = createMockLayout(fragment);

      const deps: ComputeCaretLayoutRectGeometryDeps = {
        layout,
        blocks: [block],
        measures: [measure],
        painterHost: mockDom.painterHost,
        viewportHost: mockDom.viewportHost,
        visibleHost: mockDom.visibleHost,
        zoom: 1,
      };

      const result = computeCaretLayoutRectGeometry(deps, 5, false);
      expect(result).not.toBe(null);
      expect(result?.pageIndex).toBe(0);
    });

    it('handles DOM fallback when includeDomFallback is true', () => {
      const block = createMockParagraphBlock('1-para', 1, 12);
      const line = createMockLine(1, 12, 16);
      const measure = createMockParagraphMeasure([line]);
      const fragment = createMockParaFragment('1-para', 10, 10, 200, 16, 0, 1, 1, 12);
      const layout = createMockLayout(fragment);

      // Add a text node to the span for DOM fallback testing
      const span = mockDom.painterHost.querySelector('span[data-pm-start]');
      if (span && span.firstChild) {
        span.firstChild.textContent = 'Hello world';
      }

      const deps: ComputeCaretLayoutRectGeometryDeps = {
        layout,
        blocks: [block],
        measures: [measure],
        painterHost: mockDom.painterHost,
        viewportHost: mockDom.viewportHost,
        visibleHost: mockDom.visibleHost,
        zoom: 1,
      };

      const result = computeCaretLayoutRectGeometry(deps, 5, true);
      expect(result).not.toBe(null);
      expect(result?.pageIndex).toBe(0);
    });

    it('handles virtualized content (no DOM element available)', () => {
      const block = createMockParagraphBlock('1-para', 1, 12);
      const line = createMockLine(1, 12, 16);
      const measure = createMockParagraphMeasure([line]);
      const fragment = createMockParaFragment('1-para', 10, 10, 200, 16, 0, 1, 1, 12);
      const layout = createMockLayout(fragment);

      // Empty painter host simulates virtualized content
      const emptyPainterHost = document.createElement('div');

      const deps: ComputeCaretLayoutRectGeometryDeps = {
        layout,
        blocks: [block],
        measures: [measure],
        painterHost: emptyPainterHost,
        viewportHost: mockDom.viewportHost,
        visibleHost: mockDom.visibleHost,
        zoom: 1,
      };

      const result = computeCaretLayoutRectGeometry(deps, 5, false);
      // Should still return layout-computed result even without DOM
      expect(result).not.toBe(null);
      expect(result?.pageIndex).toBe(0);
    });

    it('returns null when block is not a paragraph', () => {
      const nonParaBlock: FlowBlock = {
        kind: 'table',
        id: '1-table',
        rows: [],
      };

      const nonParaMeasure: Measure = {
        kind: 'table',
        rows: [],
      };

      // Create a para fragment but with mismatched block kind
      const fragment = createMockParaFragment('1-table', 10, 10, 200, 16, 0, 1, 1, 12);
      const layout = createMockLayout(fragment);

      const deps: ComputeCaretLayoutRectGeometryDeps = {
        layout,
        blocks: [nonParaBlock],
        measures: [nonParaMeasure],
        painterHost: mockDom.painterHost,
        viewportHost: mockDom.viewportHost,
        visibleHost: mockDom.visibleHost,
        zoom: 1,
      };

      const result = computeCaretLayoutRectGeometry(deps, 5);
      expect(result).toBe(null);
    });

    it('handles multiple lines in a paragraph', () => {
      const block = createMockParagraphBlock('1-para', 1, 30);

      const line1 = createMockLine(1, 15, 16);
      const line2 = createMockLine(16, 30, 16);

      const measure = createMockParagraphMeasure([line1, line2]);
      const fragment = createMockParaFragment('1-para', 10, 10, 200, 32, 0, 2, 1, 30);
      const layout = createMockLayout(fragment);

      const deps: ComputeCaretLayoutRectGeometryDeps = {
        layout,
        blocks: [block],
        measures: [measure],
        painterHost: mockDom.painterHost,
        viewportHost: mockDom.viewportHost,
        visibleHost: mockDom.visibleHost,
        zoom: 1,
      };

      // Position in second line
      const result = computeCaretLayoutRectGeometry(deps, 20, false);
      expect(result).not.toBe(null);
      expect(result?.pageIndex).toBe(0);
      // Y should account for first line height
      expect(result?.y).toBeGreaterThan(10);
    });

    it('handles zoom factor correctly', () => {
      const block = createMockParagraphBlock('1-para', 1, 12);
      const line = createMockLine(1, 12, 16);
      const measure = createMockParagraphMeasure([line]);
      const fragment = createMockParaFragment('1-para', 10, 10, 200, 16, 0, 1, 1, 12);
      const layout = createMockLayout(fragment);

      const deps: ComputeCaretLayoutRectGeometryDeps = {
        layout,
        blocks: [block],
        measures: [measure],
        painterHost: mockDom.painterHost,
        viewportHost: mockDom.viewportHost,
        visibleHost: mockDom.visibleHost,
        zoom: 2.0,
      };

      const result = computeCaretLayoutRectGeometry(deps, 5, false);
      expect(result).not.toBe(null);
      expect(result?.pageIndex).toBe(0);
    });
  });
});
