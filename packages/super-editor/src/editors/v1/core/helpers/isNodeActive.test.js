import { describe, it, expect } from 'vitest';
import { EditorState, TextSelection } from 'prosemirror-state';
import { schema, doc, p, blockquote } from 'prosemirror-test-builder';
import { isNodeActive } from './isNodeActive.js';

describe('isNodeActive', () => {
  it('returns true for collapsed selection inside node', () => {
    const testDoc = doc(p('Hello'));
    const state = EditorState.create({ schema, doc: testDoc });
    const selectionState = state.apply(state.tr.setSelection(TextSelection.create(testDoc, 1)));

    expect(isNodeActive(selectionState, 'paragraph')).toBe(true);
  });

  it('checks full selection coverage for block nodes', () => {
    const testDoc = doc(blockquote(p('Quote')));
    const state = EditorState.create({ schema, doc: testDoc });
    const selection = TextSelection.create(testDoc, 1, testDoc.content.size - 1);
    const selectionState = state.apply(state.tr.setSelection(selection));

    expect(isNodeActive(selectionState, 'blockquote')).toBe(true);
    expect(isNodeActive(selectionState, 'heading')).toBe(false);
  });
});
