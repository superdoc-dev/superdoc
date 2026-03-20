import { describe, it, expect } from 'vitest';
import { EditorState } from 'prosemirror-state';
import { schema, doc, p, em } from 'prosemirror-test-builder';
import { getMarkRange } from './getMarkRange.js';

describe('getMarkRange', () => {
  it('returns range for mark at given position', () => {
    const testDoc = doc(p(em('Hello'), ' world'));
    const state = EditorState.create({ schema, doc: testDoc });
    const $pos = state.doc.resolve(3); // inside em
    const range = getMarkRange($pos, schema.marks.em);

    expect(range).toEqual({ from: 1, to: 6 });
  });

  it('extends range across contiguous marks', () => {
    const testDoc = doc(p(em('Hello'), em(' world')));
    const state = EditorState.create({ schema, doc: testDoc });
    const $pos = state.doc.resolve(3);
    const range = getMarkRange($pos, schema.marks.em);

    expect(range).toEqual({ from: 1, to: testDoc.content.size - 1 });
  });

  it('returns undefined when mark absent', () => {
    const testDoc = doc(p('plain'));
    const state = EditorState.create({ schema, doc: testDoc });
    const $pos = state.doc.resolve(2);
    expect(getMarkRange($pos, schema.marks.em)).toBeUndefined();
  });
});
