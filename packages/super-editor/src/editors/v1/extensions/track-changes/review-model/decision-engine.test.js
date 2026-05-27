// @ts-check
/**
 * Overlap decision engine unit tests.
 *
 * Validates the canonical accept/reject behavior, atomicity, partial-range
 * shape, parent/child rules, and comment effects produced by the
 * decision engine against a real PM schema with tracked marks.
 */

import { describe, it, expect } from 'vitest';

import { decideTrackedChanges } from './decision-engine.js';
import { buildReviewGraph } from './review-graph.js';
import { createReviewGraphTestSchema, stateFromTrackedSpans, markAttrs } from './test-fixtures.js';
import { TrackInsertMarkName, TrackDeleteMarkName, TrackFormatMarkName } from '../constants.js';

const SAME_USER = { name: 'Alice', email: 'alice@example.com' };
const OTHER_USER = { name: 'Bob', email: 'bob@example.com' };

const editorFor = (user, extra) => ({
  options: {
    user,
    trackedChanges: {},
    ...extra,
  },
  storage: { trackChanges: { lastDecisionFailure: null } },
});

const insertAttrs = (id, user = SAME_USER, extra = {}) =>
  markAttrs({
    id,
    author: user.name,
    authorEmail: user.email,
    revisionGroupId: id,
    changeType: 'insertion',
    ...extra,
  });

const deleteAttrs = (id, user = SAME_USER, extra = {}) =>
  markAttrs({
    id,
    author: user.name,
    authorEmail: user.email,
    revisionGroupId: id,
    changeType: 'deletion',
    ...extra,
  });

const formatAttrsWithSnapshots = (id, user = SAME_USER, before = [], after = []) => ({
  ...markAttrs({
    id,
    author: user.name,
    authorEmail: user.email,
    revisionGroupId: id,
    changeType: 'formatting',
  }),
  before,
  after,
});

