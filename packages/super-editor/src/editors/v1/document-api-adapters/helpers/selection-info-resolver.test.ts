import { describe, expect, it, vi } from 'vitest';
import type { Node as ProseMirrorNode } from 'prosemirror-model';
import type { Editor } from '../../core/Editor.js';
import { resolveCurrentSelectionInfo, subscribeToSelection } from './selection-info-resolver.js';

// ---------------------------------------------------------------------------
// PM node stub builder
//
// Matches the shape and conventions of the factory in
// text-offset-resolver.test.ts — block and text nodes with sdBlockId on
// the attrs bag so `readBlockId` can find them.
// ---------------------------------------------------------------------------

type NodeOptions = {
  text?: string;
  isInline?: boolean;
  isBlock?: boolean;
  isLeaf?: boolean;
  inlineContent?: boolean;
  nodeSize?: number;
  attrs?: Record<string, unknown>;
};

function createNode(typeName: string, children: ProseMirrorNode[] = [], options: NodeOptions = {}): ProseMirrorNode {
  const text = options.text ?? '';
  const isText = typeName === 'text';
  const isInline = options.isInline ?? isText;
  const isBlock = options.isBlock ?? (!isInline && typeName !== 'doc');
  const inlineContent = options.inlineContent ?? (isBlock && children.every((c) => (c as any).isInline));
  const isLeaf = options.isLeaf ?? (isInline && !isText && children.length === 0);
  const isTextblock = options.inlineContent ?? inlineContent;

  const contentSize = children.reduce((sum, child) => sum + child.nodeSize, 0);
  const nodeSize = isText ? text.length : options.nodeSize != null ? options.nodeSize : isLeaf ? 1 : contentSize + 2;

  return {
    type: { name: typeName },
    text: isText ? text : undefined,
    nodeSize,
    attrs: options.attrs ?? {},
    isText,
    isInline,
    isBlock,
    inlineContent,
    isTextblock,
    isLeaf,
    childCount: children.length,
    child(index: number) {
      return children[index]!;
    },
    marks: [],
    // `nodesBetween` walks the whole subtree. A minimal correct
    // implementation for our test shapes: visit self first, then recurse
    // into children with the right child-position accounting.
    nodesBetween(from: number, to: number, callback: (node: ProseMirrorNode, pos: number) => boolean | void) {
      const walk = (node: ProseMirrorNode, pos: number): void => {
        const descend = callback(node, pos);
        if (descend === false) return;
        if (node.isText || node.isLeaf) return;

        const contentStart = pos + 1;
        let childOffset = 0;
        for (let i = 0; i < node.childCount; i += 1) {
          const child = node.child(i);
          const childPos = contentStart + childOffset;
          if (childPos <= to && childPos + child.nodeSize >= from) {
            walk(child, childPos);
          }
          childOffset += child.nodeSize;
        }
      };

      walk(this as unknown as ProseMirrorNode, 0);
    },
    resolve(pos: number) {
      // Minimal $pos shim: only `.marks()` is used by the resolver for
      // collapsed-selection mark collection. Return empty; tests that
      // care about marks build a range selection.
      void pos;
      return { marks: () => [] as Array<{ type: { name: string } }> };
    },
    textBetween(from: number, _to: number, separator?: string): string {
      // Simple textBetween: concatenate text node contents reachable
      // within [from, to], joined on block separators.
      void separator;
      return ''; // Tests that need textBetween provide their own editor stub.
    },
  } as unknown as ProseMirrorNode;
}

function textBlock(blockId: string, text: string): ProseMirrorNode {
  const textNode = createNode('text', [], { text });
  return createNode('paragraph', [textNode], {
    isBlock: true,
    inlineContent: true,
    attrs: { sdBlockId: blockId },
  });
}

function doc(blocks: ProseMirrorNode[]): ProseMirrorNode {
  return createNode('doc', blocks, { isBlock: false, inlineContent: false });
}

/** Minimal editor stub whose doc + selection are controllable per test. */
function makeEditor(docNode: ProseMirrorNode, selection: { from: number; to: number; empty?: boolean }): Editor {
  const empty = selection.empty ?? selection.from === selection.to;
  const listeners = new Map<string, Array<() => void>>();
  return {
    state: {
      doc: docNode,
      selection: { from: selection.from, to: selection.to, empty },
      storedMarks: null,
    },
    on(event: string, listener: () => void) {
      if (!listeners.has(event)) listeners.set(event, []);
      listeners.get(event)!.push(listener);
    },
    off(event: string, listener: () => void) {
      const arr = listeners.get(event);
      if (!arr) return;
      const idx = arr.indexOf(listener);
      if (idx >= 0) arr.splice(idx, 1);
    },
    // Expose listeners for tests that want to simulate an event fire.
    __fire(event: string) {
      const arr = listeners.get(event);
      if (!arr) return;
      for (const l of [...arr]) l();
    },
  } as unknown as Editor & { __fire(event: string): void };
}

// ---------------------------------------------------------------------------
// resolveCurrentSelectionInfo
// ---------------------------------------------------------------------------

