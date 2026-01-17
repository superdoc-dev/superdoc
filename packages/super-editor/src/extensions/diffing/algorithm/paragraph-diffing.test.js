import { describe, it, expect } from 'vitest';
import {
  shouldProcessEqualAsModification,
  paragraphComparator,
  buildAddedParagraphDiff,
  buildDeletedParagraphDiff,
  buildModifiedParagraphDiff,
  canTreatAsModification,
} from './paragraph-diffing.ts';

/**
 * Builds text tokens without offsets for paragraph diff tests.
 *
 * @param {string} text Text content to tokenize.
 * @param {Record<string, unknown>} attrs Run attributes to attach.
 * @returns {Array<Record<string, unknown>>}
 */
const buildRuns = (text, attrs = {}) => text.split('').map((char) => ({ char, runAttrs: attrs, kind: 'text' }));

/**
 * Builds marked text tokens with offsets for paragraph diff tests.
 *
 * @param {string} text Text content to tokenize.
 * @param {Array<Record<string, unknown>>} marks Marks to attach.
 * @param {Record<string, unknown>} attrs Run attributes to attach.
 * @param {number} offsetStart Offset base for the first token.
 * @returns {Array<Record<string, unknown>>}
 */
const buildMarkedRuns = (text, marks, attrs = {}, offsetStart = 0) =>
  text.split('').map((char, index) => ({
    char,
    runAttrs: attrs,
    kind: 'text',
    marks,
    offset: offsetStart + index,
  }));

/**
 * Creates a mock paragraph node with default attributes.
 *
 * @param {Record<string, unknown>} overrides Overrides for the mock node.
 * @returns {Record<string, unknown>}
 */
const createParagraphNode = (overrides = {}) => {
  const node = {
    type: { name: 'paragraph', ...(overrides.type || {}) },
    attrs: {},
    nodeSize: 5,
    ...overrides,
  };
  if (typeof node.toJSON !== 'function') {
    node.toJSON = () => ({ type: node.type.name, attrs: node.attrs });
  }
  return node;
};

/**
 * Creates a paragraph snapshot stub for diff builder tests.
 *
 * @param {Record<string, unknown>} overrides Overrides for the snapshot.
 * @returns {Record<string, unknown>}
 */
const createParagraphInfo = (overrides = {}) => {
  const fullText = overrides.fullText ?? 'text';
  const paragraphPos = overrides.pos ?? 0;
  const baseTokens =
    overrides.text ??
    buildRuns(fullText).map((token, index) => ({
      ...token,
      offset: paragraphPos + 1 + index,
    }));
  const textTokens = baseTokens.map((token, index) => {
    if (token.kind === 'text' && token.offset == null) {
      return { ...token, offset: paragraphPos + 1 + index };
    }
    if (token.kind === 'inlineNode' && token.pos == null) {
      return { ...token, pos: paragraphPos + 1 + index };
    }
    return token;
  });

  return {
    node: createParagraphNode(overrides.node),
    pos: paragraphPos,
    depth: 0,
    fullText,
    text: textTokens,
    endPos: overrides.endPos ?? paragraphPos + 1 + fullText.length,
    ...overrides,
  };
};

describe('shouldProcessEqualAsModification', () => {
  it('returns true when node JSON differs', () => {
    const baseNode = { toJSON: () => ({ attrs: { bold: true } }) };
    const modifiedNode = { toJSON: () => ({ attrs: { bold: false } }) };

    expect(shouldProcessEqualAsModification({ node: baseNode }, { node: modifiedNode })).toBe(true);
  });

  it('returns false when serialized nodes are identical', () => {
    const node = { toJSON: () => ({ attrs: { bold: true } }) };
    expect(shouldProcessEqualAsModification({ node }, { node })).toBe(false);
  });
});

describe('paragraphComparator', () => {
  it('treats paragraphs with the same paraId as equal', () => {
    const makeInfo = (id) => ({ node: { attrs: { paraId: id } } });
    expect(paragraphComparator(makeInfo('123'), makeInfo('123'))).toBe(true);
  });

  it('falls back to comparing fullText when ids differ', () => {
    const makeInfo = (text) => ({ node: { attrs: {} }, fullText: text });
    expect(paragraphComparator(makeInfo('same text'), makeInfo('same text'))).toBe(true);
  });

  it('returns false for paragraphs with different identity signals', () => {
    expect(paragraphComparator({ fullText: 'one' }, { fullText: 'two' })).toBe(false);
  });
});

