import { describe, it, expect } from 'vitest';
import { getTextDiff } from './text-diffing';

describe('getTextDiff', () => {
  it('returns an empty diff list when both strings are identical', () => {
    const resolver = () => 0;

    const diffs = getTextDiff('unchanged', 'unchanged', resolver);

    expect(diffs).toEqual([]);
  });

  it('detects text insertions and maps them to resolver positions', () => {
    const oldResolver = (index) => index + 10;
    const newResolver = (index) => index + 100;

    const diffs = getTextDiff('abc', 'abXc', oldResolver, newResolver);

    expect(diffs).toEqual([
      {
        type: 'addition',
        startIdx: 102,
        endIdx: 103,
        text: 'X',
      },
    ]);
  });

  it('detects deletions and additions in the same diff sequence', () => {
    const oldResolver = (index) => index + 5;
    const newResolver = (index) => index + 20;

    const diffs = getTextDiff('abcd', 'abXYd', oldResolver, newResolver);

    expect(diffs).toEqual([
      {
        type: 'deletion',
        startIdx: 7,
        endIdx: 8,
        text: 'c',
      },
      {
        type: 'addition',
        startIdx: 22,
        endIdx: 24,
        text: 'XY',
      },
    ]);
  });
});
