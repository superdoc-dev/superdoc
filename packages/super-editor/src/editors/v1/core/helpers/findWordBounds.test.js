import { describe, it, expect } from 'vitest';
import { EditorState } from 'prosemirror-state';
import { schema, doc, p } from 'prosemirror-test-builder';
import { findWordBounds } from './findWordBounds.js';

describe('findWordBounds', () => {
  const createDoc = (content) => {
    const testDoc = doc(p(content));
    return EditorState.create({ schema, doc: testDoc }).doc;
  };

  it('selects an entire word when cursor is inside it', () => {
    const pmDoc = createDoc('Hello world');
    const result = findWordBounds(pmDoc, 3);

    expect(result).toEqual({ from: 1, to: 6 });
  });

  it('returns single-character range for punctuation', () => {
    const pmDoc = createDoc('Hi!');
    const result = findWordBounds(pmDoc, 3);

    expect(result).toEqual({ from: 3, to: 4 });
  });
});
