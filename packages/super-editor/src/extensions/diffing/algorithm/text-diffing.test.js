import { describe, it, expect, vi } from 'vitest';
vi.mock('./myers-diff.js', async () => {
  const actual = await vi.importActual('./myers-diff.js');
  return {
    myersDiff: vi.fn(actual.myersDiff),
  };
});
import { getTextDiff } from './text-diffing.js';

const buildTextRuns = (text, runAttrs = {}) =>
  text.split('').map((char) => ({ char, runAttrs: JSON.stringify(runAttrs) }));

describe('getTextDiff', () => {
  it('returns an empty diff list when both strings are identical', () => {
    const resolver = (index) => index;
    const diffs = getTextDiff(buildTextRuns('unchanged'), buildTextRuns('unchanged'), resolver);

    expect(diffs).toEqual([]);
  });

  it('detects text insertions and maps them to resolver positions', () => {
    const oldResolver = (index) => index + 10;
    const newResolver = (index) => index + 100;

    const diffs = getTextDiff(buildTextRuns('abc'), buildTextRuns('abXc'), oldResolver, newResolver);

    expect(diffs).toEqual([
      {
        action: 'added',
        startPos: 12,
        endPos: 12,
        text: 'X',
        runAttrs: {},
      },
    ]);
  });

  it('detects deletions and additions in the same diff sequence', () => {
    const oldResolver = (index) => index + 5;
    const newResolver = (index) => index + 20;

    const diffs = getTextDiff(buildTextRuns('abcd'), buildTextRuns('abXYd'), oldResolver, newResolver);

    expect(diffs).toEqual([
      {
        action: 'deleted',
        startPos: 7,
        endPos: 7,
        text: 'c',
        runAttrs: {},
      },
      {
        action: 'added',
        startPos: 8,
        endPos: 8,
        text: 'XY',
        runAttrs: {},
      },
    ]);
  });

  it('marks attribute-only changes as modifications and surfaces attribute diffs', () => {
    const resolver = (index) => index;

    const diffs = getTextDiff(buildTextRuns('a', { bold: true }), buildTextRuns('a', { italic: true }), resolver);

    expect(diffs).toEqual([
      {
        action: 'modified',
        startPos: 0,
        endPos: 0,
        oldText: 'a',
        newText: 'a',
        runAttrsDiff: {
          added: { italic: true },
          deleted: { bold: true },
          modified: {},
        },
      },
    ]);
  });

  it('merges contiguous attribute edits that share the same diff metadata', () => {
    const resolver = (index) => index + 5;

    const diffs = getTextDiff(buildTextRuns('ab', { bold: true }), buildTextRuns('ab', { bold: false }), resolver);

    expect(diffs).toEqual([
      {
        action: 'modified',
        startPos: 5,
        endPos: 6,
        oldText: 'ab',
        newText: 'ab',
        runAttrsDiff: {
          added: {},
          deleted: {},
          modified: {
            bold: { from: true, to: false },
          },
        },
      },
    ]);
  });
});
