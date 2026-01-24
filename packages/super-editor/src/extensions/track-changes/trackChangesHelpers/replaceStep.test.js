import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { EditorState, TextSelection } from 'prosemirror-state';
import { trackedTransaction, documentHelpers } from './index.js';
import { TrackInsertMarkName, TrackDeleteMarkName } from '../constants.js';
import { TrackChangesBasePluginKey } from '../plugins/trackChangesBasePlugin.js';
import { initTestEditor } from '@tests/helpers/helpers.js';

describe('trackChangesHelpers replaceStep', () => {
  let editor;
  let schema;
  let basePlugins;

  const user = { name: 'Track Tester', email: 'track@example.com' };

  beforeEach(() => {
    ({ editor } = initTestEditor({ mode: 'text', content: '<p></p>' }));
    schema = editor.schema;
    basePlugins = editor.state.plugins;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    editor?.destroy();
    editor = null;
  });

  const createState = (doc) =>
    EditorState.create({
      schema,
      doc,
      plugins: basePlugins,
    });

  const findTextPos = (docNode, exactText) => {
    let found = null;
    docNode.descendants((node, pos) => {
      if (found) return false;
      if (!node.isText) return;
      if (node.text !== exactText) return;
      found = pos;
    });
    return found;
  };

  it('types characters in correct order after fully deleting content (SD-1624)', () => {
    // Setup: Create a paragraph with "AB" fully marked as deleted
    const deletionMark = schema.marks[TrackDeleteMarkName].create({
      id: 'del-existing',
      author: user.name,
      authorEmail: user.email,
      date: '2024-01-01T00:00:00.000Z',
    });

    const run = schema.nodes.run.create({}, [schema.text('AB', [deletionMark])]);
    const doc = schema.nodes.doc.create({}, schema.nodes.paragraph.create({}, run));
    let state = createState(doc);

    // Position cursor at the start of the paragraph (position 2, after doc and paragraph open tags)
    state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, 2)));

    // Simulate typing "xy" one character at a time
    // Note: We must explicitly setSelection to match real browser input behavior
    // (replaceWith alone doesn't set tr.selectionSet = true)

    // First character: "x"
    let tr = state.tr.replaceWith(state.selection.from, state.selection.from, schema.text('x'));
    // Browser input places cursor after inserted text
    tr.setSelection(TextSelection.create(tr.doc, tr.selection.from));
    tr.setMeta('inputType', 'insertText');
    let tracked = trackedTransaction({ tr, state, user });
    state = state.apply(tracked);

    // Second character: "y"
    tr = state.tr.replaceWith(state.selection.from, state.selection.from, schema.text('y'));
    tr.setSelection(TextSelection.create(tr.doc, tr.selection.from));
    tr.setMeta('inputType', 'insertText');
    tracked = trackedTransaction({ tr, state, user });
    state = state.apply(tracked);

    // Extract the inserted text (text with trackInsert mark)
    let insertedText = '';
    state.doc.descendants((node) => {
      if (node.isText && node.marks.some((mark) => mark.type.name === TrackInsertMarkName)) {
        insertedText += node.text;
      }
    });

    // The bug would cause "yx" (reversed), the fix ensures "xy" (correct order)
    expect(insertedText).toBe('xy');
  });

  it('should map insertedTo through deletionMap when replacing own insertions near deletion spans', () => {
    // Edge case: User has their own prior insertion adjacent to a deletion span.
    // When selecting across both and replacing, markDeletion removes the user's own
    // insertion (shifting positions), but insertedTo was calculated before this shift.
    // The cursor would land too far to the right if insertedTo isn't remapped.
    //
    // Document: [inserted:"XY"][deleted:"ABC"]
    // User selects "XY" + part of "ABC" and types "Q"
    // Expected: cursor lands right after "Q"
    // Bug: cursor lands 2 positions too far right (length of removed "XY")

    const insertionMark = schema.marks[TrackInsertMarkName].create({
      id: 'ins-own',
      author: user.name,
      authorEmail: user.email,
      date: '2024-01-01T00:00:00.000Z',
    });

    const deletionMark = schema.marks[TrackDeleteMarkName].create({
      id: 'del-existing',
      author: user.name,
      authorEmail: user.email,
      date: '2024-01-01T00:00:00.000Z',
    });

    // "XY" with insertion mark, "ABC" with deletion mark
    const run = schema.nodes.run.create({}, [schema.text('XY', [insertionMark]), schema.text('ABC', [deletionMark])]);
    const doc = schema.nodes.doc.create({}, schema.nodes.paragraph.create({}, run));
    let state = createState(doc);

    const posXY = findTextPos(state.doc, 'XY');
    const posABC = findTextPos(state.doc, 'ABC');

    // Select from start of "XY" into the deletion span (selecting "XY" + "A")
    // This triggers positionAdjusted=true because selection ends inside deletion span.
    const from = posXY;
    const to = posABC + 1;
    state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, from, to)));

    // Replace selection with "Q"
    let tr = state.tr.replaceWith(from, to, schema.text('Q'));
    tr.setSelection(TextSelection.create(tr.doc, from + 1)); // Browser would place cursor after "Q"
    tr.setMeta('inputType', 'insertText');

    const tracked = trackedTransaction({ tr, state, user });
    const finalState = state.apply(tracked);

    // After the transaction:
    // - "XY" (user's own insertion) is removed entirely by markDeletion
    // - "A" already has delete mark, stays as deleted
    // - "Q" is inserted after the deletion span
    // - Final doc should be: [deleted:"ABC"][inserted:"Q"]
    //
    // The cursor should be right after "Q"
    // Bug would place it 2 positions too far right (length of removed "XY")

    // Verify the document structure
    let deletedText = '';
    let insertedText = '';
    finalState.doc.descendants((node) => {
      if (node.isText) {
        if (node.marks.some((mark) => mark.type.name === TrackDeleteMarkName)) {
          deletedText += node.text;
        }
        if (node.marks.some((mark) => mark.type.name === TrackInsertMarkName)) {
          insertedText += node.text;
        }
      }
    });

    expect(deletedText).toBe('ABC'); // Already-deleted text is preserved
    expect(insertedText).toBe('Q');

    // The critical assertion: cursor position
    // With the bug, this would fail because cursor is at wrong position
    const cursorPos = finalState.selection.from;
    const expectedCursorPos = findTextPos(finalState.doc, 'Q') + 1; // Right after "Q"

    expect(cursorPos).toBe(expectedCursorPos);
  });

  it('handles multi-step transactions without losing content (SD-1624 fix)', () => {
    // Multi-step transactions (like input rules) should preserve all content.
    // The position adjustment for insertion after deletion spans is only applied
    // to single-step transactions to avoid breaking multi-step mapping.
    const deletionMark = schema.marks[TrackDeleteMarkName].create({
      id: 'del-existing',
      author: user.name,
      authorEmail: user.email,
      date: '2024-01-01T00:00:00.000Z',
    });

    const run = schema.nodes.run.create({}, [schema.text('AB', [deletionMark])]);
    const doc = schema.nodes.doc.create({}, schema.nodes.paragraph.create({}, run));
    let state = createState(doc);
    state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, 2)));

    // Two steps in one transaction (like input rules or batched typing)
    let tr = state.tr;
    tr = tr.replaceWith(2, 2, schema.text('x'));
    tr = tr.replaceWith(3, 3, schema.text('y'));
    tr.setSelection(TextSelection.create(tr.doc, 4));
    tr.setMeta('inputType', 'insertText');

    const tracked = trackedTransaction({ tr, state, user });
    const finalState = state.apply(tracked);

    let insertedText = '';
    finalState.doc.descendants((node) => {
      if (node.isText && node.marks.some((mark) => mark.type.name === TrackInsertMarkName)) {
        insertedText += node.text;
      }
    });

    // Both characters should be tracked
    expect(insertedText).toBe('xy');
  });

  it('tracks replace even when selection contains existing deletions and links', () => {
    const linkMark = schema.marks.link.create({ href: 'https://example.com' });
    const existingDeletion = schema.marks[TrackDeleteMarkName].create({
      id: 'del-existing',
      author: user.name,
      authorEmail: user.email,
      date: '2024-01-01T00:00:00.000Z',
    });

    const run = schema.nodes.run.create({}, [
      schema.text('Start'),
      schema.text('Del', [existingDeletion]),
      schema.text('Link', [linkMark]),
      schema.text('Tail'),
    ]);
    const doc = schema.nodes.doc.create({}, schema.nodes.paragraph.create({}, run));
    let state = createState(doc);

    const startPos = findTextPos(state.doc, 'Start');
    const linkPos = findTextPos(state.doc, 'Link');
    expect(startPos).toBeTypeOf('number');
    expect(linkPos).toBeTypeOf('number');

    const from = startPos;
    const to = linkPos + 'Link'.length;
    state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, from, to)));

    const tr = state.tr.replaceWith(from, to, schema.text('X'));
    tr.setMeta('inputType', 'insertText');

    const tracked = trackedTransaction({ tr, state, user });
    const meta = tracked.getMeta(TrackChangesBasePluginKey);

    expect(meta?.insertedMark).toBeDefined();
    expect(meta?.deletionMark).toBeDefined();
    expect(meta.insertedMark.attrs.id).toBe(meta.deletionMark.attrs.id);

    const finalState = state.apply(tracked);
    const inlineNodes = documentHelpers.findInlineNodes(finalState.doc);
    expect(inlineNodes.some(({ node }) => node.marks.some((mark) => mark.type.name === TrackInsertMarkName))).toBe(
      true,
    );
    expect(inlineNodes.some(({ node }) => node.marks.some((mark) => mark.type.name === TrackDeleteMarkName))).toBe(
      true,
    );
  });
});
