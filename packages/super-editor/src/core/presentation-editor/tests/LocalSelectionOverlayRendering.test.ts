import { describe, expect, it, vi, beforeEach } from 'vitest';

import {
  renderSelectionRects,
  renderCaretOverlay,
  type RenderSelectionRectsDeps,
  type RenderCaretOverlayDeps,
  type LayoutRect,
  type CaretLayoutRect,
} from '../LocalSelectionOverlayRendering.js';

describe('renderSelectionRects', () => {
  let localSelectionLayer: HTMLElement;
  let convertPageLocalToOverlayCoords: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    localSelectionLayer = document.createElement('div');
    convertPageLocalToOverlayCoords = vi.fn((pageIndex: number, x: number, y: number) => ({
      x: x + pageIndex * 100,
      y: y + pageIndex * 100,
    }));
  });

  it('renders single selection rectangle with correct positioning', () => {
    const rects: LayoutRect[] = [{ pageIndex: 0, x: 50, y: 100, width: 200, height: 16 }];

    const deps: RenderSelectionRectsDeps = {
      localSelectionLayer,
      rects,
      pageHeight: 1200,
      pageGap: 20,
      convertPageLocalToOverlayCoords,
    };

    renderSelectionRects(deps);

    const highlights = localSelectionLayer.querySelectorAll('.presentation-editor__selection-rect');
    expect(highlights.length).toBe(1);

    const highlight = highlights[0] as HTMLElement;
    expect(highlight.style.position).toBe('absolute');
    expect(highlight.style.left).toBe('50px'); // x + pageIndex * 100 = 50 + 0 = 50
    expect(highlight.style.top).toBe('100px'); // y + pageIndex * 100 = 100 + 0 = 100
    expect(highlight.style.width).toBe('200px');
    expect(highlight.style.height).toBe('16px');
  });

  it('renders multiple selection rectangles', () => {
    const rects: LayoutRect[] = [
      { pageIndex: 0, x: 50, y: 100, width: 200, height: 16 },
      { pageIndex: 0, x: 50, y: 120, width: 180, height: 16 },
      { pageIndex: 0, x: 50, y: 140, width: 150, height: 16 },
    ];

    const deps: RenderSelectionRectsDeps = {
      localSelectionLayer,
      rects,
      pageHeight: 1200,
      pageGap: 20,
      convertPageLocalToOverlayCoords,
    };

    renderSelectionRects(deps);

    const highlights = localSelectionLayer.querySelectorAll('.presentation-editor__selection-rect');
    expect(highlights.length).toBe(3);
  });

  it('applies correct styling to selection rectangles', () => {
    const rects: LayoutRect[] = [{ pageIndex: 0, x: 50, y: 100, width: 200, height: 16 }];

    const deps: RenderSelectionRectsDeps = {
      localSelectionLayer,
      rects,
      pageHeight: 1200,
      pageGap: 20,
      convertPageLocalToOverlayCoords,
    };

    renderSelectionRects(deps);

    const highlight = localSelectionLayer.querySelector('.presentation-editor__selection-rect') as HTMLElement;
    expect(highlight.style.backgroundColor).toBe('rgba(51, 132, 255, 0.35)');
    expect(highlight.style.borderRadius).toBe('2px');
    expect(highlight.style.pointerEvents).toBe('none');
  });

  it('clamps minimum width to 1px', () => {
    const rects: LayoutRect[] = [{ pageIndex: 0, x: 50, y: 100, width: 0.5, height: 16 }];

    const deps: RenderSelectionRectsDeps = {
      localSelectionLayer,
      rects,
      pageHeight: 1200,
      pageGap: 20,
      convertPageLocalToOverlayCoords,
    };

    renderSelectionRects(deps);

    const highlight = localSelectionLayer.querySelector('.presentation-editor__selection-rect') as HTMLElement;
    expect(parseInt(highlight.style.width)).toBe(1);
  });

  it('clamps minimum height to 1px', () => {
    const rects: LayoutRect[] = [{ pageIndex: 0, x: 50, y: 100, width: 200, height: 0.3 }];

    const deps: RenderSelectionRectsDeps = {
      localSelectionLayer,
      rects,
      pageHeight: 1200,
      pageGap: 20,
      convertPageLocalToOverlayCoords,
    };

    renderSelectionRects(deps);

    const highlight = localSelectionLayer.querySelector('.presentation-editor__selection-rect') as HTMLElement;
    expect(parseInt(highlight.style.height)).toBe(1);
  });

  it('handles zero width rectangles by clamping to 1px', () => {
    const rects: LayoutRect[] = [{ pageIndex: 0, x: 50, y: 100, width: 0, height: 16 }];

    const deps: RenderSelectionRectsDeps = {
      localSelectionLayer,
      rects,
      pageHeight: 1200,
      pageGap: 20,
      convertPageLocalToOverlayCoords,
    };

    renderSelectionRects(deps);

    const highlight = localSelectionLayer.querySelector('.presentation-editor__selection-rect') as HTMLElement;
    expect(parseInt(highlight.style.width)).toBe(1);
  });

  it('handles zero height rectangles by clamping to 1px', () => {
    const rects: LayoutRect[] = [{ pageIndex: 0, x: 50, y: 100, width: 200, height: 0 }];

    const deps: RenderSelectionRectsDeps = {
      localSelectionLayer,
      rects,
      pageHeight: 1200,
      pageGap: 20,
      convertPageLocalToOverlayCoords,
    };

    renderSelectionRects(deps);

    const highlight = localSelectionLayer.querySelector('.presentation-editor__selection-rect') as HTMLElement;
    expect(parseInt(highlight.style.height)).toBe(1);
  });

  it('handles negative width by clamping to 1px', () => {
    const rects: LayoutRect[] = [{ pageIndex: 0, x: 50, y: 100, width: -10, height: 16 }];

    const deps: RenderSelectionRectsDeps = {
      localSelectionLayer,
      rects,
      pageHeight: 1200,
      pageGap: 20,
      convertPageLocalToOverlayCoords,
    };

    renderSelectionRects(deps);

    const highlight = localSelectionLayer.querySelector('.presentation-editor__selection-rect') as HTMLElement;
    expect(parseInt(highlight.style.width)).toBe(1);
  });

  it('skips rectangles when coordinate conversion returns null (virtualized page)', () => {
    const coordsReturningNull = vi.fn(() => null);

    const rects: LayoutRect[] = [
      { pageIndex: 0, x: 50, y: 100, width: 200, height: 16 },
      { pageIndex: 1, x: 50, y: 120, width: 180, height: 16 },
    ];

    const deps: RenderSelectionRectsDeps = {
      localSelectionLayer,
      rects,
      pageHeight: 1200,
      pageGap: 20,
      convertPageLocalToOverlayCoords: coordsReturningNull,
    };

    renderSelectionRects(deps);

    const highlights = localSelectionLayer.querySelectorAll('.presentation-editor__selection-rect');
    expect(highlights.length).toBe(0);
  });

  it('handles partial virtualization (some pages mounted, others not)', () => {
    const selectiveCoords = vi.fn((pageIndex: number, x: number, y: number) => {
      if (pageIndex === 0) return { x, y };
      return null; // Page 1 is virtualized
    });

    const rects: LayoutRect[] = [
      { pageIndex: 0, x: 50, y: 100, width: 200, height: 16 },
      { pageIndex: 1, x: 50, y: 120, width: 180, height: 16 },
    ];

    const deps: RenderSelectionRectsDeps = {
      localSelectionLayer,
      rects,
      pageHeight: 1200,
      pageGap: 20,
      convertPageLocalToOverlayCoords: selectiveCoords,
    };

    renderSelectionRects(deps);

    const highlights = localSelectionLayer.querySelectorAll('.presentation-editor__selection-rect');
    expect(highlights.length).toBe(1); // Only page 0 rendered
  });

  it('correctly calculates page-local Y coordinate', () => {
    const coordsSpy = vi.fn((pageIndex: number, x: number, y: number) => ({ x, y }));

    const rects: LayoutRect[] = [{ pageIndex: 2, x: 50, y: 2540, width: 200, height: 16 }];

    const deps: RenderSelectionRectsDeps = {
      localSelectionLayer,
      rects,
      pageHeight: 1200,
      pageGap: 20,
      convertPageLocalToOverlayCoords: coordsSpy,
    };

    renderSelectionRects(deps);

    // pageLocalY = rect.y - pageIndex * (pageHeight + pageGap)
    // pageLocalY = 2540 - 2 * (1200 + 20) = 2540 - 2440 = 100
    expect(coordsSpy).toHaveBeenCalledWith(2, 50, 100);
  });

  it('handles empty rects array', () => {
    const deps: RenderSelectionRectsDeps = {
      localSelectionLayer,
      rects: [],
      pageHeight: 1200,
      pageGap: 20,
      convertPageLocalToOverlayCoords,
    };

    renderSelectionRects(deps);

    const highlights = localSelectionLayer.querySelectorAll('.presentation-editor__selection-rect');
    expect(highlights.length).toBe(0);
  });

  it('handles rectangles spanning multiple pages', () => {
    const rects: LayoutRect[] = [
      { pageIndex: 0, x: 50, y: 1190, width: 200, height: 16 },
      { pageIndex: 1, x: 50, y: 1220, width: 200, height: 16 },
      { pageIndex: 2, x: 50, y: 2440, width: 200, height: 16 },
    ];

    const deps: RenderSelectionRectsDeps = {
      localSelectionLayer,
      rects,
      pageHeight: 1200,
      pageGap: 20,
      convertPageLocalToOverlayCoords,
    };

    renderSelectionRects(deps);

    const highlights = localSelectionLayer.querySelectorAll('.presentation-editor__selection-rect');
    expect(highlights.length).toBe(3);
  });

  it('handles missing ownerDocument gracefully', () => {
    const layerWithoutDoc = {
      ownerDocument: null,
      querySelectorAll: vi.fn(() => []),
    } as unknown as HTMLElement;

    const rects: LayoutRect[] = [{ pageIndex: 0, x: 50, y: 100, width: 200, height: 16 }];

    const deps: RenderSelectionRectsDeps = {
      localSelectionLayer: layerWithoutDoc,
      rects,
      pageHeight: 1200,
      pageGap: 20,
      convertPageLocalToOverlayCoords,
    };

    expect(() => renderSelectionRects(deps)).not.toThrow();
  });
});

