import type { Node as ProseMirrorNode, Mark as ProseMirrorMark } from 'prosemirror-model';
import type { Editor } from '../../core/Editor.js';
import type { BlockIndex } from './node-address-resolver.js';
import { buildInlineIndex, findInlineByType } from './inline-address-resolver.js';

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

  const childEntries = children.map((child) => ({ node: child }));
  let offset = 0;
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
      offset = 0;
      for (const child of childEntries) {
        callback(child.node, offset);
        offset += child.node.nodeSize;
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

describe('inline-address-resolver', () => {
  it('builds inline candidates for marks and atoms', () => {
    const linkMark = makeMark('link', { href: 'https://example.com' });
    const textNode = createNode('text', [], { text: 'Hi', marks: [linkMark] });
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

    const hyperlinks = findInlineByType(inlineIndex, 'hyperlink');
    expect(hyperlinks).toHaveLength(1);
    expect(hyperlinks[0]!.anchor.start.offset).toBe(0);
    expect(hyperlinks[0]!.anchor.end.offset).toBe(2);

    const images = findInlineByType(inlineIndex, 'image');
    expect(images).toHaveLength(1);
    expect(images[0]!.anchor.start.offset).toBe(2);
    expect(images[0]!.anchor.end.offset).toBe(3);
  });

  it('pairs bookmark start and end nodes into a single anchor', () => {
    const bookmarkStart = createNode('bookmarkStart', [], {
      isInline: true,
      isLeaf: false,
      attrs: { id: 'b1', name: 'bm' },
    });
    const textNode = createNode('text', [], { text: 'A' });
    const bookmarkEnd = createNode('bookmarkEnd', [], { isInline: true, isLeaf: true, attrs: { id: 'b1' } });
    const paragraph = createNode('paragraph', [bookmarkStart, textNode, bookmarkEnd], {
      attrs: { sdBlockId: 'p2' },
      isBlock: true,
      inlineContent: true,
    });
    const doc = createNode('doc', [paragraph], { isBlock: false });

    const editor = makeEditor(doc);
    const blockIndex = buildBlockIndexFromParagraph(paragraph, 'p2');
    const inlineIndex = buildInlineIndex(editor, blockIndex);

    const bookmarks = findInlineByType(inlineIndex, 'bookmark');
    expect(bookmarks).toHaveLength(1);
    expect(bookmarks[0]!.anchor.start.offset).toBe(0);
    expect(bookmarks[0]!.anchor.end.offset).toBe(1);
  });
});
