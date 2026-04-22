import { describe, it, expect } from 'vitest';
import { tokenizeWords, computeWordDiff, getWordChanges } from '../../editor/word-diff';

describe('tokenizeWords', () => {
  it('should tokenize a basic sentence', () => {
    const tokens = tokenizeWords('The quick fox');
    expect(tokens).toEqual([
      { text: 'The', offset: 0 },
      { text: ' ', offset: 3 },
      { text: 'quick', offset: 4 },
      { text: ' ', offset: 9 },
      { text: 'fox', offset: 10 },
    ]);
  });

  it('should handle multiple spaces between words', () => {
    const tokens = tokenizeWords('hello  world');
    expect(tokens).toEqual([
      { text: 'hello', offset: 0 },
      { text: '  ', offset: 5 },
      { text: 'world', offset: 7 },
    ]);
  });

  it('should handle leading and trailing whitespace', () => {
    const tokens = tokenizeWords('  hello ');
    expect(tokens).toEqual([
      { text: '  ', offset: 0 },
      { text: 'hello', offset: 2 },
      { text: ' ', offset: 7 },
    ]);
  });

  it('should return empty array for empty string', () => {
    expect(tokenizeWords('')).toEqual([]);
  });

  it('should handle a single word', () => {
    expect(tokenizeWords('hello')).toEqual([{ text: 'hello', offset: 0 }]);
  });

  it('should handle punctuation attached to words', () => {
    const tokens = tokenizeWords('Hello, world!');
    expect(tokens).toEqual([
      { text: 'Hello,', offset: 0 },
      { text: ' ', offset: 6 },
      { text: 'world!', offset: 7 },
    ]);
  });
});

describe('computeWordDiff', () => {
  it('should return empty array for identical strings', () => {
    expect(computeWordDiff('hello world', 'hello world')).toEqual([]);
  });

  it('should detect a single word replacement', () => {
    const changes = getWordChanges('The quick fox', 'The fast fox');
    expect(changes).toEqual([{ type: 'replace', oldFrom: 4, oldTo: 9, newText: 'fast' }]);
  });

  it('should detect multiple word replacements', () => {
    const changes = getWordChanges(
      'The quick brown fox jumps over the lazy dog',
      'The fast brown fox leaps over the lazy cat',
    );
    expect(changes).toEqual([
      { type: 'replace', oldFrom: 4, oldTo: 9, newText: 'fast' },
      { type: 'replace', oldFrom: 20, oldTo: 25, newText: 'leaps' },
      { type: 'replace', oldFrom: 40, oldTo: 43, newText: 'cat' },
    ]);
  });

  it('should detect word insertion', () => {
    const changes = getWordChanges('The fox', 'The quick fox');
    expect(changes).toHaveLength(1);
    expect(changes[0].type).toBe('insert');
    // "quick " is inserted (word + trailing space before "fox")
    expect(changes[0]).toHaveProperty('newText', 'quick ');
  });

  it('should detect word deletion', () => {
    const changes = getWordChanges('The quick fox', 'The fox');
    expect(changes).toHaveLength(1);
    expect(changes[0].type).toBe('delete');
    // "quick " (word + space) is removed as a contiguous block
    expect(changes[0]).toHaveProperty('oldFrom', 4);
    expect(changes[0]).toHaveProperty('oldTo', 10);
  });

  it('should handle complete rewrite', () => {
    const changes = getWordChanges('hello world', 'goodbye earth');
    // Each word is replaced separately since the space is a shared separator
    expect(changes.length).toBeGreaterThanOrEqual(1);
    expect(changes.every((c) => c.type === 'replace')).toBe(true);
  });

  it('should handle empty old text', () => {
    const diff = computeWordDiff('', 'hello');
    expect(diff).toEqual([{ type: 'insert', insertAt: 0, newText: 'hello' }]);
  });

  it('should handle empty new text', () => {
    const diff = computeWordDiff('hello', '');
    expect(diff).toEqual([{ type: 'delete', oldFrom: 0, oldTo: 5 }]);
  });

  it('should handle both empty', () => {
    expect(computeWordDiff('', '')).toEqual([]);
  });

  it('should preserve whitespace tokens as equal', () => {
    const diff = computeWordDiff('a b c', 'a x c');
    const changes = diff.filter((op) => op.type !== 'equal');
    expect(changes).toEqual([{ type: 'replace', oldFrom: 2, oldTo: 3, newText: 'x' }]);
  });

  it('should handle sentence with punctuation changes', () => {
    const changes = getWordChanges('The company shall provide services.', 'The company must provide services.');
    expect(changes).toEqual([{ type: 'replace', oldFrom: 12, oldTo: 17, newText: 'must' }]);
  });
});
