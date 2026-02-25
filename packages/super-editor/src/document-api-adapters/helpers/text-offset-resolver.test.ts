import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { resolveTextRangeInBlock } from './text-offset-resolver.js';

type NodeOptions = {
  text?: string;
  isInline?: boolean;
  isBlock?: boolean;
  isLeaf?: boolean;
  inlineContent?: boolean;
  nodeSize?: number;
};

function createNode(typeName: string, children: ProseMirrorNode[] = [], options: NodeOptions = {}): ProseMirrorNode {
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
    childCount: children.length,
    child(index: number) {
      return children[index]!;
    },
  } as unknown as ProseMirrorNode;
}

describe('resolveTextRangeInBlock', () => {
  it('resolves plain text offsets to absolute positions', () => {
    const textNode = createNode('text', [], { text: 'Hello' });
    const paragraph = createNode('paragraph', [textNode], { isBlock: true, inlineContent: true });

    const result = resolveTextRangeInBlock(paragraph, 0, { start: 0, end: 5 });

    expect(result).toEqual({ from: 1, to: 6 });
  });

  it('resolves offsets that target leaf atoms with nodeSize > 1', () => {
    const textNode = createNode('text', [], { text: 'A' });
    const imageNode = createNode('image', [], { isInline: true, isLeaf: true, nodeSize: 3 });
    const paragraph = createNode('paragraph', [textNode, imageNode], { isBlock: true, inlineContent: true });

    const result = resolveTextRangeInBlock(paragraph, 0, { start: 1, end: 2 });

    expect(result).toEqual({ from: 2, to: 5 });
  });

  it('treats inline wrappers as transparent', () => {
    const textNode = createNode('text', [], { text: 'Hi' });
    const runNode = createNode('run', [textNode], { isInline: true, isLeaf: false });
    const paragraph = createNode('paragraph', [runNode], { isBlock: true, inlineContent: true });

    const result = resolveTextRangeInBlock(paragraph, 0, { start: 0, end: 2 });

    expect(result).toEqual({ from: 2, to: 4 });
  });

  it('returns null for out-of-range offsets', () => {
    const textNode = createNode('text', [], { text: 'Hi' });
    const paragraph = createNode('paragraph', [textNode], { isBlock: true, inlineContent: true });

    const result = resolveTextRangeInBlock(paragraph, 0, { start: 0, end: 5 });

    expect(result).toBeNull();
  });

  it('resolves collapsed zero-offset ranges in empty text blocks', () => {
    const paragraph = createNode('paragraph', [], { isBlock: true, inlineContent: true });

    const result = resolveTextRangeInBlock(paragraph, 10, { start: 0, end: 0 });

    expect(result).toEqual({ from: 11, to: 11 });
  });

  it('accounts for block separators inside container blocks', () => {
    const paraA = createNode('paragraph', [createNode('text', [], { text: 'A' })], {
      isBlock: true,
      inlineContent: true,
    });
    const paraB = createNode('paragraph', [createNode('text', [], { text: 'B' })], {
      isBlock: true,
      inlineContent: true,
    });
    const cell = createNode('tableCell', [paraA, paraB], { isBlock: true, inlineContent: false });

    const result = resolveTextRangeInBlock(cell, 0, { start: 2, end: 3 });

    expect(result).toEqual({ from: 5, to: 6 });
  });
});
