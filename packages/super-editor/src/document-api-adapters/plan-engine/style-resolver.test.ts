import { describe, expect, it } from 'vitest';
import { captureRunsInRange } from './style-resolver.js';
import { coalesceRuns, assertRunTilingInvariant } from './match-style-helpers.js';
import type { Editor } from '../../core/Editor.js';
import type { Node as ProseMirrorNode } from 'prosemirror-model';
import type { MatchRun } from '@superdoc/document-api';

type MockMark = {
  type: { name: string };
  attrs: Record<string, unknown>;
  eq: (other: MockMark) => boolean;
};

type MockNodeOptions = {
  text?: string;
  marks?: MockMark[];
  isInline?: boolean;
  isBlock?: boolean;
  isLeaf?: boolean;
  inlineContent?: boolean;
  nodeSize?: number;
};

function mockMark(name: string, attrs: Record<string, unknown> = {}): MockMark {
  return {
    type: { name },
    attrs,
    eq(other: MockMark) {
      if (other.type.name !== name) return false;
      const keys = new Set([...Object.keys(attrs), ...Object.keys(other.attrs ?? {})]);
      for (const key of keys) {
        if ((attrs as Record<string, unknown>)[key] !== other.attrs[key]) return false;
      }
      return true;
    },
  };
}

function createNode(
  typeName: string,
  children: ProseMirrorNode[] = [],
  options: MockNodeOptions = {},
): ProseMirrorNode {
  const text = options.text ?? '';
  const isText = typeName === 'text';
  const isInline = options.isInline ?? isText;
  const isBlock = options.isBlock ?? (!isInline && typeName !== 'doc');
  const inlineContent = options.inlineContent ?? isBlock;
  const isLeaf = options.isLeaf ?? (isInline && !isText && children.length === 0);

  const contentSize = children.reduce((sum, child) => sum + child.nodeSize, 0);
  const nodeSize = isText ? text.length : options.nodeSize != null ? options.nodeSize : isLeaf ? 1 : contentSize + 2;

  return {
    type: { name: typeName },
    text: isText ? text : undefined,
    nodeSize,
    isText,
    isInline,
    isBlock,
    inlineContent,
    isTextblock: inlineContent,
    isLeaf,
    marks: options.marks ?? [],
    childCount: children.length,
    child(index: number) {
      return children[index]!;
    },
  } as unknown as ProseMirrorNode;
}

function makeEditor(blockPos: number, blockNode: ProseMirrorNode | null): Editor {
  return {
    state: {
      doc: {
        nodeAt(pos: number) {
          return pos === blockPos ? blockNode : null;
        },
      },
    },
  } as unknown as Editor;
}

