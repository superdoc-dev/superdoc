import { describe, expect, it, vi } from 'vitest';
import { NodeSelection } from 'prosemirror-state';
import type { Node as ProseMirrorNode } from 'prosemirror-model';
import type { Editor } from '../../core/Editor.js';
import { resolveCurrentSelectionInfo } from './selection-info-resolver.js';

// Stub `groupTrackedChanges` so tests don't need a fully PM-shaped
// editor with `editor.state.doc.textBetween` and the tracked-change
// mark walker. Each test that exercises tracked-change ids configures
// the raw → canonical mapping it expects.
const groupTrackedChangesMock = vi.hoisted(() =>
  vi.fn(() => [] as Array<{ rawId: string; id: string; from: number; to: number }>),
);
vi.mock('./tracked-change-resolver.js', () => ({
  groupTrackedChanges: groupTrackedChangesMock,
}));

const setTrackedChangeMapping = (mappings: Array<{ rawId: string; canonical: string }>) => {
  groupTrackedChangesMock.mockReturnValue(
    mappings.map((m) => ({ rawId: m.rawId, id: m.canonical, from: 0, to: 0 })) as never,
  );
};

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
  /** Mark names applied to this node (only used for text nodes). */
  markNames?: string[];
  /**
   * Marks with attrs (commentMark, trackInsert, etc). Coexists with
   * `markNames` — both end up in `node.marks`. Use this for tests that
   * exercise per-mark attribute-driven id collection.
   */
  marksWithAttrs?: Array<{ name: string; attrs: Record<string, unknown> }>;
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
    marks: [
      ...(options.markNames ?? []).map((name) => ({ type: { name }, attrs: {} as Record<string, unknown> })),
      ...(options.marksWithAttrs ?? []).map((m) => ({ type: { name: m.name }, attrs: m.attrs })),
    ],
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

/**
 * Build a paragraph whose body is a sequence of text nodes with different
 * marks. `runs` is an array of `{ text, marks }` tuples; each becomes one
 * text child in order.
 */
function markedTextBlock(blockId: string, runs: Array<{ text: string; marks: string[] }>): ProseMirrorNode {
  const children = runs.map((r) => createNode('text', [], { text: r.text, markNames: r.marks }));
  return createNode('paragraph', children, {
    isBlock: true,
    inlineContent: true,
    attrs: { sdBlockId: blockId },
  });
}

function doc(blocks: ProseMirrorNode[]): ProseMirrorNode {
  return createNode('doc', blocks, { isBlock: false, inlineContent: false });
}

function makeRealNodeSelection(
  from: number,
  to: number,
  node: { type: { name: string }; isBlock: boolean; isLeaf: boolean; isInline: boolean; nodeSize: number },
): NodeSelection {
  const sel = Object.create(NodeSelection.prototype);
  Object.defineProperty(sel, 'from', { value: from, configurable: true });
  Object.defineProperty(sel, 'to', { value: to, configurable: true });
  Object.defineProperty(sel, 'empty', { value: false, configurable: true });
  Object.defineProperty(sel, 'node', { value: node, configurable: true });
  return sel as NodeSelection;
}

