import type { Node as ProseMirrorNode, Mark as ProseMirrorMark } from 'prosemirror-model';
import type { Editor } from '../core/Editor.js';
import type { BlockIndex } from './helpers/node-address-resolver.js';
import { buildInlineIndex, findInlineByType } from './helpers/inline-address-resolver.js';
import { getNodeAdapter, getNodeByIdAdapter } from './get-node-adapter.js';

function makeMark(name: string, attrs: Record<string, unknown> = {}): ProseMirrorMark {
  return { type: { name }, attrs } as unknown as ProseMirrorMark;
}

type NodeOptions = {
  attrs?: Record<string, unknown>;
  marks?: ProseMirrorMark[];
  text?: string;
  isInline?: boolean;
  isBlock?: boolean;
  isLeaf?: boolean;
  inlineContent?: boolean;
};

function createNode(typeName: string, children: ProseMirrorNode[] = [], options: NodeOptions = {}): ProseMirrorNode {
  const attrs = options.attrs ?? {};
  const marks = options.marks ?? [];
  const text = options.text ?? '';
  const isText = typeName === 'text';
  const isInline = options.isInline ?? isText;
  const isBlock = options.isBlock ?? (!isInline && typeName !== 'doc');
  const inlineContent = options.inlineContent ?? isBlock;
  const isLeaf = options.isLeaf ?? (isInline && children.length === 0 && !isText);

  const contentSize = children.reduce((sum, child) => sum + child.nodeSize, 0);
  const nodeSize = isText ? text.length : isLeaf ? 1 : contentSize + 2;

  return {
    type: { name: typeName },
    attrs,
    marks,
    text: isText ? text : undefined,
    nodeSize,
    content: { size: contentSize },
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
    forEach(callback: (node: ProseMirrorNode, offset: number) => void) {
      let offset = 0;
      for (const child of children) {
        callback(child, offset);
        offset += child.nodeSize;
      }
    },
    descendants(callback: (node: ProseMirrorNode, pos: number) => void) {
      let offset = 0;
      for (const child of children) {
        callback(child, offset);
        offset += child.nodeSize;
      }
    },
  } as unknown as ProseMirrorNode;
}

function makeEditor(docNode: ProseMirrorNode): Editor {
  return { state: { doc: docNode } } as unknown as Editor;
}

function buildBlockIndexFromParagraph(paragraph: ProseMirrorNode, nodeId: string): BlockIndex {
  const candidate = {
    node: paragraph,
    pos: 0,
    end: paragraph.nodeSize,
    nodeType: 'paragraph' as const,
    nodeId,
  };
  const byId = new Map<string, typeof candidate>();
  byId.set(`paragraph:${nodeId}`, candidate);
  return { candidates: [candidate], byId };
}

describe('getNodeAdapter — inline', () => {
  it('resolves inline images by anchor', () => {
    const textNode = createNode('text', [], { text: 'Hi' });
    const imageNode = createNode('image', [], { isInline: true, isLeaf: true, attrs: { src: 'x' } });
    const paragraph = createNode('paragraph', [textNode, imageNode], {
      attrs: { sdBlockId: 'p1' },
      isBlock: true,
      inlineContent: true,
    });
    const doc = createNode('doc', [paragraph], { isBlock: false });

    const editor = makeEditor(doc);
    const blockIndex = buildBlockIndexFromParagraph(paragraph, 'p1');
    const inlineIndex = buildInlineIndex(editor, blockIndex);
    const imageCandidate = findInlineByType(inlineIndex, 'image')[0];
    if (!imageCandidate) throw new Error('Expected image candidate');

    const result = getNodeAdapter(editor, {
      kind: 'inline',
      nodeType: 'image',
      anchor: imageCandidate.anchor,
    });

    expect(result.nodeType).toBe('image');
    expect(result.kind).toBe('inline');
  });

  it('resolves hyperlink marks by anchor', () => {
    const linkMark = makeMark('link', { href: 'https://example.com' });
    const textNode = createNode('text', [], { text: 'Hi', marks: [linkMark] });
    const paragraph = createNode('paragraph', [textNode], {
      attrs: { sdBlockId: 'p2' },
      isBlock: true,
      inlineContent: true,
    });
    const doc = createNode('doc', [paragraph], { isBlock: false });

    const editor = makeEditor(doc);
    const blockIndex = buildBlockIndexFromParagraph(paragraph, 'p2');
    const inlineIndex = buildInlineIndex(editor, blockIndex);
    const hyperlink = findInlineByType(inlineIndex, 'hyperlink')[0];
    if (!hyperlink) throw new Error('Expected hyperlink candidate');

    const result = getNodeAdapter(editor, {
      kind: 'inline',
      nodeType: 'hyperlink',
      anchor: hyperlink.anchor,
    });

    expect(result.nodeType).toBe('hyperlink');
    expect(result.kind).toBe('inline');
  });
});