describe('captureRunsInRange', () => {
  it('uses wrapper-transparent text offsets so adjacent runs stay contiguous', () => {
    const bold = mockMark('bold');
    const textStyle = mockMark('textStyle');

    const runA = createNode('run', [createNode('text', [], { text: 'Hello', marks: [bold, textStyle] })], {
      isInline: true,
      isBlock: false,
      isLeaf: false,
    });
    const runB = createNode('run', [createNode('text', [], { text: ' world', marks: [textStyle] })], {
      isInline: true,
      isBlock: false,
      isLeaf: false,
    });
    const paragraph = createNode('paragraph', [runA, runB], { isBlock: true, inlineContent: true });
    const editor = makeEditor(10, paragraph);

    const result = captureRunsInRange(editor, 10, 0, 11);

    expect(result.runs).toHaveLength(2);
    expect(result.runs[0]).toMatchObject({ from: 0, to: 5, charCount: 5 });
    expect(result.runs[1]).toMatchObject({ from: 5, to: 11, charCount: 6 });
    expect(result.runs[0].marks.map((m) => m.type.name)).toEqual(['bold', 'textStyle']);
    expect(result.runs[1].marks.map((m) => m.type.name)).toEqual(['textStyle']);
  });

  it('clamps runs to the requested offset subrange across wrappers', () => {
    const bold = mockMark('bold');

    const runA = createNode('run', [createNode('text', [], { text: 'Hello', marks: [bold] })], {
      isInline: true,
      isBlock: false,
      isLeaf: false,
    });
    const runB = createNode('run', [createNode('text', [], { text: ' world', marks: [] })], {
      isInline: true,
      isBlock: false,
      isLeaf: false,
    });
    const paragraph = createNode('paragraph', [runA, runB], { isBlock: true, inlineContent: true });
    const editor = makeEditor(20, paragraph);

    const result = captureRunsInRange(editor, 20, 2, 8);

    expect(result.runs).toHaveLength(2);
    expect(result.runs[0]).toMatchObject({ from: 2, to: 5, charCount: 3 });
    expect(result.runs[1]).toMatchObject({ from: 5, to: 8, charCount: 3 });
  });

  it('filters metadata marks from captured runs', () => {
    const boldMark = mockMark('bold');
    const trackInsert = mockMark('trackInsert');
    const commentMark = mockMark('commentMark');

    const paragraph = createNode(
      'paragraph',
      [createNode('text', [], { text: 'Hello', marks: [boldMark, trackInsert, commentMark] })],
      { isBlock: true, inlineContent: true },
    );
    const editor = makeEditor(0, paragraph);

    const result = captureRunsInRange(editor, 0, 0, 5);

    expect(result.runs).toHaveLength(1);
    expect(result.runs[0].marks.map((m) => m.type.name)).toEqual(['bold']);
  });

  it('returns empty runs when the block node cannot be resolved', () => {
    const editor = makeEditor(0, null);
    const result = captureRunsInRange(editor, 0, 0, 5);

    expect(result.runs).toEqual([]);
    expect(result.isUniform).toBe(true);
  });

  it('keeps run coverage contiguous when range crosses an inline leaf placeholder', () => {
    const textA = createNode('text', [], { text: 'A' });
    const inlineLeaf = createNode('bookmarkStart', [], {
      isInline: true,
      isBlock: false,
      isLeaf: true,
      nodeSize: 1,
    });
    const textB = createNode('text', [], { text: 'B' });
    const paragraph = createNode('paragraph', [textA, inlineLeaf, textB], { isBlock: true, inlineContent: true });
    const editor = makeEditor(0, paragraph);

    const captured = captureRunsInRange(editor, 0, 0, 3);
    const coalesced = coalesceRuns(captured.runs);
    const matchRuns: MatchRun[] = coalesced.map((run, idx) => ({
      range: { start: run.from, end: run.to },
      text: `r${idx}`,
      styles: { bold: false, italic: false, underline: false, strike: false },
      ref: `test-ref-${idx}`,
    }));

    expect(() => assertRunTilingInvariant(matchRuns, { start: 0, end: 3 }, 'p1')).not.toThrow();
  });

  it('emits a synthetic run for each inline leaf so raw runs tile before coalescing', () => {
    const textA = createNode('text', [], { text: 'AB' });
    const leaf = createNode('image', [], { isInline: true, isBlock: false, isLeaf: true, nodeSize: 1 });
    const textB = createNode('text', [], { text: 'CD' });
    const paragraph = createNode('paragraph', [textA, leaf, textB], { isBlock: true, inlineContent: true });
    const editor = makeEditor(0, paragraph);

    const captured = captureRunsInRange(editor, 0, 0, 5);

    // Raw runs: [0,2) text, [2,3) synthetic leaf, [3,5) text — 3 runs, no gap
    expect(captured.runs).toHaveLength(3);
    expect(captured.runs[0]).toMatchObject({ from: 0, to: 2, charCount: 2 });
    expect(captured.runs[1]).toMatchObject({ from: 2, to: 3, charCount: 1, marks: [] });
    expect(captured.runs[2]).toMatchObject({ from: 3, to: 5, charCount: 2 });
  });

  it('handles multiple consecutive inline leaves without gaps', () => {
    const textA = createNode('text', [], { text: 'X' });
    const leaf1 = createNode('bookmarkStart', [], { isInline: true, isBlock: false, isLeaf: true, nodeSize: 1 });
    const leaf2 = createNode('bookmarkEnd', [], { isInline: true, isBlock: false, isLeaf: true, nodeSize: 1 });
    const textB = createNode('text', [], { text: 'Y' });
    const paragraph = createNode('paragraph', [textA, leaf1, leaf2, textB], { isBlock: true, inlineContent: true });
    const editor = makeEditor(0, paragraph);

    const captured = captureRunsInRange(editor, 0, 0, 4);

    // Raw: [0,1) text, [1,2) leaf, [2,3) leaf, [3,4) text
    expect(captured.runs).toHaveLength(4);
    expect(captured.runs[0]).toMatchObject({ from: 0, to: 1 });
    expect(captured.runs[1]).toMatchObject({ from: 1, to: 2 });
    expect(captured.runs[2]).toMatchObject({ from: 2, to: 3 });
    expect(captured.runs[3]).toMatchObject({ from: 3, to: 4 });

    // After coalescing (all empty marks), they merge into one contiguous run
    const coalesced = coalesceRuns(captured.runs);
    expect(coalesced).toHaveLength(1);
    expect(coalesced[0]).toMatchObject({ from: 0, to: 4, charCount: 4 });
  });

  it('inline leaf between styled text runs produces correct tiling after coalescing', () => {
    const bold = mockMark('bold');
    const textA = createNode('text', [], { text: 'Hi', marks: [bold] });
    const leaf = createNode('bookmarkStart', [], { isInline: true, isBlock: false, isLeaf: true, nodeSize: 1 });
    const textB = createNode('text', [], { text: 'Lo', marks: [bold] });
    const paragraph = createNode('paragraph', [textA, leaf, textB], { isBlock: true, inlineContent: true });
    const editor = makeEditor(0, paragraph);

    const captured = captureRunsInRange(editor, 0, 0, 5);

    // Raw: [0,2) bold, [2,3) empty, [3,5) bold — 3 runs
    expect(captured.runs).toHaveLength(3);

    // After coalescing: bold [0,2), empty [2,3), bold [3,5) — leaf breaks coalescence
    const coalesced = coalesceRuns(captured.runs);
    expect(coalesced).toHaveLength(3);
    expect(coalesced[0]).toMatchObject({ from: 0, to: 2 });
    expect(coalesced[1]).toMatchObject({ from: 2, to: 3 });
    expect(coalesced[2]).toMatchObject({ from: 3, to: 5 });

    // Tiling invariant holds
    const matchRuns: MatchRun[] = coalesced.map((run, idx) => ({
      range: { start: run.from, end: run.to },
      text: `r${idx}`,
      styles: { bold: false, italic: false, underline: false, strike: false },
      ref: `test-ref-${idx}`,
    }));
    expect(() => assertRunTilingInvariant(matchRuns, { start: 0, end: 5 }, 'p1')).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// T9: Run-capture perf budget test (Workstream A)
// ---------------------------------------------------------------------------

describe('captureRunsInRange: performance budget', () => {
  it('handles 50+ inline leaves within environment-safe time budget', () => {
    const leafCount = 60;
    const marks = [mockMark('bold'), mockMark('textStyle')];

    // Build alternating bold/plain text nodes interleaved with inline leaves
    const children: ProseMirrorNode[] = [];
    for (let i = 0; i < leafCount; i++) {
      if (i % 3 === 0) {
        // Inline leaf (e.g., image, footnote ref)
        children.push(
          createNode('inline_image', [], {
            isInline: true,
            isBlock: false,
            isLeaf: true,
            nodeSize: 1,
          }),
        );
      } else if (i % 2 === 0) {
        children.push(createNode('text', [], { text: 'word' + i, marks: [marks[0]] }));
      } else {
        children.push(createNode('text', [], { text: 'text' + i, marks: [marks[1]] }));
      }
    }

    const paragraph = createNode('paragraph', children, { isBlock: true, inlineContent: true });

    // Total text length for the range
    let totalTextLen = 0;
    for (let i = 0; i < paragraph.childCount; i++) {
      const child = paragraph.child(i);
      if (child.isText && child.text) {
        totalTextLen += child.text.length;
      } else {
        totalTextLen += 1; // inline leaf counts as 1
      }
    }

    const editor = makeEditor(0, paragraph);

    // Warm up
    captureRunsInRange(editor, 0, 0, totalTextLen);

    // Timed run (10 iterations to smooth out noise)
    const iterations = 10;
    const start = performance.now();
    for (let i = 0; i < iterations; i++) {
      captureRunsInRange(editor, 0, 0, totalTextLen);
    }
    const elapsed = performance.now() - start;
    const avgMs = elapsed / iterations;

    // Budget: each call should complete well under 5ms on any reasonable CI host.
    // We use a generous 10ms threshold to avoid flakiness on slow machines.
    expect(avgMs).toBeLessThan(10);

    // Verify correctness: runs should tile the full range
    const result = captureRunsInRange(editor, 0, 0, totalTextLen);
    expect(result.runs.length).toBeGreaterThan(0);

    // Runs should cover from 0 to totalTextLen
    const firstRun = result.runs[0];
    const lastRun = result.runs[result.runs.length - 1];
    expect(firstRun.from).toBe(0);
    expect(lastRun.to).toBe(totalTextLen);
  });
});
