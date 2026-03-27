import { describe, it, expect } from 'vitest';
import { EditorState } from 'prosemirror-state';
import { schema, doc, p } from 'prosemirror-test-builder';

/**
 * Regression test for proofing suggestion mark preservation.
 *
 * The proofing context menu action replaces a misspelled range with a
 * suggestion. It collects the INTERSECTION of marks across all text nodes
 * in the range (via nodesBetween), then uses replaceWith to insert a text
 * node carrying exactly those marks — preserving marks that covered the
 * entire word (including non-inclusive marks like links) without
 * over-expanding marks that only appeared on some nodes.
 */

/**
 * Simulate the exact proofing suggestion action from menuItems.js:
 * nodesBetween to collect mark intersection, then replaceWith a marked text node.
 */
function applyProofingSuggestion(state, pmFrom, pmTo, suggestion) {
  let commonMarks = null;
  state.doc.nodesBetween(pmFrom, pmTo, (node) => {
    if (node.isText) {
      if (commonMarks === null) {
        commonMarks = [...node.marks];
      } else {
        commonMarks = commonMarks.filter((existing) => node.marks.some((m) => existing.eq(m)));
      }
    }
  });
  const existingMarks = commonMarks ?? [];

  const tr = state.tr;
  const replacement = state.schema.text(suggestion, existingMarks);
  tr.replaceWith(pmFrom, pmTo, replacement);

  return state.apply(tr);
}

/** Collect marks on all text nodes matching `text` in the doc. */
function collectMarks(state, text) {
  const marks = [];
  state.doc.descendants((node) => {
    if (node.isText && node.text === text) {
      marks.push(...node.marks);
    }
  });
  return marks;
}

