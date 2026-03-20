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
  const endPos = startPos + 3;

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
  const endPos = startPos + 1;

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
    endPos: startPos,
    // The replay helper computes `to` from oldText length, so we use a synthetic
    // span that intersects both runs to validate range-based run-attrs updates.
    oldText: 'AB__',
    newText: 'AB__',
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
  it('applies run attributes for a modified text range', testTextModifyRunAttrsOnly);
  it('applies run attributes across multiple runs in a modified range', testTextModifyRunAttrsAcrossRuns);
  it('applies metadata run attributes when marks are modified', testTextModifyMarksAndRunMetadata);
  it('inserts an inline node', testInlineNodeAdd);
  it('deletes an inline node', testInlineNodeDelete);
  it('modifies an inline node', testInlineNodeModify);
};

describe('replayInlineDiff', runInlineReplaySuite);