describe('paragraph diff builders', () => {
  it('builds added paragraph payloads with consistent metadata', () => {
    const paragraph = createParagraphInfo({
      node: createParagraphNode({ type: { name: 'paragraph' } }),
      fullText: 'Hello',
    });
    const previousNode = { pos: 10, depth: 0, node: { nodeSize: 4 } };

    expect(buildAddedParagraphDiff(paragraph, previousNode)).toEqual({
      action: 'added',
      nodeType: 'paragraph',
      nodeJSON: paragraph.node.toJSON(),
      text: 'Hello',
      pos: 14,
    });
  });

  it('builds deletion payloads reflecting the original paragraph context', () => {
    const paragraph = createParagraphInfo({ pos: 7, fullText: 'Old text' });

    expect(buildDeletedParagraphDiff(paragraph)).toEqual({
      action: 'deleted',
      nodeType: 'paragraph',
      nodeJSON: paragraph.node.toJSON(),
      oldText: 'Old text',
      pos: 7,
    });
  });

  it('returns a diff with inline changes when content differs', () => {
    const oldParagraph = createParagraphInfo({
      pos: 5,
      fullText: 'foo',
      text: buildRuns('foo'),
      node: createParagraphNode({ attrs: { align: 'left' } }),
    });
    const newParagraph = createParagraphInfo({
      pos: 5,
      fullText: 'bar',
      text: buildRuns('bar'),
      node: createParagraphNode({ attrs: { align: 'left' } }),
    });

    const diff = buildModifiedParagraphDiff(oldParagraph, newParagraph);
    expect(diff).not.toBeNull();
    expect(diff).toMatchObject({
      action: 'modified',
      nodeType: 'paragraph',
      oldNodeJSON: oldParagraph.node.toJSON(),
      newNodeJSON: newParagraph.node.toJSON(),
      oldText: 'foo',
      newText: 'bar',
      pos: 5,
      attrsDiff: null,
    });
    expect(diff.contentDiff.length).toBeGreaterThan(0);
  });

  it('returns a diff when only inline marks change', () => {
    const oldParagraph = createParagraphInfo({
      fullText: 'a',
      text: buildMarkedRuns('a', [{ type: 'bold', attrs: { level: 1 } }], {}, 1),
      node: createParagraphNode({ attrs: { align: 'left' } }),
    });
    const newParagraph = createParagraphInfo({
      fullText: 'a',
      text: buildMarkedRuns('a', [{ type: 'bold', attrs: { level: 2 } }], {}, 1),
      node: createParagraphNode({ attrs: { align: 'left' } }),
    });

    const diff = buildModifiedParagraphDiff(oldParagraph, newParagraph);
    expect(diff).not.toBeNull();
    expect(diff?.attrsDiff).toBeNull();
    expect(diff?.contentDiff).toEqual([
      {
        action: 'modified',
        kind: 'text',
        startPos: 1,
        endPos: 1,
        oldText: 'a',
        newText: 'a',
        runAttrsDiff: null,
        marksDiff: {
          added: [],
          deleted: [],
          modified: [
            {
              name: 'bold',
              oldAttrs: { level: 1 },
              newAttrs: { level: 2 },
            },
          ],
        },
      },
    ]);
  });

  it('returns null when neither text nor attributes changed', () => {
    const baseParagraph = createParagraphInfo({
      fullText: 'stable',
      node: createParagraphNode({ attrs: { align: 'left' } }),
    });

    expect(buildModifiedParagraphDiff(baseParagraph, baseParagraph)).toBeNull();
  });

  it('returns a diff when only the attributes change', () => {
    const oldParagraph = createParagraphInfo({
      node: createParagraphNode({ attrs: { align: 'left' } }),
    });
    const newParagraph = createParagraphInfo({
      node: createParagraphNode({ attrs: { align: 'right' } }),
    });

    const diff = buildModifiedParagraphDiff(oldParagraph, newParagraph);
    expect(diff).not.toBeNull();
    expect(diff.contentDiff).toEqual([]);
    expect(diff.attrsDiff?.modified).toHaveProperty('align');
    expect(diff.oldNodeJSON).toEqual(oldParagraph.node.toJSON());
    expect(diff.newNodeJSON).toEqual(newParagraph.node.toJSON());
  });
});

describe('canTreatAsModification', () => {
  it('returns true when paragraph comparator matches by paraId', () => {
    const buildInfo = (paraId) => ({
      node: { attrs: { paraId } },
      fullText: 'abc',
    });
    expect(canTreatAsModification(buildInfo('id'), buildInfo('id'))).toBe(true);
  });

  it('returns false for short paragraphs lacking identity signals', () => {
    const a = { node: { attrs: {} }, fullText: 'abc' };
    const b = { node: { attrs: {} }, fullText: 'xyz' };
    expect(canTreatAsModification(a, b)).toBe(false);
  });

  it('returns true when textual similarity exceeds the threshold', () => {
    const a = { node: { attrs: {} }, fullText: 'lorem' };
    const b = { node: { attrs: {} }, fullText: 'loren' };
    expect(canTreatAsModification(a, b)).toBe(true);
  });

  it('returns false when paragraphs are dissimilar', () => {
    const a = { node: { attrs: {} }, fullText: 'lorem ipsum' };
    const b = { node: { attrs: {} }, fullText: 'dolor sit' };
    expect(canTreatAsModification(a, b)).toBe(false);
  });
});