/** Minimal editor stub whose doc + selection are controllable per test. */
function makeEditor(
  docNode: ProseMirrorNode,
  selection: { from: number; to: number; empty?: boolean; node?: unknown },
): Editor {
  const empty = selection.empty ?? selection.from === selection.to;
  const pmSelection = 'node' in selection ? selection : { from: selection.from, to: selection.to, empty };
  const listeners = new Map<string, Array<() => void>>();
  return {
    state: {
      doc: docNode,
      selection: pmSelection,
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
    expect(info).toEqual({ empty: true, target: null, activeMarks: [], activeCommentIds: [], activeChangeIds: [] });
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

  it('returns null target for a NodeSelection over an addressable text block', () => {
    // SelectionInfo.target is only for text selections. A NodeSelection
    // over a text-bearing block still represents the node, not a user text
    // range that can safely feed comments.create.
    const paragraph = textBlock('p1', 'Hello');
    const docNode = doc([paragraph]);
    const selection = makeRealNodeSelection(1, 1 + paragraph.nodeSize, paragraph as any);
    const editor = makeEditor(docNode, selection);

    const info = resolveCurrentSelectionInfo(editor, {});

    expect(info.empty).toBe(false);
    expect(info.target).toBeNull();
  });

  it('returns null target for a NodeSelection over a text-bearing structured content block', () => {
    // Presentation clicks can select a block SDT as a NodeSelection. Even
    // though the wrapper contains textblocks, the selection itself is not
    // a text selection and should not be projected into a TextTarget.
    const innerParagraph = textBlock('p-inside-sdt', 'Field text');
    const blockSdt = createNode('structuredContentBlock', [innerParagraph], {
      isBlock: true,
      inlineContent: false,
      attrs: { sdBlockId: 'sdt-1' },
    });
    const docNode = doc([blockSdt]);
    const selection = makeRealNodeSelection(1, 1 + blockSdt.nodeSize, blockSdt as any);
    const editor = makeEditor(docNode, selection);

    const info = resolveCurrentSelectionInfo(editor, {});

    expect(info.empty).toBe(false);
    expect(info.target).toBeNull();
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

  it('returns null target when the selection touches any non-addressable block', () => {
    // Regression: a selection that spans an addressable block AND a
    // block without a stable id used to emit a partial TextTarget,
    // silently dropping the unaddressable block from comments / scroll
    // operations. The resolver now bails out and returns null so the
    // caller can refuse the action rather than act on incomplete data.
    const textNodeA = createNode('text', [], { text: 'abc' });
    const addressable = createNode('paragraph', [textNodeA], {
      isBlock: true,
      inlineContent: true,
      attrs: { sdBlockId: 'p1' },
    });
    const textNodeB = createNode('text', [], { text: 'def' });
    const nonAddressable = createNode('paragraph', [textNodeB], {
      isBlock: true,
      inlineContent: true,
      // No sdBlockId / id / blockId.
    });
    const docNode = doc([addressable, nonAddressable]);
    // p1 spans PM [1,5); p2 spans PM [5,10). Select PM [2,8] — touches both.
    const editor = makeEditor(docNode, { from: 2, to: 8 });

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

  it('reports marks shared by every text node in a range selection', () => {
    // Both runs carry `bold`; only the first carries `italic`. The shared
    // active mark across the whole selection is `bold` alone.
    const docNode = doc([
      markedTextBlock('p1', [
        { text: 'Bold and italic ', marks: ['bold', 'italic'] },
        { text: 'bold only', marks: ['bold'] },
      ]),
    ]);
    // Select across both runs.
    const editor = makeEditor(docNode, { from: 2, to: 26 });

    const info = resolveCurrentSelectionInfo(editor, {});
    expect([...info.activeMarks].sort()).toEqual(['bold']);
  });

  it('returns no marks when any text node in the selection is unmarked', () => {
    const docNode = doc([
      markedTextBlock('p1', [
        { text: 'Bold ', marks: ['bold'] },
        { text: 'plain', marks: [] },
      ]),
    ]);
    const editor = makeEditor(docNode, { from: 2, to: 11 });

    const info = resolveCurrentSelectionInfo(editor, {});
    expect(info.activeMarks).toEqual([]);
  });

  it('does not allocate per-character when the selection spans thousands of chars', () => {
    // Regression: the original `perCharMarks.push(names)` loop allocated one
    // Set reference per selected character. For a 10k-character selection
    // that produced noticeable jank on every selection.onChange event.
    // The per-node intersection should stay fast and return the correct
    // shared-mark set regardless of selection length.
    const runs = Array.from({ length: 200 }, (_, i) => ({
      text: 'x'.repeat(50),
      // Every run carries `bold`; half also carry `italic`, so italic is
      // NOT universally present and must drop out of the intersection.
      marks: i % 2 === 0 ? ['bold', 'italic'] : ['bold'],
    }));
    const docNode = doc([markedTextBlock('p1', runs)]);
    // Select the entire 10,000-char block.
    const textLen = 200 * 50;
    const editor = makeEditor(docNode, { from: 2, to: 2 + textLen });

    const t0 = performance.now();
    const info = resolveCurrentSelectionInfo(editor, {});
    const elapsed = performance.now() - t0;

    expect([...info.activeMarks].sort()).toEqual(['bold']);
    // Loose wall-clock bound just to guard against an accidental
    // quadratic regression. The functional assertion above is the real
    // correctness check; this is a smoke check that we're not back to
    // the per-character loop. A noisy CI worker still completes in well
    // under a second for 10k chars; pick a bound that won't flake.
    expect(elapsed).toBeLessThan(500);
  });
});

// ---------------------------------------------------------------------------
// activeCommentIds / activeChangeIds (SD-2792)
// ---------------------------------------------------------------------------

/**
 * Marked-text helper that lets each run carry attribute-bearing marks
 * (commentMark with commentId, trackInsert/Delete/Format with id).
 */
function entityMarkedTextBlock(
  blockId: string,
  runs: Array<{
    text: string;
    marks?: string[];
    marksWithAttrs?: Array<{ name: string; attrs: Record<string, unknown> }>;
  }>,
): ProseMirrorNode {
  const children = runs.map((r) =>
    createNode('text', [], {
      text: r.text,
      markNames: r.marks ?? [],
      marksWithAttrs: r.marksWithAttrs ?? [],
    }),
  );
  return createNode('paragraph', children, {
    isBlock: true,
    inlineContent: true,
    attrs: { sdBlockId: blockId },
  });
}

describe('resolveCurrentSelectionInfo > entity ids', () => {
  it('collects commentIds from commentMarks across the selection (union)', () => {
    const docNode = doc([
      entityMarkedTextBlock('p1', [
        { text: 'Hello ', marksWithAttrs: [{ name: 'commentMark', attrs: { commentId: 'c1' } }] },
        {
          text: 'world',
          marksWithAttrs: [
            { name: 'commentMark', attrs: { commentId: 'c1' } },
            { name: 'commentMark', attrs: { commentId: 'c2' } },
          ],
        },
      ]),
    ]);
    // Select the whole text "Hello world" (PM positions 2..13).
    const editor = makeEditor(docNode, { from: 2, to: 13 });

    const info = resolveCurrentSelectionInfo(editor, {});

    expect([...info.activeCommentIds].sort()).toEqual(['c1', 'c2']);
    expect(info.activeChangeIds).toEqual([]);
  });

  it('collects changeIds from trackInsert/trackDelete/trackFormat marks (translated through canonical resolver)', () => {
    // Raw mark ids and canonical Document API ids can differ. We mock
    // that map so the resolver sees raw 'tc1' / 'tc2' / 'tc3' and
    // returns the canonical 'tcA' / 'tcB' / 'tcC' that consumers see
    // in `trackChanges.list().items[].id`.
    setTrackedChangeMapping([
      { rawId: 'tc1', canonical: 'tcA' },
      { rawId: 'tc2', canonical: 'tcB' },
      { rawId: 'tc3', canonical: 'tcC' },
    ]);
    const docNode = doc([
      entityMarkedTextBlock('p1', [
        { text: 'inserted ', marksWithAttrs: [{ name: 'trackInsert', attrs: { id: 'tc1' } }] },
        { text: 'deleted ', marksWithAttrs: [{ name: 'trackDelete', attrs: { id: 'tc2' } }] },
        { text: 'reformat', marksWithAttrs: [{ name: 'trackFormat', attrs: { id: 'tc3' } }] },
      ]),
    ]);
    const editor = makeEditor(docNode, { from: 2, to: 27 });

    const info = resolveCurrentSelectionInfo(editor, {});

    expect([...info.activeChangeIds].sort()).toEqual(['tcA', 'tcB', 'tcC']);
    expect(info.activeCommentIds).toEqual([]);
  });

  it('drops raw change ids that have no canonical mapping (defensive)', () => {
    // Raw id present in the document but missing from groupTrackedChanges
    // (mid-construction editor, or a mark that wasn't grouped). Leaking
    // the raw id past the resolver would silently produce no-match
    // highlights in consumer sidebars; drop it instead.
    setTrackedChangeMapping([{ rawId: 'tc1', canonical: 'tcA' }]);
    const docNode = doc([
      entityMarkedTextBlock('p1', [
        { text: 'mapped ', marksWithAttrs: [{ name: 'trackInsert', attrs: { id: 'tc1' } }] },
        { text: 'orphan', marksWithAttrs: [{ name: 'trackInsert', attrs: { id: 'orphan-id' } }] },
      ]),
    ]);
    const editor = makeEditor(docNode, { from: 2, to: 14 });

    const info = resolveCurrentSelectionInfo(editor, {});

    expect(info.activeChangeIds).toEqual(['tcA']);
  });

  it('dedupes canonical ids when two raw ids map to the same canonical (paired tracked changes)', () => {
    // Tracked replace produces paired insert + delete halves whose
    // raw mark ids both group to a single canonical id. A range
    // selection across both halves must surface the canonical id
    // once, not twice — otherwise sidebar counts and union-driven
    // highlights would double-count the change.
    setTrackedChangeMapping([
      { rawId: 'tc1-insert', canonical: 'tcA' },
      { rawId: 'tc1-delete', canonical: 'tcA' },
    ]);
    const docNode = doc([
      entityMarkedTextBlock('p1', [
        { text: 'inserted ', marksWithAttrs: [{ name: 'trackInsert', attrs: { id: 'tc1-insert' } }] },
        { text: 'deleted', marksWithAttrs: [{ name: 'trackDelete', attrs: { id: 'tc1-delete' } }] },
      ]),
    ]);
    const editor = makeEditor(docNode, { from: 2, to: 16 });

    const info = resolveCurrentSelectionInfo(editor, {});

    expect(info.activeChangeIds).toEqual(['tcA']);
  });

  it('reports both comment and change ids when a span carries both', () => {
    setTrackedChangeMapping([{ rawId: 'tc1', canonical: 'tcA' }]);
    const docNode = doc([
      entityMarkedTextBlock('p1', [
        {
          text: 'reviewed',
          marksWithAttrs: [
            { name: 'commentMark', attrs: { commentId: 'c1' } },
            { name: 'trackInsert', attrs: { id: 'tc1' } },
          ],
        },
      ]),
    ]);
    const editor = makeEditor(docNode, { from: 2, to: 10 });

    const info = resolveCurrentSelectionInfo(editor, {});

    expect(info.activeCommentIds).toEqual(['c1']);
    expect(info.activeChangeIds).toEqual(['tcA']);
  });

  it('returns empty id arrays when no entity marks overlap the selection', () => {
    const docNode = doc([entityMarkedTextBlock('p1', [{ text: 'Plain text', marks: ['bold'] }])]);
    const editor = makeEditor(docNode, { from: 2, to: 12 });

    const info = resolveCurrentSelectionInfo(editor, {});

    expect(info.activeCommentIds).toEqual([]);
    expect(info.activeChangeIds).toEqual([]);
    expect(info.activeMarks).toEqual(['bold']);
  });

  it('uses union semantics, not intersection (one comment touching part of the selection counts)', () => {
    // Run 1 has comment c1; run 2 is plain. activeMarks would not include
    // a "bold" if it only touched run 1, but activeCommentIds should
    // include c1 because we use union semantics.
    const docNode = doc([
      entityMarkedTextBlock('p1', [
        { text: 'commented', marksWithAttrs: [{ name: 'commentMark', attrs: { commentId: 'c1' } }] },
        { text: ' tail', marks: [] },
      ]),
    ]);
    const editor = makeEditor(docNode, { from: 2, to: 16 });

    const info = resolveCurrentSelectionInfo(editor, {});

    expect(info.activeCommentIds).toEqual(['c1']);
  });

  it('resolves comment ids from importedId / w:id when commentId is absent (legacy DOCX imports)', () => {
    // Imported / legacy comment marks may carry the id on
    // `importedId` or `w:id` instead of the post-import canonical
    // `commentId`. The resolver must honor the same fallback chain
    // the rest of the comment adapter graph uses
    // (`resolveCommentIdFromAttrs`); without it,
    // `selection.current().activeCommentIds` would stay empty over a
    // run that `comments.list()` reports as a real comment.
    const docNode = doc([
      entityMarkedTextBlock('p1', [
        { text: 'imported ', marksWithAttrs: [{ name: 'commentMark', attrs: { importedId: 'imp-1' } }] },
        { text: 'legacy', marksWithAttrs: [{ name: 'commentMark', attrs: { 'w:id': 'leg-2' } }] },
      ]),
    ]);
    const editor = makeEditor(docNode, { from: 2, to: 17 });

    const info = resolveCurrentSelectionInfo(editor, {});

    expect([...info.activeCommentIds].sort()).toEqual(['imp-1', 'leg-2']);
  });

  it('empty arrays survive a JSON round-trip (serialization-stable shape)', () => {
    // Schema and dispatch tests assume the SelectionInfo output is JSON-
    // serializable with stable field presence. Empty arrays should
    // serialize and parse back as empty arrays, not be elided.
    const docNode = doc([textBlock('p1', 'Hello')]);
    const editor = makeEditor(docNode, { from: 2, to: 7 });

    const info = resolveCurrentSelectionInfo(editor, {});
    const roundTripped = JSON.parse(JSON.stringify(info));

    expect(roundTripped.activeCommentIds).toEqual([]);
    expect(roundTripped.activeChangeIds).toEqual([]);
  });
});
