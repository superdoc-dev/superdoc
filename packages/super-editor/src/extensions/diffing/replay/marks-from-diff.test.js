import { describe, it, expect } from 'vitest';

import { getStarterExtensions } from '@extensions/index.js';
import { createMinimalTestEditor } from '@tests/helpers/editor-test-utils.js';

import { marksFromDiff } from './marks-from-diff.js';

/**
 * Builds a schema using the standard editor extensions.
 * @returns {import('prosemirror-model').Schema}
 */
const createSchema = () => {
  const editor = createMinimalTestEditor(getStarterExtensions(), { mode: 'docx', skipViewCreation: true });
  return editor.schema;
};

/**
 * Extracts mark types from a list of marks for assertions.
 * @param {import('prosemirror-model').Mark[]} marks
 * @returns {string[]}
 */
const getMarkTypes = (marks) => marks.map((mark) => mark.type.name);

/**
 * Verifies marks are generated for added text based on mark JSON.
 * @returns {void}
 */
const testAddedMarks = () => {
  const schema = createSchema();
  const marks = marksFromDiff({
    schema,
    action: 'added',
    marks: [{ type: 'bold' }, { type: 'textStyle', attrs: { color: '#ff0000' } }],
  });

  expect(getMarkTypes(marks)).toEqual(['bold', 'textStyle']);
  expect(marks[1].attrs.color).toBe('#ff0000');
};

/**
 * Verifies modified text uses marksDiff applied to old marks.
 * @returns {void}
 */
const testModifiedMarksFromDiff = () => {
  const schema = createSchema();
  const marks = marksFromDiff({
    schema,
    action: 'modified',
    oldMarks: [{ type: 'bold' }, { type: 'textStyle', attrs: { color: '#0000ff' } }],
    marksDiff: {
      added: [{ name: 'italic', attrs: {} }],
      deleted: [{ name: 'bold', attrs: {} }],
      modified: [{ name: 'textStyle', oldAttrs: { color: '#0000ff' }, newAttrs: { color: '#00ff00' } }],
    },
  });

  expect(getMarkTypes(marks)).toEqual(['textStyle', 'italic']);
  const textStyleMark = marks.find((mark) => mark.type.name === 'textStyle');
  expect(textStyleMark?.attrs.color).toBe('#00ff00');
};

/**
 * Verifies modified text falls back to explicit marks when no marksDiff is provided.
 * @returns {void}
 */
const testModifiedMarksFallback = () => {
  const schema = createSchema();
  const marks = marksFromDiff({
    schema,
    action: 'modified',
    marks: [{ type: 'underline' }],
  });

  expect(getMarkTypes(marks)).toEqual(['underline']);
};

/**
 * Verifies deleted text returns no marks.
 * @returns {void}
 */
const testDeletedMarks = () => {
  const schema = createSchema();
  const marks = marksFromDiff({
    schema,
    action: 'deleted',
    marks: [{ type: 'bold' }],
  });

  expect(marks).toEqual([]);
};

/**
 * Runs the marks-from-diff helper suite.
 * @returns {void}
 */
const runMarksFromDiffSuite = () => {
  it('builds marks for added text', testAddedMarks);
  it('applies marksDiff for modified text', testModifiedMarksFromDiff);
  it('falls back to marks for modified text', testModifiedMarksFallback);
  it('returns no marks for deleted text', testDeletedMarks);
};

describe('marksFromDiff', runMarksFromDiffSuite);
