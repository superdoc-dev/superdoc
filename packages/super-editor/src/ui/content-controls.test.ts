/**
 * Focused tests for the `ui.contentControls` handle (SD-3157).
 *
 * The shared `create-super-doc-ui.test.ts` mock doesn't expose
 * `doc.contentControls.list` or a PM-style `state.selection.$anchor`,
 * so this file builds a tighter stub for the new surface. Coverage:
 *
 *  - getSnapshot reads the items / total from
 *    `editor.doc.contentControls.list()`.
 *  - subscribe fires once synchronously, then again after a
 *    doc-changing transaction refreshes the cache.
 *  - selection-only transactions don't churn `items`.
 *  - activeIds walks innermost-first through SDT ancestors at the
 *    PM selection anchor.
 *  - get({ id }) reads from the cached items, returns null for
 *    unknown ids.
 *  - getRect({ id }) delegates to ui.viewport.getRect.
 */
import { describe, expect, it, vi } from 'vitest';

import { createSuperDocUI } from './create-super-doc-ui.js';
import type { SuperDocLike } from './types.js';

type ContentControlItem = {
  nodeType: 'sdt';
  kind: 'inline' | 'block';
  id: string;
  controlType: string;
  lockMode: string;
  properties: Record<string, unknown>;
  target: { kind: 'inline' | 'block'; nodeType: 'sdt'; nodeId: string };
};

type AnchorPath = Array<{ nodeType: 'sdt' | 'paragraph' | 'doc'; id?: string }>;

function makeItem(id: string, kind: 'inline' | 'block' = 'inline'): ContentControlItem {
  return {
    nodeType: 'sdt',
    kind,
    id,
    controlType: 'richText',
    lockMode: 'unlocked',
    properties: { id, tag: `tag-${id}`, alias: `Alias ${id}` },
    target: { kind, nodeType: 'sdt', nodeId: id },
  };
}

function makeStub(initial: { items?: ContentControlItem[]; anchorPath?: AnchorPath } = {}) {
  const editorListeners = new Map<string, Set<(...args: unknown[]) => void>>();
  let currentItems = initial.items ?? [];
  let currentAnchor: AnchorPath = initial.anchorPath ?? [{ nodeType: 'doc' }];

  // PM-style $anchor: depth + node(depth) walking outward. Tests build
  // a synthetic path; depth 0 is the outermost (doc), highest depth is
  // the leaf the cursor is inside.
  const buildAnchor = () => ({
    depth: currentAnchor.length - 1,
    node: (depth: number) => {
      const entry = currentAnchor[depth];
      if (!entry) return null;
      return {
        type: { name: entry.nodeType === 'sdt' ? 'sdt' : entry.nodeType },
        attrs: { id: entry.id },
      };
    },
  });

  const editor = {
    on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      if (!editorListeners.has(event)) editorListeners.set(event, new Set());
      editorListeners.get(event)!.add(handler);
    }),
    off: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      editorListeners.get(event)?.delete(handler);
    }),
    state: { get selection() { return { $anchor: buildAnchor() }; } },
    doc: {
      selection: {
        current: vi.fn(() => ({ empty: true, target: null })),
      },
      contentControls: {
        list: vi.fn(() => ({ items: currentItems, total: currentItems.length })),
      },
    },
  };

  const superdoc: SuperDocLike & {
    fireEditor(event: string, payload?: unknown): void;
    setItems(items: ContentControlItem[]): void;
    setAnchorPath(path: AnchorPath): void;
  } = {
    activeEditor: editor,
    config: { documentMode: 'editing' },
    on: vi.fn(),
    off: vi.fn(),
    fireEditor(event, payload) {
      const handlers = editorListeners.get(event);
      if (!handlers) return;
      [...handlers].forEach((h) => h(payload));
    },
    setItems(items) {
      currentItems = items;
    },
    setAnchorPath(path) {
      currentAnchor = path;
    },
  };

  return { superdoc, editor };
}

