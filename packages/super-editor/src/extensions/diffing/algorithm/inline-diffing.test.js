import { describe, it, expect, vi } from 'vitest';
vi.mock('./myers-diff.ts', async () => {
  const actual = await vi.importActual('./myers-diff.ts');
  return {
    myersDiff: vi.fn(actual.myersDiff),
  };
});
import { getInlineDiff } from './inline-diffing.ts';

const buildTextRuns = (text, runAttrs = {}) =>
  text.split('').map((char) => ({ char, runAttrs: JSON.stringify(runAttrs), kind: 'text' }));

const buildInlineNodeToken = (attrs = {}, type = { name: 'link' }) => {
  const nodeAttrs = { ...attrs };
  return {
    kind: 'inlineNode',
    nodeType: 'link',
    node: {
      type,
      attrs: nodeAttrs,
      toJSON: () => ({ type: 'link', attrs: nodeAttrs }),
    },
  };
};

describe('getInlineDiff', () => {
  it('returns an empty diff list when both strings are identical', () => {
    const resolver = (index) => index;
    const diffs = getInlineDiff(buildTextRuns('unchanged'), buildTextRuns('unchanged'), resolver);

    expect(diffs).toEqual([]);
  });

  it('detects text insertions and maps them to resolver positions', () => {
    const oldResolver = (index) => index + 10;
    const newResolver = (index) => index + 100;

    const diffs = getInlineDiff(buildTextRuns('abc'), buildTextRuns('abXc'), oldResolver, newResolver);

    expect(diffs).toEqual([
      {
        action: 'added',
        kind: 'text',
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

    const diffs = getInlineDiff(buildTextRuns('abcd'), buildTextRuns('abXYd'), oldResolver, newResolver);

    expect(diffs).toEqual([
      {
        action: 'deleted',
        kind: 'text',
        startPos: 7,
        endPos: 7,
        text: 'c',
        runAttrs: {},
      },
      {
        action: 'added',
        kind: 'text',
        startPos: 8,
        endPos: 8,
        text: 'XY',
        runAttrs: {},
      },
    ]);
  });

  it('marks attribute-only changes as modifications and surfaces attribute diffs', () => {
    const resolver = (index) => index;

    const diffs = getInlineDiff(buildTextRuns('a', { bold: true }), buildTextRuns('a', { italic: true }), resolver);

    expect(diffs).toEqual([
      {
        action: 'modified',
        kind: 'text',
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

    const diffs = getInlineDiff(buildTextRuns('ab', { bold: true }), buildTextRuns('ab', { bold: false }), resolver);

    expect(diffs).toEqual([
      {
        action: 'modified',
        kind: 'text',
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

  it('surfaces attribute diffs for inline node modifications', () => {
    const resolver = (index) => index + 3;
    const sharedType = { name: 'link' };
    const oldNode = buildInlineNodeToken({ href: 'https://old.example', label: 'Example' }, sharedType);
    const newNode = buildInlineNodeToken({ href: 'https://new.example', label: 'Example' }, sharedType);

    const diffs = getInlineDiff([oldNode], [newNode], resolver);

    expect(diffs).toEqual([
      {
        action: 'modified',
        kind: 'inlineNode',
        nodeType: 'link',
        startPos: 3,
        endPos: 3,
        oldNode: oldNode.node,
        newNode: newNode.node,
        attrsDiff: {
          added: {},
          deleted: {},
          modified: {
            href: {
              from: 'https://old.example',
              to: 'https://new.example',
            },
          },
        },
      },
    ]);
  });
});
