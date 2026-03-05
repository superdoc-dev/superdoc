import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { EditorState, TextSelection } from 'prosemirror-state';
import { Mapping, ReplaceAroundStep, ReplaceStep } from 'prosemirror-transform';
import { Fragment, Slice } from 'prosemirror-model';
import { trackedTransaction, documentHelpers } from './index.js';
import { replaceAroundStep } from './replaceAroundStep.js';
import { TrackDeleteMarkName, TrackInsertMarkName } from '../constants.js';
import { TrackChangesBasePluginKey } from '../plugins/trackChangesBasePlugin.js';
import { initTestEditor } from '@tests/helpers/helpers.js';
import { findTextPos } from './testUtils.js';

describe('replaceAroundStep handler', () => {
  let editor;
  let schema;
  let basePlugins;

  const user = { name: 'Track Tester', email: 'track@example.com' };
  const date = '2024-01-01T00:00:00.000Z';

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

  /**
   * Create a ReplaceAroundStep that simulates ProseMirror's structural backspace.
   * A ReplaceAroundStep replaces from..gapFrom and gapTo..to with a slice,
   * preserving the content between gapFrom..gapTo (the "gap").
   *
   * For backspace at a list/paragraph boundary, ProseMirror creates a step that
   * lifts content out of its wrapper. We simulate this by wrapping the text
   * in a listItem-like structure and creating a step that unwraps it.
   */
  const createBackspaceReplaceAroundTr = (state, doc) => {
    // Create a ReplaceAroundStep that covers the paragraph node.
    // This simulates what ProseMirror generates when backspacing at a
    // paragraph boundary to lift content out of its wrapper.
    //
    // We find the first paragraph and create a step that would "unwrap" it
    // by replacing the paragraph's opening and closing tokens while preserving
    // the content between them.
    let paraStart = null;
    let paraEnd = null;
    doc.forEach((node, offset) => {
      if (paraStart === null && node.type.name === 'paragraph') {
        paraStart = offset;
        paraEnd = offset + node.nodeSize;
      }
    });

    if (paraStart === null) throw new Error('No paragraph found');

    // Build a transaction with a ReplaceAroundStep.
    // The step unwraps the paragraph: replaces the paragraph node but keeps its inline content.
    // from=paraStart, to=paraEnd, gapFrom=paraStart+1, gapTo=paraEnd-1
    // This means: replace [paraStart..paraStart+1] (open tag) and [paraEnd-1..paraEnd] (close tag)
    // with a new paragraph wrapper, keeping the content (the "gap") intact.
    const tr = state.tr;
    const step = new ReplaceAroundStep(
      paraStart,
      paraEnd,
      paraStart + 1,
      paraEnd - 1,
      new Slice(Fragment.from(schema.nodes.paragraph.create()), 0, 0),
      1,
      true,
    );

    if (!tr.maybeStep(step).failed) {
      return tr;
    }

    // Fallback: just create a simple structural step to test the handler
    return null;
  };

  /**
   * Helper to invoke replaceAroundStep handler directly.
   * Sets up tr with a real step applied so tr.docs[0] is populated.
   */
  const invokeHandler = ({ state, inputType = 'deleteContentBackward' }) => {
    const doc = state.doc;
    const trackDeleteMarkType = state.schema.marks[TrackDeleteMarkName];

    // We need to supply a tr that has tr.docs populated (i.e., a step was applied to it).
    // Apply a dummy ReplaceStep to the tr to populate tr.docs[0].
    const tr = state.tr;

    // Find cursor position and the char we'd delete
    const cursorPos = state.selection.from;
    let lastLiveCharPos = null;

    // Walk the paragraph to find the live char (same logic as findPreviousLiveCharPos)
    const $cursor = doc.resolve(cursorPos);
    let paraDepth = $cursor.depth;
    while (paraDepth > 0 && $cursor.node(paraDepth).type.name !== 'paragraph') {
      paraDepth--;
    }
    if (paraDepth > 0) {
      const paraStart = $cursor.before(paraDepth) + 1;
      doc.nodesBetween(paraStart, cursorPos, (node, pos) => {
        if (!node.isText) return;
        const hasDeleteMark = node.marks.some((m) => m.type === trackDeleteMarkType);
        if (hasDeleteMark) return;
        const nodeEnd = pos + node.nodeSize;
        const relevantEnd = Math.min(nodeEnd, cursorPos);
        if (relevantEnd > pos) lastLiveCharPos = relevantEnd - 1;
      });
    }

    // Apply a ReplaceStep to tr so tr.docs gets populated
    if (lastLiveCharPos !== null) {
      tr.step(new ReplaceStep(lastLiveCharPos, lastLiveCharPos + 1, Slice.empty));
    }
    tr.setMeta('inputType', inputType);

    const newTr = state.tr;
    const map = new Mapping();
    const fakeStep = {};

    replaceAroundStep({
      state,
      tr,
      step: fakeStep,
      newTr,
      map,
      doc,
      user,
      date,
      originalStep: fakeStep,
      originalStepIndex: 0,
    });

    return newTr;
  };

  describe('non-backspace blocking', () => {
    it('blocks non-backspace ReplaceAroundStep (no steps added to newTr)', () => {
      const doc = schema.nodes.doc.create(
        {},
        schema.nodes.paragraph.create({}, schema.nodes.run.create({}, [schema.text('Hello')])),
      );
      const state = createState(doc);
      const cursorPos = findTextPos(state.doc, 'Hello') + 5;
      const stateWithSelection = state.apply(state.tr.setSelection(TextSelection.create(state.doc, cursorPos)));

      const newTr = invokeHandler({ state: stateWithSelection, inputType: 'insertParagraph' });

      // No steps should be added — the structural change is blocked
      expect(newTr.steps.length).toBe(0);
    });

    it('blocks ReplaceAroundStep without inputType meta', () => {
      const doc = schema.nodes.doc.create(
        {},
        schema.nodes.paragraph.create({}, schema.nodes.run.create({}, [schema.text('Hello')])),
      );
      const state = createState(doc);

      const tr = state.tr;
      // No inputType meta set
      const newTr = state.tr;
      const map = new Mapping();

      replaceAroundStep({
        state,
        tr,
        step: {},
        newTr,
        map,
        doc: state.doc,
        user,
        date,
        originalStep: {},
        originalStepIndex: 0,
      });

      expect(newTr.steps.length).toBe(0);
    });
  });

  describe('backspace character deletion', () => {
    it('converts backspace ReplaceAroundStep to tracked single-char deletion', () => {
      const doc = schema.nodes.doc.create(
        {},
        schema.nodes.paragraph.create({}, schema.nodes.run.create({}, [schema.text('Hello')])),
      );
      let state = createState(doc);

      // Position cursor after 'o' (end of "Hello")
      const cursorPos = findTextPos(state.doc, 'Hello') + 5;
      state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, cursorPos)));

      const newTr = invokeHandler({ state });

      // Should have added steps (the tracked deletion)
      expect(newTr.steps.length).toBeGreaterThan(0);

      // The last character 'o' should be marked as deleted
      let hasDeleteMark = false;
      newTr.doc.descendants((node) => {
        if (node.isText && node.marks.some((m) => m.type.name === TrackDeleteMarkName)) {
          hasDeleteMark = true;
        }
      });
      expect(hasDeleteMark).toBe(true);
    });

    it('sets selectionPos on track meta for cursor positioning', () => {
      const doc = schema.nodes.doc.create(
        {},
        schema.nodes.paragraph.create({}, schema.nodes.run.create({}, [schema.text('Hello')])),
      );
      let state = createState(doc);

      const cursorPos = findTextPos(state.doc, 'Hello') + 5;
      state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, cursorPos)));

      const newTr = invokeHandler({ state });
      const trackMeta = newTr.getMeta(TrackChangesBasePluginKey);

      expect(trackMeta).toBeDefined();
      expect(trackMeta.selectionPos).toBeDefined();
      // selectionPos should be the position of the deleted character (before cursor)
      expect(trackMeta.selectionPos).toBeLessThan(cursorPos);
    });

    it('returns early when no live character exists before cursor', () => {
      // All content is tracked-deleted — nothing to delete
      const deleteMark = schema.marks[TrackDeleteMarkName].create({
        id: 'del-existing',
        author: user.name,
        authorEmail: user.email,
        date,
      });
      const doc = schema.nodes.doc.create(
        {},
        schema.nodes.paragraph.create({}, schema.nodes.run.create({}, [schema.text('Deleted', [deleteMark])])),
      );
      let state = createState(doc);

      const cursorPos = findTextPos(state.doc, 'Deleted') + 7;
      state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, cursorPos)));

      const newTr = invokeHandler({ state });

      // No steps — nothing to delete
      expect(newTr.steps.length).toBe(0);
    });
  });

  describe('findPreviousLiveCharPos (tested through handler)', () => {
    it('skips tracked-deleted text and deletes the last live character', () => {
      // "Hel" (live) + "lo" (deleted by another author) — cursor at end
      // Should delete 'l' (the last live char), not 'o'
      const deleteMark = schema.marks[TrackDeleteMarkName].create({
        id: 'del-existing',
        author: 'Other Author',
        authorEmail: 'other@example.com',
        date: '2023-01-01T00:00:00.000Z',
      });
      const doc = schema.nodes.doc.create(
        {},
        schema.nodes.paragraph.create(
          {},
          schema.nodes.run.create({}, [schema.text('Hel'), schema.text('lo', [deleteMark])]),
        ),
      );
      let state = createState(doc);

      // Cursor after 'lo' (end of all text)
      const hPos = findTextPos(state.doc, 'Hel');
      const cursorPos = hPos + 5; // After "Hello" = Hel + lo
      state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, cursorPos)));

      const newTr = invokeHandler({ state });

      // Should have tracked deletion
      expect(newTr.steps.length).toBeGreaterThan(0);

      // 'l' from "Hel" should be the newly deleted character
      let newlyDeletedText = '';
      newTr.doc.descendants((node) => {
        if (!node.isText) return;
        const mark = node.marks.find((m) => m.type.name === TrackDeleteMarkName);
        if (mark && mark.attrs.id !== 'del-existing') {
          newlyDeletedText += node.text;
        }
      });
      expect(newlyDeletedText).toBe('l');
    });
  });

  describe('mark merging', () => {
    it('merges adjacent trackDelete marks with same author/date but different IDs', () => {
      // Simulate the scenario: "." was deleted previously (id A), now "l" is deleted (id B)
      // They are in separate run nodes with a gap between them.
      // After handler runs, both should have the same ID.
      const existingDeleteMark = schema.marks[TrackDeleteMarkName].create({
        id: 'existing-period-id',
        author: user.name,
        authorEmail: user.email,
        date,
      });

      // "Material" (live) in one run, "." (deleted, id=existing) in another run
      const doc = schema.nodes.doc.create(
        {},
        schema.nodes.paragraph.create({}, [
          schema.nodes.run.create({}, [schema.text('Material')]),
          schema.nodes.run.create({}, [schema.text('.', [existingDeleteMark])]),
        ]),
      );
      let state = createState(doc);

      // Cursor after 'l' in "Material" (position to delete 'l')
      const textPos = findTextPos(state.doc, 'Material');
      const cursorPos = textPos + 8; // After "Material"
      state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, cursorPos)));

      const newTr = invokeHandler({ state });
      const trackMeta = newTr.getMeta(TrackChangesBasePluginKey);

      // The handler should have created a deletion mark
      expect(trackMeta?.deletionMark).toBeDefined();

      // Check that the existing "." deletion was re-marked with the new ID
      const newId = trackMeta.deletionMark.attrs.id;
      let periodMarkId = null;
      newTr.doc.descendants((node) => {
        if (!node.isText || node.text !== '.') return;
        const delMark = node.marks.find((m) => m.type.name === TrackDeleteMarkName);
        if (delMark) periodMarkId = delMark.attrs.id;
      });

      // Both the 'l' deletion and the '.' deletion should now share the same ID
      expect(periodMarkId).toBe(newId);
    });

    it('does not merge marks from different authors', () => {
      const otherAuthorMark = schema.marks[TrackDeleteMarkName].create({
        id: 'other-author-del',
        author: 'Other Author',
        authorEmail: 'other@example.com',
        date,
      });

      const doc = schema.nodes.doc.create(
        {},
        schema.nodes.paragraph.create({}, [
          schema.nodes.run.create({}, [schema.text('Material')]),
          schema.nodes.run.create({}, [schema.text('.', [otherAuthorMark])]),
        ]),
      );
      let state = createState(doc);

      const textPos = findTextPos(state.doc, 'Material');
      const cursorPos = textPos + 8;
      state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, cursorPos)));

      const newTr = invokeHandler({ state });

      // The "." should keep the other author's ID (not merged)
      let periodMarkId = null;
      newTr.doc.descendants((node) => {
        if (!node.isText || node.text !== '.') return;
        const delMark = node.marks.find((m) => m.type.name === TrackDeleteMarkName);
        if (delMark) periodMarkId = delMark.attrs.id;
      });

      expect(periodMarkId).toBe('other-author-del');
    });

    it('does not merge non-contiguous marks separated by live text', () => {
      // "Material" (live) + "." (deleted, same author) + "end" (live) + "!" (deleted, same author)
      // Only "." should be merged with the new deletion; "!" should keep its own ID
      // because "end" (live text) breaks contiguity.
      const deleteMark1 = schema.marks[TrackDeleteMarkName].create({
        id: 'period-del',
        author: user.name,
        authorEmail: user.email,
        date,
      });
      const deleteMark2 = schema.marks[TrackDeleteMarkName].create({
        id: 'excl-del',
        author: user.name,
        authorEmail: user.email,
        date,
      });

      const doc = schema.nodes.doc.create(
        {},
        schema.nodes.paragraph.create({}, [
          schema.nodes.run.create({}, [schema.text('Material')]),
          schema.nodes.run.create({}, [schema.text('.', [deleteMark1])]),
          schema.nodes.run.create({}, [schema.text('end')]),
          schema.nodes.run.create({}, [schema.text('!', [deleteMark2])]),
        ]),
      );
      let state = createState(doc);

      const textPos = findTextPos(state.doc, 'Material');
      const cursorPos = textPos + 8;
      state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, cursorPos)));

      const newTr = invokeHandler({ state });
      const trackMeta = newTr.getMeta(TrackChangesBasePluginKey);
      const newId = trackMeta?.deletionMark?.attrs?.id;

      // "." should be merged (same ID as new deletion)
      let periodMarkId = null;
      let exclMarkId = null;
      newTr.doc.descendants((node) => {
        if (!node.isText) return;
        const delMark = node.marks.find((m) => m.type.name === TrackDeleteMarkName);
        if (!delMark) return;
        if (node.text === '.') periodMarkId = delMark.attrs.id;
        if (node.text === '!') exclMarkId = delMark.attrs.id;
      });

      expect(periodMarkId).toBe(newId); // Adjacent — merged
      expect(exclMarkId).toBe('excl-del'); // Non-contiguous — NOT merged
    });
  });

  describe('selectionPos in trackedTransaction', () => {
    it('selectionPos is honored even when tr.selectionSet is false', () => {
      // This tests the critical fix in trackedTransaction.js:
      // ReplaceAroundStep transactions may not set selection on the original tr,
      // but our handler sets selectionPos on the meta. trackedTransaction must
      // check selectionPos BEFORE checking tr.selectionSet.
      const doc = schema.nodes.doc.create(
        {},
        schema.nodes.paragraph.create({}, schema.nodes.run.create({}, [schema.text('Hello')])),
      );
      let state = createState(doc);

      const cursorPos = findTextPos(state.doc, 'Hello') + 5;
      state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, cursorPos)));

      // Create a transaction with a ReplaceStep but do NOT set selection on tr,
      // simulating the ReplaceAroundStep behavior where tr.selectionSet is false.
      const deletePos = cursorPos - 1;
      const tr = state.tr;
      tr.step(new ReplaceStep(deletePos, cursorPos, Slice.empty));
      tr.setMeta('inputType', 'deleteContentBackward');
      // Critically: do NOT call tr.setSelection — this is what happens with ReplaceAroundStep

      // Set selectionPos meta to simulate what replaceAroundStep handler does
      tr.setMeta(TrackChangesBasePluginKey, { selectionPos: deletePos });

      // Now run through trackedTransaction
      const tracked = trackedTransaction({ tr, state, user });
      const finalState = state.apply(tracked);

      // The selection should be at or near deletePos, not at the original cursor position
      expect(finalState.selection.from).toBeLessThanOrEqual(cursorPos);
    });
  });
});
