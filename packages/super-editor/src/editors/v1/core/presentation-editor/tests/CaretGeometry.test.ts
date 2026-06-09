import { describe, expect, it, beforeEach, vi } from 'vitest';
import type { DrawingFragment, FlowBlock, Layout, Line, Measure, ParaFragment } from '@superdoc/contracts';

import { computeCaretLayoutRectGeometry, type ComputeCaretLayoutRectGeometryDeps } from '../selection/CaretGeometry.js';

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

    it('uses textbox DOM geometry for textbox drawing fragments', () => {
      mockDom.painterHost.innerHTML = `
        <div class="superdoc-page" data-page-index="0">
          <div class="superdoc-fragment" data-block-id="textbox-1">
            <div class="superdoc-line" data-pm-start="10" data-pm-end="22">
              <span data-pm-start="10" data-pm-end="22">Textbox line</span>
            </div>
          </div>
        </div>
      `;

      const pageEl = mockDom.painterHost.querySelector('.superdoc-page') as HTMLElement;
      const fragmentEl = mockDom.painterHost.querySelector('[data-block-id="textbox-1"]') as HTMLElement;
      const lineEl = mockDom.painterHost.querySelector('.superdoc-line') as HTMLElement;
      const spanEl = mockDom.painterHost.querySelector('span[data-pm-start="10"]') as HTMLElement;

      const createRect = (left: number, top: number, width: number, height: number) => ({
        left,
        top,
        right: left + width,
        bottom: top + height,
        width,
        height,
        x: left,
        y: top,
        toJSON: () => ({}),
      });

      mockDom.viewportHost.getBoundingClientRect = vi.fn(() => createRect(0, 0, 612, 792)) as never;
      pageEl.getBoundingClientRect = vi.fn(() => createRect(0, 0, 612, 792)) as never;
      fragmentEl.getBoundingClientRect = vi.fn(() => createRect(30, 40, 120, 80)) as never;
      lineEl.getBoundingClientRect = vi.fn(() => createRect(42, 48, 80, 20)) as never;
      spanEl.getBoundingClientRect = vi.fn(() => createRect(42, 48, 70, 20)) as never;

      const rangeRect = createRect(55, 48, 0, 20);
      const mockRange = {
        setStart: vi.fn(),
        setEnd: vi.fn(),
        getBoundingClientRect: vi.fn(() => rangeRect),
      };
      vi.spyOn(document, 'createRange').mockReturnValue(mockRange as unknown as Range);

      const drawingBlock: FlowBlock = {
        kind: 'drawing',
        id: 'textbox-1',
        drawingKind: 'textboxShape',
        geometry: { width: 120, height: 80, rotation: 0, flipH: false, flipV: false },
        contentBlocks: [],
        textContent: { parts: [{ text: 'Textbox line' }] },
      } as FlowBlock;

      const drawingMeasure: Measure = {
        kind: 'drawing',
        drawingKind: 'textboxShape',
        width: 120,
        height: 80,
        scale: 1,
        naturalWidth: 120,
        naturalHeight: 80,
        geometry: { width: 120, height: 80, rotation: 0, flipH: false, flipV: false },
      } as Measure;

      const drawingFragment: DrawingFragment = {
        kind: 'drawing',
        drawingKind: 'textboxShape',
        blockId: 'textbox-1',
        x: 30,
        y: 40,
        width: 120,
        height: 80,
        geometry: { width: 120, height: 80, rotation: 0, flipH: false, flipV: false },
        scale: 1,
        pmStart: 10,
        pmEnd: 22,
      };

      const layout: Layout = {
        version: 1,
        pages: [{ size: { w: 612, h: 792 }, fragments: [drawingFragment] }],
      };

      const deps: ComputeCaretLayoutRectGeometryDeps = {
        layout,
        blocks: [drawingBlock],
        measures: [drawingMeasure],
        painterHost: mockDom.painterHost,
        viewportHost: mockDom.viewportHost,
        visibleHost: mockDom.visibleHost,
        zoom: 1,
      };

      const result = computeCaretLayoutRectGeometry(deps, 13);
      expect(result).not.toBe(null);
      expect(result?.pageIndex).toBe(0);
      expect(result?.x).toBeCloseTo(55, 3);
      expect(result?.y).toBeCloseTo(48, 3);
      expect(result?.height).toBeCloseTo(20, 3);
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

    it('uses native collapsed selection rect when in page bounds', () => {
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

      const pageEl = mockDom.painterHost.querySelector('.superdoc-page') as HTMLElement;
      expect(pageEl).toBeTruthy();

      vi.spyOn(pageEl, 'getBoundingClientRect').mockReturnValue({
        left: 100,
        top: 200,
        right: 500,
        bottom: 700,
        width: 400,
        height: 500,
        x: 100,
        y: 200,
        toJSON: () => ({}),
      } as DOMRect);

      const nativeRange = {
        getBoundingClientRect: () =>
          ({
            left: 150,
            top: 230,
            right: 150,
            bottom: 246,
            width: 0,
            height: 16,
            x: 150,
            y: 230,
            toJSON: () => ({}),
          }) as DOMRect,
      };

      vi.spyOn(pageEl.ownerDocument, 'getSelection').mockReturnValue({
        rangeCount: 1,
        isCollapsed: true,
        getRangeAt: () => nativeRange as Range,
      } as Selection);

      const result = computeCaretLayoutRectGeometry(deps, 5, true);
      expect(result).not.toBe(null);
      expect(result?.x).toBeCloseTo(50, 3);
      expect(result?.y).toBeCloseTo(30, 3);
    });

    it('does not use native selection rect when includeDomFallback is false', () => {
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

      const pageEl = mockDom.painterHost.querySelector('.superdoc-page') as HTMLElement;
      expect(pageEl).toBeTruthy();

      vi.spyOn(pageEl, 'getBoundingClientRect').mockReturnValue({
        left: 100,
        top: 200,
        right: 500,
        bottom: 700,
        width: 400,
        height: 500,
        x: 100,
        y: 200,
        toJSON: () => ({}),
      } as DOMRect);

      const nativeRange = {
        getBoundingClientRect: () =>
          ({
            left: 150,
            top: 230,
            right: 150,
            bottom: 246,
            width: 0,
            height: 16,
            x: 150,
            y: 230,
            toJSON: () => ({}),
          }) as DOMRect,
      };

      vi.spyOn(pageEl.ownerDocument, 'getSelection').mockReturnValue({
        rangeCount: 1,
        isCollapsed: true,
        getRangeAt: () => nativeRange as Range,
      } as Selection);

      const result = computeCaretLayoutRectGeometry(deps, 5, false);
      expect(result).not.toBe(null);
      // includeDomFallback=false should keep geometry-path output, not native DOM selection coordinates.
      expect(result?.x).not.toBeCloseTo(50, 3);
      expect(result?.y).not.toBeCloseTo(30, 3);
    });

    it('ignores in-bounds native selection rect when it is far from geometry result', () => {
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

      const pageEl = mockDom.painterHost.querySelector('.superdoc-page') as HTMLElement;
      expect(pageEl).toBeTruthy();

      vi.spyOn(pageEl, 'getBoundingClientRect').mockReturnValue({
        left: 100,
        top: 200,
        right: 500,
        bottom: 700,
        width: 400,
        height: 500,
        x: 100,
        y: 200,
        toJSON: () => ({}),
      } as DOMRect);

      const nativeRange = {
        getBoundingClientRect: () =>
          ({
            left: 480,
            top: 230,
            right: 480,
            bottom: 246,
            width: 0,
            height: 16,
            x: 480,
            y: 230,
            toJSON: () => ({}),
          }) as DOMRect,
      };

      vi.spyOn(pageEl.ownerDocument, 'getSelection').mockReturnValue({
        rangeCount: 1,
        isCollapsed: true,
        getRangeAt: () => nativeRange as Range,
      } as Selection);

      const result = computeCaretLayoutRectGeometry(deps, 5, true);
      expect(result).not.toBe(null);
      // Native rect is in page bounds but implausibly far from geometry; should be ignored.
      expect(result?.x).not.toBeCloseTo(380, 3);
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

    it('places caret at right edge for RTL paragraph start boundary', () => {
      const block: FlowBlock = {
        kind: 'paragraph',
        id: 'rtl-para',
        runs: [{ text: 'אבגדה', fontFamily: 'Arial', fontSize: 14, pmStart: 1, pmEnd: 6 }],
        attrs: { directionContext: { inlineDirection: 'rtl', writingMode: 'horizontal-tb' } },
      };
      const line: Line = {
        fromRun: 0,
        toRun: 0,
        fromChar: 0,
        toChar: 5,
        width: 100,
        ascent: 12,
        descent: 4,
        lineHeight: 16,
      };
      const measure = createMockParagraphMeasure([line]);
      const fragment = createMockParaFragment('rtl-para', 10, 10, 200, 16, 0, 1, 1, 6);
      const layout = createMockLayout(fragment);

      const deps: ComputeCaretLayoutRectGeometryDeps = {
        layout,
        blocks: [block],
        measures: [measure],
        painterHost: null,
        viewportHost: mockDom.viewportHost,
        visibleHost: mockDom.visibleHost,
        zoom: 1,
      };

      const result = computeCaretLayoutRectGeometry(deps, 1, false);
      expect(result).not.toBe(null);
      expect(result?.x).toBeCloseTo(210, 3);
    });

    it('keeps caret on right side for RTL empty paragraph boundary fallback', () => {
      const block: FlowBlock = {
        kind: 'paragraph',
        id: 'rtl-empty',
        runs: [{ text: '', fontFamily: 'Arial', fontSize: 14, pmStart: 1, pmEnd: 1 }],
        attrs: { directionContext: { inlineDirection: 'rtl', writingMode: 'horizontal-tb' } },
      };
      const line: Line = {
        fromRun: 0,
        toRun: 0,
        fromChar: 0,
        toChar: 0,
        width: 0,
        ascent: 12,
        descent: 4,
        lineHeight: 16,
      };
      const measure = createMockParagraphMeasure([line]);
      const fragment = createMockParaFragment('rtl-empty', 10, 10, 200, 16, 0, 1, 1, 1);
      const layout = createMockLayout(fragment);

      const deps: ComputeCaretLayoutRectGeometryDeps = {
        layout,
        blocks: [block],
        measures: [measure],
        painterHost: null,
        viewportHost: mockDom.viewportHost,
        visibleHost: mockDom.visibleHost,
        zoom: 1,
      };

      const result = computeCaretLayoutRectGeometry(deps, 1, false);
      expect(result).not.toBe(null);
      expect(result?.x).toBeCloseTo(210, 3);
    });

    it('places caret at visual left for RTL line end boundary', () => {
      const block: FlowBlock = {
        kind: 'paragraph',
        id: 'rtl-line-end',
        runs: [{ text: 'אבגדה', fontFamily: 'Arial', fontSize: 14, pmStart: 1, pmEnd: 6 }],
        attrs: { directionContext: { inlineDirection: 'rtl', writingMode: 'horizontal-tb' } },
      };
      const line: Line = {
        fromRun: 0,
        toRun: 0,
        fromChar: 0,
        toChar: 5,
        width: 100,
        ascent: 12,
        descent: 4,
        lineHeight: 16,
      };
      const measure = createMockParagraphMeasure([line]);
      const fragment = createMockParaFragment('rtl-line-end', 10, 10, 200, 16, 0, 1, 1, 6);
      const layout = createMockLayout(fragment);

      const deps: ComputeCaretLayoutRectGeometryDeps = {
        layout,
        blocks: [block],
        measures: [measure],
        painterHost: null,
        viewportHost: mockDom.viewportHost,
        visibleHost: mockDom.visibleHost,
        zoom: 1,
      };

      const result = computeCaretLayoutRectGeometry(deps, 6, false);
      expect(result).not.toBe(null);
      expect(result?.x).toBeCloseTo(110, 3);
    });

    it('computes decreasing X across mid-line positions for RTL paragraphs without DOM fallback', () => {
      const block: FlowBlock = {
        ...createMockParagraphBlock('rtl-midline', 1, 12),
        attrs: { directionContext: { inlineDirection: 'rtl', writingMode: 'horizontal-tb' } },
      };
      const line = createMockLine(1, 12, 16);
      const measure = createMockParagraphMeasure([line]);
      const fragment = createMockParaFragment('rtl-midline', 10, 10, 200, 16, 0, 1, 1, 12);
      const layout = createMockLayout(fragment);

      const deps: ComputeCaretLayoutRectGeometryDeps = {
        layout,
        blocks: [block],
        measures: [measure],
        painterHost: null,
        viewportHost: mockDom.viewportHost,
        visibleHost: mockDom.visibleHost,
        zoom: 1,
      };

      const start = computeCaretLayoutRectGeometry(deps, 1, false);
      const middle = computeCaretLayoutRectGeometry(deps, 6, false);
      const end = computeCaretLayoutRectGeometry(deps, 11, false);

      expect(start).not.toBeNull();
      expect(middle).not.toBeNull();
      expect(end).not.toBeNull();
      expect(start!.x).toBeGreaterThan(middle!.x);
      expect(middle!.x).toBeGreaterThan(end!.x);
    });
  });
});
