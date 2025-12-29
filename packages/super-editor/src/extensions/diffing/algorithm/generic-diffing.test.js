import { describe, it, expect } from 'vitest';
import { diffNodes } from './generic-diffing.ts';

const createDocFromNodes = (nodes = []) => ({
  descendants(callback) {
    nodes.forEach(({ node, pos }) => callback(node, pos));
  },
});

const buildSimpleNode = (typeName, attrs = {}, options = {}) => {
  const { nodeSize = 2, children = [] } = options;
  const node = {
    attrs,
    type: { name: typeName, spec: {} },
    nodeSize,
    descendants(cb) {
      children.forEach((child, index) => {
        cb(child, index + 1);
        if (typeof child.descendants === 'function') {
          child.descendants(cb);
        }
      });
    },
  };
  node.toJSON = () => ({ type: node.type.name, attrs: node.attrs });
  return node;
};

const createParagraph = (text, attrs = {}, options = {}) => {
  const { pos = 0, textAttrs = {} } = options;
  const paragraphNode = {
    attrs,
    type: { name: 'paragraph', spec: {} },
    nodeSize: text.length + 2,
    content: { size: text.length },
    nodesBetween(_from, _to, callback) {
      if (!text.length) {
        return;
      }
      callback(
        {
          isText: true,
          text,
          type: { name: 'text', spec: {} },
          isLeaf: false,
          isInline: true,
        },
        1,
      );
    },
    nodeAt() {
      return { attrs: textAttrs };
    },
  };
  paragraphNode.toJSON = () => ({ type: paragraphNode.type.name, attrs: paragraphNode.attrs });

  return { node: paragraphNode, pos };
};

describe('diffParagraphs', () => {
  it('treats similar paragraphs without IDs as modifications', () => {
    const oldParagraphs = [createParagraph('Hello world from ProseMirror.')];
    const newParagraphs = [createParagraph('Hello brave new world from ProseMirror.')];
    const oldRoot = { descendants: (cb) => oldParagraphs.forEach((p) => cb(p.node, p.pos)) };
    const newRoot = { descendants: (cb) => newParagraphs.forEach((p) => cb(p.node, p.pos)) };

    const diffs = diffNodes(oldRoot, newRoot);

    expect(diffs).toHaveLength(1);
    expect(diffs[0].action).toBe('modified');
    expect(diffs[0].contentDiff.length).toBeGreaterThan(0);
  });

  it('keeps unrelated paragraphs as deletion + addition', () => {
    const oldParagraphs = [createParagraph('Alpha paragraph with some text.')];
    const newParagraphs = [createParagraph('Zephyr quickly jinxed the new passage.')];
    const oldRoot = { descendants: (cb) => oldParagraphs.forEach((p) => cb(p.node, p.pos)) };
    const newRoot = { descendants: (cb) => newParagraphs.forEach((p) => cb(p.node, p.pos)) };

    const diffs = diffNodes(oldRoot, newRoot);

    expect(diffs).toHaveLength(2);
    expect(diffs[0].action).toBe('deleted');
    expect(diffs[1].action).toBe('added');
  });

  it('detects modifications even when Myers emits grouped deletes and inserts', () => {
    const oldParagraphs = [
      createParagraph('Original introduction paragraph that needs tweaks.'),
      createParagraph('Paragraph that will be removed.'),
    ];
    const newParagraphs = [
      createParagraph('Original introduction paragraph that now has tweaks.'),
      createParagraph('Completely different replacement paragraph.'),
    ];
    const oldRoot = { descendants: (cb) => oldParagraphs.forEach((p) => cb(p.node, p.pos)) };
    const newRoot = { descendants: (cb) => newParagraphs.forEach((p) => cb(p.node, p.pos)) };

    const diffs = diffNodes(oldRoot, newRoot);

    expect(diffs).toHaveLength(3);
    expect(diffs[0].action).toBe('modified');
    expect(diffs[0].contentDiff.length).toBeGreaterThan(0);
    expect(diffs[1].action).toBe('deleted');
    expect(diffs[2].action).toBe('added');
  });

  it('treats paragraph attribute-only changes as modifications', () => {
    const oldParagraph = createParagraph('Consistent text', { align: 'left' });
    const newParagraph = createParagraph('Consistent text', { align: 'right' });
    const diffs = diffNodes(createDocFromNodes([oldParagraph]), createDocFromNodes([newParagraph]));

    expect(diffs).toHaveLength(1);
    expect(diffs[0].action).toBe('modified');
    expect(diffs[0].contentDiff).toEqual([]);
    expect(diffs[0].attrsDiff?.modified?.align).toEqual({ from: 'left', to: 'right' });
  });

  it('emits attribute diffs for non-paragraph nodes', () => {
    const oldHeading = { node: buildSimpleNode('heading', { level: 1 }), pos: 0 };
    const newHeading = { node: buildSimpleNode('heading', { level: 2 }), pos: 0 };
    const diffs = diffNodes(createDocFromNodes([oldHeading]), createDocFromNodes([newHeading]));

    expect(diffs).toHaveLength(1);
    expect(diffs[0]).toMatchObject({
      action: 'modified',
      nodeType: 'heading',
    });
    expect(diffs[0].attrsDiff?.modified?.level).toEqual({ from: 1, to: 2 });
  });

  it('deduplicates added nodes and their descendants', () => {
    const childNode = buildSimpleNode('image');
    const parentNode = buildSimpleNode('figure', {}, { children: [childNode] });
    const oldParagraph = createParagraph('Base paragraph', {}, { pos: 0 });
    const newParagraph = createParagraph('Base paragraph', {}, { pos: 0 });
    const insertionPos = oldParagraph.pos + oldParagraph.node.nodeSize;
    const diffs = diffNodes(
      createDocFromNodes([oldParagraph]),
      createDocFromNodes([
        newParagraph,
        { node: parentNode, pos: insertionPos },
        { node: childNode, pos: insertionPos + 1 },
      ]),
    );

    const additions = diffs.filter((diff) => diff.action === 'added');
    expect(additions).toHaveLength(1);
    expect(additions[0].nodeType).toBe('figure');
  });

  it('computes insertion position based on the previous old node', () => {
    const oldParagraph = createParagraph('Hello!', {}, { pos: 0 });
    const newParagraph = createParagraph('Hello!', {}, { pos: 0 });
    const headingNode = buildSimpleNode('heading', { level: 1 }, { nodeSize: 3 });
    const expectedPos = oldParagraph.pos + oldParagraph.node.nodeSize;

    const diffs = diffNodes(
      createDocFromNodes([oldParagraph]),
      createDocFromNodes([newParagraph, { node: headingNode, pos: expectedPos }]),
    );

    const addition = diffs.find((diff) => diff.action === 'added' && diff.nodeType === 'heading');
    expect(addition?.pos).toBe(expectedPos);
  });
});
