import { describe, expect, it } from 'vitest';
import { buildSnippet } from './snippet-builder.js';
import { SNIPPET_MAX_LENGTH, SNIPPET_CONTEXT_CHARS } from '@superdoc/document-api';

// ---------------------------------------------------------------------------
// buildSnippet — unit tests
// ---------------------------------------------------------------------------

describe('buildSnippet', () => {
  // --- Short match centered in block text ---

  it('includes context on both sides for a short match in the middle', () => {
    const blockText = 'A'.repeat(100) + 'MATCH' + 'B'.repeat(100);
    const matchStart = 100;
    const result = buildSnippet('MATCH', blockText, matchStart);

    // Context should include characters before and after the match
    expect(result.snippet.length).toBeGreaterThan('MATCH'.length);
    expect(result.snippet).toContain('MATCH');

    // highlightRange should correctly point to the match within the snippet
    expect(result.snippet.slice(result.highlightRange.start, result.highlightRange.end)).toBe('MATCH');

    // Verify context appears on both sides
    expect(result.highlightRange.start).toBeGreaterThan(0);
    expect(result.highlightRange.end).toBeLessThan(result.snippet.length);
  });

  // --- Match at start of block ---

  it('has no left context when match starts at block offset 0', () => {
    const blockText = 'MATCH' + 'B'.repeat(200);
    const result = buildSnippet('MATCH', blockText, 0);

    // Match starts at the very beginning of the snippet
    expect(result.highlightRange.start).toBe(0);
    expect(result.snippet.slice(0, 5)).toBe('MATCH');

    // Right context should be present
    expect(result.snippet.length).toBeGreaterThan('MATCH'.length);
  });

  // --- Match at end of block ---

  it('has no right context when match ends at block boundary', () => {
    const blockText = 'A'.repeat(200) + 'MATCH';
    const matchStart = 200;
    const result = buildSnippet('MATCH', blockText, matchStart);

    // Match ends at the very end of the snippet
    expect(result.highlightRange.end).toBe(result.snippet.length);
    expect(result.snippet.slice(-5)).toBe('MATCH');

    // Left context should be present
    expect(result.highlightRange.start).toBeGreaterThan(0);
  });

  // --- Very long match (>= SNIPPET_MAX_LENGTH) ---

  it('truncates to SNIPPET_MAX_LENGTH when matched text is very long', () => {
    const longMatch = 'X'.repeat(600);
    const blockText = longMatch;
    const result = buildSnippet(longMatch, blockText, 0);

    expect(result.snippet.length).toBe(SNIPPET_MAX_LENGTH);
    expect(result.snippet).toBe('X'.repeat(SNIPPET_MAX_LENGTH));
    expect(result.highlightRange).toEqual({ start: 0, end: SNIPPET_MAX_LENGTH });
  });

  it('truncates to SNIPPET_MAX_LENGTH when matched text is exactly SNIPPET_MAX_LENGTH', () => {
    const exactMatch = 'Y'.repeat(SNIPPET_MAX_LENGTH);
    const blockText = 'A'.repeat(50) + exactMatch + 'B'.repeat(50);
    const result = buildSnippet(exactMatch, blockText, 50);

    expect(result.snippet.length).toBe(SNIPPET_MAX_LENGTH);
    expect(result.highlightRange).toEqual({ start: 0, end: SNIPPET_MAX_LENGTH });
  });

  // --- Short block text (match is the entire block) ---

  it('returns block text as snippet when match is the entire block', () => {
    const blockText = 'Hello world';
    const result = buildSnippet('Hello world', blockText, 0);

    expect(result.snippet).toBe('Hello world');
    expect(result.highlightRange).toEqual({ start: 0, end: 11 });
  });

  // --- highlightRange invariant ---

  it('highlightRange.start >= 0 and highlightRange.end <= snippet.length (short match)', () => {
    const blockText = 'some text with a match here';
    const matchText = 'match';
    const matchStart = blockText.indexOf(matchText);
    const result = buildSnippet(matchText, blockText, matchStart);

    expect(result.highlightRange.start).toBeGreaterThanOrEqual(0);
    expect(result.highlightRange.end).toBeLessThanOrEqual(result.snippet.length);
  });

  it('highlightRange.start >= 0 and highlightRange.end <= snippet.length (long match)', () => {
    const longMatch = 'Z'.repeat(700);
    const result = buildSnippet(longMatch, longMatch, 0);

    expect(result.highlightRange.start).toBeGreaterThanOrEqual(0);
    expect(result.highlightRange.end).toBeLessThanOrEqual(result.snippet.length);
  });

  it('highlightRange.start >= 0 and highlightRange.end <= snippet.length (edge: match at end)', () => {
    const blockText = 'prefix' + 'M'.repeat(10);
    const matchText = 'M'.repeat(10);
    const result = buildSnippet(matchText, blockText, 6);

    expect(result.highlightRange.start).toBeGreaterThanOrEqual(0);
    expect(result.highlightRange.end).toBeLessThanOrEqual(result.snippet.length);
  });

  // --- Zero-length match ---

  it('handles zero-length match by producing context around the insertion point', () => {
    const blockText = 'A'.repeat(50) + 'B'.repeat(50);
    const matchStart = 50; // insertion point between As and Bs
    const result = buildSnippet('', blockText, matchStart);

    // Snippet should have context characters from both sides
    expect(result.snippet.length).toBeGreaterThan(0);

    // Highlight range should be zero-width
    expect(result.highlightRange.end - result.highlightRange.start).toBe(0);

    // Invariant still holds
    expect(result.highlightRange.start).toBeGreaterThanOrEqual(0);
    expect(result.highlightRange.end).toBeLessThanOrEqual(result.snippet.length);
  });

  // --- Context budget respects SNIPPET_CONTEXT_CHARS ---

  it('limits context to SNIPPET_CONTEXT_CHARS on each side', () => {
    const blockText = 'L'.repeat(300) + 'MATCH' + 'R'.repeat(300);
    const matchStart = 300;
    const result = buildSnippet('MATCH', blockText, matchStart);

    // Left context should be at most SNIPPET_CONTEXT_CHARS
    expect(result.highlightRange.start).toBeLessThanOrEqual(SNIPPET_CONTEXT_CHARS);

    // Right context should be at most SNIPPET_CONTEXT_CHARS
    const rightContext = result.snippet.length - result.highlightRange.end;
    expect(rightContext).toBeLessThanOrEqual(SNIPPET_CONTEXT_CHARS);
  });
});
