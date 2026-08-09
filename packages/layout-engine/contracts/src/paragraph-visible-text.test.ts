import { describe, expect, it } from 'vitest';
import type { ParagraphBlock, Run } from './index.js';
import {
  INLINE_OBJECT_REPLACEMENT_CHARACTER,
  flattenParagraphVisibleText,
  mapVisibleRangeToRunSlices,
} from './paragraph-visible-text.js';

const atomicRuns: Run[] = [
  { kind: 'image', src: 'image.png', width: 10, height: 10 },
  { kind: 'tab', text: '\t' },
  { kind: 'lineBreak' },
  { kind: 'break', breakType: 'line' },
  { kind: 'fieldAnnotation', variant: 'text', displayLabel: 'Field' },
  { kind: 'math', ommlJson: {}, textContent: 'x + y', width: 20, height: 12 },
];

const paragraph = (): ParagraphBlock => ({
  kind: 'paragraph',
  id: 'visible-text',
  runs: [{ text: 'A😀' }, ...atomicRuns, { kind: 'text', text: 'Z' }],
});

describe('paragraph visible text', () => {
  it('uses UTF-16 text and one placeholder for each non-text run', () => {
    expect(flattenParagraphVisibleText(paragraph())).toBe(
      `A😀${INLINE_OBJECT_REPLACEMENT_CHARACTER.repeat(atomicRuns.length)}Z`,
    );
    expect(flattenParagraphVisibleText(paragraph()).length).toBe(3 + atomicRuns.length + 1);
  });

  it('maps visible ranges across partial text and atomic runs', () => {
    expect(mapVisibleRangeToRunSlices(paragraph(), 1, 5)).toEqual([
      { runIndex: 0, fromChar: 1, toChar: 3 },
      { runIndex: 1, fromChar: 0, toChar: 1 },
      { runIndex: 2, fromChar: 0, toChar: 1 },
    ]);
  });

  it('returns an empty slice set for a valid collapsed range', () => {
    expect(mapVisibleRangeToRunSlices(paragraph(), 3, 3)).toEqual([]);
  });

  it('rejects ranges that bisect a UTF-16 surrogate pair', () => {
    expect(mapVisibleRangeToRunSlices(paragraph(), 0, 2)).toBeNull();
    expect(mapVisibleRangeToRunSlices(paragraph(), 2, 3)).toBeNull();
  });

  it.each([
    [-1, 1],
    [2, 1],
    [0.5, 1],
    [0, 11],
  ])('rejects invalid visible range [%s, %s)', (from, to) => {
    expect(mapVisibleRangeToRunSlices(paragraph(), from, to)).toBeNull();
  });
});
