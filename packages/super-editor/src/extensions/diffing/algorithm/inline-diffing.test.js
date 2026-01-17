import { describe, it, expect, vi } from 'vitest';
vi.mock('./myers-diff.ts', async () => {
  const actual = await vi.importActual('./myers-diff.ts');
  return {
    myersDiff: vi.fn(actual.myersDiff),
  };
});
import { getInlineDiff, tokenizeInlineContent } from './inline-diffing.ts';

/**
 * Builds text tokens with offsets for inline diff tests.
 *
 * @param {string} text Text content to tokenize.
 * @param {Record<string, unknown>} runAttrs Run attributes to attach.
 * @param {number} offsetStart Offset base for the first token.
 * @returns {import('./inline-diffing.ts').InlineTextToken[]}
 */
const buildTextRuns = (text, runAttrs = {}, offsetStart = 0) =>
  text.split('').map((char, index) => ({
    char,
    runAttrs: { ...runAttrs },
    kind: 'text',
    offset: offsetStart + index,
  }));

/**
 * Builds marked text tokens with offsets for inline diff tests.
 *
 * @param {string} text Text content to tokenize.
 * @param {Array<Record<string, unknown>>} marks Marks to attach.
 * @param {Record<string, unknown>} runAttrs Run attributes to attach.
 * @param {number} offsetStart Offset base for the first token.
 * @returns {import('./inline-diffing.ts').InlineTextToken[]}
 */
const buildMarkedTextRuns = (text, marks, runAttrs = {}, offsetStart = 0) =>
  text.split('').map((char, index) => ({
    char,
    runAttrs: { ...runAttrs },
    kind: 'text',
    offset: offsetStart + index,
    marks,
  }));

/**
 * Builds a mock inline-node token for diff tests.
 *
 * @param {Record<string, unknown>} attrs Node attributes.
 * @param {{ name: string }} type Node type descriptor.
 * @param {number} pos Position offset for the inline node.
 * @returns {import('./inline-diffing.ts').InlineNodeToken}
 */
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

/**
 * Builds text tokens without offsets for tokenizer assertions.
 *
 * @param {string} text Text content to tokenize.
 * @param {Record<string, unknown>} runAttrs Run attributes to attach.
 * @param {Array<Record<string, unknown>>} marks Marks to attach.
 * @returns {import('./inline-diffing.ts').InlineTextToken[]}
 */
const buildTextTokens = (text, runAttrs = {}, marks = []) =>
  text.split('').map((char) => ({
    char,
    runAttrs,
    kind: 'text',
    marks,
  }));

/**
 * Creates a mock inline container with configurable segments for tokenizer tests.
 *
 * @param {Array<Record<string, unknown>>} segments Inline segments to emit.
 * @param {number | null} contentSize Optional content size override.
 * @returns {import('prosemirror-model').Node}
 */
const createInlineContainer = (segments, contentSize) => {
  const computedSegments = segments.map((segment) => {
    if (segment.inlineNode) {
      return {
        ...segment,
        kind: 'inline',
        length: segment.length ?? 1,
        start: segment.start ?? 0,
        attrs: segment.attrs ?? segment.inlineNode.attrs ?? {},
        inlineNode: {
          typeName: segment.inlineNode.typeName ?? 'inline',
          attrs: segment.inlineNode.attrs ?? {},
          isLeaf: segment.inlineNode.isLeaf ?? true,
          toJSON:
            segment.inlineNode.toJSON ??
            (() => ({
              type: segment.inlineNode.typeName ?? 'inline',
              attrs: segment.inlineNode.attrs ?? {},
            })),
        },
      };
    }

    const segmentText = segment.text ?? segment.leafText();
    const length = segmentText.length;
    return {
      ...segment,
      kind: segment.text != null ? 'text' : 'leaf',
      length,
      start: segment.start ?? 0,
      attrs: segment.attrs ?? {},
    };
  });
  const size =
    contentSize ?? computedSegments.reduce((max, segment) => Math.max(max, segment.start + segment.length), 0);
  const attrsMap = new Map();
  computedSegments.forEach((segment) => {
    const key = segment.kind === 'inline' ? segment.start : segment.start - 1;
    attrsMap.set(key, segment.attrs);
  });

  return {
    content: { size },
    nodesBetween: (from, to, callback) => {
      computedSegments.forEach((segment) => {
        if (segment.kind === 'text') {
          callback({ isText: true, text: segment.text, marks: segment.marks ?? [] }, segment.start);
        } else if (segment.kind === 'leaf') {
          callback({ isLeaf: true, type: { spec: { leafText: segment.leafText } } }, segment.start);
        } else {
          callback(
            {
              isInline: true,
              isLeaf: segment.inlineNode.isLeaf,
              type: { name: segment.inlineNode.typeName, spec: {} },
              attrs: segment.inlineNode.attrs,
              toJSON: () => ({
                type: segment.inlineNode.typeName,
                attrs: segment.inlineNode.attrs,
              }),
            },
            segment.start,
          );
        }
      });
    },
    nodeAt: (pos) => ({ attrs: attrsMap.get(pos) ?? {} }),
  };
};

