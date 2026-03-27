import { describe, it, expect } from 'vitest';
import { EditorState, TextSelection } from 'prosemirror-state';
import { schema, doc, p, strong } from 'prosemirror-test-builder';
import { isMarkActive } from './isMarkActive.js';

describe('isMarkActive', () => {
  it('returns true for collapsed selection with matching stored mark', () => {
    const testDoc = doc(p(strong('Hello')));
    const baseState = EditorState.create({ schema, doc: testDoc });
    const tr = baseState.tr.setSelection(TextSelection.create(testDoc, 2));
    tr.setStoredMarks([schema.marks.strong.create()]);
    const state = baseState.apply(tr);

    expect(isMarkActive(state, 'strong')).toBe(true);
  });

  it('returns false when selection range includes unmarked content', () => {
    const testDoc = doc(p(strong('Hello'), ' world'));
    const baseState = EditorState.create({ schema, doc: testDoc });
    const state = baseState.apply(
      baseState.tr.setSelection(TextSelection.create(testDoc, 1, testDoc.content.size - 1)),
    );

    expect(isMarkActive(state, 'strong')).toBe(false);
  });
});
