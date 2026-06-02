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

describe('ui.viewport.entityAt — host scoping', () => {
  it('returns [] for invalid input (missing or non-numeric coordinates)', () => {
    const { superdoc } = makeStubs();
    const ui = createSuperDocUI({ superdoc });

    expect(ui.viewport.entityAt({} as never)).toEqual([]);
    expect(ui.viewport.entityAt({ x: 'a', y: 0 } as never)).toEqual([]);

    ui.destroy();
  });

  it('returns [] when no editor is mounted (no presentationEditor.visibleHost)', () => {
    const { superdoc } = makeStubs();
    // Stub editor has no `visibleHost` on its presentationEditor —
    // simulating SSR / non-paginated mounts and post-destroy state.
    const ui = createSuperDocUI({ superdoc });

    expect(ui.viewport.entityAt({ x: 10, y: 10 })).toEqual([]);

    ui.destroy();
  });

  it('returns [] when the hit element is outside the controller`s painted host', () => {
    const { superdoc } = makeStubs();
    // Mount a fake host on the stub presentation editor and put the
    // "hit" element OUTSIDE that host — the equivalent of a second
    // SuperDoc instance painting the cursor target.
    const host = document.createElement('div');
    document.body.appendChild(host);
    (
      superdoc.activeEditor as unknown as { presentationEditor: { visibleHost: HTMLElement } }
    ).presentationEditor.visibleHost = host;

    const outside = document.createElement('span');
    outside.dataset.commentIds = 'c-foreign';
    document.body.appendChild(outside);

    const docAny = document as unknown as { elementFromPoint?: (x: number, y: number) => Element | null };
    const original = docAny.elementFromPoint;
    docAny.elementFromPoint = () => outside;

    const ui = createSuperDocUI({ superdoc });
    expect(ui.viewport.entityAt({ x: 0, y: 0 })).toEqual([]);

    if (original) docAny.elementFromPoint = original;
    else delete docAny.elementFromPoint;
    outside.remove();
    host.remove();
    ui.destroy();
  });
});

describe('ui.viewport.getHost', () => {
  it('returns the painted host element when one is mounted', () => {
    const { superdoc } = makeStubs();
    const host = document.createElement('div');
    document.body.appendChild(host);
    (
      superdoc.activeEditor as unknown as { presentationEditor: { visibleHost: HTMLElement } }
    ).presentationEditor.visibleHost = host;

    const ui = createSuperDocUI({ superdoc });
    expect(ui.viewport.getHost()).toBe(host);

    host.remove();
    ui.destroy();
  });

  it('returns null when no editor is mounted', () => {
    const { superdoc } = makeStubs();
    (superdoc.activeEditor as unknown as { presentationEditor: unknown }).presentationEditor = undefined;
    const ui = createSuperDocUI({ superdoc });
    expect(ui.viewport.getHost()).toBeNull();
    ui.destroy();
  });
});

describe('ui.viewport.positionAt — input validation', () => {
  it('returns null for invalid input (missing or non-numeric coordinates)', () => {
    const { superdoc } = makeStubs();
    const ui = createSuperDocUI({ superdoc });

    expect(ui.viewport.positionAt({} as never)).toBeNull();
    expect(ui.viewport.positionAt({ x: 'a', y: 0 } as never)).toBeNull();

    ui.destroy();
  });

  it('returns null when posAtCoords is missing on the presentation stub', () => {
    const { superdoc } = makeStubs();
    const ui = createSuperDocUI({ superdoc });
    expect(ui.viewport.positionAt({ x: 10, y: 10 })).toBeNull();
    ui.destroy();
  });
});

