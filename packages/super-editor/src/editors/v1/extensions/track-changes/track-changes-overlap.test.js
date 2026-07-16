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
import { handleBackspace, handleDelete } from '@core/extensions/keymap.js';
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

describe('overlap wired: deletion spanning a paragraph boundary (SD-3386)', () => {
  let editor;
  afterEach(() => {
    editor?.destroy();
    editor = null;
  });

  const TWO_PARAGRAPHS = '<p>First line of text</p><p>Second line of text</p>';

  // Selection from the start of paragraph 1 (pos 1) through the middle of
  // paragraph 2 ("Second|" → 21 + 6 = 27). deleteSelection routes through
  // deleteRange, which emits a ReplaceStep whose slice is a structural
  // paragraph re-join shell with no inline content.
  const deleteAcrossBoundary = () => {
    editor.commands.command(({ tr, dispatch }) => {
      tr.setSelection(TextSelection.create(tr.doc, 1, 27));
      tr.deleteSelection();
      if (dispatch) dispatch(tr);
      return true;
    });
  };

  const paragraphTexts = (doc) => {
    const texts = [];
    doc.forEach((node) => texts.push(node.textContent));
    return texts;
  };

  it('marks the range deleted without splitting the trailing paragraph', () => {
    editor = setup(ALICE, TWO_PARAGRAPHS);
    deleteAcrossBoundary();

    // No spurious paragraph split: still exactly two paragraphs with the
    // original text (the deletion is only marked, not applied).
    expect(editor.state.doc.childCount).toBe(2);
    expect(paragraphTexts(editor.state.doc)).toEqual(['First line of text', 'Second line of text']);

    // One logical deletion — not a replacement wrapping an empty block shell.
    const graph = graphFor(editor);
    expect(graph.changes.size).toBe(1);
    const change = Array.from(graph.changes.values())[0];
    expect(change.type).toBe(CanonicalChangeType.Deletion);
  });

  it('accept removes the marked content and all tracked marks', () => {
    editor = setup(ALICE, TWO_PARAGRAPHS);
    deleteAcrossBoundary();

    const ok = editor.commands.acceptTrackedChangesBetween(0, editor.state.doc.content.size);
    expect(ok).toBe(true);
    expect(editor.storage.trackChanges?.lastDecisionFailure ?? null).toBeNull();

    // Deleted content is gone, remainder of paragraph 2 survives.
    expect(paragraphTexts(editor.state.doc)).toEqual(['', 'ond line of text']);

    // No tracked-change state (marks/decorations) survives the decision.
    const graph = graphFor(editor);
    expect(graph.changes.size).toBe(0);
  });

  it('reject restores the content and removes all tracked marks', () => {
    editor = setup(ALICE, TWO_PARAGRAPHS);
    deleteAcrossBoundary();

    const graph = graphFor(editor);
    const changeId = Array.from(graph.changes.keys())[0];
    const ok = editor.commands.rejectTrackedChangeById(changeId);
    expect(ok).toBe(true);
    expect(editor.storage.trackChanges?.lastDecisionFailure ?? null).toBeNull();

    // Original two-paragraph content is intact and unmarked.
    expect(editor.state.doc.childCount).toBe(2);
    expect(paragraphTexts(editor.state.doc)).toEqual(['First line of text', 'Second line of text']);
    expect(graphFor(editor).changes.size).toBe(0);

    let hasTrackedMarks = false;
    editor.state.doc.descendants((node) => {
      if (node.marks.some((m) => m.type.name === TrackInsertMarkName || m.type.name === TrackDeleteMarkName)) {
        hasTrackedMarks = true;
      }
    });
    expect(hasTrackedMarks).toBe(false);
  });
});

describe('overlap wired: cross-paragraph deletion through the real keymap path (SD-3386)', () => {
  let editor;
  afterEach(() => {
    editor?.destroy();
    editor = null;
  });

  // The keymap path differs from a raw command dispatch: handleBackspace tags
  // the transaction with inputType 'deleteContentBackward' and deleteSelection
  // sets the post-step selection, which can land inside the structural shell
  // slice that the tracked compile never inserts. Mapping that position back
  // through a falsely-mirrored invert map produced `Position NaN` and the
  // dispatch fallback then applied the deletion untracked.
  const setupTwoLines = () => {
    ({ editor } = initTestEditor({
      mode: 'text',
      content: '<p>Line 1</p><p>Line 2</p>',
      user: ALICE,
      trackedChanges: {},
    }));
    editor.commands.enableTrackChanges();

    let p2TextStart = null;
    editor.state.doc.descendants((node, pos) => {
      if (node.isText && node.text === 'Line 2') p2TextStart = pos;
    });
    // User selection from the start of "Line 1" through "Lin" of line 2,
    // dispatched on its own like a mouse selection.
    editor.commands.command(({ tr, dispatch }) => {
      tr.setSelection(TextSelection.create(tr.doc, 1, p2TextStart + 3));
      if (dispatch) dispatch(tr);
      return true;
    });
  };

  const paragraphTexts = (doc) => {
    const texts = [];
    doc.forEach((node) => texts.push(node.textContent));
    return texts;
  };

  it.each([
    ['Backspace', handleBackspace],
    ['Delete', handleDelete],
  ])('%s tracks the deletion instead of hard-deleting', (_label, handler) => {
    setupTwoLines();
    const handled = handler(editor);
    expect(handled).toBe(true);

    // Content survives as a tracked deletion — never hard-deleted.
    expect(paragraphTexts(editor.state.doc)).toEqual(['Line 1', 'Line 2']);
    const graph = graphFor(editor);
    expect(graph.changes.size).toBe(1);
    expect(Array.from(graph.changes.values())[0].type).toBe(CanonicalChangeType.Deletion);

    // Caret lands at the left edge of the tracked deletion, inside paragraph 1.
    expect(editor.state.selection.empty).toBe(true);
    expect(editor.state.selection.from).toBeLessThan(editor.state.doc.firstChild.nodeSize);
  });
});
