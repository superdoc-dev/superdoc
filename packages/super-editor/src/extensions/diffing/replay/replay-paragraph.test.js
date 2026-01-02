import { describe, it, expect } from 'vitest';
import { EditorState } from 'prosemirror-state';

import { getStarterExtensions } from '@extensions/index.js';
import { createMinimalTestEditor } from '@tests/helpers/editor-test-utils.js';

import { replayParagraphDiff } from './replay-paragraph.js';

/**
 * Builds a schema using the standard editor extensions.
 * @returns {import('prosemirror-model').Schema}
 */
const createSchema = () => {
  const editor = createMinimalTestEditor(getStarterExtensions(), { mode: 'docx', skipViewCreation: true });
  return editor.schema;
};

/**
 * Builds a paragraph node with the given text.
 * @param {import('prosemirror-model').Schema} schema
 * @param {string} text
 * @returns {import('prosemirror-model').Node}
 */
const createParagraph = (schema, text) => {
  return schema.nodes.paragraph.create(null, schema.text(text));
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
 * Verifies paragraph insertion adds the node at the diff position.
 * @returns {void}
 */
const testParagraphAdd = () => {
  const schema = createSchema();
  const doc = schema.nodes.doc.create(null, [createParagraph(schema, 'Before')]);
  const state = EditorState.create({ schema, doc });
  const tr = state.tr;

  const newParagraph = createParagraph(schema, 'Added');
  const diff = {
    action: 'added',
    nodeType: 'paragraph',
    nodeJSON: newParagraph.toJSON(),
    pos: doc.content.size,
    text: 'Added',
  };

  const result = replayParagraphDiff({ tr, diff, schema });

  expect(result.applied).toBe(1);
  expect(tr.doc.childCount).toBe(2);
  expect(tr.doc.child(1).textContent).toBe('Added');
};

/**
 * Verifies paragraph deletion removes the node at the diff position.
 * @returns {void}
 */
const testParagraphDelete = () => {
  const schema = createSchema();
  const paragraph = createParagraph(schema, 'Delete');
  const trailingParagraph = createParagraph(schema, 'Keep');
  const doc = schema.nodes.doc.create(null, [paragraph, trailingParagraph]);
  const state = EditorState.create({ schema, doc });
  const tr = state.tr;

  const paragraphPos = findParagraphPos(doc);
  const diff = {
    action: 'deleted',
    nodeType: 'paragraph',
    nodeJSON: paragraph.toJSON(),
    oldText: 'Delete',
    pos: paragraphPos,
  };

  const result = replayParagraphDiff({ tr, diff, schema });

  expect(result.applied).toBe(1);
  expect(tr.doc.childCount).toBe(1);
  expect(tr.doc.child(0).textContent).toBe('Keep');
};

/**
 * Verifies paragraph modification replays inline text diffs.
 * @returns {void}
 */
const testParagraphInlineModify = () => {
  const schema = createSchema();
  const paragraph = createParagraph(schema, 'Hello');
  const doc = schema.nodes.doc.create(null, [paragraph]);
  const state = EditorState.create({ schema, doc });
  const tr = state.tr;

  const paragraphPos = findParagraphPos(doc);
  const diff = {
    action: 'modified',
    nodeType: 'paragraph',
    pos: paragraphPos,
    oldText: 'Hello',
    newText: 'Yello!',
    oldNodeJSON: paragraph.toJSON(),
    newNodeJSON: createParagraph(schema, 'Yello!').toJSON(),
    contentDiff: [
      {
        action: 'modified',
        kind: 'text',
        startPos: paragraphPos + 1,
        endPos: paragraphPos + 2,
        oldText: 'H',
        newText: 'Y',
        marksDiff: null,
      },
      {
        action: 'added',
        kind: 'text',
        startPos: paragraphPos + 1 + paragraph.content.size,
        endPos: paragraphPos + 1 + paragraph.content.size,
        text: '!',
        marks: [],
      },
    ],
    attrsDiff: null,
  };

  const result = replayParagraphDiff({ tr, diff, schema });

  expect(result.applied).toBe(2);
  expect(tr.doc.textContent).toBe('Yello!');
};

/**
 * Verifies paragraph attribute updates apply new attrs.
 * @returns {void}
 */
const testParagraphAttrsModify = () => {
  const schema = createSchema();
  const paragraph = createParagraph(schema, 'Hello');
  const doc = schema.nodes.doc.create(null, [paragraph]);
  const state = EditorState.create({ schema, doc });
  const tr = state.tr;

  const paragraphPos = findParagraphPos(doc);
  const updatedParagraph = schema.nodes.paragraph.create(
    { paragraphProperties: { styleId: 'Heading1' } },
    schema.text('Hello'),
  );
  const diff = {
    action: 'modified',
    nodeType: 'paragraph',
    pos: paragraphPos,
    oldText: 'Hello',
    newText: 'Hello',
    oldNodeJSON: paragraph.toJSON(),
    newNodeJSON: updatedParagraph.toJSON(),
    contentDiff: [],
    attrsDiff: {
      modified: {
        'paragraphProperties.styleId': { from: null, to: 'Heading1' },
      },
    },
  };

  const result = replayParagraphDiff({ tr, diff, schema });

  expect(result.applied).toBe(1);
  expect(tr.doc.child(0).attrs.paragraphProperties?.styleId).toBe('Heading1');
};

/**
 * Runs the paragraph replay helper suite.
 * @returns {void}
 */
const runParagraphReplaySuite = () => {
  it('adds a paragraph', testParagraphAdd);
  it('deletes a paragraph', testParagraphDelete);
  it('modifies a paragraph with inline diffs', testParagraphInlineModify);
  it('updates paragraph attributes', testParagraphAttrsModify);
};

describe('replayParagraphDiff', runParagraphReplaySuite);
