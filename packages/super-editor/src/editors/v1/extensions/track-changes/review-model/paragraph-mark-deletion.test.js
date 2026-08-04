// @ts-check
/**
 * Whole-block tracked deletion (paragraph / list item).
 *
 * Deleting a list item in tracked mode marks the runs AND the paragraph MARK
 * (`w:pPr/w:rPr/w:del`, recorded on `paragraph.attrs.markTrackChange`). The two
 * halves share one revision id, so the document surfaces ONE decidable change:
 *
 *   accept → content removed AND the emptied paragraph collapses into its
 *            successor, so the item is gone and the remaining list renumbers.
 *   reject → the run marks and the paragraph mark both clear; the item stays.
 *
 * Before this, accepting removed only the text and left an empty numbered
 * paragraph behind, which is what customers reported.
 */

import { describe, it, expect } from 'vitest';
import { EditorState } from 'prosemirror-state';

import { decideTrackedChanges } from './decision-engine.js';
import { buildReviewGraph } from './review-graph.js';
import { createReviewGraphTestSchema } from './test-fixtures.js';
import { TrackDeleteMarkName } from '../constants.js';

const ALICE = { name: 'Alice Reviewer', email: 'alice@example.com' };
const CHANGE_ID = 'para-del-1';

const editorFor = () => ({
  options: { user: ALICE, trackedChanges: {} },
  storage: { trackChanges: { lastDecisionFailure: null } },
});

/**
 * Three paragraphs; the middle one is deleted whole — every run carries the
 * trackDelete mark and the node carries the matching paragraph-mark deletion.
 */
const stateWithDeletedBlock = ({ markTrackChange = true } = {}) => {
  const schema = createReviewGraphTestSchema();
  const deleteMark = schema.marks[TrackDeleteMarkName].create({
    id: CHANGE_ID,
    author: ALICE.name,
    authorEmail: ALICE.email,
    date: '2026-07-31T10:00:00Z',
  });

  const doc = schema.node('doc', null, [
    schema.node('paragraph', null, [schema.text('First item')]),
    schema.node(
      'paragraph',
      markTrackChange
        ? {
            markTrackChange: {
              type: 'paragraphMarkDelete',
              id: CHANGE_ID,
              author: ALICE.name,
              authorEmail: ALICE.email,
              date: '2026-07-31T10:00:00Z',
            },
          }
        : null,
      [schema.text('Second item', [deleteMark])],
    ),
    schema.node('paragraph', null, [schema.text('Third item')]),
  ]);

  return { schema, state: EditorState.create({ doc }) };
};

const paragraphTexts = (state) => {
  const texts = [];
  state.doc.forEach((node) => texts.push(node.textContent));
  return texts;
};

