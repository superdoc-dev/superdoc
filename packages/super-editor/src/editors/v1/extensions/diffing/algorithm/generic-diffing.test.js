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

const createParagraphSequence = (texts, options = {}) => {
  const { attrs = {}, textAttrs = {}, depth = 1, startPos = 0 } = options;
  let pos = startPos;

  return texts.map((text) => {
    const paragraph = createParagraph(text, attrs, { pos, textAttrs, depth });
    pos += paragraph.node.nodeSize;
    return paragraph;
  });
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

  it('keeps a middle insertion in repeated paragraphs as a single added diff at the correct position', () => {
    const repeatedText = 'Repeated boilerplate paragraph.';
    const insertedText = 'Inserted middle paragraph.';
    const oldParagraphs = createParagraphSequence(Array(10).fill(repeatedText));
    const newParagraphs = createParagraphSequence([
      ...Array(5).fill(repeatedText),
      insertedText,
      ...Array(5).fill(repeatedText),
    ]);

    const diffs = diffNodes(
      normalizeNodes(createDocFromNodes(oldParagraphs)),
      normalizeNodes(createDocFromNodes(newParagraphs)),
    );
    const additions = diffs.filter((diff) => diff.action === 'added');
    const nonAdditions = diffs.filter((diff) => diff.action !== 'added');

    expect(additions).toHaveLength(1);
    expect(nonAdditions).toEqual([]);
    expect(additions[0]).toMatchObject({
      action: 'added',
      nodeType: 'paragraph',
      text: insertedText,
      pos: oldParagraphs[5].pos,
    });
  });

  it('keeps a middle edit in repeated paragraphs as a single modified diff without surrounding noise', () => {
    const repeatedText = 'Repeated boilerplate paragraph.';
    const modifiedText = 'Repeated boilerplate paragraph with one edit.';
    const oldParagraphs = createParagraphSequence(Array(10).fill(repeatedText));
    const newParagraphs = createParagraphSequence([
      ...Array(5).fill(repeatedText),
      modifiedText,
      ...Array(4).fill(repeatedText),
    ]);

    const diffs = diffNodes(
      normalizeNodes(createDocFromNodes(oldParagraphs)),
      normalizeNodes(createDocFromNodes(newParagraphs)),
    );

    expect(diffs).toHaveLength(1);
    expect(diffs[0]).toMatchObject({
      action: 'modified',
      nodeType: 'paragraph',
      oldText: repeatedText,
      newText: modifiedText,
      pos: oldParagraphs[5].pos,
    });
  });

  it('does not pair moderately similar repeated paragraphs as a modification in a larger document', () => {
    const repeatedText = 'Repeated boilerplate paragraph.';
    const oldCandidate = 'electronic warranties section';
    const newCandidate = 'electric what section';
    const oldParagraphs = createParagraphSequence([
      ...Array(5).fill(repeatedText),
      oldCandidate,
      ...Array(4).fill(repeatedText),
    ]);
    const newParagraphs = createParagraphSequence([
      ...Array(5).fill(repeatedText),
      newCandidate,
      ...Array(4).fill(repeatedText),
    ]);

    const diffs = diffNodes(
      normalizeNodes(createDocFromNodes(oldParagraphs)),
      normalizeNodes(createDocFromNodes(newParagraphs)),
    );

    expect(diffs).toHaveLength(2);
    expect(diffs[0]).toMatchObject({
      action: 'deleted',
      nodeType: 'paragraph',
      oldText: oldCandidate,
      pos: oldParagraphs[5].pos,
    });
    expect(diffs[1]).toMatchObject({
      action: 'added',
      nodeType: 'paragraph',
      text: newCandidate,
      // Replay processes diffs in reverse order. The added diff must land after the deleted
      // paragraph in old-doc coordinates so that when replay reverses (insert first, then delete),
      // the inserted node ends up at the deleted paragraph's original position.
      pos: oldParagraphs[5].pos + oldParagraphs[5].node.nodeSize,
    });
  });

  it('keeps an unrelated replacement in equal-length repeated sequences as deleted + added', () => {
    const repeatedText = 'Repeated boilerplate paragraph.';
    const unrelatedText = 'Zephyr quickly jinxed an entirely unrelated passage.';
    // 5 identical old paragraphs; the 3rd is replaced with something with low similarity to P.
    const oldParagraphs = createParagraphSequence(Array(5).fill(repeatedText));
    const newParagraphs = createParagraphSequence([
      ...Array(2).fill(repeatedText),
      unrelatedText,
      ...Array(2).fill(repeatedText),
    ]);

    const diffs = diffNodes(
      normalizeNodes(createDocFromNodes(oldParagraphs)),
      normalizeNodes(createDocFromNodes(newParagraphs)),
    );

    expect(diffs).toHaveLength(2);
    expect(diffs[0]).toMatchObject({
      action: 'deleted',
      nodeType: 'paragraph',
      oldText: repeatedText,
      pos: oldParagraphs[2].pos,
    });
    expect(diffs[1]).toMatchObject({
      action: 'added',
      nodeType: 'paragraph',
      text: unrelatedText,
      pos: oldParagraphs[2].pos + oldParagraphs[2].node.nodeSize,
    });
  });

  it('emits deleted+added for a paragraph with similarity 0.65–0.70 when surrounded by repeated paragraphs', () => {
    // Myers path: old is NOT all-identical (contains oldPara ≠ R), so positionalAlignDiffs
    // is skipped and Myers + detectLocalRepeatedContent runs instead.
    // sim("Repeated standard text here.", "Repeated standard paragraph.") ≈ 0.679 —
    // above the base threshold (0.65) but below the repeated-content threshold (0.70).
    // detectLocalRepeatedContent sees the surrounding R paragraphs and raises the
    // threshold to 0.70, so the pair must be emitted as deleted+added, not modified.
    const repeatedText = 'Repeated boilerplate paragraph.';
    const oldPara = 'Repeated standard text here.'; // ≈ 0.679 similarity with newPara
    const newPara = 'Repeated standard paragraph.';
    const oldParagraphs = createParagraphSequence([
      ...Array(4).fill(repeatedText),
      oldPara,
      ...Array(5).fill(repeatedText),
    ]);
    const newParagraphs = createParagraphSequence([
      ...Array(4).fill(repeatedText),
      newPara,
      ...Array(5).fill(repeatedText),
    ]);

    const diffs = diffNodes(
      normalizeNodes(createDocFromNodes(oldParagraphs)),
      normalizeNodes(createDocFromNodes(newParagraphs)),
    );

    expect(diffs).toHaveLength(2);
    expect(diffs[0]).toMatchObject({ action: 'deleted', oldText: oldPara });
    expect(diffs[1]).toMatchObject({ action: 'added', text: newPara });
  });

  it('emits modified for the same borderline pair when there are no repeated neighbours', () => {
    // Without repeated neighbours detectLocalRepeatedContent does not raise the
    // threshold, so similarity 0.679 clears the base 0.65 threshold → modified.
    const oldText = 'Repeated standard text here.';
    const newText = 'Repeated standard paragraph.';
    const diffs = diffNodes(
      normalizeNodes(createDocFromNodes(createParagraphSequence([oldText]))),
      normalizeNodes(createDocFromNodes(createParagraphSequence([newText]))),
    );

    expect(diffs).toHaveLength(1);
    expect(diffs[0]).toMatchObject({ action: 'modified', oldText, newText });
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

  it('inserts after the correct ancestor when adding a shallower node after nested content', () => {
    const tableCell = buildSimpleNode('tableCell', {}, { nodeSize: 4 });
    const tableRow = buildSimpleNode('tableRow', { paraId: 'row-1' }, { nodeSize: 6, children: [tableCell] });
    const table = buildSimpleNode('table', {}, { nodeSize: 12, children: [tableRow] });
    const headingNode = buildSimpleNode('heading', { level: 1 }, { nodeSize: 3 });

    const oldDoc = createDocFromNodes([
      { node: table, pos: 0, depth: 1 },
      { node: tableRow, pos: 1, depth: 2 },
      { node: tableCell, pos: 2, depth: 3 },
    ]);
    const newDoc = createDocFromNodes([
      { node: table, pos: 0, depth: 1 },
      { node: tableRow, pos: 1, depth: 2 },
      { node: tableCell, pos: 2, depth: 3 },
      { node: headingNode, pos: 12, depth: 1 },
    ]);

    const diffs = diffNodes(normalizeNodes(oldDoc), normalizeNodes(newDoc));
    const addition = diffs.find((diff) => diff.action === 'added' && diff.nodeType === 'heading');

    expect(addition).toBeDefined();
    expect(addition?.pos).toBe(12);
  });
});
