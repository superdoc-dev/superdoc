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

/**
 * Each entry maps to a PM node in the ancestor chain. Use the *real*
 * PM type names — the production filter accepts
 * `structuredContent` / `structuredContentBlock`, NOT a legacy `'sdt'`
 * alias. Earlier test scaffolding mapped every SDT-shaped entry to
 * `type.name === 'sdt'`, which passed against a now-removed fallback
 * branch; the tests covered dead code instead of the real path.
 */
type AnchorPath = Array<{
  nodeType: 'structuredContent' | 'structuredContentBlock' | 'paragraph' | 'doc';
  id?: string;
}>;

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

function makeStub(
  initial: {
    items?: ContentControlItem[];
    anchorPath?: AnchorPath;
    /**
     * For NodeSelection: the PM node currently selected as a unit
     * (drag-handle click, Esc-promotes-to-node, paste-replaces). The
     * production code reads `selection.node` for this case. Setting
     * this here drives that branch independently of the ancestor
     * path; in real PM the two coexist (a NodeSelection's $anchor is
     * positioned before the node, so the ancestor walk runs against
     * the parent chain).
     */
    selectedNode?: { type: { name: string }; attrs?: { id?: string } } | null;
  } = {},
) {
  const editorListeners = new Map<string, Set<(...args: unknown[]) => void>>();
  let currentItems = initial.items ?? [];
  let currentAnchor: AnchorPath = initial.anchorPath ?? [{ nodeType: 'doc' }];
  let currentSelectedNode = initial.selectedNode ?? null;

  // PM-style $anchor: depth + node(depth) walking outward. Tests build
  // a synthetic path; depth 0 is the outermost (doc), highest depth is
  // the leaf the cursor is inside. Uses the real PM type names —
  // matches `structured-content.js:38` / `structured-content-block.js:31`
  // verbatim.
  const buildAnchor = () => ({
    depth: currentAnchor.length - 1,
    node: (depth: number) => {
      const entry = currentAnchor[depth];
      if (!entry) return null;
      return {
        type: { name: entry.nodeType },
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
    state: {
      get selection() {
        const sel: {
          $anchor: ReturnType<typeof buildAnchor>;
          node?: { type: { name: string }; attrs?: { id?: string } };
        } = { $anchor: buildAnchor() };
        if (currentSelectedNode) sel.node = currentSelectedNode;
        return sel;
      },
    },
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
    setSelectedNode(node: { type: { name: string }; attrs?: { id?: string } } | null): void;
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
    setSelectedNode(node) {
      currentSelectedNode = node;
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
    // Uses the *real* PM type names from the structuredContent extensions
    // (`structured-content.js:38`, `structured-content-block.js:31`), not
    // a `'sdt'` alias. An earlier version of this test asserted against
    // a `'sdt'` fallback in the production filter that didn't reflect
    // any real PM extension; both have been removed.
    const { superdoc } = makeStub({
      items: [makeItem('outer-block', 'block'), makeItem('inner-inline')],
      anchorPath: [
        { nodeType: 'doc' },
        { nodeType: 'structuredContentBlock', id: 'outer-block' },
        { nodeType: 'paragraph' },
        { nodeType: 'structuredContent', id: 'inner-inline' },
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
        { nodeType: 'structuredContentBlock', id: 'ghost' },
        { nodeType: 'structuredContent', id: 'known' },
      ],
    });
    const ui = createSuperDocUI({ superdoc });

    expect(ui.contentControls.getSnapshot().activeIds).toEqual(['known']);

    ui.destroy();
  });

  it('activeIds includes the selected node for NodeSelection on an inline SDT (drag-handle / Esc-promotes)', () => {
    // When PM `NodeSelection` is on the SDT wrapper itself, `$anchor`
    // is positioned BEFORE the node, so the ancestor walk never visits
    // the selected node. The production code must read `selection.node`
    // to pick it up.
    const { superdoc } = makeStub({
      items: [makeItem('selected-inline')],
      // NodeSelection: anchor sits at the parent depth (paragraph), node
      // selection.node references the SDT itself.
      anchorPath: [{ nodeType: 'doc' }, { nodeType: 'paragraph' }],
      selectedNode: {
        type: { name: 'structuredContent' },
        attrs: { id: 'selected-inline' },
      },
    });
    const ui = createSuperDocUI({ superdoc });

    const snap = ui.contentControls.getSnapshot();
    expect(snap.activeIds).toEqual(['selected-inline']);
    expect(snap.activeId).toBe('selected-inline');

    ui.destroy();
  });

  it('activeIds handles NodeSelection on a block SDT', () => {
    const { superdoc } = makeStub({
      items: [makeItem('selected-block', 'block')],
      anchorPath: [{ nodeType: 'doc' }],
      selectedNode: {
        type: { name: 'structuredContentBlock' },
        attrs: { id: 'selected-block' },
      },
    });
    const ui = createSuperDocUI({ superdoc });

    expect(ui.contentControls.getSnapshot().activeIds).toEqual(['selected-block']);

    ui.destroy();
  });

  it('activeIds dedupes when both NodeSelection.node and an ancestor walk would surface the same id', () => {
    // Defensive: real PM never sets selection.node to a node that the
    // anchor walk also visits, but if anything in the controller's
    // path changes the convention, the dedupe keeps the slice stable.
    const { superdoc } = makeStub({
      items: [makeItem('dup-block', 'block')],
      anchorPath: [{ nodeType: 'doc' }, { nodeType: 'structuredContentBlock', id: 'dup-block' }],
      selectedNode: {
        type: { name: 'structuredContentBlock' },
        attrs: { id: 'dup-block' },
      },
    });
    const ui = createSuperDocUI({ superdoc });

    expect(ui.contentControls.getSnapshot().activeIds).toEqual(['dup-block']);

    ui.destroy();
  });

  it('activeIds ignores selection.node when it is not an SDT type', () => {
    // Some PM commands set NodeSelection on non-SDT nodes (image,
    // table, etc.). Those must not surface as content controls.
    const { superdoc } = makeStub({
      items: [makeItem('sdt-1')],
      anchorPath: [{ nodeType: 'doc' }],
      selectedNode: {
        type: { name: 'image' },
        attrs: { id: 'sdt-1' /* shape matches but type doesn't */ },
      },
    });
    const ui = createSuperDocUI({ superdoc });

    expect(ui.contentControls.getSnapshot().activeIds).toEqual([]);

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

  it('observe receives the snapshot value directly (parallel to comments/trackChanges)', async () => {
    // `observe` is the value-shaped alias of `subscribe`. The demo
    // (`field-chip.ts`) consumes it directly, so an explicit test
    // keeps that path covered. `scheduleNotify` is microtask-batched,
    // so the second emit needs an await between the event and the
    // assertion — matches the subscribe test above.
    const { superdoc } = makeStub({ items: [makeItem('sdt-1')] });
    const ui = createSuperDocUI({ superdoc });

    const received: Array<{ ids: string[]; total: number }> = [];
    const unsubscribe = ui.contentControls.observe((snapshot) => {
      received.push({ ids: snapshot.items.map((it) => it.id), total: snapshot.total });
    });

    expect(received).toHaveLength(1);
    expect(received[0]).toEqual({ ids: ['sdt-1'], total: 1 });

    superdoc.setItems([makeItem('sdt-1'), makeItem('sdt-2')]);
    superdoc.fireEditor('transaction', { transaction: { docChanged: true } });
    await Promise.resolve();

    expect(received.length).toBeGreaterThanOrEqual(2);
    expect(received[received.length - 1]).toEqual({ ids: ['sdt-1', 'sdt-2'], total: 2 });

    unsubscribe();
    ui.destroy();
  });

  it('commentsUpdate does NOT trigger a content-controls list refresh', () => {
    // refreshAndNotify (which fires on commentsUpdate / commentsLoaded
    // / tracked-changes-changed) must NOT re-call
    // `editor.doc.contentControls.list()`. Comment / tracked-change
    // events can't add or remove SDTs; bundling the SDT cache refresh
    // into that path wastes an O(N) walk on every comment event on
    // the editing hot path.
    const { superdoc, editor } = makeStub({ items: [makeItem('sdt-1')] });
    const ui = createSuperDocUI({ superdoc });

    const listMock = editor.doc.contentControls.list as ReturnType<typeof vi.fn>;
    listMock.mockClear();

    superdoc.fireEditor('commentsUpdate', {});
    superdoc.fireEditor('commentsLoaded', {});
    superdoc.fireEditor('tracked-changes-changed', {});

    expect(listMock).not.toHaveBeenCalled();

    ui.destroy();
  });
});
