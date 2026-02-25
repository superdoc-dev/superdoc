import type { Node as ProseMirrorNode } from 'prosemirror-model';
import type { Editor } from '../../core/Editor.js';
import { getBlockIndex, getInlineIndex } from './index-cache.js';

function createTextNode(text: string): ProseMirrorNode {
  return {
    type: { name: 'text' },
    attrs: {},
    marks: [],
    text,
    nodeSize: text.length,
    content: { size: 0 },
    isText: true,
    isInline: true,
    isBlock: false,
    isLeaf: true,
    childCount: 0,
    child() {
      throw new Error('Text nodes do not have children.');
    },
    forEach() {
      // Text nodes do not expose children.
    },
  } as unknown as ProseMirrorNode;
}

function createParagraphNode(nodeId: string, text = 'Hello'): ProseMirrorNode {
  const textNode = createTextNode(text);
  return {
    type: { name: 'paragraph' },
    attrs: { sdBlockId: nodeId },
    marks: [],
    nodeSize: textNode.nodeSize + 2,
    content: { size: textNode.nodeSize },
    isText: false,
    isInline: false,
    isBlock: true,
    inlineContent: true,
    isTextblock: true,
    isLeaf: false,
    childCount: 1,
    child(index: number) {
      if (index !== 0) throw new Error('Paragraph has only one child.');
      return textNode;
    },
    forEach(callback: (node: ProseMirrorNode, offset: number) => void) {
      callback(textNode, 0);
    },
  } as unknown as ProseMirrorNode;
}

function createDocNode(paragraph: ProseMirrorNode): ProseMirrorNode {
  return {
    type: { name: 'doc' },
    attrs: {},
    marks: [],
    nodeSize: paragraph.nodeSize + 2,
    content: { size: paragraph.nodeSize },
    isText: false,
    isInline: false,
    isBlock: false,
    isLeaf: false,
    childCount: 1,
    child(index: number) {
      if (index !== 0) throw new Error('Doc has only one child.');
      return paragraph;
    },
    forEach(callback: (node: ProseMirrorNode, offset: number) => void) {
      callback(paragraph, 0);
    },
    descendants(callback: (node: ProseMirrorNode, pos: number) => void) {
      callback(paragraph, 0);
    },
  } as unknown as ProseMirrorNode;
}

function makeEditor(doc: ProseMirrorNode): Editor {
  return {
    state: {
      doc,
    },
  } as unknown as Editor;
}

describe('index-cache', () => {
  it('reuses block index for the same document snapshot', () => {
    const editor = makeEditor(createDocNode(createParagraphNode('p1')));

    const first = getBlockIndex(editor);
    const second = getBlockIndex(editor);

    expect(second).toBe(first);
  });

  it('lazily builds and reuses inline index for the same document snapshot', () => {
    const editor = makeEditor(createDocNode(createParagraphNode('p1')));

    const block = getBlockIndex(editor);
    const firstInline = getInlineIndex(editor);
    const secondInline = getInlineIndex(editor);

    expect(secondInline).toBe(firstInline);
    expect(getBlockIndex(editor)).toBe(block);
  });

  it('invalidates block and inline indexes when the document snapshot changes', () => {
    const firstDoc = createDocNode(createParagraphNode('p1'));
    const secondDoc = createDocNode(createParagraphNode('p2'));
    const editor = makeEditor(firstDoc) as Editor & { state: { doc: ProseMirrorNode } };

    const firstBlock = getBlockIndex(editor);
    const firstInline = getInlineIndex(editor);

    editor.state.doc = secondDoc;

    const secondBlock = getBlockIndex(editor);
    const secondInline = getInlineIndex(editor);

    expect(secondBlock).not.toBe(firstBlock);
    expect(secondInline).not.toBe(firstInline);
  });
});