/**
 * Strips positional fields from tokens for assertions.
 *
 * @param {import('./inline-diffing.ts').InlineDiffToken[]} tokens Tokens to normalize.
 * @returns {Array<Record<string, unknown>>}
 */
const stripTokenOffsets = (tokens) =>
  tokens.map((token) => {
    if (token.kind === 'text') {
      return {
        kind: token.kind,
        char: token.char,
        runAttrs: token.runAttrs,
        marks: token.marks,
      };
    }
    return {
      kind: token.kind,
      nodeType: token.nodeType,
      nodeJSON: token.nodeJSON,
    };
  });

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

describe('tokenizeInlineContent', () => {
  it('handles basic text nodes', () => {
    const mockParagraph = createInlineContainer([{ text: 'Hello', start: 1, attrs: { bold: true } }], 6);

    const tokens = tokenizeInlineContent(mockParagraph, 0);
    expect(stripTokenOffsets(tokens)).toEqual(buildTextTokens('Hello', { bold: true }, []));
    expect(tokens[0]?.offset).toBe(1);
    expect(tokens[4]?.offset).toBe(5);
  });

  it('handles leaf nodes with leafText', () => {
    const mockParagraph = createInlineContainer([{ leafText: () => 'Leaf', start: 1, attrs: { type: 'leaf' } }], 5);

    const tokens = tokenizeInlineContent(mockParagraph, 0);
    expect(stripTokenOffsets(tokens)).toEqual(buildTextTokens('Leaf', { type: 'leaf' }, []));
    expect(tokens[0]?.offset).toBe(1);
    expect(tokens[3]?.offset).toBe(4);
  });

  it('handles mixed content', () => {
    const mockParagraph = createInlineContainer([
      { text: 'Hello', start: 1, attrs: { bold: true } },
      { leafText: () => 'Leaf', start: 6, attrs: { italic: true } },
    ]);

    const tokens = tokenizeInlineContent(mockParagraph, 0);
    expect(stripTokenOffsets(tokens)).toEqual([
      ...buildTextTokens('Hello', { bold: true }, []),
      ...buildTextTokens('Leaf', { italic: true }, []),
    ]);
    expect(tokens[0]?.offset).toBe(1);
    expect(tokens[5]?.offset).toBe(6);
    expect(tokens[tokens.length - 1]?.offset).toBe(9);
  });

  it('handles empty content', () => {
    const mockParagraph = createInlineContainer([], 0);

    const tokens = tokenizeInlineContent(mockParagraph, 0);
    expect(tokens).toEqual([]);
  });

  it('includes inline nodes that have no textual content', () => {
    const inlineAttrs = { kind: 'tab', width: 120 };
    const mockParagraph = createInlineContainer([
      { inlineNode: { typeName: 'tab', attrs: inlineAttrs }, start: 1 },
      { text: 'Text', start: 2, attrs: { bold: false } },
    ]);

    const tokens = tokenizeInlineContent(mockParagraph, 0);
    expect(tokens[0]).toMatchObject({
      kind: 'inlineNode',
      nodeType: 'tab',
      nodeJSON: {
        type: 'tab',
        attrs: inlineAttrs,
      },
      pos: 1,
    });
    expect(stripTokenOffsets(tokens.slice(1))).toEqual(buildTextTokens('Text', { bold: false }, []));
    expect(tokens[1]?.offset).toBe(2);
  });

  it('captures marks from text nodes', () => {
    const boldMark = { toJSON: () => ({ type: 'bold', attrs: { level: 2 } }) };
    const mockParagraph = createInlineContainer([{ text: 'Hi', start: 1, marks: [boldMark] }], 3);

    const tokens = tokenizeInlineContent(mockParagraph, 0);
    expect(tokens[0]?.marks).toEqual([{ type: 'bold', attrs: { level: 2 } }]);
    expect(tokens[1]?.marks).toEqual([{ type: 'bold', attrs: { level: 2 } }]);
  });

  it('applies the base offset to token positions', () => {
    const mockParagraph = createInlineContainer([{ text: 'Nested', start: 1 }], 7);

    const tokens = tokenizeInlineContent(mockParagraph, 10);
    expect(stripTokenOffsets(tokens)).toEqual(buildTextTokens('Nested', {}, []));
    expect(tokens[0]?.offset).toBe(11);
    expect(tokens[5]?.offset).toBe(16);
  });
});
