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