describe('proofing suggestion preserves marks', () => {
  // =========================================================================
  // Single-node words (all marks on one text node)
  // =========================================================================

  it('preserves bold (inclusive) mark on single-node word', () => {
    const bold = schema.marks.strong.create();
    const testDoc = doc(p(schema.text('Hello '), schema.text('wrold', [bold])));
    const state = EditorState.create({ schema, doc: testDoc });

    const newState = applyProofingSuggestion(state, 7, 12, 'world');

    expect(newState.doc.textContent).toBe('Hello world');
    expect(collectMarks(newState, 'world').some((m) => m.type.name === 'strong')).toBe(true);
  });

  it('preserves multiple inclusive marks on single-node word', () => {
    const bold = schema.marks.strong.create();
    const italic = schema.marks.em.create();
    const testDoc = doc(p(schema.text('wrold', [bold, italic])));
    const state = EditorState.create({ schema, doc: testDoc });

    const newState = applyProofingSuggestion(state, 1, 6, 'world');

    expect(newState.doc.textContent).toBe('world');
    const marks = collectMarks(newState, 'world');
    expect(marks.some((m) => m.type.name === 'strong')).toBe(true);
    expect(marks.some((m) => m.type.name === 'em')).toBe(true);
  });

  it('preserves non-inclusive link mark on single-node word', () => {
    const link = schema.marks.link.create({ href: 'https://example.com' });
    const testDoc = doc(p(schema.text('wrold', [link])));
    const state = EditorState.create({ schema, doc: testDoc });

    const newState = applyProofingSuggestion(state, 1, 6, 'world');

    expect(newState.doc.textContent).toBe('world');
    const marks = collectMarks(newState, 'world');
    expect(marks.some((m) => m.type.name === 'link')).toBe(true);
    expect(marks[0].attrs.href).toBe('https://example.com');
  });

  it('preserves link and bold together on single-node word', () => {
    const link = schema.marks.link.create({ href: 'https://example.com' });
    const bold = schema.marks.strong.create();
    const testDoc = doc(p(schema.text('wrold', [link, bold])));
    const state = EditorState.create({ schema, doc: testDoc });

    const newState = applyProofingSuggestion(state, 1, 6, 'world');

    expect(newState.doc.textContent).toBe('world');
    const marks = collectMarks(newState, 'world');
    expect(marks.some((m) => m.type.name === 'link')).toBe(true);
    expect(marks.some((m) => m.type.name === 'strong')).toBe(true);
  });

  // =========================================================================
  // Multi-node words (marks differ across text nodes)
  // =========================================================================

  it('does not over-expand a link that only covers part of the word', () => {
    const link = schema.marks.link.create({ href: 'https://example.com' });
    const bold = schema.marks.strong.create();
    // "wr" is plain, "old" is linked+bold — link only on second node
    const testDoc = doc(p(schema.text('wr'), schema.text('old', [link, bold])));
    const state = EditorState.create({ schema, doc: testDoc });

    const newState = applyProofingSuggestion(state, 1, 6, 'world');

    expect(newState.doc.textContent).toBe('world');
    const marks = collectMarks(newState, 'world');
    // Intersection is empty — link and bold were NOT on all nodes
    expect(marks.some((m) => m.type.name === 'link')).toBe(false);
    expect(marks.some((m) => m.type.name === 'strong')).toBe(false);
  });

  it('does not over-expand when each node has different marks', () => {
    const bold = schema.marks.strong.create();
    const italic = schema.marks.em.create();
    // "wr" is bold, "old" is italic — no marks in common
    const testDoc = doc(p(schema.text('wr', [bold]), schema.text('old', [italic])));
    const state = EditorState.create({ schema, doc: testDoc });

    const newState = applyProofingSuggestion(state, 1, 6, 'world');

    expect(newState.doc.textContent).toBe('world');
    const marks = collectMarks(newState, 'world');
    // Intersection is empty — neither mark appears on all nodes.
    // replaceWith carries exactly the intersection, so no marks leak.
    expect(marks.some((m) => m.type.name === 'strong')).toBe(false);
    expect(marks.some((m) => m.type.name === 'em')).toBe(false);
  });

  it('preserves marks shared by all nodes in a multi-node word', () => {
    const bold = schema.marks.strong.create();
    const link = schema.marks.link.create({ href: 'https://example.com' });
    // Both nodes share bold+link — intersection = bold+link
    const testDoc = doc(p(schema.text('wr', [bold, link]), schema.text('old', [bold, link])));
    const state = EditorState.create({ schema, doc: testDoc });

    const newState = applyProofingSuggestion(state, 1, 6, 'world');

    expect(newState.doc.textContent).toBe('world');
    const marks = collectMarks(newState, 'world');
    expect(marks.some((m) => m.type.name === 'strong')).toBe(true);
    expect(marks.some((m) => m.type.name === 'link')).toBe(true);
  });

  it('keeps only the shared mark when one node has an extra mark', () => {
    const bold = schema.marks.strong.create();
    const link = schema.marks.link.create({ href: 'https://example.com' });
    // "wr" is bold, "old" is bold+link — intersection = bold only
    const testDoc = doc(p(schema.text('wr', [bold]), schema.text('old', [bold, link])));
    const state = EditorState.create({ schema, doc: testDoc });

    const newState = applyProofingSuggestion(state, 1, 6, 'world');

    expect(newState.doc.textContent).toBe('world');
    const marks = collectMarks(newState, 'world');
    expect(marks.some((m) => m.type.name === 'strong')).toBe(true);
    expect(marks.some((m) => m.type.name === 'link')).toBe(false);
  });

  // =========================================================================
  // Baseline: confirm old approaches drop marks
  // =========================================================================

  it('insertText inherits inclusive boundary marks — confirming replaceWith is needed', () => {
    const link = schema.marks.link.create({ href: 'https://example.com' });
    const testDoc = doc(p(schema.text('wrold', [link])));
    const state = EditorState.create({ schema, doc: testDoc });

    const tr = state.tr.insertText('world', 1, 6);
    const newState = state.apply(tr);

    expect(newState.doc.textContent).toBe('world');
    expect(collectMarks(newState, 'world').some((m) => m.type.name === 'link')).toBe(false);
  });

  it('replaceWith with bare text node drops all marks — confirming marks param is needed', () => {
    const bold = schema.marks.strong.create();
    const testDoc = doc(p(schema.text('Hello '), schema.text('wrold', [bold])));
    const state = EditorState.create({ schema, doc: testDoc });

    const tr = state.tr.replaceWith(7, 12, schema.text('world'));
    const newState = state.apply(tr);

    expect(newState.doc.textContent).toBe('Hello world');
    expect(collectMarks(newState, 'world').some((m) => m.type.name === 'strong')).toBe(false);
  });
});
