// @ts-check
/**
 * Integration tests for overlap-aware decision engine paths.
 *
 * Verifies that v1 commands route through the decision engine and leave the
 * document in the expected logical state.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { initTestEditor } from '@tests/helpers/helpers.js';
import { buildReviewGraph } from './review-model/review-graph.js';

const ALICE = { name: 'Alice', email: 'alice@example.com' };

const setup = () => {
  const { editor } = initTestEditor({
    mode: 'text',
    content: '<p>Hello world</p>',
    user: ALICE,
    trackedChanges: {},
  });
  editor.commands.enableTrackChanges();
  return editor;
};

const graphFor = (editor) => buildReviewGraph({ state: editor.state });

describe('overlap wired decision engine (phase0-004)', () => {
  let editor;
  afterEach(() => {
    editor?.destroy();
    editor = null;
  });

  it('acceptAllTrackedChanges via overlap retires tracked insertions', () => {
    editor = setup();
    editor.commands.insertTrackedChange({ from: 6, to: 6, text: 'BIG ', user: ALICE });
    const graphBefore = graphFor(editor);
    expect(graphBefore.changes.size).toBe(1);

    const textBefore = editor.state.doc.textContent;
    const applied = editor.commands.acceptAllTrackedChanges();
    expect(applied).toBe(true);
    const graphAfter = graphFor(editor);
    expect(graphAfter.changes.size).toBe(0);
    // Accepted insertion keeps the inserted content; document text is unchanged.
    expect(editor.state.doc.textContent).toBe(textBefore);
  });

  it('rejectAllTrackedChanges via overlap removes inserted content', () => {
    editor = setup();
    editor.commands.insertTrackedChange({ from: 6, to: 6, text: 'BAD ', user: ALICE });
    const applied = editor.commands.rejectAllTrackedChanges();
    expect(applied).toBe(true);
    expect(editor.state.doc.textContent).toBe('Hello world');
    expect(graphFor(editor).changes.size).toBe(0);
  });

  it('acceptTrackedChangeById routes through the decision engine', () => {
    editor = setup();
    editor.commands.insertTrackedChange({ from: 6, to: 6, text: 'X', user: ALICE, id: 'ins-by-id' });
    const textBefore = editor.state.doc.textContent;
    const applied = editor.commands.acceptTrackedChangeById('ins-by-id');
    expect(applied).toBe(true);
    // Accepting an insertion preserves text.
    expect(editor.state.doc.textContent).toBe(textBefore);
    expect(graphFor(editor).changes.has('ins-by-id')).toBe(false);
  });

  it('rejectTrackedChangeById routes through the decision engine', () => {
    editor = setup();
    editor.commands.insertTrackedChange({ from: 6, to: 6, text: 'X', user: ALICE, id: 'ins-by-id-2' });
    const applied = editor.commands.rejectTrackedChangeById('ins-by-id-2');
    expect(applied).toBe(true);
    expect(editor.state.doc.textContent).toBe('Hello world');
    expect(graphFor(editor).changes.has('ins-by-id-2')).toBe(false);
  });

  it('acceptTrackedChangesBetween routes through the decision engine for range targets', () => {
    editor = setup();
    editor.commands.insertTrackedChange({ from: 6, to: 6, text: 'NEW ', user: ALICE });
    const textBefore = editor.state.doc.textContent;
    const applied = editor.commands.acceptTrackedChangesBetween(0, editor.state.doc.content.size);
    expect(applied).toBe(true);
    // Accepted insertion keeps inserted text; ensure graph is now empty.
    expect(editor.state.doc.textContent).toBe(textBefore);
    expect(graphFor(editor).changes.size).toBe(0);
  });

  it('permission denial under overlap aborts before mutation', () => {
    const { editor: ed } = initTestEditor({
      mode: 'text',
      content: '<p>Hello world</p>',
      user: ALICE,
      trackedChanges: {},
      permissionResolver: () => false,
    });
    ed.commands.enableTrackChanges();
    ed.commands.insertTrackedChange({ from: 6, to: 6, text: 'X', user: ALICE, id: 'deny-ins' });
    const before = ed.state.doc.textContent;
    const applied = ed.commands.acceptTrackedChangeById('deny-ins');
    expect(applied).toBe(false);
    expect(ed.state.doc.textContent).toBe(before);
    const failure = ed.storage.trackChanges.lastDecisionFailure;
    expect(failure?.code).toBe('PERMISSION_DENIED');
    ed.destroy();
  });
});
