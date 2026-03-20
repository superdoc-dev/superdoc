import { describe, it, expect } from 'vitest';
import { EditorState } from 'prosemirror-state';
import { schema, doc, p, br } from 'prosemirror-test-builder';
import { getTextContentFromNodes } from './getTextContentFromNodes.js';

describe('getTextContentFromNodes', () => {
  it('collects text content including atom placeholders', () => {
    const testDoc = doc(p('Hello', br(), 'there'));
    const state = EditorState.create({ schema, doc: testDoc });
    const $pos = state.doc.resolve(9);

    expect(getTextContentFromNodes($pos)).toBe('Hello%leaf%th');
  });

  it('respects the maxMatch constraint', () => {
    const testDoc = doc(p('abcdefghij'));
    const state = EditorState.create({ schema, doc: testDoc });
    const $pos = state.doc.resolve(8);

    expect(getTextContentFromNodes($pos, 3)).toBe('abcdefg');
  });
});