describe('whole-block tracked deletion', () => {
  it('accepting removes the block entirely, leaving no empty paragraph', () => {
    const { state } = stateWithDeletedBlock();
    const result = decideTrackedChanges({
      state,
      editor: editorFor(),
      decision: 'accept',
      target: { kind: 'id', id: CHANGE_ID },
    });
    expect(result.ok, result.ok ? '' : JSON.stringify(result.failure)).toBe(true);

    const next = state.apply(result.tr);
    expect(next.doc.childCount).toBe(2);
    expect(paragraphTexts(next)).toEqual(['First item', 'Third item']);
    // No stranded empty paragraph, and no leftover mark record.
    next.doc.forEach((node) => {
      expect(node.textContent.length).toBeGreaterThan(0);
      expect(node.attrs.markTrackChange).toBeFalsy();
    });
  });

  it('rejecting restores the block, its content and its paragraph mark', () => {
    const { state } = stateWithDeletedBlock();
    const result = decideTrackedChanges({
      state,
      editor: editorFor(),
      decision: 'reject',
      target: { kind: 'id', id: CHANGE_ID },
    });
    expect(result.ok, result.ok ? '' : JSON.stringify(result.failure)).toBe(true);

    const next = state.apply(result.tr);
    expect(next.doc.childCount).toBe(3);
    expect(paragraphTexts(next)).toEqual(['First item', 'Second item', 'Third item']);
    expect(next.doc.child(1).attrs.markTrackChange).toBeFalsy();
    // Content is live again: no trackDelete mark survives.
    let deleteMarks = 0;
    next.doc.descendants((node) => {
      deleteMarks += node.marks.filter((mark) => mark.type.name === TrackDeleteMarkName).length;
    });
    expect(deleteMarks).toBe(0);
  });

  // `accept_tracked_changes` / `reject_tracked_changes` with no filter target
  // scope 'all', a different planning branch from a by-id decision. The agent
  // reaches for the unfiltered form constantly, so both branches must agree.
  it('accepting via scope:all removes the block too', () => {
    const { state } = stateWithDeletedBlock();
    const result = decideTrackedChanges({
      state,
      editor: editorFor(),
      decision: 'accept',
      target: { kind: 'all' },
    });
    expect(result.ok, result.ok ? '' : JSON.stringify(result.failure)).toBe(true);

    const next = state.apply(result.tr);
    expect(paragraphTexts(next)).toEqual(['First item', 'Third item']);
  });

  it('rejecting via scope:all restores the block too', () => {
    const { state } = stateWithDeletedBlock();
    const result = decideTrackedChanges({
      state,
      editor: editorFor(),
      decision: 'reject',
      target: { kind: 'all' },
    });
    expect(result.ok, result.ok ? '' : JSON.stringify(result.failure)).toBe(true);

    const next = state.apply(result.tr);
    expect(paragraphTexts(next)).toEqual(['First item', 'Second item', 'Third item']);
    expect(next.doc.child(1).attrs.markTrackChange).toBeFalsy();
  });

  it('leaves an ordinary inline deletion alone (no paragraph mark, no collapse)', () => {
    // Same change id, but the paragraph mark was never deleted — this is a
    // plain "delete this sentence" edit and the paragraph must survive.
    const { state } = stateWithDeletedBlock({ markTrackChange: false });
    const result = decideTrackedChanges({
      state,
      editor: editorFor(),
      decision: 'accept',
      target: { kind: 'id', id: CHANGE_ID },
    });
    expect(result.ok, result.ok ? '' : JSON.stringify(result.failure)).toBe(true);

    const next = state.apply(result.tr);
    expect(next.doc.childCount).toBe(3);
    expect(paragraphTexts(next)).toEqual(['First item', '', 'Third item']);
  });

  // The V2 kernel splices bytes, so there the collapse had to be taught where a
  // container ends. Here the collapse is a ProseMirror `join`, and `canJoin`
  // already refuses across a cell boundary — this pins that, so the guard is
  // not lost to a future refactor. Accepting empties the cell paragraph, which
  // is the only legal outcome: a `<w:tc>` must contain at least one paragraph.
  it('never collapses a cell-final paragraph into the next cell', () => {
    const schema = createReviewGraphTestSchema();
    const deleteMark = schema.marks[TrackDeleteMarkName].create({
      id: CHANGE_ID,
      author: ALICE.name,
      authorEmail: ALICE.email,
      date: '2026-07-31T10:00:00Z',
    });
    const markTrackChange = {
      type: 'paragraphMarkDelete',
      id: CHANGE_ID,
      author: ALICE.name,
      authorEmail: ALICE.email,
      date: '2026-07-31T10:00:00Z',
    };
    const cell = (text, attrs) =>
      schema.nodes.tableCell.create({}, [
        schema.node('paragraph', attrs, [schema.text(text, attrs ? [deleteMark] : [])]),
      ]);
    const doc = schema.node('doc', null, [
      schema.node('paragraph', null, [schema.text('Intro.')]),
      schema.nodes.table.create({}, [
        schema.nodes.tableRow.create({}, [cell('A', { markTrackChange }), cell('B', null)]),
      ]),
    ]);
    const state = EditorState.create({ doc });

    const result = decideTrackedChanges({
      state,
      editor: editorFor(),
      decision: 'accept',
      target: { kind: 'id', id: CHANGE_ID },
    });
    expect(result.ok, result.ok ? '' : JSON.stringify(result.failure)).toBe(true);

    const row = state.apply(result.tr).doc.child(1).child(0);
    // Both cells survive; only the targeted one is emptied.
    expect(row.childCount).toBe(2);
    expect(row.child(0).textContent).toBe('');
    expect(row.child(1).textContent).toBe('B');
    expect(row.child(0).child(0).attrs.markTrackChange).toBeFalsy();
  });
});

