import { describe, it, expect, vi } from 'vitest';
vi.mock('./myers-diff.ts', async () => {
  const actual = await vi.importActual('./myers-diff.ts');
  return {
    myersDiff: vi.fn(actual.myersDiff),
  };
});
import { getInlineDiff } from './inline-diffing.ts';

const buildTextRuns = (text, runAttrs = {}, offsetStart = 0) =>
  text.split('').map((char, index) => ({
    char,
    runAttrs: { ...runAttrs },
    kind: 'text',
    offset: offsetStart + index,
  }));

const buildMarkedTextRuns = (text, marks, runAttrs = {}, offsetStart = 0) =>
  text.split('').map((char, index) => ({
    char,
    runAttrs: { ...runAttrs },
    kind: 'text',
    offset: offsetStart + index,
    marks,
  }));

const buildInlineNodeToken = (attrs = {}, type = { name: 'link' }, pos = 0) => {
  const nodeAttrs = { ...attrs };
  return {
    kind: 'inlineNode',
    nodeType: 'link',
    node: {
      type,
      attrs: nodeAttrs,
      toJSON: () => ({ type: 'link', attrs: nodeAttrs }),
    },
    nodeJSON: { type: 'link', attrs: nodeAttrs },
    pos,
  };
};

describe('getInlineDiff', () => {
  it('returns an empty diff list when both strings are identical', () => {
    const oldRuns = buildTextRuns('unchanged');
    const diffs = getInlineDiff(oldRuns, buildTextRuns('unchanged'), oldRuns.length);

    expect(diffs).toEqual([]);
  });

  it('detects text insertions and maps them to resolver positions', () => {
    const startOffset = 10;
    const oldRuns = buildTextRuns('abc', {}, startOffset);
    const diffs = getInlineDiff(oldRuns, buildTextRuns('abXc', {}, startOffset), startOffset + oldRuns.length);

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
    const startOffset = 5;
    const oldRuns = buildTextRuns('abcd', {}, startOffset);
    const diffs = getInlineDiff(oldRuns, buildTextRuns('abXYd', {}, startOffset), startOffset + oldRuns.length);

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
    const oldRuns = buildTextRuns('a', { bold: true }, 0);
    const diffs = getInlineDiff(oldRuns, buildTextRuns('a', { italic: true }), oldRuns.length);

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
        marksDiff: null,
      },
    ]);
  });

  it('merges contiguous attribute edits that share the same diff metadata', () => {
    const startOffset = 5;
    const oldRuns = buildTextRuns('ab', { bold: true }, startOffset);
    const diffs = getInlineDiff(
      oldRuns,
      buildTextRuns('ab', { bold: false }, startOffset),
      startOffset + oldRuns.length,
    );

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
        marksDiff: null,
      },
    ]);
  });

  it('treats mark-only changes as modifications and surfaces marks diffs', () => {
    const oldRuns = buildMarkedTextRuns('a', [{ type: 'bold', attrs: { level: 1 } }]);
    const newRuns = buildMarkedTextRuns('a', [{ type: 'italic', attrs: {} }]);

    const diffs = getInlineDiff(oldRuns, newRuns, oldRuns.length);

    expect(diffs).toEqual([
      {
        action: 'modified',
        kind: 'text',
        startPos: 0,
        endPos: 0,
        oldText: 'a',
        newText: 'a',
        runAttrsDiff: null,
        marksDiff: {
          added: [{ name: 'italic', attrs: {} }],
          deleted: [{ name: 'bold', attrs: { level: 1 } }],
          modified: [],
        },
      },
    ]);
  });

  it('surfaces attribute diffs for inline node modifications', () => {
    const sharedType = { name: 'link' };
    const oldNode = buildInlineNodeToken({ href: 'https://old.example', label: 'Example' }, sharedType, 3);
    const newNode = buildInlineNodeToken({ href: 'https://new.example', label: 'Example' }, sharedType, 3);

    const diffs = getInlineDiff([oldNode], [newNode], 4);

    expect(diffs).toEqual([
      {
        action: 'modified',
        kind: 'inlineNode',
        nodeType: 'link',
        startPos: 3,
        endPos: 3,
        oldNodeJSON: oldNode.nodeJSON,
        newNodeJSON: newNode.nodeJSON,
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
