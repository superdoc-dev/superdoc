import { describe, expect, it } from 'vitest';
import { captureRunsInRange } from './style-resolver.js';
import type { Editor } from '../../core/Editor.js';
import type { Node as ProseMirrorNode } from 'prosemirror-model';

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
});