describe('renderCaretOverlay', () => {
  let localSelectionLayer: HTMLElement;
  let convertPageLocalToOverlayCoords: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    localSelectionLayer = document.createElement('div');
    convertPageLocalToOverlayCoords = vi.fn((pageIndex: number, x: number, y: number) => ({
      x: x + pageIndex * 50,
      y: y + pageIndex * 50,
    }));
  });

  it('renders caret with correct position and height', () => {
    const caretLayout: CaretLayoutRect = {
      pageIndex: 0,
      x: 100,
      y: 200,
      height: 18,
    };

    const deps: RenderCaretOverlayDeps = {
      localSelectionLayer,
      caretLayout,
      convertPageLocalToOverlayCoords,
    };

    renderCaretOverlay(deps);

    const caret = localSelectionLayer.querySelector('.presentation-editor__selection-caret') as HTMLElement;
    expect(caret).not.toBeNull();
    expect(caret.style.position).toBe('absolute');
    expect(caret.style.left).toBe('100px'); // x + pageIndex * 50 = 100 + 0
    expect(caret.style.top).toBe('200px'); // y + pageIndex * 50 = 200 + 0
    expect(caret.style.height).toBe('18px');
  });

  it('applies correct styling to caret element', () => {
    const caretLayout: CaretLayoutRect = {
      pageIndex: 0,
      x: 100,
      y: 200,
      height: 18,
    };

    const deps: RenderCaretOverlayDeps = {
      localSelectionLayer,
      caretLayout,
      convertPageLocalToOverlayCoords,
    };

    renderCaretOverlay(deps);

    const caret = localSelectionLayer.querySelector('.presentation-editor__selection-caret') as HTMLElement;
    expect(caret.style.width).toBe('2px');
    expect(caret.style.backgroundColor).toMatch(/#000000|rgb\(0,\s*0,\s*0\)/);
    expect(caret.style.borderRadius).toBe('1px');
    expect(caret.style.pointerEvents).toBe('none');
  });

  it('clamps minimum height to 1px', () => {
    const caretLayout: CaretLayoutRect = {
      pageIndex: 0,
      x: 100,
      y: 200,
      height: 0.5,
    };

    const deps: RenderCaretOverlayDeps = {
      localSelectionLayer,
      caretLayout,
      convertPageLocalToOverlayCoords,
    };

    renderCaretOverlay(deps);

    const caret = localSelectionLayer.querySelector('.presentation-editor__selection-caret') as HTMLElement;
    expect(parseInt(caret.style.height)).toBe(1);
  });

  it('handles zero height by clamping to 1px', () => {
    const caretLayout: CaretLayoutRect = {
      pageIndex: 0,
      x: 100,
      y: 200,
      height: 0,
    };

    const deps: RenderCaretOverlayDeps = {
      localSelectionLayer,
      caretLayout,
      convertPageLocalToOverlayCoords,
    };

    renderCaretOverlay(deps);

    const caret = localSelectionLayer.querySelector('.presentation-editor__selection-caret') as HTMLElement;
    expect(parseInt(caret.style.height)).toBe(1);
  });

  it('handles negative height by clamping to 1px', () => {
    const caretLayout: CaretLayoutRect = {
      pageIndex: 0,
      x: 100,
      y: 200,
      height: -5,
    };

    const deps: RenderCaretOverlayDeps = {
      localSelectionLayer,
      caretLayout,
      convertPageLocalToOverlayCoords,
    };

    renderCaretOverlay(deps);

    const caret = localSelectionLayer.querySelector('.presentation-editor__selection-caret') as HTMLElement;
    expect(parseInt(caret.style.height)).toBe(1);
  });

  it('does not render when coordinate conversion returns null (virtualized page)', () => {
    const coordsReturningNull = vi.fn(() => null);

    const caretLayout: CaretLayoutRect = {
      pageIndex: 0,
      x: 100,
      y: 200,
      height: 18,
    };

    const deps: RenderCaretOverlayDeps = {
      localSelectionLayer,
      caretLayout,
      convertPageLocalToOverlayCoords: coordsReturningNull,
    };

    renderCaretOverlay(deps);

    const caret = localSelectionLayer.querySelector('.presentation-editor__selection-caret');
    expect(caret).toBeNull();
  });

  it('handles caret on different page indices', () => {
    const coordsSpy = vi.fn((pageIndex: number, x: number, y: number) => ({
      x: x + pageIndex * 50,
      y: y + pageIndex * 50,
    }));

    const caretLayout: CaretLayoutRect = {
      pageIndex: 3,
      x: 100,
      y: 200,
      height: 18,
    };

    const deps: RenderCaretOverlayDeps = {
      localSelectionLayer,
      caretLayout,
      convertPageLocalToOverlayCoords: coordsSpy,
    };

    renderCaretOverlay(deps);

    expect(coordsSpy).toHaveBeenCalledWith(3, 100, 200);

    const caret = localSelectionLayer.querySelector('.presentation-editor__selection-caret') as HTMLElement;
    expect(caret.style.left).toBe('250px'); // 100 + 3 * 50
    expect(caret.style.top).toBe('350px'); // 200 + 3 * 50
  });

  it('handles very large caret heights', () => {
    const caretLayout: CaretLayoutRect = {
      pageIndex: 0,
      x: 100,
      y: 200,
      height: 1000,
    };

    const deps: RenderCaretOverlayDeps = {
      localSelectionLayer,
      caretLayout,
      convertPageLocalToOverlayCoords,
    };

    renderCaretOverlay(deps);

    const caret = localSelectionLayer.querySelector('.presentation-editor__selection-caret') as HTMLElement;
    expect(parseInt(caret.style.height)).toBe(1000);
  });

  it('handles missing ownerDocument gracefully', () => {
    const layerWithoutDoc = {
      ownerDocument: null,
      querySelector: vi.fn(() => null),
    } as unknown as HTMLElement;

    const caretLayout: CaretLayoutRect = {
      pageIndex: 0,
      x: 100,
      y: 200,
      height: 18,
    };

    const deps: RenderCaretOverlayDeps = {
      localSelectionLayer: layerWithoutDoc,
      caretLayout,
      convertPageLocalToOverlayCoords,
    };

    expect(() => renderCaretOverlay(deps)).not.toThrow();
  });

  it('handles fractional pixel positions', () => {
    const coordsWithFractional = vi.fn(() => ({
      x: 100.7,
      y: 200.3,
    }));

    const caretLayout: CaretLayoutRect = {
      pageIndex: 0,
      x: 100.7,
      y: 200.3,
      height: 18.5,
    };

    const deps: RenderCaretOverlayDeps = {
      localSelectionLayer,
      caretLayout,
      convertPageLocalToOverlayCoords: coordsWithFractional,
    };

    renderCaretOverlay(deps);

    const caret = localSelectionLayer.querySelector('.presentation-editor__selection-caret') as HTMLElement;
    expect(caret).not.toBeNull();
    expect(caret.style.left).toBe('100.7px');
    expect(caret.style.top).toBe('200.3px');
    expect(caret.style.height).toBe('18.5px');
  });

  it('handles caret at page boundaries', () => {
    const caretLayout: CaretLayoutRect = {
      pageIndex: 0,
      x: 0,
      y: 0,
      height: 18,
    };

    const deps: RenderCaretOverlayDeps = {
      localSelectionLayer,
      caretLayout,
      convertPageLocalToOverlayCoords,
    };

    renderCaretOverlay(deps);

    const caret = localSelectionLayer.querySelector('.presentation-editor__selection-caret') as HTMLElement;
    expect(caret).not.toBeNull();
    expect(caret.style.left).toBe('0px');
    expect(caret.style.top).toBe('0px');
  });

  it('handles very large page indices', () => {
    const caretLayout: CaretLayoutRect = {
      pageIndex: 1000,
      x: 100,
      y: 200,
      height: 18,
    };

    const deps: RenderCaretOverlayDeps = {
      localSelectionLayer,
      caretLayout,
      convertPageLocalToOverlayCoords,
    };

    renderCaretOverlay(deps);

    const caret = localSelectionLayer.querySelector('.presentation-editor__selection-caret') as HTMLElement;
    expect(caret).not.toBeNull();
    expect(parseInt(caret.style.left)).toBeGreaterThan(100);
    expect(parseInt(caret.style.top)).toBeGreaterThan(200);
  });
});
