import { describe, expect, it, vi } from 'vitest';

import { createSuperDocUI } from './create-super-doc-ui.js';
import type { SuperDocLike } from './types.js';

/**
 * Stub for `ui.selection.getRects` / `ui.selection.getAnchorRect` tests.
 * Models the minimal `presentationEditor` surface the controller calls:
 * `getSelectionRects()` for the live path and `getRangeRects(from, to)`
 * for the captured path.
 */
function makeStubs(
  initial: {
    selectionRects?: Array<{
      pageIndex: number;
      left: number;
      top: number;
      right: number;
      bottom: number;
      width: number;
      height: number;
    }>;
    rangeRects?: Array<{
      pageIndex: number;
      left: number;
      top: number;
      right: number;
      bottom: number;
      width: number;
      height: number;
    }>;
    resolveTextTarget?: (target: { blockId: string }) => { from: number; to: number } | null;
  } = {},
) {
  const getSelectionRects = vi.fn(() => initial.selectionRects ?? []);
  const getRangeRects = vi.fn((_from: number, _to: number) => initial.rangeRects ?? []);

  const editor: {
    on: ReturnType<typeof vi.fn>;
    off: ReturnType<typeof vi.fn>;
    doc: unknown;
    presentationEditor: unknown;
  } = {
    on: vi.fn(),
    off: vi.fn(),
    doc: {
      selection: { current: vi.fn(() => ({ empty: true })) },
      comments: {
        list: vi.fn(() => ({
          evaluatedRevision: 'r1',
          total: 0,
          items: [],
          page: { limit: 0, offset: 0, returned: 0 },
        })),
      },
      trackChanges: {
        list: vi.fn(() => ({
          evaluatedRevision: 'r1',
          total: 0,
          items: [],
          page: { limit: 0, offset: 0, returned: 0 },
        })),
      },
    },
    presentationEditor: undefined,
  };
  editor.presentationEditor = {
    getSelectionRects,
    getRangeRects,
    getActiveEditor: () => editor,
  };

  const superdoc: SuperDocLike = {
    activeEditor: editor as never,
    config: { documentMode: 'editing' },
    on: vi.fn(),
    off: vi.fn(),
  };

  return { superdoc, editor, mocks: { getSelectionRects, getRangeRects } };
}

describe('ui.selection.getRects — live selection', () => {
  it('returns the painted rects from presentationEditor.getSelectionRects', () => {
    const { superdoc, mocks } = makeStubs({
      selectionRects: [
        { pageIndex: 0, left: 100, top: 200, right: 240, bottom: 220, width: 140, height: 20 },
        { pageIndex: 0, left: 80, top: 224, right: 200, bottom: 244, width: 120, height: 20 },
      ],
    });
    const ui = createSuperDocUI({ superdoc });

    const rects = ui.selection.getRects();

    expect(mocks.getSelectionRects).toHaveBeenCalledTimes(1);
    expect(rects).toHaveLength(2);
    expect(rects[0]).toEqual({ pageIndex: 0, left: 100, top: 200, width: 140, height: 20 });
    expect(rects[1]).toEqual({ pageIndex: 0, left: 80, top: 224, width: 120, height: 20 });
  });

  it('returns [] when no presentation editor is mounted (SSR / non-paginated stub)', () => {
    const { superdoc, editor } = makeStubs();
    (editor as { presentationEditor: unknown }).presentationEditor = undefined;
    const ui = createSuperDocUI({ superdoc });

    expect(ui.selection.getRects()).toEqual([]);
  });

  it('returns [] when getSelectionRects throws', () => {
    const { superdoc, mocks } = makeStubs({ selectionRects: [] });
    mocks.getSelectionRects.mockImplementationOnce(() => {
      throw new Error('boom');
    });
    const ui = createSuperDocUI({ superdoc });

    expect(ui.selection.getRects()).toEqual([]);
  });
});

describe('ui.selection.getAnchorRect — placement', () => {
  const lineRects = [
    { pageIndex: 0, left: 100, top: 200, right: 240, bottom: 220, width: 140, height: 20 },
    { pageIndex: 0, left: 80, top: 224, right: 260, bottom: 244, width: 180, height: 20 },
    { pageIndex: 0, left: 80, top: 248, right: 200, bottom: 268, width: 120, height: 20 },
  ];

  it("placement: 'start' (default) returns the first line rect", () => {
    const { superdoc } = makeStubs({ selectionRects: lineRects });
    const ui = createSuperDocUI({ superdoc });

    expect(ui.selection.getAnchorRect()).toEqual({
      pageIndex: 0,
      left: 100,
      top: 200,
      width: 140,
      height: 20,
    });
    expect(ui.selection.getAnchorRect({ placement: 'start' })).toEqual({
      pageIndex: 0,
      left: 100,
      top: 200,
      width: 140,
      height: 20,
    });
  });

  it("placement: 'end' returns the last line rect", () => {
    const { superdoc } = makeStubs({ selectionRects: lineRects });
    const ui = createSuperDocUI({ superdoc });

    expect(ui.selection.getAnchorRect({ placement: 'end' })).toEqual({
      pageIndex: 0,
      left: 80,
      top: 248,
      width: 120,
      height: 20,
    });
  });

  it("placement: 'union' returns the bounding rect across all lines", () => {
    const { superdoc } = makeStubs({ selectionRects: lineRects });
    const ui = createSuperDocUI({ superdoc });

    // Union: top=200, left=80, right=260, bottom=268 → width=180, height=68.
    expect(ui.selection.getAnchorRect({ placement: 'union' })).toEqual({
      pageIndex: 0,
      left: 80,
      top: 200,
      width: 180,
      height: 68,
    });
  });

  it('returns null when there are no rects', () => {
    const { superdoc } = makeStubs({ selectionRects: [] });
    const ui = createSuperDocUI({ superdoc });

    expect(ui.selection.getAnchorRect()).toBeNull();
    expect(ui.selection.getAnchorRect({ placement: 'union' })).toBeNull();
  });
});

describe('ui.selection.getRects — captured selection', () => {
  it('returns [] for a capture with no addressable target', () => {
    const { superdoc } = makeStubs();
    const ui = createSuperDocUI({ superdoc });

    // Synthetic frozen capture with no segments — exercises the early
    // return path before the resolver is touched.
    const fakeCapture = Object.freeze({
      empty: false,
      target: null,
      selectionTarget: null,
      activeMarks: [],
      activeCommentIds: [],
      activeChangeIds: [],
      quotedText: '',
    }) as never;

    expect(ui.selection.getRects(fakeCapture)).toEqual([]);
  });

  it('returns [] when getRangeRects is missing on the presentation stub', () => {
    const { superdoc, editor } = makeStubs();
    (editor as { presentationEditor: unknown }).presentationEditor = {
      getSelectionRects: () => [],
      getActiveEditor: () => editor,
    } as never;
    const ui = createSuperDocUI({ superdoc });

    const fakeCapture = Object.freeze({
      empty: false,
      target: { kind: 'text', segments: [{ blockId: 'b1', range: { start: 0, end: 4 } }] },
      selectionTarget: null,
      activeMarks: [],
      activeCommentIds: [],
      activeChangeIds: [],
      quotedText: 'test',
    }) as never;

    expect(ui.selection.getRects(fakeCapture)).toEqual([]);
  });
});