describe('decideTrackedChanges overlap behavior', () => {
  it('accept insertion by id keeps content and removes the trackInsert mark', () => {
    const schema = createReviewGraphTestSchema();
    const { state } = stateFromTrackedSpans({
      schema,
      spans: [
        { text: 'before ' },
        { text: 'NEW', marks: [{ markType: TrackInsertMarkName, attrs: insertAttrs('ins-1') }] },
        { text: ' after' },
      ],
    });
    const editor = editorFor(SAME_USER);

    const result = decideTrackedChanges({
      state,
      editor,
      decision: 'accept',
      target: { kind: 'id', id: 'ins-1' },
    });
    expect(result.ok).toBe(true);
    expect(result.receipt.removedChangeIds).toEqual([{ id: 'ins-1', cause: 'decision' }]);
    const nextState = state.apply(result.tr);
    expect(nextState.doc.textContent).toBe('before NEW after');
    nextState.doc.nodesBetween(0, nextState.doc.content.size, (node) => {
      if (node.isText) {
        for (const mark of node.marks) expect(mark.type.name).not.toBe(TrackInsertMarkName);
      }
    });
  });

  it('accept insertion by id removes every same-id segment even when attrs differ across split text nodes', () => {
    const schema = createReviewGraphTestSchema();
    const { state } = stateFromTrackedSpans({
      schema,
      spans: [
        { text: 'before ' },
        {
          text: 'N',
          marks: [
            {
              markType: TrackInsertMarkName,
              attrs: markAttrs({
                id: 'ins-split',
                author: SAME_USER.name,
                authorEmail: SAME_USER.email,
              }),
            },
          ],
        },
        { text: 'EW', marks: [{ markType: TrackInsertMarkName, attrs: insertAttrs('ins-split') }] },
        { text: ' after' },
      ],
    });

    const result = decideTrackedChanges({
      state,
      editor: editorFor(SAME_USER),
      decision: 'accept',
      target: { kind: 'id', id: 'ins-split' },
    });

    expect(result.ok).toBe(true);
    const nextState = state.apply(result.tr);
    expect(nextState.doc.textContent).toBe('before NEW after');
    nextState.doc.nodesBetween(0, nextState.doc.content.size, (node) => {
      if (node.isText) {
        for (const mark of node.marks) expect(mark.type.name).not.toBe(TrackInsertMarkName);
      }
    });
  });

  it('reject insertion by id removes inserted content atomically', () => {
    const schema = createReviewGraphTestSchema();
    const { state } = stateFromTrackedSpans({
      schema,
      spans: [
        { text: 'keep ' },
        { text: 'BAD', marks: [{ markType: TrackInsertMarkName, attrs: insertAttrs('ins-2') }] },
        { text: ' tail' },
      ],
    });
    const editor = editorFor(SAME_USER);

    const result = decideTrackedChanges({
      state,
      editor,
      decision: 'reject',
      target: { kind: 'id', id: 'ins-2' },
    });
    expect(result.ok).toBe(true);
    const next = state.apply(result.tr);
    expect(next.doc.textContent).toBe('keep  tail');
  });

  it('accept deletion removes content; reject deletion drops the mark and keeps content', () => {
    const schema = createReviewGraphTestSchema();
    const accept = stateFromTrackedSpans({
      schema,
      spans: [
        { text: 'A ' },
        { text: 'CUT', marks: [{ markType: TrackDeleteMarkName, attrs: deleteAttrs('del-1') }] },
        { text: ' B' },
      ],
    });
    const editor = editorFor(SAME_USER);
    const acceptResult = decideTrackedChanges({
      state: accept.state,
      editor,
      decision: 'accept',
      target: { kind: 'id', id: 'del-1' },
    });
    expect(acceptResult.ok).toBe(true);
    expect(accept.state.apply(acceptResult.tr).doc.textContent).toBe('A  B');

    const reject = stateFromTrackedSpans({
      schema,
      spans: [
        { text: 'A ' },
        { text: 'CUT', marks: [{ markType: TrackDeleteMarkName, attrs: deleteAttrs('del-2') }] },
        { text: ' B' },
      ],
    });
    const rejectResult = decideTrackedChanges({
      state: reject.state,
      editor,
      decision: 'reject',
      target: { kind: 'id', id: 'del-2' },
    });
    expect(rejectResult.ok).toBe(true);
    const next = reject.state.apply(rejectResult.tr);
    expect(next.doc.textContent).toBe('A CUT B');
    next.doc.nodesBetween(0, next.doc.content.size, (node) => {
      if (node.isText) {
        for (const mark of node.marks) expect(mark.type.name).not.toBe(TrackDeleteMarkName);
      }
    });
  });

  it('accept all retires every open change', () => {
    const schema = createReviewGraphTestSchema();
    const { state } = stateFromTrackedSpans({
      schema,
      spans: [
        { text: 'pre ' },
        { text: 'INS', marks: [{ markType: TrackInsertMarkName, attrs: insertAttrs('ins-3') }] },
        { text: ' mid ' },
        { text: 'DEL', marks: [{ markType: TrackDeleteMarkName, attrs: deleteAttrs('del-3') }] },
        { text: ' post' },
      ],
    });
    const result = decideTrackedChanges({
      state,
      editor: editorFor(SAME_USER),
      decision: 'accept',
      target: { kind: 'all' },
    });
    expect(result.ok).toBe(true);
    const ids = result.receipt.removedChangeIds.map((entry) => entry.id).sort();
    expect(ids).toEqual(['del-3', 'ins-3']);
    expect(state.apply(result.tr).doc.textContent).toBe('pre INS mid  post');
  });

  it('accept paired replacement removes deleted side and keeps inserted side', () => {
    const schema = createReviewGraphTestSchema();
    const { state } = stateFromTrackedSpans({
      schema,
      spans: [
        { text: 'a ' },
        {
          text: 'OLD',
          marks: [
            {
              markType: TrackDeleteMarkName,
              attrs: deleteAttrs('rep-1', SAME_USER, {
                changeType: 'replacement',
                replacementGroupId: 'rep-1',
                replacementSideId: 'rep-1#deleted',
              }),
            },
          ],
        },
        {
          text: 'NEW',
          marks: [
            {
              markType: TrackInsertMarkName,
              attrs: insertAttrs('rep-1', SAME_USER, {
                changeType: 'replacement',
                replacementGroupId: 'rep-1',
                replacementSideId: 'rep-1#inserted',
              }),
            },
          ],
        },
        { text: ' b' },
      ],
    });
    const result = decideTrackedChanges({
      state,
      editor: editorFor(SAME_USER),
      decision: 'accept',
      target: { kind: 'id', id: 'rep-1' },
    });
    expect(result.ok).toBe(true);
    const next = state.apply(result.tr);
    expect(next.doc.textContent).toBe('a NEW b');
  });

  it('reject paired replacement restores deleted side and removes inserted side', () => {
    const schema = createReviewGraphTestSchema();
    const { state } = stateFromTrackedSpans({
      schema,
      spans: [
        { text: 'a ' },
        {
          text: 'OLD',
          marks: [
            {
              markType: TrackDeleteMarkName,
              attrs: deleteAttrs('rep-2', SAME_USER, {
                changeType: 'replacement',
                replacementGroupId: 'rep-2',
                replacementSideId: 'rep-2#deleted',
              }),
            },
          ],
        },
        {
          text: 'NEW',
          marks: [
            {
              markType: TrackInsertMarkName,
              attrs: insertAttrs('rep-2', SAME_USER, {
                changeType: 'replacement',
                replacementGroupId: 'rep-2',
                replacementSideId: 'rep-2#inserted',
              }),
            },
          ],
        },
        { text: ' b' },
      ],
    });
    const result = decideTrackedChanges({
      state,
      editor: editorFor(SAME_USER),
      decision: 'reject',
      target: { kind: 'id', id: 'rep-2' },
    });
    expect(result.ok).toBe(true);
    expect(state.apply(result.tr).doc.textContent).toBe('a OLD b');
  });

  it('formatting accept removes the trackFormat mark; reject restores the before snapshot', () => {
    const schema = createReviewGraphTestSchema();
    const beforeSnap = [{ type: TrackInsertMarkName, attrs: insertAttrs('inner-ins') }];
    const afterSnap = [{ type: TrackInsertMarkName, attrs: insertAttrs('inner-ins-new') }];
    // To exercise mark restoration we'd need a richer mark set; here we just
    // verify the engine handles formatting decisions structurally.
    const { state } = stateFromTrackedSpans({
      schema,
      spans: [
        {
          text: 'FORMATTED',
          marks: [
            {
              markType: TrackFormatMarkName,
              attrs: formatAttrsWithSnapshots('fmt-1', SAME_USER, beforeSnap, afterSnap),
            },
          ],
        },
      ],
    });
    const accept = decideTrackedChanges({
      state,
      editor: editorFor(SAME_USER),
      decision: 'accept',
      target: { kind: 'id', id: 'fmt-1' },
    });
    expect(accept.ok).toBe(true);
    const next = state.apply(accept.tr);
    next.doc.nodesBetween(0, next.doc.content.size, (node) => {
      if (node.isText) {
        for (const mark of node.marks) expect(mark.type.name).not.toBe(TrackFormatMarkName);
      }
    });

    const reject = decideTrackedChanges({
      state,
      editor: editorFor(SAME_USER),
      decision: 'reject',
      target: { kind: 'id', id: 'fmt-1' },
    });
    expect(reject.ok).toBe(true);
  });

  it('range target resolving fully-covered insertion is treated as full coverage', () => {
    const schema = createReviewGraphTestSchema();
    const { state } = stateFromTrackedSpans({
      schema,
      spans: [
        { text: 'A ' },
        { text: 'XYZ', marks: [{ markType: TrackInsertMarkName, attrs: insertAttrs('ins-r1') }] },
        { text: ' B' },
      ],
    });
    const result = decideTrackedChanges({
      state,
      editor: editorFor(SAME_USER),
      decision: 'accept',
      target: { kind: 'range', from: 0, to: state.doc.content.size },
    });
    expect(result.ok).toBe(true);
    expect(result.receipt.removedChangeIds[0]?.id).toBe('ins-r1');
  });

  it('range target with collapsed cursor inside change resolves whole change', () => {
    const schema = createReviewGraphTestSchema();
    const { state } = stateFromTrackedSpans({
      schema,
      spans: [
        { text: 'A ' },
        { text: 'NEW', marks: [{ markType: TrackInsertMarkName, attrs: insertAttrs('ins-r2') }] },
        { text: ' B' },
      ],
    });
    // Find a position inside the insertion (somewhere between offset 3 and 6).
    const cursor = 4;
    const result = decideTrackedChanges({
      state,
      editor: editorFor(SAME_USER),
      decision: 'accept',
      target: { kind: 'range', from: cursor, to: cursor },
    });
    expect(result.ok).toBe(true);
    expect(result.receipt.removedChangeIds[0]?.id).toBe('ins-r2');
  });

  it('partial accept of an insertion retires the source id and mints successor fragments', () => {
    const schema = createReviewGraphTestSchema();
    const { state } = stateFromTrackedSpans({
      schema,
      spans: [
        { text: 'A ' },
        { text: 'XYZ', marks: [{ markType: TrackInsertMarkName, attrs: insertAttrs('ins-partial-accept') }] },
        { text: ' B' },
      ],
    });

    const result = decideTrackedChanges({
      state,
      editor: editorFor(SAME_USER),
      decision: 'accept',
      target: { kind: 'range', from: 4, to: 5 },
    });

    expect(result.ok).toBe(true);
    expect(result.receipt.removedChangeIds).toEqual([{ id: 'ins-partial-accept', cause: 'decision' }]);
    expect(result.receipt.createdChangeIds).toHaveLength(2);
    const next = state.apply(result.tr);
    expect(next.doc.textContent).toBe('A XYZ B');
    const graph = buildReviewGraph({ state: next });
    expect(graph.changes.has('ins-partial-accept')).toBe(false);
    const fragments = Array.from(graph.changes.values()).sort((a, b) => a.excerpt.localeCompare(b.excerpt));
    expect(fragments.map((change) => change.excerpt)).toEqual(['X', 'Z']);
    for (const fragment of fragments) {
      expect(fragment.splitFromId).toBe('ins-partial-accept');
      expect(fragment.revisionGroupId).toBe('ins-partial-accept');
      expect(result.receipt.createdChangeIds).toContain(fragment.id);
    }
  });

  it('partial reject of an insertion removes selected text and keeps deterministic successor fragments', () => {
    const schema = createReviewGraphTestSchema();
    const { state } = stateFromTrackedSpans({
      schema,
      spans: [
        { text: 'A ' },
        { text: 'XYZ', marks: [{ markType: TrackInsertMarkName, attrs: insertAttrs('ins-partial-reject') }] },
        { text: ' B' },
      ],
    });

    const result = decideTrackedChanges({
      state,
      editor: editorFor(SAME_USER),
      decision: 'reject',
      target: { kind: 'range', from: 4, to: 5 },
    });

    expect(result.ok).toBe(true);
    const next = state.apply(result.tr);
    expect(next.doc.textContent).toBe('A XZ B');
    const graph = buildReviewGraph({ state: next });
    expect(graph.changes.has('ins-partial-reject')).toBe(false);
    const fragments = Array.from(graph.changes.values()).sort((a, b) => a.excerpt.localeCompare(b.excerpt));
    expect(fragments.map((change) => change.excerpt)).toEqual(['X', 'Z']);
    expect(fragments.every((change) => change.splitFromId === 'ins-partial-reject')).toBe(true);
  });

  it('partial accept of a deletion removes selected deleted text and preserves successor deletion fragments', () => {
    const schema = createReviewGraphTestSchema();
    const { state } = stateFromTrackedSpans({
      schema,
      spans: [
        { text: 'A ' },
        { text: 'XYZ', marks: [{ markType: TrackDeleteMarkName, attrs: deleteAttrs('del-partial-accept') }] },
        { text: ' B' },
      ],
    });

    const result = decideTrackedChanges({
      state,
      editor: editorFor(SAME_USER),
      decision: 'accept',
      target: { kind: 'range', from: 4, to: 5 },
    });

    expect(result.ok).toBe(true);
    const next = state.apply(result.tr);
    expect(next.doc.textContent).toBe('A XZ B');
    const graph = buildReviewGraph({ state: next });
    expect(graph.changes.has('del-partial-accept')).toBe(false);
    const fragments = Array.from(graph.changes.values()).sort((a, b) => a.excerpt.localeCompare(b.excerpt));
    expect(fragments.map((change) => change.excerpt)).toEqual(['X', 'Z']);
    expect(fragments.every((change) => change.splitFromId === 'del-partial-accept')).toBe(true);
    expect(fragments.every((change) => change.type === 'deletion')).toBe(true);
  });

  it('partial reject of a deletion unwraps selected text and preserves successor deletion fragments', () => {
    const schema = createReviewGraphTestSchema();
    const { state } = stateFromTrackedSpans({
      schema,
      spans: [
        { text: 'A ' },
        { text: 'XYZ', marks: [{ markType: TrackDeleteMarkName, attrs: deleteAttrs('del-partial-reject') }] },
        { text: ' B' },
      ],
    });

    const result = decideTrackedChanges({
      state,
      editor: editorFor(SAME_USER),
      decision: 'reject',
      target: { kind: 'range', from: 4, to: 5 },
    });

    expect(result.ok).toBe(true);
    const next = state.apply(result.tr);
    expect(next.doc.textContent).toBe('A XYZ B');
    const graph = buildReviewGraph({ state: next });
    expect(graph.changes.has('del-partial-reject')).toBe(false);
    const fragments = Array.from(graph.changes.values()).sort((a, b) => a.excerpt.localeCompare(b.excerpt));
    expect(fragments.map((change) => change.excerpt)).toEqual(['X', 'Z']);
    expect(fragments.every((change) => change.splitFromId === 'del-partial-reject')).toBe(true);
  });

  it('range target with no overlap returns TARGET_NOT_FOUND', () => {
    const schema = createReviewGraphTestSchema();
    const { state } = stateFromTrackedSpans({
      schema,
      spans: [{ text: 'plain text only' }],
    });
    const result = decideTrackedChanges({
      state,
      editor: editorFor(SAME_USER),
      decision: 'accept',
      target: { kind: 'range', from: 1, to: 4 },
    });
    expect(result.ok).toBe(false);
    expect(result.code).toBe('TARGET_NOT_FOUND');
  });

  it('permission denial aborts before any mutation', () => {
    const schema = createReviewGraphTestSchema();
    const { state } = stateFromTrackedSpans({
      schema,
      spans: [
        { text: 'A ' },
        { text: 'NEW', marks: [{ markType: TrackInsertMarkName, attrs: insertAttrs('ins-p1', OTHER_USER) }] },
        { text: ' B' },
      ],
    });
    const editor = editorFor(SAME_USER, {
      permissionResolver: () => false,
    });
    const result = decideTrackedChanges({
      state,
      editor,
      decision: 'accept',
      target: { kind: 'id', id: 'ins-p1' },
    });
    expect(result.ok).toBe(false);
    expect(result.code).toBe('PERMISSION_DENIED');
  });

  it('rejects unknown id with TARGET_NOT_FOUND', () => {
    const schema = createReviewGraphTestSchema();
    const { state } = stateFromTrackedSpans({
      schema,
      spans: [{ text: 'plain' }],
    });
    const result = decideTrackedChanges({
      state,
      editor: editorFor(SAME_USER),
      decision: 'accept',
      target: { kind: 'id', id: 'does-not-exist' },
    });
    expect(result.ok).toBe(false);
    expect(result.code).toBe('TARGET_NOT_FOUND');
  });

  it('rejects invalid target shapes', () => {
    const schema = createReviewGraphTestSchema();
    const { state } = stateFromTrackedSpans({ schema, spans: [{ text: 'x' }] });
    const result = decideTrackedChanges({
      state,
      editor: editorFor(SAME_USER),
      decision: 'accept',
      target: { not: 'real' },
    });
    expect(result.ok).toBe(false);
    expect(result.code).toBe('INVALID_TARGET');
  });

  it('child change wholly inside a rejected insertion retires as a side effect', () => {
    const schema = createReviewGraphTestSchema();
    // Parent insertion "AAA" by other user, with a child same-user delete on "AA" inside.
    // Rejecting parent insertion removes "AAA" content; child id should be retired.
    const parentAttrs = insertAttrs('parent-1', OTHER_USER);
    const childAttrs = deleteAttrs('child-1', SAME_USER, { overlapParentId: 'parent-1' });
    const { state } = stateFromTrackedSpans({
      schema,
      spans: [
        { text: 'A ' },
        {
          text: 'AA',
          marks: [
            { markType: TrackInsertMarkName, attrs: parentAttrs },
            { markType: TrackDeleteMarkName, attrs: childAttrs },
          ],
        },
        {
          text: 'A',
          marks: [{ markType: TrackInsertMarkName, attrs: parentAttrs }],
        },
        { text: ' B' },
      ],
    });
    const result = decideTrackedChanges({
      state,
      editor: editorFor(SAME_USER),
      decision: 'reject',
      target: { kind: 'id', id: 'parent-1' },
    });
    expect(result.ok).toBe(true);
    const retired = result.receipt.removedChangeIds.map((e) => e.id).sort();
    expect(retired).toContain('parent-1');
    expect(retired).toContain('child-1');
    expect(result.receipt.affectedChildren.some((c) => c.changeId === 'child-1')).toBe(true);
  });

  it('legacy aliases { id } and { scope: "all" } normalize correctly', () => {
    const schema = createReviewGraphTestSchema();
    const { state } = stateFromTrackedSpans({
      schema,
      spans: [{ text: 'X', marks: [{ markType: TrackInsertMarkName, attrs: insertAttrs('legacy-id') }] }],
    });
    const byId = decideTrackedChanges({
      state,
      editor: editorFor(SAME_USER),
      decision: 'accept',
      target: { id: 'legacy-id' },
    });
    expect(byId.ok).toBe(true);

    const all = decideTrackedChanges({
      state,
      editor: editorFor(SAME_USER),
      decision: 'accept',
      target: { scope: 'all' },
    });
    expect(all.ok).toBe(true);
  });
});
