import { describe, it, expect } from 'vitest';
import { EditorState } from 'prosemirror-state';

import { getStarterExtensions } from '@extensions/index.js';
import { createMinimalTestEditor } from '@tests/helpers/editor-test-utils.js';

import { replayInlineDiff } from './replay-inline.js';

/**
 * Builds a schema using the standard editor extensions.
 * @returns {import('prosemirror-model').Schema}
 */
const createSchema = () => {
  const editor = createMinimalTestEditor(getStarterExtensions(), { mode: 'docx', skipViewCreation: true });
  return editor.schema;
};

/**
 * Builds a paragraph node with the given content.
 * @param {import('prosemirror-model').Schema} schema
 * @param {Array<import('prosemirror-model').Node>} content
 * @returns {import('prosemirror-model').Node}
 */
const createParagraph = (schema, content) => {
  return schema.nodes.paragraph.create(null, content);
};

/**
 * Finds the first paragraph position in the document.
 * @param {import('prosemirror-model').Node} doc
 * @returns {number}
 */
const findParagraphPos = (doc) => {
  let found = null;
  doc.descendants((node, pos) => {
    if (node.type.name === 'paragraph' && found === null) {
      found = pos;
      return false;
    }
    return undefined;
  });
  if (found === null) {
    throw new Error('Expected to find a paragraph node.');
  }
  return found;
};

/**
 * Finds the first inline node position in the document by type.
 * @param {import('prosemirror-model').Node} doc
 * @param {string} typeName
 * @returns {{ pos: number; node: import('prosemirror-model').Node }}
 */
const findInlineNode = (doc, typeName) => {
  let found = null;
  doc.descendants((node, pos) => {
    if (node.type.name === typeName && found === null) {
      found = { node, pos };
      return false;
    }
    return undefined;
  });
  if (!found) {
    throw new Error(`Expected to find inline node ${typeName}.`);
  }
  return found;
};

/**
 * Finds all run nodes in document order.
 * @param {import('prosemirror-model').Node} doc
 * @returns {Array<{ pos: number; node: import('prosemirror-model').Node }>}
 */
const findRunNodes = (doc) => {
  const runs = [];
  doc.descendants((node, pos) => {
    if (node.type.name === 'run') {
      runs.push({ node, pos });
    }
    return undefined;
  });
  return runs;
};

/**
 * Finds the first text node position.
 * @param {import('prosemirror-model').Node} doc
 * @returns {number}
 */
const findFirstTextPos = (doc) => {
  let found = null;
  doc.descendants((node, pos) => {
    if (node.isText && found === null) {
      found = pos;
      return false;
    }
    return undefined;
  });
  if (found === null) {
    throw new Error('Expected to find a text node.');
  }
  return found;
};

/**
 * Verifies inline text insertion uses the paragraph end when startPos is null.
 * @returns {void}
 */
const testTextAddAtParagraphEnd = () => {
  const schema = createSchema();
  const paragraph = createParagraph(schema, [schema.text('Hello')]);
  const doc = schema.nodes.doc.create(null, [paragraph]);
  const state = EditorState.create({ schema, doc });
  const tr = state.tr;

  const paragraphPos = findParagraphPos(doc);
  const paragraphEndPos = paragraphPos + 1 + paragraph.content.size;

  const diff = {
    action: 'added',
    kind: 'text',
    startPos: null,
    endPos: null,
    text: '!',
    marks: [],
  };

  const result = replayInlineDiff({ tr, diff, schema, paragraphEndPos });

  expect(result.applied).toBe(1);
  expect(tr.doc.textContent).toBe('Hello!');
};

/**
 * Verifies inline text deletion removes the specified range.
 * @returns {void}
 */
const testTextDeleteRange = () => {
  const schema = createSchema();
  const paragraph = createParagraph(schema, [schema.text('Hello')]);
  const doc = schema.nodes.doc.create(null, [paragraph]);
  const state = EditorState.create({ schema, doc });
  const tr = state.tr;

  const paragraphPos = findParagraphPos(doc);
  const startPos = paragraphPos + 1 + 1;
  const endPos = startPos + 2;

  const diff = {
    action: 'deleted',
    kind: 'text',
    startPos,
    endPos,
    text: 'ell',
  };

  const result = replayInlineDiff({ tr, diff, schema, paragraphEndPos: endPos });

  expect(result.applied).toBe(1);
  expect(tr.doc.textContent).toBe('Ho');
};

