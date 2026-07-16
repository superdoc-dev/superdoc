import { describe, it, expect, vi } from 'vitest';
vi.mock('./myers-diff.ts', async () => {
  const actual = await vi.importActual('./myers-diff.ts');
  return {
    myersDiff: vi.fn(actual.myersDiff),
  };
});
import {
  buildInlineDiffPlan,
  getInlineDiff,
  isSafeSpan,
  segmentInlineTokens,
  tokenizeInlineContent,
} from './inline-diffing.ts';

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
    text: char,
    length: 1,
    runAttrs: { ...runAttrs },
    kind: 'text',
    offset: offsetStart + index,
    endOffset: offsetStart + index,
  }));

/**
 * Builds text tokens with explicit offsets for multi-run position tests.
 *
 * @param {string} text Text content to tokenize.
 * @param {number[]} offsets Absolute offsets for each character token.
 * @param {Record<string, unknown>} runAttrs Run attributes to attach.
 * @returns {import('./inline-diffing.ts').InlineTextToken[]}
 */
const buildTextRunsWithOffsets = (text, offsets, runAttrs = {}) =>
  text.split('').map((char, index) => ({
    text: char,
    length: 1,
    runAttrs: { ...runAttrs },
    kind: 'text',
    offset: offsets[index],
    endOffset: offsets[index],
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
    text: char,
    length: 1,
    runAttrs: { ...runAttrs },
    kind: 'text',
    offset: offsetStart + index,
    endOffset: offsetStart + index,
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
 * Builds a mock image inline-node token for diff tests.
 *
 * @param {Record<string, unknown>} attrs Image node attributes.
 * @param {number} pos Position offset for the image node.
 * @returns {import('./inline-diffing.ts').InlineNodeToken}
 */
const buildImageNodeToken = (attrs = {}, pos = 0) => {
  const nodeAttrs = { ...attrs };
  const type = { name: 'image' };
  return {
    kind: 'inlineNode',
    nodeType: 'image',
    node: {
      type,
      attrs: nodeAttrs,
      toJSON: () => ({ type: 'image', attrs: nodeAttrs }),
    },
    nodeJSON: { type: 'image', attrs: nodeAttrs },
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
    text: char,
    length: 1,
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
        text: token.text,
        length: token.length,
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

/**
 * Collects text diff fragments for readability assertions.
 *
 * @param {import('./inline-diffing.ts').InlineDiffResult[]} diffs Inline diff results.
 * @returns {{ added: string[]; deleted: string[]; modifiedOld: string[]; modifiedNew: string[] }}
 */
const collectTextDiffFragments = (diffs) => {
  const added = [];
  const deleted = [];
  const modifiedOld = [];
  const modifiedNew = [];

  for (const diff of diffs) {
    if (diff.kind !== 'text') {
      continue;
    }

    if (diff.action === 'added' && typeof diff.text === 'string') {
      added.push(diff.text);
      continue;
    }

    if (diff.action === 'deleted' && typeof diff.text === 'string') {
      deleted.push(diff.text);
      continue;
    }

    if (diff.action === 'modified') {
      if (typeof diff.oldText === 'string') {
        modifiedOld.push(diff.oldText);
      }
      if (typeof diff.newText === 'string') {
        modifiedNew.push(diff.newText);
      }
    }
  }

  return { added, deleted, modifiedOld, modifiedNew };
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
        action: 'modified',
        kind: 'text',
        startPos: 10,
        endPos: 12,
        oldText: 'abc',
        newText: 'abXc',
        runAttrsDiff: null,
        marksDiff: null,
      },
    ]);
  });

  it('detects deletions and additions in the same diff sequence', () => {
    const startOffset = 5;
    const oldRuns = buildTextRuns('abcd', {}, startOffset);
    const diffs = getInlineDiff(oldRuns, buildTextRuns('abXYd', {}, startOffset), startOffset + oldRuns.length);

    expect(diffs).toEqual([
      {
        action: 'modified',
        kind: 'text',
        startPos: 5,
        endPos: 8,
        oldText: 'abcd',
        newText: 'abXYd',
        runAttrsDiff: null,
        marksDiff: null,
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

  it('ignores tracked-change id-only churn when computing mark diffs', () => {
    const oldRuns = buildMarkedTextRuns('a', [{ type: 'trackInsert', attrs: { id: 'import-a', author: 'Alice' } }]);
    const newRuns = buildMarkedTextRuns('a', [{ type: 'trackInsert', attrs: { id: 'import-b', author: 'Alice' } }]);

    const diffs = getInlineDiff(oldRuns, newRuns, oldRuns.length);

    expect(diffs).toEqual([]);
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

  it('marks plain text spans with matching formatting as safe', () => {
    const oldRuns = buildMarkedTextRuns('word', [{ type: 'bold', attrs: {} }], { styleId: 'BodyText' });
    const newRuns = buildMarkedTextRuns('text', [{ type: 'bold', attrs: {} }], { styleId: 'BodyText' });

    expect(isSafeSpan(oldRuns, newRuns)).toBe(true);
  });

  it('rejects spans with tracked-change marks', () => {
    const oldRuns = buildMarkedTextRuns('word', [{ type: 'trackInsert', attrs: { id: 'tracked-1' } }]);
    const newRuns = buildTextRuns('text');

    expect(isSafeSpan(oldRuns, newRuns)).toBe(false);
  });

  it('rejects spans with comment anchors or inline nodes', () => {
    const commentAnchor = {
      kind: 'inlineNode',
      nodeType: 'commentRangeStart',
      node: {
        type: { name: 'commentRangeStart' },
        attrs: { id: 'c1' },
        toJSON: () => ({ type: 'commentRangeStart', attrs: { id: 'c1' } }),
      },
      nodeJSON: { type: 'commentRangeStart', attrs: { id: 'c1' } },
      pos: 0,
    };

    expect(isSafeSpan([commentAnchor], buildTextRuns('text'))).toBe(false);
  });

  it('rejects spans with PAGEREF-like run attrs', () => {
    const oldRuns = buildTextRuns('9', { instruction: 'PAGEREF _Toc123456789 h' });
    const newRuns = buildTextRuns('10', { instruction: 'PAGEREF _Toc123456789 h' });

    expect(isSafeSpan(oldRuns, newRuns)).toBe(false);
  });

  it('rejects spans with formatting drift between old and new tokens', () => {
    const oldRuns = buildMarkedTextRuns('word', [{ type: 'bold', attrs: {} }], { styleId: 'BodyText' });
    const newRuns = buildMarkedTextRuns('text', [{ type: 'italic', attrs: {} }], { styleId: 'BodyText' });
    const newRunAttrs = buildMarkedTextRuns('text', [{ type: 'bold', attrs: {} }], { styleId: 'Quote' });

    expect(isSafeSpan(oldRuns, newRuns)).toBe(false);
    expect(isSafeSpan(oldRuns, newRunAttrs)).toBe(false);
  });

  it('ignores volatile run attrs when checking safe spans', () => {
    const oldRuns = buildTextRuns('LEASE', { rsidR: '001', rsidRPr: 'aaa', rsidDel: null });
    const newRuns = buildTextRuns('RENTAL', { rsidR: '002', rsidRPr: 'bbb', rsidDel: 'deleted' });

    expect(isSafeSpan(oldRuns, newRuns)).toBe(true);
  });

  it('ignores importer font-family churn when checking safe spans', () => {
    const oldRuns = buildTextRuns('LEASE', {
      runProperties: {
        kern: 0,
        ligatures: 'none',
      },
      runPropertiesInlineKeys: ['kern', 'ligatures', 'fontFamily', 'fontSize', 'fontSizeCs'],
      rsidRPr: null,
    });
    const newRuns = buildTextRuns('RENTAL', {
      runProperties: {
        fontFamily: {
          eastAsia: 'Aptos',
          cs: 'Aptos',
          asciiTheme: 'minorHAnsi',
          hAnsiTheme: 'minorHAnsi',
        },
        kern: 0,
        ligatures: 'none',
      },
      runPropertiesInlineKeys: ['fontFamily', 'fontSize', 'fontSizeCs'],
      rsidRPr: '00952A78',
    });

    expect(isSafeSpan(oldRuns, newRuns)).toBe(true);
  });

  it('does not emit text modifications for volatile run-attr churn alone', () => {
    const oldRuns = buildTextRuns('same', { rsidR: '001', rsidRPr: null, rsidDel: null });
    const newRuns = buildTextRuns('same', { rsidR: '002', rsidRPr: 'abc', rsidDel: 'def' });

    expect(getInlineDiff(oldRuns, newRuns, oldRuns.length)).toEqual([]);
  });

  it('still emits text modifications for equal text when font attrs really differ', () => {
    const oldRuns = buildTextRuns('same', {
      runProperties: {
        kern: 0,
        ligatures: 'none',
      },
      runPropertiesInlineKeys: ['kern', 'ligatures', 'fontFamily', 'fontSize', 'fontSizeCs'],
      rsidRPr: null,
    });
    const newRuns = buildTextRuns('same', {
      runProperties: {
        fontFamily: {
          eastAsia: 'Aptos',
          cs: 'Aptos',
          asciiTheme: 'minorHAnsi',
          hAnsiTheme: 'minorHAnsi',
        },
        kern: 0,
        ligatures: 'none',
      },
      runPropertiesInlineKeys: ['fontFamily', 'fontSize', 'fontSizeCs'],
      rsidRPr: '00952A78',
    });

    expect(getInlineDiff(oldRuns, newRuns, oldRuns.length)).toEqual([
      expect.objectContaining({
        action: 'modified',
        kind: 'text',
        oldText: 'same',
        newText: 'same',
        runAttrsDiff: expect.objectContaining({
          added: expect.objectContaining({
            'runProperties.fontFamily.eastAsia': 'Aptos',
          }),
        }),
      }),
    ]);
  });

  it('keeps LEASE to RENTAL AGREEMENT as a whole-word replacement', () => {
    const oldRuns = buildTextRuns('LEASE');
    const diffs = getInlineDiff(oldRuns, buildTextRuns('RENTAL AGREEMENT'), oldRuns.length);
    const fragments = collectTextDiffFragments(diffs);
    const removedText = [...fragments.deleted, ...fragments.modifiedOld];
    const addedText = [...fragments.added, ...fragments.modifiedNew];

    expect(removedText).toEqual(expect.arrayContaining(['LEASE']));
    expect(addedText).toEqual(expect.arrayContaining(['RENTAL', ' AGREEMENT']));
    expect(removedText).not.toEqual(expect.arrayContaining(['R', 'NT', 'L']));
    expect(addedText).not.toEqual(expect.arrayContaining(['L', 'SE']));
  });

  it('keeps electronic to electric as a whole-word replacement', () => {
    const oldRuns = buildTextRuns('electronic');
    const diffs = getInlineDiff(oldRuns, buildTextRuns('electric'), oldRuns.length);
    const fragments = collectTextDiffFragments(diffs);
    const removedText = [...fragments.deleted, ...fragments.modifiedOld];
    const addedText = [...fragments.added, ...fragments.modifiedNew];

    expect(removedText).toEqual(expect.arrayContaining(['electronic']));
    expect(addedText).toEqual(expect.arrayContaining(['electric']));
    expect(removedText).not.toEqual(expect.arrayContaining(['on']));
    expect(addedText).not.toEqual(expect.arrayContaining(['lectr']));
  });

  it('keeps endPos aligned to the last source token for multi-run word replacements', () => {
    const oldRuns = buildTextRunsWithOffsets('electronic', [2, 5, 6, 7, 8, 9, 12, 13, 14, 15]);
    const diffs = getInlineDiff(oldRuns, buildTextRuns('electric', {}, 2), 16);

    expect(diffs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: 'modified',
          kind: 'text',
          oldText: 'electronic',
          newText: 'electric',
          startPos: 2,
          endPos: 15,
        }),
      ]),
    );
  });

  it('keeps warranties to what as a whole-word replacement', () => {
    const oldRuns = buildTextRuns('warranties');
    const diffs = getInlineDiff(oldRuns, buildTextRuns('what'), oldRuns.length);
    const fragments = collectTextDiffFragments(diffs);
    const removedText = [...fragments.deleted, ...fragments.modifiedOld];
    const addedText = [...fragments.added, ...fragments.modifiedNew];

    expect(removedText).toEqual(expect.arrayContaining(['warranties']));
    expect(addedText).toEqual(expect.arrayContaining(['what']));
    expect(removedText).not.toEqual(expect.arrayContaining(['what']));
    expect(addedText).not.toEqual(expect.arrayContaining(['w', 'arranties']));
  });

  it('keeps sentence to phrase as a whole-word replacement', () => {
    const oldRuns = buildTextRuns('sentence');
    const diffs = getInlineDiff(oldRuns, buildTextRuns('phrase'), oldRuns.length);
    const fragments = collectTextDiffFragments(diffs);
    const removedText = [...fragments.deleted, ...fragments.modifiedOld];
    const addedText = [...fragments.added, ...fragments.modifiedNew];

    expect(removedText).toEqual(expect.arrayContaining(['sentence']));
    expect(addedText).toEqual(expect.arrayContaining(['phrase']));
    expect(removedText).not.toEqual(expect.arrayContaining(['phra']));
    expect(addedText).not.toEqual(expect.arrayContaining(['ntence']));
  });

  it('keeps goods to products as a whole-word replacement', () => {
    const oldRuns = buildTextRuns('goods');
    const diffs = getInlineDiff(oldRuns, buildTextRuns('products'), oldRuns.length);
    const fragments = collectTextDiffFragments(diffs);
    const removedText = [...fragments.deleted, ...fragments.modifiedOld];
    const addedText = [...fragments.added, ...fragments.modifiedNew];

    expect(removedText).toEqual(expect.arrayContaining(['goods']));
    expect(addedText).toEqual(expect.arrayContaining(['products']));
    expect(removedText).not.toEqual(expect.arrayContaining(['od']));
    expect(addedText).not.toEqual(expect.arrayContaining(['uct']));
  });
});

describe('segmentInlineTokens', () => {
  it('starts a new segment at unsafe tokens instead of appending them to the previous span', () => {
    const tokens = [
      ...buildTextRuns('ab', {}, 0),
      ...buildMarkedTextRuns('c', [{ type: 'trackInsert', attrs: { id: 'tracked-1' } }], {}, 2),
      ...buildTextRuns('de', {}, 3),
    ];

    expect(
      segmentInlineTokens(tokens).map((segment) => ({
        text: segment.tokens.map((token) => (token.kind === 'text' ? token.text : `[${token.nodeType}]`)).join(''),
        isTextOnly: segment.isTextOnly,
        isIndividuallySafe: segment.isIndividuallySafe,
        sourceStartTokenIdx: segment.sourceStartTokenIdx,
      })),
    ).toEqual([
      { text: 'ab', isTextOnly: true, isIndividuallySafe: true, sourceStartTokenIdx: 0 },
      { text: 'c', isTextOnly: true, isIndividuallySafe: false, sourceStartTokenIdx: 2 },
      { text: 'de', isTextOnly: true, isIndividuallySafe: true, sourceStartTokenIdx: 3 },
    ]);
  });

  it('falls back when segment counts are asymmetric', () => {
    const oldSegments = segmentInlineTokens(buildTextRuns('LEASE'));
    const newSegments = segmentInlineTokens([
      ...buildTextRuns('RENTAL', {}, 0),
      ...buildTextRuns(' body', { styleId: 'Quote' }, 6),
    ]);

    expect(buildInlineDiffPlan(oldSegments, newSegments)).toBeNull();
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

  it('treats structuredContent as atomic and does not emit descendant text tokens', () => {
    // Simulates: paragraph → "before" text + structuredContent (non-leaf, with text
    // children) + "after" text. The structuredContent should appear as a single
    // inlineNode token; its internal text should not produce additional text tokens.
    const sdtAttrs = { sdtId: '446128060', sdtTag: 'my field 2' };
    const sdtNode = {
      isInline: true,
      isLeaf: false,
      type: { name: 'structuredContent', spec: {} },
      attrs: sdtAttrs,
      toJSON: () => ({ type: 'structuredContent', attrs: sdtAttrs }),
    };

    const mockParagraph = {
      content: { size: 30 },
      nodesBetween: (_from, _to, callback) => {
        // text before SDT
        'hi'.split('').forEach((ch, i) => {
          callback({ isText: true, text: ch, marks: [] }, i);
        });
        // structuredContent (non-leaf inline container)
        const shouldDescend = callback(sdtNode, 2);
        // simulate PM: only call children if callback did NOT return false
        if (shouldDescend !== false) {
          'field content'.split('').forEach((ch, i) => {
            callback({ isText: true, text: ch, marks: [] }, 3 + i);
          });
        }
        // text after SDT
        'ok'.split('').forEach((ch, i) => {
          callback({ isText: true, text: ch, marks: [] }, 20 + i);
        });
      },
      nodeAt: () => ({ attrs: {} }),
    };

    const tokens = tokenizeInlineContent(mockParagraph);

    const inlineNodeTokens = tokens.filter((t) => t.kind === 'inlineNode');
    const textTokens = tokens.filter((t) => t.kind === 'text');

    expect(inlineNodeTokens).toHaveLength(1);
    expect(inlineNodeTokens[0].nodeType).toBe('structuredContent');
    // Only "hi" (2) and "ok" (2) — no tokens from SDT's internal content
    expect(textTokens).toHaveLength(4);
    expect(textTokens.map((t) => t.text).join('')).toBe('hiok');
  });
});

describe('image semantic normalization in inline diff', () => {
  it('produces no diff when images differ only in volatile originalAttributes', () => {
    const baseAttrs = {
      src: 'image1.png',
      size: { width: 100, height: 50 },
      originalAttributes: {
        'wp14:anchorId': 'AAAA1111',
        'wp14:editId': 'BBBB2222',
        cx: '914400',
      },
    };
    const changedAttrs = {
      src: 'image1.png',
      size: { width: 100, height: 50 },
      originalAttributes: {
        'wp14:anchorId': 'CCCC3333',
        'wp14:editId': 'DDDD4444',
        cx: '914400',
      },
    };

    const oldToken = buildImageNodeToken(baseAttrs, 5);
    const newToken = buildImageNodeToken(changedAttrs, 5);

    const diffs = getInlineDiff([oldToken], [newToken], 6);
    expect(diffs).toEqual([]);
  });

  it('detects a real image change even when volatile attrs also differ', () => {
    const oldAttrs = {
      src: 'old-image.png',
      originalAttributes: { 'wp14:anchorId': 'A1', cx: '100' },
    };
    const newAttrs = {
      src: 'new-image.png',
      originalAttributes: { 'wp14:anchorId': 'A2', cx: '100' },
    };

    const oldToken = buildImageNodeToken(oldAttrs, 3);
    const newToken = buildImageNodeToken(newAttrs, 3);

    const diffs = getInlineDiff([oldToken], [newToken], 4);

    expect(diffs).toHaveLength(1);
    expect(diffs[0].action).toBe('modified');
    expect(diffs[0].kind).toBe('inlineNode');
    expect(diffs[0].attrsDiff?.modified).toHaveProperty('src');
  });

  it('handles multiple images in one paragraph using type-based pairing', () => {
    const mkImage = (src, anchorId, pos) =>
      buildImageNodeToken({ src, originalAttributes: { 'wp14:anchorId': anchorId, cx: '100' } }, pos);

    const oldTokens = [mkImage('a.png', 'ID1', 1), mkImage('b.png', 'ID2', 3)];
    const newTokens = [mkImage('a.png', 'ID3', 1), mkImage('b.png', 'ID4', 3)];

    const diffs = getInlineDiff(oldTokens, newTokens, 5);
    expect(diffs).toEqual([]);
  });

  it('emits a diff when one of multiple images genuinely changes', () => {
    const mkImage = (src, anchorId, pos) =>
      buildImageNodeToken({ src, originalAttributes: { 'wp14:anchorId': anchorId } }, pos);

    const oldTokens = [mkImage('a.png', 'ID1', 1), mkImage('b.png', 'ID2', 3)];
    const newTokens = [mkImage('a.png', 'ID3', 1), mkImage('c.png', 'ID4', 3)];

    const diffs = getInlineDiff(oldTokens, newTokens, 5);

    expect(diffs).toHaveLength(1);
    expect(diffs[0].action).toBe('modified');
    expect(diffs[0].attrsDiff?.modified).toHaveProperty('src');
  });

  it('correctly detects an image insertion when a new image is prepended', () => {
    const mkImage = (src, pos) => buildImageNodeToken({ src }, pos);

    const oldTokens = [mkImage('a.png', 1), mkImage('b.png', 3)];
    const newTokens = [mkImage('x.png', 1), mkImage('a.png', 3), mkImage('b.png', 5)];

    const diffs = getInlineDiff(oldTokens, newTokens, 5);

    // Should be a single insertion of x.png, not two modifications + addition
    expect(diffs).toHaveLength(1);
    expect(diffs[0].action).toBe('added');
    expect(diffs[0].kind).toBe('inlineNode');
    expect(diffs[0].nodeJSON.attrs.src).toBe('x.png');
  });

  it('correctly detects image reordering as delete + add', () => {
    const mkImage = (src, pos) => buildImageNodeToken({ src }, pos);

    const oldTokens = [mkImage('a.png', 1), mkImage('b.png', 3)];
    const newTokens = [mkImage('b.png', 1), mkImage('a.png', 3)];

    const diffs = getInlineDiff(oldTokens, newTokens, 5);

    // Reorder produces diffs — at minimum some combination of added/deleted
    expect(diffs.length).toBeGreaterThan(0);
  });

  it('excludes volatile attrs from attrsDiff when a real image change occurs', () => {
    const oldAttrs = {
      src: 'v1.png',
      size: { width: 100 },
      originalAttributes: { 'wp14:anchorId': 'OLD', 'wp14:editId': 'OLD', cx: '100' },
    };
    const newAttrs = {
      src: 'v2.png',
      size: { width: 200 },
      originalAttributes: { 'wp14:anchorId': 'NEW', 'wp14:editId': 'NEW', cx: '100' },
    };

    const diffs = getInlineDiff([buildImageNodeToken(oldAttrs, 1)], [buildImageNodeToken(newAttrs, 1)], 2);

    expect(diffs).toHaveLength(1);
    const attrsDiff = diffs[0].attrsDiff;

    // Semantic changes are reported
    expect(attrsDiff?.modified).toHaveProperty('src');
    expect(attrsDiff?.modified).toHaveProperty('size.width');

    // Volatile changes are NOT reported
    expect(attrsDiff?.modified).not.toHaveProperty('originalAttributes.wp14:anchorId');
    expect(attrsDiff?.modified).not.toHaveProperty('originalAttributes.wp14:editId');
  });
});