describe('ui.viewport.positionAt - resolution', () => {
  // Minimal PM-shaped textblock: a single paragraph carrying its block
  // id under `sdBlockId` (the canonical attr the importer assigns to
  // paragraphs). `id` and `blockId` are intentionally absent so the
  // test catches a regression of the `attrs.id`-only readBlockId.
  function makeDocWithParagraphAtSdBlockId(blockId: string, content: string) {
    const text = { isText: true, isTextblock: false, text: content, nodeSize: content.length, attrs: {} };
    const paragraph = {
      isText: false,
      isTextblock: true,
      nodeSize: content.length + 2, // open + content + close
      attrs: { sdBlockId: blockId },
      content,
    };
    const doc = {
      descendants(callback: (node: unknown, pos: number) => boolean | void) {
        // Walk: paragraph at pos=0, then its text child (skipped because
        // !isTextblock returns true to descend, but we don't model the
        // text child since findContainingTextBlock matches the textblock
        // itself).
        callback(paragraph, 0);
      },
    };
    return { doc, paragraph, text };
  }

  function buildEditorStub(
    doc: unknown,
    posAtCoordsResult: { pos: number; inside: number } | null,
    extras: { storyLocator?: unknown; visibleHost?: HTMLElement } = {},
  ) {
    const editor: {
      on: ReturnType<typeof vi.fn>;
      off: ReturnType<typeof vi.fn>;
      state: { doc: unknown };
      doc: unknown;
      presentationEditor: {
        getActiveEditor: () => unknown;
        posAtCoords: (coords: { clientX: number; clientY: number }) => { pos: number; inside: number } | null;
        visibleHost?: HTMLElement;
        getActiveStoryLocator?: () => unknown;
      };
    } = {
      on: vi.fn(),
      off: vi.fn(),
      state: { doc },
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
      presentationEditor: {
        getActiveEditor: () => editor,
        posAtCoords: vi.fn(() => posAtCoordsResult),
        visibleHost: extras.visibleHost,
        getActiveStoryLocator: extras.storyLocator !== undefined ? vi.fn(() => extras.storyLocator) : undefined,
      },
    };
    return editor;
  }

  it('resolves a paragraph whose block id is stored on `sdBlockId` (not `id`)', () => {
    const { doc } = makeDocWithParagraphAtSdBlockId('p-42', 'hello');
    const editor = buildEditorStub(doc, { pos: 3, inside: 0 }); // pos inside paragraph
    const superdoc: SuperDocLike = {
      activeEditor: editor as never,
      config: { documentMode: 'editing' },
    };
    const ui = createSuperDocUI({ superdoc });

    const hit = ui.viewport.positionAt({ x: 10, y: 10 });
    expect(hit).not.toBeNull();
    expect(hit?.point.kind).toBe('text');
    expect((hit?.point as { blockId: string }).blockId).toBe('p-42');
    expect(hit?.target.kind).toBe('selection');
    expect((hit?.target.start as { blockId: string }).blockId).toBe('p-42');

    ui.destroy();
  });

  it('threads the active story locator onto the returned point and target', () => {
    const { doc } = makeDocWithParagraphAtSdBlockId('hf-block-1', 'header');
    const storyLocator = { kind: 'story', storyType: 'headerFooterPart', refId: 'rId7' } as const;
    const editor = buildEditorStub(doc, { pos: 4, inside: 0 }, { storyLocator });
    const superdoc: SuperDocLike = {
      activeEditor: editor as never,
      config: { documentMode: 'editing' },
    };
    const ui = createSuperDocUI({ superdoc });

    const hit = ui.viewport.positionAt({ x: 10, y: 10 });
    expect(hit).not.toBeNull();
    expect(hit?.point).toMatchObject({ blockId: 'hf-block-1', story: storyLocator });
    expect(hit?.target).toMatchObject({ story: storyLocator });
    expect((hit?.target.start as { story?: unknown }).story).toEqual(storyLocator);

    ui.destroy();
  });
});

// SD-2945: `ui.viewport.contextAt({ x, y })` is the bundle right-click
// menus pass to `getContextMenuItems`. Verifies it composes the
// existing primitives (entityAt / positionAt / selection slice / rect
// hit-test) and always returns a well-formed shape, even when the
// editor surfaces nothing under the click.
describe('ui.viewport.contextAt - bundle composition', () => {
  it('echoes the click point and surfaces empty primitives when nothing is under the click', () => {
    const { superdoc } = makeStubs();
    const ui = createSuperDocUI({ superdoc });

    const ctx = ui.viewport.contextAt({ x: 100, y: 200 });
    expect(ctx.point).toEqual({ x: 100, y: 200 });
    expect(ctx.entities).toEqual([]);
    expect(ctx.position).toBeNull();
    expect(ctx.insideSelection).toBe(false);
    expect(ctx.selection).toBeDefined();
    expect(ctx.selection.empty).toBe(true);

    ui.destroy();
  });

  it('coerces non-numeric input to a well-formed default bundle', () => {
    const { superdoc } = makeStubs();
    const ui = createSuperDocUI({ superdoc });

    const ctx = ui.viewport.contextAt({} as never);
    expect(ctx.point).toEqual({ x: 0, y: 0 });
    expect(ctx.entities).toEqual([]);
    expect(ctx.position).toBeNull();
    expect(ctx.insideSelection).toBe(false);

    ui.destroy();
  });
});