/**
 * Verifies inline text modification applies formatting only.
 * @returns {void}
 */
const testTextModifyRange = () => {
  const schema = createSchema();
  const paragraph = createParagraph(schema, [schema.text('Hello')]);
  const doc = schema.nodes.doc.create(null, [paragraph]);
  const state = EditorState.create({ schema, doc });
  const tr = state.tr;

  const paragraphPos = findParagraphPos(doc);
  const startPos = paragraphPos + 1;
  const endPos = startPos;

  const diff = {
    action: 'modified',
    kind: 'text',
    startPos,
    endPos,
    oldText: 'H',
    newText: 'H',
    marksDiff: {
      added: [{ name: 'bold', attrs: { value: true } }],
      deleted: [],
      modified: [],
    },
  };

  const result = replayInlineDiff({ tr, diff, schema, paragraphEndPos: endPos });

  expect(result.applied).toBe(1);
  expect(tr.doc.textContent).toBe('Hello');
  const firstTextNode = tr.doc.nodeAt(startPos);
  expect(firstTextNode?.marks?.some((mark) => mark.type.name === 'bold')).toBe(true);
};

/**
 * Verifies inline text modification replaces text when content changes.
 * @returns {void}
 */
const testTextModifyReplacesText = () => {
  const schema = createSchema();
  const paragraph = createParagraph(schema, [schema.text('sentence')]);
  const doc = schema.nodes.doc.create(null, [paragraph]);
  const state = EditorState.create({ schema, doc });
  const tr = state.tr;

  const startPos = findFirstTextPos(doc);

  const diff = {
    action: 'modified',
    kind: 'text',
    startPos,
    endPos: startPos + 'sentence'.length - 1,
    oldText: 'sentence',
    newText: 'phrase',
    marksDiff: null,
    runAttrsDiff: null,
  };

  const result = replayInlineDiff({ tr, diff, schema, paragraphEndPos: startPos + 'sentence'.length });

  expect(result.applied).toBe(1);
  expect(result.warnings).toEqual([]);
  expect(tr.doc.textContent).toBe('phrase');
};

/**
 * Verifies inline node insertion is applied at the paragraph end.
 * @returns {void}
 */
const testInlineNodeAdd = () => {
  const schema = createSchema();
  const paragraph = createParagraph(schema, [schema.text('A')]);
  const doc = schema.nodes.doc.create(null, [paragraph]);
  const state = EditorState.create({ schema, doc });
  const tr = state.tr;

  const paragraphPos = findParagraphPos(doc);
  const paragraphEndPos = paragraphPos + 1 + paragraph.content.size;
  const image = schema.nodes.image.create({ src: 'data:image/png;base64,AAA=' });

  const diff = {
    action: 'added',
    kind: 'inlineNode',
    startPos: null,
    endPos: null,
    nodeJSON: image.toJSON(),
  };

  const result = replayInlineDiff({ tr, diff, schema, paragraphEndPos });

  expect(result.applied).toBe(1);
  const insertedImage = findInlineNode(tr.doc, 'image');
  expect(insertedImage).toBeTruthy();
};

/**
 * Verifies inline node deletion removes the node range.
 * @returns {void}
 */
const testInlineNodeDelete = () => {
  const schema = createSchema();
  const image = schema.nodes.image.create({ src: 'data:image/png;base64,AAA=' });
  const paragraph = createParagraph(schema, [schema.text('A'), image]);
  const doc = schema.nodes.doc.create(null, [paragraph]);
  const state = EditorState.create({ schema, doc });
  const tr = state.tr;

  const { node, pos } = findInlineNode(doc, 'image');
  const diff = {
    action: 'deleted',
    kind: 'inlineNode',
    startPos: pos,
    endPos: pos + node.nodeSize,
  };

  const result = replayInlineDiff({ tr, diff, schema, paragraphEndPos: pos });

  expect(result.applied).toBe(1);
  expect(() => findInlineNode(tr.doc, 'image')).toThrow();
};

/**
 * Verifies inline node modification replaces the node range.
 * @returns {void}
 */