// An EMPTY list item has no runs to strike, so the paragraph mark is the ONLY
// record of the deletion. The inline enumerators are mark-based and never see
// it, so without a dedicated projection the change is invisible: nothing to
// list, nothing to accept, and the empty item survives — the very symptom
// whole-block deletion exists to remove. Real documents are full of these:
// a blank bullet left behind while drafting is exactly what a user asks an
// agent to clean up.
describe('whole-block tracked deletion of an EMPTY block', () => {
  const stateWithEmptyDeleted = () => {
    const schema = createReviewGraphTestSchema();
    const doc = schema.node('doc', null, [
      schema.node('paragraph', null, [schema.text('First item')]),
      schema.node(
        'paragraph',
        {
          markTrackChange: {
            type: 'paragraphMarkDelete',
            id: CHANGE_ID,
            author: ALICE.name,
            authorEmail: ALICE.email,
            date: '2026-07-31T10:00:00Z',
          },
        },
        [],
      ),
      schema.node('paragraph', null, [schema.text('Third item')]),
    ]);
    return EditorState.create({ doc });
  };

  it('is a reviewable change even though no run carries a mark', () => {
    const state = stateWithEmptyDeleted();
    const graph = buildReviewGraph({ state, editor: editorFor() });
    const change = graph.changes.get(CHANGE_ID);
    expect(change, 'the deletion must be listed').toBeTruthy();
    expect(change.author).toBe(ALICE.name);
  });

  it('accepting removes the empty block', () => {
    const state = stateWithEmptyDeleted();
    const result = decideTrackedChanges({
      state,
      editor: editorFor(),
      decision: 'accept',
      target: { kind: 'id', id: CHANGE_ID },
    });
    expect(result.ok, result.ok ? '' : JSON.stringify(result.failure)).toBe(true);
    expect(paragraphTexts(state.apply(result.tr))).toEqual(['First item', 'Third item']);
  });

  it('rejecting keeps the empty block and clears the record', () => {
    const state = stateWithEmptyDeleted();
    const result = decideTrackedChanges({
      state,
      editor: editorFor(),
      decision: 'reject',
      target: { kind: 'id', id: CHANGE_ID },
    });
    expect(result.ok, result.ok ? '' : JSON.stringify(result.failure)).toBe(true);
    const next = state.apply(result.tr);
    expect(paragraphTexts(next)).toEqual(['First item', '', 'Third item']);
    expect(next.doc.child(1).attrs.markTrackChange).toBeFalsy();
  });

  it('scope:all resolves it too', () => {
    const state = stateWithEmptyDeleted();
    const result = decideTrackedChanges({
      state,
      editor: editorFor(),
      decision: 'accept',
      target: { kind: 'all' },
    });
    expect(result.ok, result.ok ? '' : JSON.stringify(result.failure)).toBe(true);
    expect(paragraphTexts(state.apply(result.tr))).toEqual(['First item', 'Third item']);
  });

  it('does not double-project a block whose runs were struck too', () => {
    // The content case already produces the change from its inline marks; the
    // mark pass must not add a second entry under the same id.
    const { state } = stateWithDeletedBlock();
    const graph = buildReviewGraph({ state, editor: editorFor() });
    const ids = new Set();
    for (const change of graph.changes.values()) ids.add(change.id);
    expect([...ids].filter((id) => id === CHANGE_ID)).toHaveLength(1);
  });
});
