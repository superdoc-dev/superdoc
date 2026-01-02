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
  };

  const result = replayInlineDiff({ tr, diff, schema, paragraphEndPos: endPos });

  expect(result.applied).toBe(1);
  expect(tr.doc.textContent).toBe('Ho');
};

/**
 * Verifies inline text modification replaces the specified range.
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
    newText: 'Y',
    marks: [],
    marksDiff: null,
  };

  const result = replayInlineDiff({ tr, diff, schema, paragraphEndPos: endPos });

  expect(result.applied).toBe(1);
  expect(tr.doc.textContent).toBe('Yello');
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
 * Runs the inline replay helper suite.
 * @returns {void}
 */
const runInlineReplaySuite = () => {
  it('inserts text at paragraph end when startPos is null', testTextAddAtParagraphEnd);
  it('deletes a text range', testTextDeleteRange);
  it('modifies a text range', testTextModifyRange);
  it('inserts an inline node', testInlineNodeAdd);
  it('deletes an inline node', testInlineNodeDelete);
  it('modifies an inline node', testInlineNodeModify);
};

describe('replayInlineDiff', runInlineReplaySuite);