const testInlineNodeModify = () => {
  const schema = createSchema();
  const image = schema.nodes.image.create({ src: 'data:image/png;base64,AAA=', alt: 'old' });
  const paragraph = createParagraph(schema, [schema.text('A'), image]);
  const doc = schema.nodes.doc.create(null, [paragraph]);
  const state = EditorState.create({ schema, doc });
  const tr = state.tr;

  const { node, pos } = findInlineNode(doc, 'image');
  const updatedImage = schema.nodes.image.create({ src: 'data:image/png;base64,AAA=', alt: 'new' });

  const diff = {
    action: 'modified',
    kind: 'inlineNode',
    startPos: pos,
    endPos: pos + node.nodeSize,
    newNodeJSON: updatedImage.toJSON(),
  };

  const result = replayInlineDiff({ tr, diff, schema, paragraphEndPos: pos });

  expect(result.applied).toBe(1);
  const updated = findInlineNode(tr.doc, 'image');
  expect(updated.node.attrs.alt).toBe('new');
};

/**
 * Verifies run-attrs replay applies runProperties and metadata for run-attrs-only diffs.
 * @returns {void}
 */
const testTextModifyRunAttrsOnly = () => {
  const schema = createSchema();
  const run = schema.nodes.run.create({ runProperties: { styleId: 'BodyText', bold: true }, rsidR: 'r-old' }, [
    schema.text('A'),
  ]);
  const paragraph = createParagraph(schema, [run]);
  const doc = schema.nodes.doc.create(null, [paragraph]);
  const state = EditorState.create({ schema, doc });
  const tr = state.tr;

  const startPos = findFirstTextPos(doc);

  const diff = {
    action: 'modified',
    kind: 'text',
    startPos,
    endPos: startPos,
    oldText: 'A',
    newText: 'A',
    marksDiff: null,
    runAttrsDiff: {
      added: {},
      deleted: {},
      modified: {
        rsidR: { from: 'r-old', to: 'r-new' },
        'runProperties.styleId': { from: 'BodyText', to: 'Heading1' },
        'runProperties.bold': { from: true, to: false },
      },
    },
  };

  const result = replayInlineDiff({ tr, diff, schema, paragraphEndPos: startPos + 1 });

  expect(result.applied).toBe(1);
  expect(result.warnings).toEqual([]);
  const [updatedRun] = findRunNodes(tr.doc);
  expect(updatedRun.node.attrs.rsidR).toBe('r-new');
  expect(updatedRun.node.attrs.runProperties.styleId).toBe('Heading1');
  expect(updatedRun.node.attrs.runProperties.bold).toBe(false);
};

/**
 * Verifies run-attrs replay updates every run touched by the diff range.
 * @returns {void}
 */
const testTextModifyRunAttrsAcrossRuns = () => {
  const schema = createSchema();
  const runA = schema.nodes.run.create({ runProperties: { styleId: 'BodyText' }, rsidR: 'r-1' }, [schema.text('A')]);
  const runB = schema.nodes.run.create({ runProperties: { styleId: 'BodyText' }, rsidR: 'r-2' }, [schema.text('B')]);
  const paragraph = createParagraph(schema, [runA, runB]);
  const doc = schema.nodes.doc.create(null, [paragraph]);
  const state = EditorState.create({ schema, doc });
  const tr = state.tr;

  const startPos = findFirstTextPos(doc);

  const diff = {
    action: 'modified',
    kind: 'text',
    startPos,
    endPos: startPos + 3, // 'A'(+0) runA-close(+1) runB-open(+2) 'B'(+3) — spans both text nodes
    oldText: 'AB',
    newText: 'AB',
    marksDiff: null,
    runAttrsDiff: {
      added: {},
      deleted: {},
      modified: {
        rsidR: { from: 'r-1', to: 'r-shared' },
      },
    },
  };

  const result = replayInlineDiff({ tr, diff, schema, paragraphEndPos: startPos + 1 });

  expect(result.applied).toBe(1);
  expect(result.warnings).toEqual([]);
  const updatedRuns = findRunNodes(tr.doc);
  expect(updatedRuns).toHaveLength(2);
  expect(updatedRuns[0].node.attrs.rsidR).toBe('r-shared');
  expect(updatedRuns[1].node.attrs.rsidR).toBe('r-shared');
};

