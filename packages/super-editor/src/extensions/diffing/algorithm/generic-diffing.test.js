import { describe, it, expect } from 'vitest';
import { diffNodes, normalizeNodes } from './generic-diffing.ts';

const createDocFromNodes = (nodes = []) => {
  const docNode = {
    type: { name: 'doc', spec: {} },
    descendants(callback) {
      const childIndexMap = new WeakMap();
      const depthStack = [docNode];
      for (const entry of nodes) {
        const { node, pos, depth = 1 } = entry;
        depthStack.length = depth;
        const parentNode = depthStack[depth - 1] ?? docNode;
        const currentIndex = childIndexMap.get(parentNode) ?? 0;
        childIndexMap.set(parentNode, currentIndex + 1);
        callback(node, pos, parentNode, currentIndex);
        depthStack[depth] = node;
      }
    },
  };

  return docNode;
};

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
  const { pos = 0, textAttrs = {}, depth = 1 } = options;
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

  return { node: paragraphNode, pos, depth };
};

describe('diffParagraphs', () => {
  it('treats similar paragraphs without IDs as modifications', () => {
    const oldParagraphs = [createParagraph('Hello world from ProseMirror.')];
    const newParagraphs = [createParagraph('Hello brave new world from ProseMirror.')];
    const oldRoot = createDocFromNodes(oldParagraphs);
    const newRoot = createDocFromNodes(newParagraphs);

    const diffs = diffNodes(normalizeNodes(oldRoot), normalizeNodes(newRoot));

    expect(diffs).toHaveLength(1);
    expect(diffs[0].action).toBe('modified');
    expect(diffs[0].contentDiff.length).toBeGreaterThan(0);
  });

  it('keeps unrelated paragraphs as deletion + addition', () => {
    const oldParagraphs = [createParagraph('Alpha paragraph with some text.')];
    const newParagraphs = [createParagraph('Zephyr quickly jinxed the new passage.')];
    const oldRoot = createDocFromNodes(oldParagraphs);
    const newRoot = createDocFromNodes(newParagraphs);

    const diffs = diffNodes(normalizeNodes(oldRoot), normalizeNodes(newRoot));

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
    const oldRoot = createDocFromNodes(oldParagraphs);
    const newRoot = createDocFromNodes(newParagraphs);

    const diffs = diffNodes(normalizeNodes(oldRoot), normalizeNodes(newRoot));

    expect(diffs).toHaveLength(3);
    expect(diffs[0].action).toBe('modified');
    expect(diffs[0].contentDiff.length).toBeGreaterThan(0);
    expect(diffs[1].action).toBe('deleted');
    expect(diffs[2].action).toBe('added');
  });

  it('treats paragraph attribute-only changes as modifications', () => {
    const oldParagraph = createParagraph('Consistent text', { align: 'left' });
    const newParagraph = createParagraph('Consistent text', { align: 'right' });
    const diffs = diffNodes(
      normalizeNodes(createDocFromNodes([oldParagraph])),
      normalizeNodes(createDocFromNodes([newParagraph])),
    );

    expect(diffs).toHaveLength(1);
    expect(diffs[0].action).toBe('modified');
    expect(diffs[0].contentDiff).toEqual([]);
    expect(diffs[0].attrsDiff?.modified?.align).toEqual({ from: 'left', to: 'right' });
  });

  it('emits attribute diffs for non-paragraph nodes', () => {
    const oldHeading = { node: buildSimpleNode('heading', { level: 1 }), pos: 0, depth: 1 };
    const newHeading = { node: buildSimpleNode('heading', { level: 2 }), pos: 0, depth: 1 };
    const diffs = diffNodes(
      normalizeNodes(createDocFromNodes([oldHeading])),
      normalizeNodes(createDocFromNodes([newHeading])),
    );

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
      normalizeNodes(createDocFromNodes([oldParagraph])),
      normalizeNodes(
        createDocFromNodes([
          newParagraph,
          { node: parentNode, pos: insertionPos, depth: 1 },
          { node: childNode, pos: insertionPos + 1, depth: 2 },
        ]),
      ),
    );

    const additions = diffs.filter((diff) => diff.action === 'added');
    expect(additions).toHaveLength(1);
    expect(additions[0].nodeType).toBe('figure');
  });

  it('deduplicates deleted nodes and their descendants', () => {
    const childNode = buildSimpleNode('image');
    const parentNode = buildSimpleNode('figure', {}, { children: [childNode] });
    const paragraph = createParagraph('Base paragraph', {}, { pos: 0 });
    const figurePos = paragraph.pos + paragraph.node.nodeSize;

    const diffs = diffNodes(
      normalizeNodes(
        createDocFromNodes([
          paragraph,
          { node: parentNode, pos: figurePos, depth: 1 },
          { node: childNode, pos: figurePos + 1, depth: 2 },
        ]),
      ),
      normalizeNodes(createDocFromNodes([paragraph])),
    );

    const deletions = diffs.filter((diff) => diff.action === 'deleted');
    expect(deletions).toHaveLength(1);
    expect(deletions[0].nodeType).toBe('figure');
  });

  it('computes insertion position for nodes added to the beginning of a container', () => {
    const oldRow = buildSimpleNode('tableRow', { paraId: 'row-1' }, { nodeSize: 4 });
    const oldTable = buildSimpleNode('table', {}, { nodeSize: 10, children: [oldRow] });
    const oldDoc = createDocFromNodes([
      { node: oldTable, pos: 0, depth: 1 },
      { node: oldRow, pos: 1, depth: 2 },
    ]);

    const insertedRow = buildSimpleNode('tableRow', { paraId: 'row-2' }, { nodeSize: 4 });
    const persistedRow = buildSimpleNode('tableRow', { paraId: 'row-1' }, { nodeSize: 4 });
    const newTable = buildSimpleNode('table', {}, { nodeSize: 14, children: [insertedRow, persistedRow] });
    const newDoc = createDocFromNodes([
      { node: newTable, pos: 0, depth: 1 },
      { node: insertedRow, pos: 1, depth: 2 },
      { node: persistedRow, pos: 1 + insertedRow.nodeSize, depth: 2 },
    ]);

    const diffs = diffNodes(normalizeNodes(oldDoc), normalizeNodes(newDoc));

    const addition = diffs.find((diff) => diff.action === 'added' && diff.nodeType === 'tableRow');
    expect(addition).toBeDefined();
    expect(addition.pos).toBe(1);
  });

  it('computes insertion position based on the previous old node', () => {
    const oldParagraph = createParagraph('Hello!', {}, { pos: 0 });
    const newParagraph = createParagraph('Hello!', {}, { pos: 0 });
    const headingNode = buildSimpleNode('heading', { level: 1 }, { nodeSize: 3 });
    const expectedPos = oldParagraph.pos + oldParagraph.node.nodeSize;

    const diffs = diffNodes(
      normalizeNodes(createDocFromNodes([oldParagraph])),
      normalizeNodes(createDocFromNodes([newParagraph, { node: headingNode, pos: expectedPos, depth: 1 }])),
    );

    const addition = diffs.find((diff) => diff.action === 'added' && diff.nodeType === 'heading');
    expect(addition?.pos).toBe(expectedPos);
  });
});
