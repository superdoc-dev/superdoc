import { describe, expect, it, vi } from 'vitest';

import { createSuperDocUI } from './create-super-doc-ui.js';
import type { SuperDocLike } from './types.js';

/**
 * Stub for `ui.viewport` tests. Models the minimal surface the
 * controller calls: `presentationEditor.getEntityRects` for geometry
 * lookups and `presentationEditor.navigateTo` for entity scroll.
 */
function makeStubs(
  initial: {
    rectsById?: Record<
      string,
      Array<{
        pageIndex: number;
        left: number;
        top: number;
        right: number;
        bottom: number;
        width: number;
        height: number;
      }>
    >;
  } = {},
) {
  const rectsById = initial.rectsById ?? {};

  const getEntityRects = vi.fn((target: { entityType?: unknown; entityId?: unknown; story?: unknown }) => {
    if (typeof target.entityId !== 'string') return [];
    return rectsById[target.entityId] ?? [];
  });
  const navigateTo = vi.fn(async (_target: unknown) => true);

  const editor: {
    on: ReturnType<typeof vi.fn>;
    off: ReturnType<typeof vi.fn>;
    doc: unknown;
    presentationEditor:
      | {
          getEntityRects: typeof getEntityRects;
          navigateTo: typeof navigateTo;
          getActiveEditor: () => unknown;
        }
      | undefined;
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
  // Self-reference so `presentationEditor.getActiveEditor()` returns the
  // same stub editor the toolbar source resolver expects when present.
  editor.presentationEditor = {
    getEntityRects,
    navigateTo,
    getActiveEditor: () => editor,
  };

  const superdoc: SuperDocLike = {
    activeEditor: editor as never,
    config: { documentMode: 'editing' },
    on: vi.fn(),
    off: vi.fn(),
  };

  return { superdoc, editor, mocks: { getEntityRects, navigateTo } };
}

describe('ui.viewport.getRect — entity targets', () => {
  it('returns success with primary rect + full rects[] for a painted comment', () => {
    const { superdoc, mocks } = makeStubs({
      rectsById: {
        c1: [
          { pageIndex: 0, left: 100, top: 200, right: 220, bottom: 220, width: 120, height: 20 },
          { pageIndex: 0, left: 100, top: 224, right: 180, bottom: 244, width: 80, height: 20 },
        ],
      },
    });
    const ui = createSuperDocUI({ superdoc });

    const result = ui.viewport.getRect({
      target: { kind: 'entity', entityType: 'comment', entityId: 'c1' },
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.rect).toEqual({ top: 200, left: 100, width: 120, height: 20, pageIndex: 0 });
    expect(result.rects).toHaveLength(2);
    expect(result.pageIndex).toBe(0);
    expect(mocks.getEntityRects).toHaveBeenCalledWith({
      entityType: 'comment',
      entityId: 'c1',
      story: undefined,
    });

    ui.destroy();
  });

  it('forwards the story when provided so non-body entities resolve correctly', () => {
    const { superdoc, mocks } = makeStubs({
      rectsById: {
        'tc-header': [{ pageIndex: 1, left: 0, top: 0, right: 50, bottom: 12, width: 50, height: 12 }],
      },
    });
    const ui = createSuperDocUI({ superdoc });

    ui.viewport.getRect({
      target: {
        kind: 'entity',
        entityType: 'trackedChange',
        entityId: 'tc-header',
        story: { kind: 'story', storyType: 'headerFooterPart', refId: 'rId1' },
      } as never,
    });

    expect(mocks.getEntityRects).toHaveBeenCalledWith({
      entityType: 'trackedChange',
      entityId: 'tc-header',
      story: { kind: 'story', storyType: 'headerFooterPart', refId: 'rId1' },
    });

    ui.destroy();
  });

  it('returns not-mounted when the entity is not painted (empty rects)', () => {
    const { superdoc } = makeStubs({ rectsById: {} });
    const ui = createSuperDocUI({ superdoc });

    const result = ui.viewport.getRect({
      target: { kind: 'entity', entityType: 'comment', entityId: 'c-missing' },
    });

    expect(result).toEqual({ success: false, reason: 'not-mounted' });
    ui.destroy();
  });

  it('returns invalid-target for missing or malformed targets', () => {
    const { superdoc } = makeStubs();
    const ui = createSuperDocUI({ superdoc });

    expect(ui.viewport.getRect({ target: null as never })).toEqual({
      success: false,
      reason: 'invalid-target',
    });
    expect(
      ui.viewport.getRect({
        target: { kind: 'entity', entityType: 'comment', entityId: '' } as never,
      }),
    ).toEqual({ success: false, reason: 'invalid-target' });
    expect(
      ui.viewport.getRect({
        target: { kind: 'entity', entityType: 'comment' } as never,
      }),
    ).toEqual({ success: false, reason: 'invalid-target' });

    ui.destroy();
  });

  it('returns invalid-target for unsupported entity types (e.g. typos, future kinds)', () => {
    const { superdoc, mocks } = makeStubs();
    const ui = createSuperDocUI({ superdoc });

    // A bogus entity type must short-circuit to `invalid-target` rather
    // than fall through to `getEntityRects` (which would emit `[]` and
    // surface as `not-mounted`, misleading consumers into retry loops).
    const result = ui.viewport.getRect({
      target: { kind: 'entity', entityType: 'mystery', entityId: 'x' } as never,
    });
    expect(result).toEqual({ success: false, reason: 'invalid-target' });
    // We never even consulted the engine for an unsupported type.
    expect(mocks.getEntityRects).not.toHaveBeenCalled();
    ui.destroy();
  });

  it('returns invalid-target for text-anchored targets (deferred path)', () => {
    const { superdoc } = makeStubs();
    const ui = createSuperDocUI({ superdoc });

    const result = ui.viewport.getRect({
      target: { kind: 'text', blockId: 'b1', range: { start: 0, end: 5 } } as never,
    });

    expect(result).toEqual({ success: false, reason: 'invalid-target' });
    ui.destroy();
  });

  it('returns not-ready when no presentation editor is mounted', () => {
    const { superdoc } = makeStubs();
    // Drop presentationEditor from the stub editor
    (superdoc.activeEditor as unknown as { presentationEditor: unknown }).presentationEditor = undefined;
    const ui = createSuperDocUI({ superdoc });

    const result = ui.viewport.getRect({
      target: { kind: 'entity', entityType: 'comment', entityId: 'c1' },
    });

    expect(result).toEqual({ success: false, reason: 'not-ready' });
    ui.destroy();
  });

  it('emits plain value rects (no DOMRect) — getRect outputs are JSON-serializable', () => {
    const { superdoc } = makeStubs({
      rectsById: {
        c1: [{ pageIndex: 2, left: 10, top: 20, right: 30, bottom: 40, width: 20, height: 20 }],
      },
    });
    const ui = createSuperDocUI({ superdoc });

    const result = ui.viewport.getRect({
      target: { kind: 'entity', entityType: 'comment', entityId: 'c1' },
    });

    if (!result.success) throw new Error('expected success');
    const json = JSON.parse(JSON.stringify(result.rect));
    expect(json).toEqual({ top: 20, left: 10, width: 20, height: 20, pageIndex: 2 });
    // pageIndex on the result mirrors the primary rect's pageIndex.
    expect(result.pageIndex).toBe(2);

    ui.destroy();
  });

  it('regression: getRect resolves through the host editor even when toolbar routing returns a child story editor', () => {
    // When focus is in a header / footer / note, the toolbar source
    // resolver returns the child story editor — but
    // `presentationEditor` lives on the host (body) editor only.
    // Routing getRect through the routed child would wrongly return
    // `not-ready`. The host's `getEntityRects` is the right call;
    // the entity target's `story` field carries the story info.
    const { superdoc, mocks } = makeStubs({
      rectsById: {
        'tc-header': [{ pageIndex: 1, left: 5, top: 6, right: 25, bottom: 18, width: 20, height: 12 }],
      },
    });
    // Plant a child story editor without its own `presentationEditor`
    // and route through it. Without the host fix, getRect would see
    // `presentation` undefined and return `not-ready`.
    const hostEditor = superdoc.activeEditor as unknown as {
      presentationEditor: { getActiveEditor: () => unknown };
    };
    hostEditor.presentationEditor.getActiveEditor = () => ({ doc: {} });

    const ui = createSuperDocUI({ superdoc });

    const result = ui.viewport.getRect({
      target: {
        kind: 'entity',
        entityType: 'trackedChange',
        entityId: 'tc-header',
      },
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.rect.width).toBe(20);
    expect(mocks.getEntityRects).toHaveBeenCalledTimes(1);

    ui.destroy();
  });
});

describe('ui.viewport.scrollIntoView', () => {
  it('navigates entity targets through the presentation editor', async () => {
    const { superdoc, mocks } = makeStubs();
    const ui = createSuperDocUI({ superdoc });

    const input = {
      target: { kind: 'entity' as const, entityType: 'comment' as const, entityId: 'c1' },
      block: 'center' as const,
      behavior: 'smooth' as const,
    };
    const result = await ui.viewport.scrollIntoView(input);

    expect(result).toEqual({ success: true });
    expect(mocks.navigateTo).toHaveBeenCalledWith(input.target, {
      behavior: 'smooth',
      block: 'center',
    });
    ui.destroy();
  });

  it('returns { success: false } when no presentation editor is mounted', async () => {
    const { superdoc } = makeStubs();
    (superdoc.activeEditor as unknown as { presentationEditor: unknown }).presentationEditor = undefined;
    const ui = createSuperDocUI({ superdoc });

    const result = await ui.viewport.scrollIntoView({
      target: { kind: 'entity', entityType: 'comment', entityId: 'c1' },
    });

    expect(result).toEqual({ success: false });
    ui.destroy();
  });
});