/**
 * Verifies metadata run attributes still replay when marksDiff is present.
 * runProperties paths are skipped in this case to avoid overlapping with mark replay.
 *
 * @returns {void}
 */
const testTextModifyMarksAndRunMetadata = () => {
  const schema = createSchema();
  const run = schema.nodes.run.create({ runProperties: { styleId: 'BodyText' }, rsidR: 'r-old' }, [schema.text('A')]);
  const paragraph = createParagraph(schema, [run]);
  const doc = schema.nodes.doc.create(null, [paragraph]);
  const state = EditorState.create({ schema, doc });
  const tr = state.tr;

  const startPos = findFirstTextPos(doc);

  const diff = {
    action: 'modified',
    kind: 'text',
    startPos,
    endPos: startPos,
    oldText: 'A',
    newText: 'A',
    marksDiff: {
      added: [{ name: 'bold', attrs: { value: true } }],
      deleted: [],
      modified: [],
    },
    runAttrsDiff: {
      added: {},
      deleted: {},
      modified: {
        rsidR: { from: 'r-old', to: 'r-new' },
        'runProperties.styleId': { from: 'BodyText', to: 'Heading1' },
      },
    },
  };

  const result = replayInlineDiff({ tr, diff, schema, paragraphEndPos: startPos + 1 });

  expect(result.applied).toBe(1);
  expect(result.warnings).toEqual([]);
  const [updatedRun] = findRunNodes(tr.doc);
  expect(updatedRun.node.attrs.rsidR).toBe('r-new');
  expect(updatedRun.node.attrs.runProperties.styleId).toBe('BodyText');
};

/**
 * Runs the inline replay helper suite.
 * @returns {void}
 */
const runInlineReplaySuite = () => {
  it('inserts text at paragraph end when startPos is null', testTextAddAtParagraphEnd);
  it('deletes a text range', testTextDeleteRange);
  it('applies formatting for a modified text range', testTextModifyRange);
  it('replaces text for a modified text range when content changes', testTextModifyReplacesText);
  it('applies run attributes for a modified text range', testTextModifyRunAttrsOnly);
  it('applies run attributes across multiple runs in a modified range', testTextModifyRunAttrsAcrossRuns);
  it('applies metadata run attributes when marks are modified', testTextModifyMarksAndRunMetadata);
  it('inserts an inline node', testInlineNodeAdd);
  it('deletes an inline node', testInlineNodeDelete);
  it('modifies an inline node', testInlineNodeModify);
};

describe('replayInlineDiff', runInlineReplaySuite);

