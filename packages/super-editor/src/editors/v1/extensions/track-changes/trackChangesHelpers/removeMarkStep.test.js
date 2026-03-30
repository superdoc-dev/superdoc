import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { EditorState } from 'prosemirror-state';
import { AddMarkStep, RemoveMarkStep } from 'prosemirror-transform';
import { TrackFormatMarkName } from '../constants.js';
import { TrackChangesBasePluginKey } from '../plugins/trackChangesBasePlugin.js';
import { addMarkStep } from './addMarkStep.js';
import { removeMarkStep } from './removeMarkStep.js';
import { initTestEditor } from '@tests/helpers/helpers.js';

describe('removeMarkStep cancel logic', () => {
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

  const createDocWithRuns = (runs) => {
    const runNodes = runs.map(({ text, marks = [] }) => schema.nodes.run.create({}, schema.text(text, marks)));
    return schema.nodes.doc.create({}, schema.nodes.paragraph.create({}, runNodes));
  };

  const createState = (doc) =>
    EditorState.create({
      schema,
      doc,
      plugins: basePlugins,
    });

  /**
   * Simulate add-then-remove of a mark and return the resulting doc.
   * Applies addMarkStep to get the TrackFormat mark, then removeMarkStep.
   */
  const addThenRemoveMark = ({ state, mark, from, to }) => {
    const addStep = new AddMarkStep(from, to, mark);
    const addTr = state.tr;
    addMarkStep({ state, step: addStep, newTr: addTr, doc: state.doc, user, date });
    const stateAfterAdd = state.apply(addTr);

    const removeStep = new RemoveMarkStep(from, to, mark);
    const removeTr = stateAfterAdd.tr;
    removeMarkStep({ state: stateAfterAdd, step: removeStep, newTr: removeTr, doc: stateAfterAdd.doc, user, date });
    return { stateAfterRemove: stateAfterAdd.apply(removeTr), removeTr };
  };

  const hasTrackFormatMark = (doc) => {
    let found = false;
    doc.descendants((node) => {
      if (node.marks?.some((m) => m.type.name === TrackFormatMarkName)) {
        found = true;
      }
    });
    return found;
  };

  it('removes TrackFormat when bold is toggled on then off (no pre-existing marks)', () => {
    const doc = createDocWithRuns([{ text: 'Hello' }]);
    const state = createState(doc);

    const { stateAfterRemove } = addThenRemoveMark({
      state,
      mark: schema.marks.bold.create(),
      from: 2,
      to: 7,
    });

    expect(hasTrackFormatMark(stateAfterRemove.doc)).toBe(false);
  });

  it('removes TrackFormat when bold is toggled on then off (node has pre-existing italic)', () => {
    const italic = schema.marks.italic.create();
    const doc = createDocWithRuns([{ text: 'world', marks: [italic] }]);
    const state = createState(doc);

    const { stateAfterRemove } = addThenRemoveMark({
      state,
      mark: schema.marks.bold.create(),
      from: 2,
      to: 7,
    });

    // The bug: before this fix, a ghost TrackFormat with before=[italic], after=[]
    // would persist, showing "Format: removed italic" even though italic was never touched.
    expect(hasTrackFormatMark(stateAfterRemove.doc)).toBe(false);
  });

  it('keeps TrackFormat when before marks were actually removed from the node', () => {
    // Setup: "world" has italic + bold
    const italic = schema.marks.italic.create();
    const bold = schema.marks.bold.create();
    const doc = createDocWithRuns([{ text: 'world', marks: [italic, bold] }]);
    const state = createState(doc);

    // Step 1: Remove italic (creates TrackFormat with before=[italic], after=[])
    const removeItalicStep = new RemoveMarkStep(2, 7, italic);
    const removeItalicTr = state.tr;
    removeMarkStep({ state, step: removeItalicStep, newTr: removeItalicTr, doc: state.doc, user, date });
    const stateAfterRemoveItalic = state.apply(removeItalicTr);

    // Step 2: Add bold (bold already exists, so this is a no-op for addMarkStep's
    // hasMatchingMark check — bold is already live). Instead, simulate adding underline
    // then removing it to test the cancel logic with a pre-existing removal.
    const addUnderlineStep = new AddMarkStep(2, 7, schema.marks.underline.create());
    const addUnderlineTr = stateAfterRemoveItalic.tr;
    addMarkStep({
      state: stateAfterRemoveItalic,
      step: addUnderlineStep,
      newTr: addUnderlineTr,
      doc: stateAfterRemoveItalic.doc,
      user,
      date,
    });
    const stateAfterAddUnderline = stateAfterRemoveItalic.apply(addUnderlineTr);

    // Step 3: Remove underline (cancel the addition). The TrackFormat should remain
    // because italic was genuinely removed and is no longer on the node.
    const removeUnderlineStep = new RemoveMarkStep(2, 7, schema.marks.underline.create());
    const removeUnderlineTr = stateAfterAddUnderline.tr;
    removeMarkStep({
      state: stateAfterAddUnderline,
      step: removeUnderlineStep,
      newTr: removeUnderlineTr,
      doc: stateAfterAddUnderline.doc,
      user,
      date,
    });
    const stateAfterRemoveUnderline = stateAfterAddUnderline.apply(removeUnderlineTr);

    // TrackFormat should persist because italic was actually removed
    expect(hasTrackFormatMark(stateAfterRemoveUnderline.doc)).toBe(true);

    // Verify the remaining TrackFormat records the italic removal
    let trackFormatAttrs = null;
    stateAfterRemoveUnderline.doc.descendants((node) => {
      const mark = node.marks?.find((m) => m.type.name === TrackFormatMarkName);
      if (mark) trackFormatAttrs = mark.attrs;
    });
    expect(trackFormatAttrs.before).toEqual(expect.arrayContaining([expect.objectContaining({ type: 'italic' })]));
  });

  it('shares TrackFormat ID across nodes when addMarkStep spans multiple runs', () => {
    const italic = schema.marks.italic.create();
    const doc = createDocWithRuns([{ text: 'Hello ' }, { text: 'world', marks: [italic] }]);
    const state = createState(doc);

    const bold = schema.marks.bold.create();
    const step = new AddMarkStep(2, 13, bold);
    const tr = state.tr;
    addMarkStep({ state, step, newTr: tr, doc: state.doc, user, date });
    const result = state.apply(tr);

    // Collect TrackFormat mark IDs from all inline nodes
    const ids = [];
    result.doc.descendants((node) => {
      const mark = node.marks?.find((m) => m.type.name === TrackFormatMarkName);
      if (mark) ids.push(mark.attrs.id);
    });

    expect(ids.length).toBe(2);
    expect(ids[0]).toBe(ids[1]);
  });

  it('clamps TrackFormat mark to node boundaries, not step range', () => {
    // doc > paragraph > run_1("Hello " at pos 2-7) + run_2("world" at pos 10-14)
    // Run open/close tags add +1 offset each, so run_2 content starts at pos 10.
    const doc = createDocWithRuns([{ text: 'Hello ' }, { text: 'world' }]);
    const state = createState(doc);

    // Apply bold from pos 5-11. Clamped per-node:
    //   run_1 text [2,8): [max(5,2), min(11,8)] = [5,8] → "lo " (3 chars)
    //   run_2 text [10,15): [max(5,10), min(11,15)] = [10,11] → "w" (1 char)
    const bold = schema.marks.bold.create();
    const step = new AddMarkStep(5, 11, bold);
    const tr = state.tr;
    addMarkStep({ state, step, newTr: tr, doc: state.doc, user, date });
    const result = state.apply(tr);

    // Collect TrackFormat marks — each should be scoped to its text portion
    const trackMarks = [];
    result.doc.descendants((node, pos) => {
      const mark = node.marks?.find((m) => m.type.name === TrackFormatMarkName);
      if (mark) trackMarks.push({ pos, size: node.nodeSize, text: node.text, id: mark.attrs.id });
    });

    // Two TrackFormat marks: one on "lo " (from first run) and one on "w" (from second run)
    expect(trackMarks.length).toBe(2);
    expect(trackMarks[0].text).toBe('lo ');
    expect(trackMarks[1].text).toBe('w');
    // Both should share the same ID (sharedWid)
    expect(trackMarks[0].id).toBe(trackMarks[1].id);
    // "Hel" and "orld" should NOT have TrackFormat (they were outside the step range)
    const nonTrackedTexts = [];
    result.doc.descendants((node) => {
      if (node.isText && !node.marks?.some((m) => m.type.name === TrackFormatMarkName)) {
        nonTrackedTexts.push(node.text);
      }
    });
    expect(nonTrackedTexts).toContain('Hel');
    expect(nonTrackedTexts).toContain('orld');
  });

  it('removes TrackFormat for multi-node bold toggle (Hello plain + world italic)', () => {
    const italic = schema.marks.italic.create();
    const doc = createDocWithRuns([{ text: 'Hello ' }, { text: 'world', marks: [italic] }]);
    const state = createState(doc);

    const { stateAfterRemove } = addThenRemoveMark({
      state,
      mark: schema.marks.bold.create(),
      from: 2,
      to: 13,
    });

    // Neither node should have a TrackFormat mark
    expect(hasTrackFormatMark(stateAfterRemove.doc)).toBe(false);
  });
});
