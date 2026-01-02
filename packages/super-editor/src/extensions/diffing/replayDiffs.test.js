import { describe, it, expect, vi } from 'vitest';
import { EditorState } from 'prosemirror-state';

import { getStarterExtensions } from '@extensions/index.js';
import { createMinimalTestEditor } from '@tests/helpers/editor-test-utils.js';

vi.mock('@extensions/track-changes/trackChangesHelpers/trackedTransaction.js', () => {
  return {
    trackedTransaction: vi.fn(({ tr }) => tr),
  };
});

import { trackedTransaction } from '@extensions/track-changes/trackChangesHelpers/trackedTransaction.js';
import { replayDiffs } from './replayDiffs';

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
 * Verifies that diffs are replayed in reverse order.
 * @returns {void}
 */
const testReverseOrderReplay = () => {
  const schema = createSchema();
  const doc = schema.nodes.doc.create(null, [createParagraph(schema, 'A')]);
  const state = EditorState.create({ schema, doc });

  const diff = {
    docDiffs: [
      {
        action: 'added',
        nodeType: 'paragraph',
        nodeJSON: createParagraph(schema, 'B').toJSON(),
        text: 'B',
        pos: doc.content.size,
      },
      {
        action: 'added',
        nodeType: 'paragraph',
        nodeJSON: createParagraph(schema, 'C').toJSON(),
        text: 'C',
        pos: doc.content.size,
      },
    ],
    commentDiffs: [],
  };

  const result = replayDiffs({
    state,
    diff,
    schema,
    options: { user: { name: 'Test', email: 'test@example.com' }, applyTrackedChanges: false },
  });

  expect(result.appliedDiffs).toBe(2);
  expect(result.skippedDiffs).toBe(0);
  expect(result.tr.doc.child(0).textContent).toBe('A');
  expect(result.tr.doc.child(1).textContent).toBe('B');
  expect(result.tr.doc.child(2).textContent).toBe('C');
};

/**
 * Verifies replay results aggregate applied and skipped diffs with warnings.
 * @returns {void}
 */
const testReplayAggregation = () => {
  const schema = createSchema();
  const doc = schema.nodes.doc.create(null, [createParagraph(schema, 'A')]);
  const state = EditorState.create({ schema, doc });

  const diff = {
    docDiffs: [
      {
        action: 'added',
        nodeType: 'paragraph',
        nodeJSON: createParagraph(schema, 'B').toJSON(),
        text: 'B',
        pos: doc.content.size,
      },
      {
        action: 'deleted',
        nodeType: 'tableOfContents',
        nodeJSON: { type: 'tableOfContents' },
        pos: 999,
      },
    ],
    commentDiffs: [],
  };

  const result = replayDiffs({
    state,
    diff,
    schema,
    options: { user: { name: 'Test', email: 'test@example.com' }, applyTrackedChanges: false },
  });

  expect(result.appliedDiffs).toBe(1);
  expect(result.skippedDiffs).toBe(1);
  expect(result.warnings.length).toBeGreaterThan(0);
};

/**
 * Verifies trackedTransaction is invoked when tracked changes are enabled.
 * @returns {void}
 */
const testTrackedChangesInvocation = () => {
  const schema = createSchema();
  const doc = schema.nodes.doc.create(null, [createParagraph(schema, 'A')]);
  const state = EditorState.create({ schema, doc });

  const diff = {
    docDiffs: [],
    commentDiffs: [],
  };

  replayDiffs({
    state,
    diff,
    schema,
    options: { user: { name: 'Test', email: 'test@example.com' }, applyTrackedChanges: true },
  });

  expect(trackedTransaction).toHaveBeenCalledTimes(1);
};

/**
 * Runs the replayDiffs orchestration suite.
 * @returns {void}
 */
const runReplayDiffsSuite = () => {
  it('replays diffs in reverse order', testReverseOrderReplay);
  it('aggregates applied/skipped diffs with warnings', testReplayAggregation);
  it('invokes tracked changes when enabled', testTrackedChangesInvocation);
};

describe('replayDiffs', runReplayDiffsSuite);
