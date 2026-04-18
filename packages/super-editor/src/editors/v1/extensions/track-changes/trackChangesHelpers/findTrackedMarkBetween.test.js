import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import { EditorState } from 'prosemirror-state';
import { TrackDeleteMarkName, TrackInsertMarkName } from '../constants.js';
import { findTrackedMarkBetween } from './findTrackedMarkBetween.js';
import { initTestEditor } from '@tests/helpers/helpers.js';

describe('findTrackedMarkBetween', () => {
  let editor;
  let schema;
  let basePlugins;

  const user = { name: 'SuperDoc 1115', email: 'user@superdoc.com' };
  const date = '2025-12-15T14:50:00.000Z';

  beforeEach(() => {
    ({ editor } = initTestEditor({ mode: 'text', content: '<p></p>' }));
    schema = editor.schema;
    basePlugins = editor.state.plugins;
  });

  afterEach(() => {
    editor?.destroy();
    editor = null;
  });

  const createState = (doc) =>
    EditorState.create({
      schema,
      doc,
      plugins: basePlugins,
    });

  it('finds mark in run node at end position when nodesBetween does not include it', () => {
    const deleteMark = schema.marks[TrackDeleteMarkName].create({
      id: '90b3b232-e513-43ae-8179-320f5415c258',
      author: user.name,
      authorEmail: user.email,
      date,
    });
    // Create a document structure: paragraph > run("tes") + run(text("t") with trackDelete mark)
    const run1 = schema.nodes.run.create({}, schema.text('tes'));
    const run2 = schema.nodes.run.create({}, schema.text('t', [deleteMark]));
    const paragraph = schema.nodes.paragraph.create({}, [run1, run2]);
    const doc = schema.nodes.doc.create({}, paragraph);

    const state = createState(doc);
    const tr = state.tr;

    // With offset=1 (default), endPos = to + 1 = 6, where run2 starts
    // nodesBetween won't fully include run2, but we should still find it by manually using `nodeAt` at the end of the fn
    const found = findTrackedMarkBetween({
      tr,
      from: 2,
      to: 5,
      markName: TrackDeleteMarkName,
      attrs: { authorEmail: user.email },
    });

    expect(found).toEqual(
      expect.objectContaining({
        mark: expect.objectContaining({
          attrs: expect.objectContaining({
            id: '90b3b232-e513-43ae-8179-320f5415c258',
            authorEmail: user.email,
          }),
        }),
      }),
    );
  });

  it('finds mark in run node at start position when nodesBetween does not include it', () => {
    const deleteMark = schema.marks[TrackDeleteMarkName].create({
      id: '9f4213cc-7829-46c6-a8a8-55334c90c777',
      author: user.name,
      authorEmail: user.email,
      date,
    });
    const run1 = schema.nodes.run.create({}, schema.text('tes', [deleteMark]));
    const run2 = schema.nodes.run.create({}, schema.text('t'));
    const paragraph = schema.nodes.paragraph.create({}, [run1, run2]);
    const doc = schema.nodes.doc.create({}, paragraph);

    const state = createState(doc);
    const tr = state.tr;

    let run2Pos;
    doc.descendants((node, pos) => {
      if (node === run2 && run2Pos == null) {
        run2Pos = pos;
        return false;
      }
      return true;
    });

    const from = run2Pos + 1;
    const to = from + run2.content.size;

    const found = findTrackedMarkBetween({
      tr,
      from,
      to,
      markName: TrackDeleteMarkName,
      attrs: { authorEmail: user.email },
    });

    expect(found).toEqual(
      expect.objectContaining({
        mark: expect.objectContaining({
          attrs: expect.objectContaining({
            id: '9f4213cc-7829-46c6-a8a8-55334c90c777',
            authorEmail: user.email,
          }),
        }),
      }),
    );
  });

  it('finds trackInsert mark on text node directly (not wrapped in run) at start position', () => {
    // This tests the fix for SD-1707: Google Docs exports can have text nodes
    // directly as children of paragraph, not wrapped in run nodes.
    const insertMark = schema.marks[TrackInsertMarkName].create({
      id: 'abc12345-1234-1234-1234-123456789abc',
      author: user.name,
      authorEmail: user.email,
      date,
    });
    // Create: paragraph > text("1" with trackInsert) + run > lineBreak
    // This mimics the structure after typing in a Google Docs exported empty list item
    const textNode = schema.text('1', [insertMark]);
    const lineBreak = schema.nodes.lineBreak.create();
    const run = schema.nodes.run.create({}, lineBreak);
    const paragraph = schema.nodes.paragraph.create({}, [textNode, run]);
    const doc = schema.nodes.doc.create({}, paragraph);

    const state = createState(doc);
    const tr = state.tr;

    // Search from position after the text node (where the run starts)
    // This simulates what happens when inserting the 2nd character
    const found = findTrackedMarkBetween({
      tr,
      from: 3, // Position after text node "1"
      to: 4,
      markName: TrackInsertMarkName,
      attrs: { authorEmail: user.email },
    });

    expect(found).not.toBeNull();
    expect(found.mark.attrs.id).toBe('abc12345-1234-1234-1234-123456789abc');
  });

  it('finds trackInsert mark on text node directly when nodeBefore is a text node', () => {
    const insertMark = schema.marks[TrackInsertMarkName].create({
      id: 'def67890-5678-5678-5678-567890123def',
      author: user.name,
      authorEmail: user.email,
      date,
    });
    // Create: paragraph > text("ab" with trackInsert)
    const textNode = schema.text('ab', [insertMark]);
    const paragraph = schema.nodes.paragraph.create({}, [textNode]);
    const doc = schema.nodes.doc.create({}, paragraph);

    const state = createState(doc);
    const tr = state.tr;

    // Search at position right after the text - this is where new text would be inserted
    // nodeBefore at pos 3 should be the text node "ab"
    const found = findTrackedMarkBetween({
      tr,
      from: 3,
      to: 4,
      markName: TrackInsertMarkName,
      attrs: { authorEmail: user.email },
    });

    expect(found).not.toBeNull();
    expect(found.mark.attrs.id).toBe('def67890-5678-5678-5678-567890123def');
  });

  it('finds trackInsert mark on text node directly when nodeAfter is a text node', () => {
    // This tests the nodeAfter branch of the fix - when the text node comes
    // after the search position (e.g., inserting at paragraph start)
    const insertMark = schema.marks[TrackInsertMarkName].create({
      id: 'ghi01234-9012-9012-9012-901234567ghi',
      author: user.name,
      authorEmail: user.email,
      date,
    });
    // Create: paragraph > text("xy" with trackInsert)
    // Search at position 2 (start of paragraph content) where text node is nodeAfter
    const textNode = schema.text('xy', [insertMark]);
    const paragraph = schema.nodes.paragraph.create({}, [textNode]);
    const doc = schema.nodes.doc.create({}, paragraph);

    const state = createState(doc);
    const tr = state.tr;

    // Position 2 is at the start of paragraph content (after doc open + paragraph open)
    // At this position, nodeAfter should be the text node "xy"
    const found = findTrackedMarkBetween({
      tr,
      from: 2,
      to: 3,
      markName: TrackInsertMarkName,
      attrs: { authorEmail: user.email },
    });

    expect(found).not.toBeNull();
    expect(found.mark.attrs.id).toBe('ghi01234-9012-9012-9012-901234567ghi');
  });
});