describe('replayInlineDiff staleness guard', () => {
  it('skips and records a STALE_POSITION warning when oldText does not match (deleted)', () => {
    const schema = createSchema();
    const paragraph = createParagraph(schema, [schema.text('Hello world')]);
    const doc = schema.nodes.doc.create(null, [paragraph]);
    const state = EditorState.create({ schema, doc });
    const tr = state.tr;

    const paragraphPos = findParagraphPos(doc);
    const startPos = paragraphPos + 1 + 1; // points to 'e' in "Hello"
    const endPos = startPos + 3; // covers "ello" (inclusive)

    const diff = {
      action: 'deleted',
      kind: 'text',
      startPos,
      endPos,
      oldText: 'xyz', // stale — actual text is "ello"
    };

    const result = replayInlineDiff({ tr, diff, schema, paragraphEndPos: paragraphPos + 1 + paragraph.content.size });

    expect(result.applied).toBe(0);
    expect(result.skipped).toBe(1);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toMatch(/STALE_POSITION/);
    expect(result.warnings[0]).toMatch(/xyz/);
    expect(result.warnings[0]).toMatch(/ello/);
  });

  it('skips and records a STALE_POSITION warning when oldText does not match (modified)', () => {
    const schema = createSchema();
    const paragraph = createParagraph(schema, [schema.text('Hello world')]);
    const doc = schema.nodes.doc.create(null, [paragraph]);
    const state = EditorState.create({ schema, doc });
    const tr = state.tr;

    const paragraphPos = findParagraphPos(doc);
    const startPos = paragraphPos + 1 + 1;
    const endPos = startPos + 3;

    const diff = {
      action: 'modified',
      kind: 'text',
      startPos,
      endPos,
      oldText: 'xyz', // stale — actual text is "ello"
      newText: 'abc',
      marks: [],
    };

    const result = replayInlineDiff({ tr, diff, schema, paragraphEndPos: paragraphPos + 1 + paragraph.content.size });

    expect(result.applied).toBe(0);
    expect(result.skipped).toBe(1);
    expect(result.warnings[0]).toMatch(/STALE_POSITION/);
  });

  it('applies normally when oldText matches the actual text at the range', () => {
    const schema = createSchema();
    const paragraph = createParagraph(schema, [schema.text('Hello world')]);
    const doc = schema.nodes.doc.create(null, [paragraph]);
    const state = EditorState.create({ schema, doc });
    const tr = state.tr;

    const paragraphPos = findParagraphPos(doc);
    const startPos = paragraphPos + 1 + 1;
    const endPos = startPos + 3;

    const diff = {
      action: 'deleted',
      kind: 'text',
      startPos,
      endPos,
      oldText: 'ello', // matches actual text
    };

    const result = replayInlineDiff({ tr, diff, schema, paragraphEndPos: paragraphPos + 1 + paragraph.content.size });

    expect(result.applied).toBe(1);
    expect(result.skipped).toBe(0);
    expect(result.warnings).toHaveLength(0);
  });

  it('skips stale deletion when the guard uses diff.text (as produced by groupDiffs — no oldText)', () => {
    // groupDiffs sets result.text on deleted diffs, not result.oldText.
    // The guard must fall back to diff.text for deletions.
    const schema = createSchema();
    const paragraph = createParagraph(schema, [schema.text('Hello world')]);
    const doc = schema.nodes.doc.create(null, [paragraph]);
    const state = EditorState.create({ schema, doc });
    const tr = state.tr;

    const paragraphPos = findParagraphPos(doc);
    const startPos = paragraphPos + 1 + 1;
    const endPos = startPos + 3;

    const diff = {
      action: 'deleted',
      kind: 'text',
      startPos,
      endPos,
      text: 'xyz', // stale — actual text is "ello". Note: text, not oldText.
    };

    const result = replayInlineDiff({ tr, diff, schema, paragraphEndPos: paragraphPos + 1 + paragraph.content.size });

    expect(result.applied).toBe(0);
    expect(result.skipped).toBe(1);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toMatch(/STALE_POSITION/);
    expect(result.warnings[0]).toMatch(/xyz/);
    expect(result.warnings[0]).toMatch(/ello/);
  });

  it('applies first diff and skips stale second diff in the same transaction (partial-apply)', () => {
    // Guards that a batch replay commits earlier steps even when a later step is stale.
    // The transaction is NOT rolled back — partial apply is the intended behavior.
    const schema = createSchema();
    const paragraph = createParagraph(schema, [schema.text('abcdef')]);
    const doc = schema.nodes.doc.create(null, [paragraph]);
    const state = EditorState.create({ schema, doc });
    const tr = state.tr;

    const paragraphPos = findParagraphPos(doc);
    const paragraphEndPos = paragraphPos + 1 + paragraph.content.size;
    // 'a'=pos1, 'b'=2, 'c'=3, 'd'=4, 'e'=5, 'f'=6
    const aPos = paragraphPos + 1;

    // diff1: delete "def" at the end — valid, applied first to avoid position shift
    const diff1 = {
      action: 'deleted',
      kind: 'text',
      startPos: aPos + 3,
      endPos: aPos + 5,
      text: 'def',
    };

    // diff2: delete "xyz" at the start — stale, actual text is "abc"
    const diff2 = {
      action: 'deleted',
      kind: 'text',
      startPos: aPos,
      endPos: aPos + 2,
      text: 'xyz',
    };

    const result1 = replayInlineDiff({ tr, diff: diff1, schema, paragraphEndPos });
    const result2 = replayInlineDiff({ tr, diff: diff2, schema, paragraphEndPos: paragraphEndPos - 3 });

    expect(result1.applied).toBe(1);
    expect(result1.skipped).toBe(0);
    expect(result2.applied).toBe(0);
    expect(result2.skipped).toBe(1);
    expect(result2.warnings[0]).toMatch(/STALE_POSITION/);
    // Transaction contains only the first deletion — "def" removed, "abc" intact.
    expect(tr.doc.textContent).toBe('abc');
  });
});