describe('resolveCurrentSelectionInfo', () => {
  it('returns an empty info with null target when the editor has no state', () => {
    const editor = { state: null } as unknown as Editor;
    const info = resolveCurrentSelectionInfo(editor, {});
    expect(info).toEqual({ empty: true, target: null, activeMarks: [] });
  });

  it('projects a single-block selection into a one-segment TextTarget', () => {
    // Doc: <p sdBlockId="p1">Hello</p>
    // PM positions: 1=p start, 2='H', 3='e', 4='l', 5='l', 6='o', 7=p end.
    // Selecting PM [3, 6] → "ell" (block offsets 1..4).
    const docNode = doc([textBlock('p1', 'Hello')]);
    const editor = makeEditor(docNode, { from: 3, to: 6 });

    const info = resolveCurrentSelectionInfo(editor, {});

    expect(info.empty).toBe(false);
    expect(info.target).toEqual({
      kind: 'text',
      segments: [{ blockId: 'p1', range: { start: 1, end: 4 } }],
    });
  });

  it('projects a multi-block selection into one segment per touched block', () => {
    // Doc: <p sdBlockId="p1">abc</p><p sdBlockId="p2">defgh</p>
    // p1 spans PM [1, 6) (content 2..5 = 'a','b','c'); p2 spans PM [6, 13)
    // (content 7..12 = 'd','e','f','g','h'). Select PM [2, 9]:
    // p1 → "abc" (offsets 0..3); p2 → "de" (offsets 0..2).
    const docNode = doc([textBlock('p1', 'abc'), textBlock('p2', 'defgh')]);
    const editor = makeEditor(docNode, { from: 2, to: 9 });

    const info = resolveCurrentSelectionInfo(editor, {});

    expect(info.target?.segments).toEqual([
      { blockId: 'p1', range: { start: 0, end: 3 } },
      { blockId: 'p2', range: { start: 0, end: 2 } },
    ]);
  });

  it('returns null target when no selected block has an addressable blockId', () => {
    // Block without sdBlockId / id / blockId — resolver skips it.
    const textNode = createNode('text', [], { text: 'Hello' });
    const paragraph = createNode('paragraph', [textNode], { isBlock: true, inlineContent: true });
    const docNode = doc([paragraph]);
    const editor = makeEditor(docNode, { from: 1, to: 5 });

    const info = resolveCurrentSelectionInfo(editor, {});

    expect(info.target).toBeNull();
  });

  it('omits `text` when includeText is not set', () => {
    const docNode = doc([textBlock('p1', 'Hello')]);
    const editor = makeEditor(docNode, { from: 2, to: 5 });

    const info = resolveCurrentSelectionInfo(editor, {});
    expect(info.text).toBeUndefined();
  });

  it('includes `text` when includeText is true and the selection is non-empty', () => {
    const docNode = doc([textBlock('p1', 'Hello')]);
    const editor = makeEditor(docNode, { from: 2, to: 5 });
    // Override textBetween so we can pin what comes back without stubbing
    // the PM doc's full traversal logic.
    (docNode as any).textBetween = vi.fn(() => 'ell');

    const info = resolveCurrentSelectionInfo(editor, { includeText: true });

    expect(info.text).toBe('ell');
  });

  it('does not populate `text` for an empty selection even with includeText: true', () => {
    const docNode = doc([textBlock('p1', 'Hello')]);
    const editor = makeEditor(docNode, { from: 2, to: 2, empty: true });

    const info = resolveCurrentSelectionInfo(editor, { includeText: true });

    expect(info.text).toBeUndefined();
  });

  it('returns an empty activeMarks array when the selection carries no stored or range marks', () => {
    const docNode = doc([textBlock('p1', 'Hello')]);
    const editor = makeEditor(docNode, { from: 2, to: 5 });

    const info = resolveCurrentSelectionInfo(editor, {});
    expect(info.activeMarks).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// subscribeToSelection
// ---------------------------------------------------------------------------

describe('subscribeToSelection', () => {
  it('fires the listener once per tick when selection updates', async () => {
    const docNode = doc([textBlock('p1', 'Hi')]);
    const editor = makeEditor(docNode, { from: 1, to: 3 }) as Editor & { __fire(event: string): void };
    const listener = vi.fn();

    const unsubscribe = subscribeToSelection(editor, listener);
    editor.__fire('selectionUpdate');
    editor.__fire('selectionUpdate');
    // Multiple events in one tick coalesce via queueMicrotask.

    await Promise.resolve(); // flush the microtask
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
  });

  it('stops firing after unsubscribe', async () => {
    const docNode = doc([textBlock('p1', 'Hi')]);
    const editor = makeEditor(docNode, { from: 1, to: 3 }) as Editor & { __fire(event: string): void };
    const listener = vi.fn();

    const unsubscribe = subscribeToSelection(editor, listener);
    unsubscribe();
    editor.__fire('selectionUpdate');
    await Promise.resolve();

    expect(listener).not.toHaveBeenCalled();
  });

  it('cancels a microtask queued just before unsubscribe (no stale fire)', async () => {
    // Regression: before the cancel flag, a microtask queued by the last
    // pre-unmount event could still invoke the listener after unsubscribe
    // returned — a classic source of stale state updates during React
    // component unmount.
    const docNode = doc([textBlock('p1', 'Hi')]);
    const editor = makeEditor(docNode, { from: 1, to: 3 }) as Editor & { __fire(event: string): void };
    const listener = vi.fn();

    const unsubscribe = subscribeToSelection(editor, listener);
    editor.__fire('selectionUpdate'); // queues a microtask
    unsubscribe(); // must mark the queued microtask as no-op
    await Promise.resolve();

    expect(listener).not.toHaveBeenCalled();
  });
});
