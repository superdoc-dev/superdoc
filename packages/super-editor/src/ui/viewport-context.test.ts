import { describe, expect, it } from 'vitest';

import { buildViewportContext, isViewportContextBundle, pointInsideRects } from './viewport-context.js';
import type { SelectionSlice, ViewportRect } from './types.js';

const rect = (top: number, left: number, width: number, height: number, pageIndex = 0): ViewportRect => ({
  top,
  left,
  width,
  height,
  pageIndex,
});

const emptySelection: SelectionSlice = {
  empty: true,
  target: null,
  selectionTarget: null,
  activeMarks: [],
  activeCommentIds: [],
  activeChangeIds: [],
  quotedText: '',
};

describe('pointInsideRects', () => {
  it('returns false for an empty rects array (no live selection)', () => {
    expect(pointInsideRects(50, 50, [])).toBe(false);
  });

  it('returns true when the point lands strictly inside a rect', () => {
    expect(pointInsideRects(50, 50, [rect(40, 40, 100, 20)])).toBe(true);
  });

  it('treats rect edges as inside (inclusive bounds, no flicker on selection borders)', () => {
    const r = rect(40, 40, 100, 20);
    expect(pointInsideRects(40, 40, [r])).toBe(true); // top-left corner
    expect(pointInsideRects(140, 60, [r])).toBe(true); // bottom-right corner
  });

  it('returns false for points outside every rect', () => {
    expect(pointInsideRects(0, 0, [rect(40, 40, 100, 20)])).toBe(false);
    expect(pointInsideRects(200, 200, [rect(40, 40, 100, 20)])).toBe(false);
  });

  it('returns true when the point is inside any one of multiple rects (multi-line selection)', () => {
    // First rect spans x:[40,140], y:[40,60]; second rect spans x:[40,120], y:[64,84].
    // The gap row at y=62 sits between both — outside both rects.
    const rects = [rect(40, 40, 100, 20), rect(64, 40, 80, 20)];
    expect(pointInsideRects(50, 70, rects)).toBe(true); // inside second rect
    expect(pointInsideRects(50, 62, rects)).toBe(false); // gap between rows
  });
});

describe('buildViewportContext', () => {
  it('echoes the click point and composes the supplied primitives verbatim', () => {
    const entities = [{ type: 'comment', id: 'c1' } as const];
    const position = {
      point: { kind: 'text', blockId: 'p1', offset: 3 } as const,
      target: {
        kind: 'selection',
        start: { kind: 'text', blockId: 'p1', offset: 3 },
        end: { kind: 'text', blockId: 'p1', offset: 3 },
      } as const,
    };
    const ctx = buildViewportContext({
      x: 100,
      y: 200,
      entities,
      position,
      selection: emptySelection,
      selectionRects: [],
    });

    expect(ctx.point).toEqual({ x: 100, y: 200 });
    expect(ctx.entities).toBe(entities);
    expect(ctx.position).toBe(position);
    expect(ctx.selection).toBe(emptySelection);
    expect(ctx.insideSelection).toBe(false);
  });

  it('reports insideSelection when the click is inside any selection rect', () => {
    const ctx = buildViewportContext({
      x: 60,
      y: 50,
      entities: [],
      position: null,
      selection: emptySelection,
      selectionRects: [rect(40, 40, 100, 20)],
    });
    expect(ctx.insideSelection).toBe(true);
  });

  it('reports insideSelection=false when rects exist but the click is outside them', () => {
    const ctx = buildViewportContext({
      x: 0,
      y: 0,
      entities: [],
      position: null,
      selection: emptySelection,
      selectionRects: [rect(40, 40, 100, 20)],
    });
    expect(ctx.insideSelection).toBe(false);
  });
});

describe('isViewportContextBundle', () => {
  it('returns true only for objects whose `point` is `{ x: number, y: number }`', () => {
    expect(isViewportContextBundle({ point: { x: 0, y: 0 }, entities: [] })).toBe(true);
    expect(isViewportContextBundle({ point: { x: 100, y: 200 }, entities: [], position: null })).toBe(true);
  });

  it('rejects null / undefined', () => {
    expect(isViewportContextBundle(null)).toBe(false);
    expect(isViewportContextBundle(undefined)).toBe(false);
  });

  it('rejects the legacy `{ entities }` call shape', () => {
    expect(isViewportContextBundle({ entities: [] })).toBe(false);
    expect(isViewportContextBundle({})).toBe(false);
  });

  it('rejects an object whose `point` is null (avoids the `typeof null === "object"` trap)', () => {
    expect(isViewportContextBundle({ entities: [], point: null })).toBe(false);
  });

  it('rejects partially-built bundles missing numeric x / y', () => {
    expect(isViewportContextBundle({ point: {}, entities: [] })).toBe(false);
    expect(isViewportContextBundle({ point: { x: 'a', y: 0 }, entities: [] })).toBe(false);
    expect(isViewportContextBundle({ point: { x: 0 }, entities: [] })).toBe(false);
  });
});