describe('ui.viewport.observe — geometry invalidation (SD-3311)', () => {
  // The rAF flush resolves within a frame; a short real-timer wait covers both
  // the requestAnimationFrame path and the setTimeout fallback.
  const nextFrame = () => new Promise((resolve) => setTimeout(resolve, 30));

  it('fires once per frame on scroll (reason "scroll") and stops after unsubscribe', async () => {
    const { superdoc } = makeStubs();
    const ui = createSuperDocUI({ superdoc });
    const events: Array<{ reason: string }> = [];
    const unsubscribe = ui.viewport.observe((e) => events.push(e));

    // Burst in one frame -> a single coalesced notification.
    window.dispatchEvent(new Event('scroll'));
    window.dispatchEvent(new Event('scroll'));
    await nextFrame();
    expect(events).toEqual([{ reason: 'scroll' }]);

    unsubscribe();
    window.dispatchEvent(new Event('scroll'));
    await nextFrame();
    expect(events).toHaveLength(1); // no notification after unsubscribe

    ui.destroy();
  });

  it('coalesces different reasons in the same frame to "mixed"', async () => {
    const { superdoc } = makeStubs();
    const ui = createSuperDocUI({ superdoc });
    const events: Array<{ reason: string }> = [];
    ui.viewport.observe((e) => events.push(e));

    window.dispatchEvent(new Event('scroll'));
    window.dispatchEvent(new Event('resize'));
    await nextFrame();
    expect(events).toEqual([{ reason: 'mixed' }]);

    ui.destroy();
  });

  it('does not notify after the UI is destroyed', async () => {
    const { superdoc } = makeStubs();
    const ui = createSuperDocUI({ superdoc });
    const events: Array<{ reason: string }> = [];
    ui.viewport.observe((e) => events.push(e));

    ui.destroy();
    window.dispatchEvent(new Event('resize'));
    await nextFrame();
    expect(events).toEqual([]);
  });
});

// Stub with real event emitters so tests can drive the engine signals that
// feed ui.viewport.observe: superdoc `zoomChange` and presentation
// `layoutUpdated` / `paginationUpdate`.
function makeEmitter() {
  const map = new Map<string, Set<(p?: unknown) => void>>();
  return {
    on: (e: string, h: (p?: unknown) => void) => {
      if (!map.has(e)) map.set(e, new Set());
      map.get(e)!.add(h);
    },
    off: (e: string, h: (p?: unknown) => void) => {
      map.get(e)?.delete(h);
    },
    emit: (e: string, p?: unknown) => [...(map.get(e) ?? [])].forEach((h) => h(p)),
  };
}

function makeGeometryStub() {
  const sd = makeEmitter();
  const pres = makeEmitter();
  const emptyList = () => ({
    evaluatedRevision: 'r1',
    total: 0,
    items: [],
    page: { limit: 0, offset: 0, returned: 0 },
  });
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
      comments: { list: vi.fn(emptyList) },
      trackChanges: { list: vi.fn(emptyList) },
      contentControls: { list: vi.fn(() => ({ items: [], total: 0 })) },
    },
    presentationEditor: undefined,
  };
  editor.presentationEditor = {
    on: pres.on,
    off: pres.off,
    getActiveEditor: () => editor,
    getEntityRects: vi.fn(() => []),
    navigateTo: vi.fn(async () => true),
  };
  const superdoc: SuperDocLike = {
    activeEditor: editor as never,
    config: { documentMode: 'editing' },
    on: sd.on as never,
    off: sd.off as never,
  };
  return { superdoc, emitSuperdoc: sd.emit, emitPresentation: pres.emit };
}

describe('ui.viewport.observe — repaint reason (SD-3311 regression)', () => {
  const nextFrame = () => new Promise((resolve) => setTimeout(resolve, 30));

  it('reports "zoom" for a zoom repaint, not "mixed" (layoutUpdated + paginationUpdate are one paint)', async () => {
    const { superdoc, emitSuperdoc, emitPresentation } = makeGeometryStub();
    const ui = createSuperDocUI({ superdoc });
    const events: Array<{ reason: string }> = [];
    ui.viewport.observe((e) => events.push(e));

    // zoomChange (pre-paint), then the paired post-paint repaint events.
    emitSuperdoc('zoomChange');
    emitPresentation('layoutUpdated');
    emitPresentation('paginationUpdate'); // same paint / payload — must not double-count
    await nextFrame();

    expect(events).toEqual([{ reason: 'zoom' }]);
    ui.destroy();
  });

  it('reports "layout" for a plain repaint (the paginationUpdate alias does not make it "mixed")', async () => {
    const { superdoc, emitPresentation } = makeGeometryStub();
    const ui = createSuperDocUI({ superdoc });
    const events: Array<{ reason: string }> = [];
    ui.viewport.observe((e) => events.push(e));

    emitPresentation('layoutUpdated');
    emitPresentation('paginationUpdate');
    await nextFrame();

    expect(events).toEqual([{ reason: 'layout' }]);
    ui.destroy();
  });
});