describe('ui.contentControls handle (SD-3157)', () => {
  it('getSnapshot reads items and total from editor.doc.contentControls.list', () => {
    const { superdoc } = makeStub({ items: [makeItem('sdt-1'), makeItem('sdt-2', 'block')] });
    const ui = createSuperDocUI({ superdoc });

    const snap = ui.contentControls.getSnapshot();
    expect(snap.total).toBe(2);
    expect(snap.items.map((it) => it.id)).toEqual(['sdt-1', 'sdt-2']);
    expect(snap.activeIds).toEqual([]);
    expect(snap.activeId).toBeNull();

    ui.destroy();
  });

  it('subscribe fires once synchronously and again after a doc-changing transaction refreshes the cache', async () => {
    const { superdoc } = makeStub({ items: [makeItem('sdt-1')] });
    const ui = createSuperDocUI({ superdoc });

    const snapshots: Array<{ ids: string[]; total: number }> = [];
    const unsubscribe = ui.contentControls.subscribe(({ snapshot }) => {
      snapshots.push({ ids: snapshot.items.map((it) => it.id), total: snapshot.total });
    });

    // Initial synchronous fire.
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0]).toEqual({ ids: ['sdt-1'], total: 1 });

    // Update the underlying list, then fire a doc-changing transaction.
    superdoc.setItems([makeItem('sdt-1'), makeItem('sdt-2')]);
    superdoc.fireEditor('transaction', { transaction: { docChanged: true } });
    await Promise.resolve();

    expect(snapshots.length).toBeGreaterThanOrEqual(2);
    expect(snapshots[snapshots.length - 1]).toEqual({ ids: ['sdt-1', 'sdt-2'], total: 2 });

    unsubscribe();
    ui.destroy();
  });

  it('selection-only transactions do not refresh the items cache', async () => {
    const { superdoc, editor } = makeStub({ items: [makeItem('sdt-1')] });
    const ui = createSuperDocUI({ superdoc });

    // Drain the initial subscribe fire.
    const listMock = editor.doc.contentControls.list as ReturnType<typeof vi.fn>;
    listMock.mockClear();

    superdoc.fireEditor('transaction', { transaction: { docChanged: false } });
    await Promise.resolve();

    // Refresh handler must short-circuit on docChanged=false.
    expect(listMock).not.toHaveBeenCalled();

    ui.destroy();
  });

  it('activeIds walks innermost-first through SDT ancestors at the PM selection anchor', () => {
    const { superdoc } = makeStub({
      items: [makeItem('outer-block', 'block'), makeItem('inner-inline')],
      anchorPath: [
        { nodeType: 'doc' },
        { nodeType: 'sdt', id: 'outer-block' },
        { nodeType: 'paragraph' },
        { nodeType: 'sdt', id: 'inner-inline' },
      ],
    });
    const ui = createSuperDocUI({ superdoc });

    const snap = ui.contentControls.getSnapshot();
    expect(snap.activeIds).toEqual(['inner-inline', 'outer-block']);
    expect(snap.activeId).toBe('inner-inline');

    ui.destroy();
  });

  it('activeIds drops ids that are not in the items cache', () => {
    // Defensive: the painter can carry an SDT id the doc-api list
    // hasn't refreshed yet (mid-transaction). Filter so subscribers
    // don't see ghost ids.
    const { superdoc } = makeStub({
      items: [makeItem('known')],
      anchorPath: [
        { nodeType: 'doc' },
        { nodeType: 'sdt', id: 'ghost' },
        { nodeType: 'sdt', id: 'known' },
      ],
    });
    const ui = createSuperDocUI({ superdoc });

    expect(ui.contentControls.getSnapshot().activeIds).toEqual(['known']);

    ui.destroy();
  });

  it('get({ id }) returns the cached item or null', () => {
    const { superdoc } = makeStub({ items: [makeItem('sdt-1'), makeItem('sdt-2')] });
    const ui = createSuperDocUI({ superdoc });

    expect(ui.contentControls.get({ id: 'sdt-2' })?.id).toBe('sdt-2');
    expect(ui.contentControls.get({ id: 'never-exists' })).toBeNull();

    ui.destroy();
  });

  it('getRect({ id }) delegates to ui.viewport.getRect with a contentControl target', () => {
    const { superdoc } = makeStub({ items: [makeItem('sdt-1')] });
    const ui = createSuperDocUI({ superdoc });

    const spy = vi.spyOn(ui.viewport, 'getRect');
    ui.contentControls.getRect({ id: 'sdt-1' });

    expect(spy).toHaveBeenCalledWith({
      target: { kind: 'entity', entityType: 'contentControl', entityId: 'sdt-1' },
    });

    ui.destroy();
  });
});