describe('getNodeAdapter — block', () => {
  it('throws when a block address matches multiple nodes with the same type and id', () => {
    const first = createNode('paragraph', [], { attrs: { sdBlockId: 'dup' }, isBlock: true, inlineContent: true });
    const second = createNode('paragraph', [], { attrs: { sdBlockId: 'dup' }, isBlock: true, inlineContent: true });
    const doc = createNode('doc', [first, second], { isBlock: false });
    const editor = makeEditor(doc);

    expect(() =>
      getNodeAdapter(editor, {
        kind: 'block',
        nodeType: 'paragraph',
        nodeId: 'dup',
      }),
    ).toThrow('Multiple nodes share paragraph id "dup".');
  });
});

describe('getNodeByIdAdapter', () => {
  it('resolves a block node by id without nodeType', () => {
    const textNode = createNode('text', [], { text: 'Hi' });
    const paragraph = createNode('paragraph', [textNode], {
      attrs: { sdBlockId: 'p1' },
      isBlock: true,
      inlineContent: true,
    });
    const doc = createNode('doc', [paragraph], { isBlock: false });

    const editor = makeEditor(doc);
    const result = getNodeByIdAdapter(editor, { nodeId: 'p1' });

    expect(result.nodeType).toBe('paragraph');
    expect(result.kind).toBe('block');
  });

  it('resolves a block node by id with nodeType', () => {
    const paragraph = createNode('paragraph', [], { attrs: { sdBlockId: 'p2' }, isBlock: true, inlineContent: true });
    const doc = createNode('doc', [paragraph], { isBlock: false });
    const editor = makeEditor(doc);

    const result = getNodeByIdAdapter(editor, { nodeId: 'p2', nodeType: 'paragraph' });

    expect(result.nodeType).toBe('paragraph');
  });

  it('throws when nodeId is missing', () => {
    const paragraph = createNode('paragraph', [], { attrs: { sdBlockId: 'p3' }, isBlock: true, inlineContent: true });
    const doc = createNode('doc', [paragraph], { isBlock: false });
    const editor = makeEditor(doc);

    expect(() => getNodeByIdAdapter(editor, { nodeId: 'missing' })).toThrow();
  });

  it('throws when nodeId is ambiguous without nodeType', () => {
    const paragraph = createNode('paragraph', [], { attrs: { sdBlockId: 'dup' }, isBlock: true, inlineContent: true });
    const table = createNode('table', [], { attrs: { sdBlockId: 'dup' }, isBlock: true });
    const doc = createNode('doc', [paragraph, table], { isBlock: false });
    const editor = makeEditor(doc);

    expect(() => getNodeByIdAdapter(editor, { nodeId: 'dup' })).toThrow();
  });

  it('throws when nodeId is ambiguous for the same nodeType', () => {
    const first = createNode('paragraph', [], {
      attrs: { sdBlockId: 'dup-typed' },
      isBlock: true,
      inlineContent: true,
    });
    const second = createNode('paragraph', [], {
      attrs: { sdBlockId: 'dup-typed' },
      isBlock: true,
      inlineContent: true,
    });
    const doc = createNode('doc', [first, second], { isBlock: false });
    const editor = makeEditor(doc);

    expect(() => getNodeByIdAdapter(editor, { nodeId: 'dup-typed', nodeType: 'paragraph' })).toThrow(
      'Multiple nodes share paragraph id "dup-typed".',
    );
  });
});
