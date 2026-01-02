import { describe, it, expect } from 'vitest';
import { EditorState } from 'prosemirror-state';

import { getStarterExtensions } from '@extensions/index.js';
import { createMinimalTestEditor } from '@tests/helpers/editor-test-utils.js';

import { replayNonParagraphDiff } from './replay-non-paragraph.js';

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
 * Builds a table-of-contents node with a single paragraph.
 * @param {import('prosemirror-model').Schema} schema
 * @param {string} text
 * @param {Record<string, unknown>} attrs
 * @returns {import('prosemirror-model').Node}
 */
const createTableOfContents = (schema, text, attrs = null) => {
  const paragraph = createParagraph(schema, text);
  return schema.nodes.tableOfContents.create(attrs, [paragraph]);
};

/**
 * Finds the first occurrence of a node type and returns its position.
 * @param {import('prosemirror-model').Node} doc
 * @param {string} typeName
 * @returns {number|null}
 */
const findNodePos = (doc, typeName) => {
  let found = null;
  doc.descendants((node, pos) => {
    if (node.type.name === typeName && found === null) {
      found = pos;
      return false;
    }
    return undefined;
  });
  return found;
};

/**
 * Verifies that non-paragraph insertions apply at the diff position.
 */
const testNonParagraphInsert = () => {
  const schema = createSchema();
  const paragraph = createParagraph(schema, 'Hello');
  const doc = schema.nodes.doc.create(null, [paragraph]);
  const state = EditorState.create({ schema, doc });
  const tr = state.tr;

  const toc = createTableOfContents(schema, 'Contents');
  const diff = {
    action: 'added',
    nodeType: 'tableOfContents',
    nodeJSON: toc.toJSON(),
    pos: doc.content.size,
  };

  const result = replayNonParagraphDiff({ tr, diff, schema });

  expect(result.applied).toBe(1);
  expect(result.skipped).toBe(0);
  expect(result.warnings).toHaveLength(0);
  expect(tr.doc.childCount).toBe(2);
  expect(tr.doc.child(1).type.name).toBe('tableOfContents');
};

/**
 * Verifies that non-paragraph deletions remove the node at the diff position.
 */
const testNonParagraphDelete = () => {
  const schema = createSchema();
  const paragraph = createParagraph(schema, 'Hello');
  const toc = createTableOfContents(schema, 'Contents');
  const doc = schema.nodes.doc.create(null, [paragraph, toc]);
  const state = EditorState.create({ schema, doc });
  const tr = state.tr;

  const tocPos = findNodePos(doc, 'tableOfContents');
  if (tocPos === null) {
    throw new Error('Expected to find tableOfContents position for deletion test.');
  }
  const diff = {
    action: 'deleted',
    nodeType: 'tableOfContents',
    nodeJSON: toc.toJSON(),
    pos: tocPos,
  };

  const result = replayNonParagraphDiff({ tr, diff, schema });

  expect(result.applied).toBe(1);
  expect(result.skipped).toBe(0);
  expect(result.warnings).toHaveLength(0);
  expect(tr.doc.childCount).toBe(1);
  expect(tr.doc.child(0).type.name).toBe('paragraph');
};

/**
 * Verifies that non-paragraph attribute updates preserve content.
 */
const testNonParagraphModify = () => {
  const schema = createSchema();
  const toc = createTableOfContents(schema, 'Contents');
  const doc = schema.nodes.doc.create(null, [toc]);
  const state = EditorState.create({ schema, doc });
  const tr = state.tr;

  const tocPos = findNodePos(doc, 'tableOfContents');
  if (tocPos === null) {
    throw new Error('Expected to find tableOfContents position for modification test.');
  }
  const updatedToc = createTableOfContents(schema, 'Contents', { instruction: 'updated' });

  const diff = {
    action: 'modified',
    nodeType: 'tableOfContents',
    oldNodeJSON: toc.toJSON(),
    newNodeJSON: updatedToc.toJSON(),
    attrsDiff: {
      modified: {
        instruction: { from: null, to: 'updated' },
      },
    },
    pos: tocPos,
  };

  const result = replayNonParagraphDiff({ tr, diff, schema });

  expect(result.applied).toBe(1);
  expect(result.skipped).toBe(0);
  expect(result.warnings).toHaveLength(0);
  expect(tr.doc.child(0).attrs.instruction).toBe('updated');
  expect(tr.doc.child(0).textContent).toBe('Contents');
};

/**
 * Runs the non-paragraph diff replay suite.
 */
const runNonParagraphSuite = () => {
  it('inserts a non-paragraph node using the diff position', testNonParagraphInsert);
  it('deletes a non-paragraph node at the diff position', testNonParagraphDelete);
  it('updates non-paragraph node attributes without replacing content', testNonParagraphModify);
};

describe('replayNonParagraphDiff', runNonParagraphSuite);
