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

describe('getNodeAdapter — inline SDT', () => {
  it('resolves inline structuredContent as SDSdt (not SDRun)', () => {
    const textChild = createNode('text', [], { text: 'sdt text' });
    const sdtNode = createNode('structuredContent', [textChild], {
      isInline: true,
      attrs: { id: 42, tag: 'test-tag', alias: 'Test', controlType: 'text', lockMode: 'contentLocked' },
    });
    const paragraph = createNode('paragraph', [sdtNode], {
      attrs: { sdBlockId: 'p-sdt' },
      isBlock: true,
      inlineContent: true,
    });
    const doc = createNode('doc', [paragraph], { isBlock: false });

    const editor = makeEditor(doc);
    const blockIndex = buildBlockIndexFromParagraph(paragraph, 'p-sdt');
    const inlineIndex = buildInlineIndex(editor, blockIndex);
    const sdtCandidate = findInlineByType(inlineIndex, 'sdt')[0];
    if (!sdtCandidate) throw new Error('Expected sdt candidate');

    const result = getNodeAdapter(editor, {
      kind: 'inline',
      nodeType: 'sdt',
      anchor: sdtCandidate.anchor,
    });

    expect(result.node.kind).toBe('sdt');
    expect(result.address.kind).toBe('inline');

    const sdt = result.node as import('@superdoc/document-api').SDSdt;
    expect(sdt.sdt.tag).toBe('test-tag');
    expect(sdt.sdt.type).toBe('text');
    expect(sdt.sdt.lock).toBe('content');
    expect(sdt.sdt.scope).toBe('inline');
  });
});

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

    expect(result.node.kind).toBe('image');
    expect(result.address.kind).toBe('inline');
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

    expect(result.node.kind).toBe('hyperlink');
    expect(result.address.kind).toBe('inline');
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

  it('falls back to nodeId when nodeType is stale after paragraph → heading restyle', () => {
    // The block is now a heading (via styleId), but the saved address still says 'paragraph'.
    const paragraph = createNode('paragraph', [], {
      attrs: { sdBlockId: 'p-restyle', paragraphProperties: { styleId: 'Heading1' } },
      isBlock: true,
      inlineContent: true,
    });
    const doc = createNode('doc', [paragraph], { isBlock: false });
    const editor = makeEditor(doc);

    // Address saved before the restyle had nodeType: 'paragraph'
    const result = getNodeAdapter(editor, {
      kind: 'block',
      nodeType: 'paragraph',
      nodeId: 'p-restyle',
    });

    expect(result.node.kind).toBe('heading');
    // The returned address should reflect the current (correct) nodeType
    expect(result.address).toMatchObject({ kind: 'block', nodeType: 'heading', nodeId: 'p-restyle' });
  });

  it('falls back to nodeId when nodeType is stale after paragraph → listItem restyle', () => {
    const paragraph = createNode('paragraph', [], {
      attrs: { sdBlockId: 'p-list', paragraphProperties: { numberingProperties: { numId: 1, ilvl: 0 } } },
      isBlock: true,
      inlineContent: true,
    });
    const doc = createNode('doc', [paragraph], { isBlock: false });
    const editor = makeEditor(doc);

    // Saved address has nodeType: 'paragraph', but the block is now indexed as 'listItem'.
    // The lookup should succeed (not throw) and return the canonical address.
    const result = getNodeAdapter(editor, {
      kind: 'block',
      nodeType: 'paragraph',
      nodeId: 'p-list',
    });

    // projectContentNode returns 'paragraph' kind for PM paragraph nodes with
    // numbering (unlike headings which check styleId), but the address reflects
    // the block index's canonical nodeType.
    expect(result.node.kind).toBe('paragraph');
    expect(result.address).toMatchObject({ kind: 'block', nodeType: 'listItem', nodeId: 'p-list' });
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

    expect(result.node.kind).toBe('paragraph');
    expect(result.address.kind).toBe('block');
  });

  it('resolves a block node by id with nodeType', () => {
    const paragraph = createNode('paragraph', [], { attrs: { sdBlockId: 'p2' }, isBlock: true, inlineContent: true });
    const doc = createNode('doc', [paragraph], { isBlock: false });
    const editor = makeEditor(doc);

    const result = getNodeByIdAdapter(editor, { nodeId: 'p2', nodeType: 'paragraph' });

    expect(result.node.kind).toBe('paragraph');
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
