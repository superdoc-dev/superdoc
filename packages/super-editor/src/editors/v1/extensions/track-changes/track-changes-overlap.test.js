// @ts-check
/**
 * Integration tests for overlap-aware tracked editing.
 *
 * Phase 0 / plan 003 ("Tests"): the matrix tests above (see
 * `review-model/overlap-compiler.test.js`) verify the compiler in isolation.
 * This file exercises the wired path: a real editor with suggesting mode
 * enabled and ordinary command dispatches.
 *
 * The tests assert:
 *   - text content after the edit
 *   - tracked-mark structure (insert/delete/format)
 *   - logical change projection via the review graph
 *
 * Decision-engine accept/reject lifecycle is owned by plan 004 and not
 * exercised here.
 */
import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import { TextSelection } from 'prosemirror-state';
import { TrackInsertMarkName, TrackDeleteMarkName } from './constants.js';
import { initTestEditor } from '@tests/helpers/helpers.js';
import { buildReviewGraph, CanonicalChangeType } from './review-model/review-graph.js';

const ALICE = { name: 'Alice', email: 'alice@example.com' };
const BOB = { name: 'Bob', email: 'bob@example.com' };

const setup = (user = ALICE, content = '<p>Hi there</p>') => {
  const { editor } = initTestEditor({
    mode: 'text',
    content,
    user,
    trackedChanges: {},
  });
  // Enable suggesting (track changes) mode.
  editor.commands.enableTrackChanges();
  return editor;
};

const graphFor = (editor) => buildReviewGraph({ state: editor.state });

describe('overlap wired: native trackedTransaction routes through compiler', () => {
  let editor;
  afterEach(() => {
    editor?.destroy();
    editor = null;
  });

  it('marks a fresh insertion with a tracked-insert mark', () => {
    editor = setup();
    // Set caret inside the paragraph (after "Hi ").
    const insertPos = 4;
    editor.commands.command(({ tr, dispatch }) => {
      tr.setSelection(TextSelection.create(tr.doc, insertPos));
      tr.insertText('X', insertPos);
      if (dispatch) dispatch(tr);
      return true;
    });
    const text = editor.state.doc.textContent;
    expect(text).toContain('X');
    const graph = graphFor(editor);
    expect(graph.changes.size).toBe(1);
    const change = Array.from(graph.changes.values())[0];
    expect(change.type).toBe(CanonicalChangeType.Insertion);
    expect(change.authorEmail).toBe(ALICE.email);
  });

  it('refines own insertion when the same user types again inside it', () => {
    editor = setup();
    const at = 4;
    editor.commands.command(({ tr, dispatch }) => {
      tr.insertText('XY', at);
      if (dispatch) dispatch(tr);
      return true;
    });
    // Now insert in the middle of the just-typed insertion.
    const middle = at + 1; // between X and Y
    editor.commands.command(({ tr, dispatch }) => {
      tr.insertText('M', middle);
      if (dispatch) dispatch(tr);
      return true;
    });
    const graph = graphFor(editor);
    // Still one logical change — refinement preserved a single id.
    expect(graph.changes.size).toBe(1);
    const change = Array.from(graph.changes.values())[0];
    expect(change.type).toBe(CanonicalChangeType.Insertion);
    expect(change.insertedSegments.length).toBeGreaterThanOrEqual(1);
    // Doc text contains all the inserted characters in order.
    expect(editor.state.doc.textContent).toContain('XMY');
  });
});

describe('overlap wired: insertTrackedChange delegates to compiler', () => {
  let editor;
  afterEach(() => {
    editor?.destroy();
    editor = null;
  });

  it('document-api tracked replace produces a paired replacement in the graph', () => {
    editor = setup(ALICE, '<p>hello world</p>');
    // Replace "hello" with "HELLO" — paired (default).
    const ok = editor.commands.insertTrackedChange({
      from: 1,
      to: 6,
      text: 'HELLO',
      user: ALICE,
    });
    expect(ok).toBe(true);
    const graph = graphFor(editor);
    // Paired mode → one logical replacement change.
    expect(graph.changes.size).toBe(1);
    const change = Array.from(graph.changes.values())[0];
    expect(change.type).toBe(CanonicalChangeType.Replacement);
    expect(change.replacement?.inserted.length).toBeGreaterThan(0);
    expect(change.replacement?.deleted.length).toBeGreaterThan(0);
  });

  it('document-api tracked insert in middle of text creates one insertion change', () => {
    editor = setup(ALICE, '<p>hello</p>');
    // Find the inline text position for "hello" and pick the offset after
    // the first three characters ("hel").
    let textNode = null;
    let textNodePos = -1;
    editor.state.doc.descendants((node, pos) => {
      if (textNode || !node.isText) return;
      textNode = node;
      textNodePos = pos;
    });
    expect(textNode).toBeTruthy();
    const insertAt = textNodePos + 3; // between "hel" and "lo"
    const ok = editor.commands.insertTrackedChange({
      from: insertAt,
      to: insertAt,
      text: 'X',
      user: ALICE,
    });
    expect(ok).toBe(true);
    const graph = graphFor(editor);
    expect(graph.changes.size).toBe(1);
    const change = Array.from(graph.changes.values())[0];
    expect(change.type).toBe(CanonicalChangeType.Insertion);
    expect(editor.state.doc.textContent).toBe('helXlo');
  });

  it('document-api tracked insert preserves active inline formatting marks', () => {
    editor = setup(ALICE, '<p><strong>hello</strong></p>');
    let textNodePos = -1;
    editor.state.doc.descendants((node, pos) => {
      if (!node.isText || textNodePos !== -1) return;
      textNodePos = pos;
    });
    expect(textNodePos).toBeGreaterThanOrEqual(0);

    const insertAt = textNodePos + 3;
    const ok = editor.commands.insertTrackedChange({
      from: insertAt,
      to: insertAt,
      text: 'X',
      user: ALICE,
    });

    expect(ok).toBe(true);
    let insertedMarks = [];
    editor.state.doc.descendants((node) => {
      if (node.isText && node.text === 'X') {
        insertedMarks = node.marks.map((mark) => mark.type.name);
        return false;
      }
    });
    expect(insertedMarks).toContain('bold');
    expect(insertedMarks).toContain(TrackInsertMarkName);
  });

  it('document-api tracked insert uses the provided id as the logical change id', () => {
    editor = setup(ALICE, '<p>hello</p>');
    const providedId = 'api-provided-id';
    const ok = editor.commands.insertTrackedChange({
      from: 4,
      to: 4,
      text: 'X',
      id: providedId,
      user: ALICE,
    });
    expect(ok).toBe(true);
    const graph = graphFor(editor);
    expect(graph.changes.get(providedId)).toBeDefined();
  });

  it('document-api tracked replacement uses the provided id as the paired logical change id', () => {
    editor = setup(ALICE, '<p>hello</p>');
    const providedId = 'api-replace-id';
    const ok = editor.commands.insertTrackedChange({
      from: 1,
      to: 6,
      text: 'HELLO',
      id: providedId,
      user: ALICE,
    });
    expect(ok).toBe(true);
    const graph = graphFor(editor);
    const change = graph.changes.get(providedId);
    expect(change).toBeDefined();
    expect(change.type).toBe(CanonicalChangeType.Replacement);
  });

  it('returns false for invalid range', () => {
    editor = setup(ALICE, '<p>short</p>');
    const ok = editor.commands.insertTrackedChange({
      from: 0,
      to: 999,
      text: 'X',
      user: ALICE,
    });
    expect(ok).toBe(false);
  });
});
