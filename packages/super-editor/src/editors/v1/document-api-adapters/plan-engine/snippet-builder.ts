/**
 * Snippet builder — constructs contextual snippets for query.match results.
 *
 * Produces bounded snippets with highlight ranges per D11 contract rules.
 */

import { SNIPPET_MAX_LENGTH, SNIPPET_CONTEXT_CHARS, type HighlightRange } from '@superdoc/document-api';

export interface SnippetResult {
  snippet: string;
  highlightRange: HighlightRange;
}

/**
 * Builds a snippet containing the matched text with surrounding context.
 *
 * @param matchedText - The text that was matched.
 * @param blockText - Full text of the containing block(s).
 * @param matchStartInBlock - Start offset of the match within `blockText`.
 *
 * Rules (per D11):
 * - Up to SNIPPET_CONTEXT_CHARS before and after, clipped to block boundaries.
 * - Total max length: SNIPPET_MAX_LENGTH.
 * - When matched text alone exceeds budget, snippet contains first SNIPPET_MAX_LENGTH
 *   characters with highlightRange = { start: 0, end: snippet.length }.
 * - Invariant: highlightRange.start >= 0 && highlightRange.end <= snippet.length.
 */
export function buildSnippet(matchedText: string, blockText: string, matchStartInBlock: number): SnippetResult {
  if (matchedText.length >= SNIPPET_MAX_LENGTH) {
    const snippet = matchedText.slice(0, SNIPPET_MAX_LENGTH);
    return { snippet, highlightRange: { start: 0, end: snippet.length } };
  }

  const matchEnd = matchStartInBlock + matchedText.length;

  // Compute available context budget
  const remainingBudget = SNIPPET_MAX_LENGTH - matchedText.length;
  const contextEachSide = Math.min(SNIPPET_CONTEXT_CHARS, Math.floor(remainingBudget / 2));

  // Clip to block boundaries
  const snippetStart = Math.max(0, matchStartInBlock - contextEachSide);
  const snippetEnd = Math.min(blockText.length, matchEnd + contextEachSide);

  const snippet = blockText.slice(snippetStart, snippetEnd);
  const highlightStart = matchStartInBlock - snippetStart;
  const highlightEnd = highlightStart + matchedText.length;

  return {
    snippet,
    highlightRange: { start: highlightStart, end: Math.min(highlightEnd, snippet.length) },
  };
}
