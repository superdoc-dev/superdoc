import { describe, it, expect } from 'vitest';
import {
  getParagraphContent,
  shouldProcessEqualAsModification,
  paragraphComparator,
  buildAddedParagraphDiff,
  buildDeletedParagraphDiff,
  buildModifiedParagraphDiff,
  canTreatAsModification,
} from './paragraph-diffing.ts';

const buildRuns = (text, attrs = {}) => text.split('').map((char) => ({ char, runAttrs: attrs, kind: 'text' }));

const createParagraphNode = (overrides = {}) => ({
  type: { name: 'paragraph', ...(overrides.type || {}) },
  attrs: {},
  nodeSize: 5,
  ...overrides,
});

const createParagraphInfo = (overrides = {}) => {
  const fullText = overrides.fullText ?? 'text';
  const textTokens = overrides.text ?? buildRuns(fullText);

  return {
    node: createParagraphNode(overrides.node),
    pos: 0,
    fullText,
    text: textTokens,
    resolvePosition: (idx) => idx,
    ...overrides,
  };
};

const createParagraphWithSegments = (segments, contentSize) => {
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
          callback({ isText: true, text: segment.text }, segment.start);
        } else if (segment.kind === 'leaf') {
          callback({ isLeaf: true, type: { spec: { leafText: segment.leafText } } }, segment.start);
        } else {
          callback(
            {
              isInline: true,
              isLeaf: segment.inlineNode.isLeaf,
              type: { name: segment.inlineNode.typeName, spec: {} },
              attrs: segment.inlineNode.attrs,
            },
            segment.start,
          );
        }
      });
    },
    nodeAt: (pos) => ({ attrs: attrsMap.get(pos) ?? {} }),
  };
};

describe('getParagraphContent', () => {
  it('handles basic text nodes', () => {
    const mockParagraph = createParagraphWithSegments([{ text: 'Hello', start: 0, attrs: { bold: true } }], 5);

    const result = getParagraphContent(mockParagraph);
    expect(result.text).toEqual(buildRuns('Hello', { bold: true }));
    expect(result.resolvePosition(0)).toBe(1);
    expect(result.resolvePosition(4)).toBe(5);
  });

  it('handles leaf nodes with leafText', () => {
    const mockParagraph = createParagraphWithSegments(
      [{ leafText: () => 'Leaf', start: 0, attrs: { type: 'leaf' } }],
      4,
    );

    const result = getParagraphContent(mockParagraph);
    expect(result.text).toEqual(buildRuns('Leaf', { type: 'leaf' }));
    expect(result.resolvePosition(0)).toBe(1);
    expect(result.resolvePosition(3)).toBe(4);
  });

  it('handles mixed content', () => {
    const mockParagraph = createParagraphWithSegments([
      { text: 'Hello', start: 0, attrs: { bold: true } },
      { leafText: () => 'Leaf', start: 5, attrs: { italic: true } },
    ]);

    const result = getParagraphContent(mockParagraph);
    expect(result.text).toEqual([...buildRuns('Hello', { bold: true }), ...buildRuns('Leaf', { italic: true })]);
    expect(result.resolvePosition(0)).toBe(1);
    expect(result.resolvePosition(5)).toBe(6);
    expect(result.resolvePosition(9)).toBe(10);
  });

  it('handles empty content', () => {
    const mockParagraph = createParagraphWithSegments([], 0);

    const result = getParagraphContent(mockParagraph);
    expect(result.text).toEqual([]);
    expect(result.resolvePosition(0)).toBe(1);
  });

  it('includes inline nodes that have no textual content', () => {
    const inlineAttrs = { kind: 'tab', width: 120 };
    const mockParagraph = createParagraphWithSegments([
      { inlineNode: { typeName: 'tab', attrs: inlineAttrs }, start: 0 },
      { text: 'Text', start: 1, attrs: { bold: false } },
    ]);

    const result = getParagraphContent(mockParagraph);
    expect(result.text[0]).toEqual({
      kind: 'inlineNode',
      node: {
        attrs: {
          kind: 'tab',
          width: 120,
        },
        isInline: true,
        isLeaf: true,
        type: {
          name: 'tab',
          spec: {},
        },
      },
      nodeType: 'tab',
    });
    expect(result.text.slice(1)).toEqual(buildRuns('Text', { bold: false }));
    expect(result.resolvePosition(0)).toBe(1);
    expect(result.resolvePosition(1)).toBe(2);
  });

  it('applies paragraph position offsets to the resolver', () => {
    const mockParagraph = createParagraphWithSegments([{ text: 'Nested', start: 0 }], 6);

    const result = getParagraphContent(mockParagraph, 10);
    expect(result.text).toEqual(buildRuns('Nested', {}));
    expect(result.resolvePosition(0)).toBe(11);
    expect(result.resolvePosition(6)).toBe(17);
  });

  it('returns null when index is outside the flattened text array', () => {
    const mockParagraph = createParagraphWithSegments([{ text: 'Hi', start: 0 }], 2);
    const { resolvePosition } = getParagraphContent(mockParagraph);

    expect(resolvePosition(-1)).toBeNull();
    expect(resolvePosition(3)).toBeNull();
    expect(resolvePosition(2)).toBe(3);
  });
});

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
    const previousNode = { pos: 10, node: { nodeSize: 4 } };

    expect(buildAddedParagraphDiff(paragraph, previousNode)).toEqual({
      action: 'added',
      nodeType: 'paragraph',
      node: paragraph.node,
      text: 'Hello',
      pos: 14,
    });
  });

  it('builds deletion payloads reflecting the original paragraph context', () => {
    const paragraph = createParagraphInfo({ pos: 7, fullText: 'Old text' });

    expect(buildDeletedParagraphDiff(paragraph)).toEqual({
      action: 'deleted',
      nodeType: 'paragraph',
      node: paragraph.node,
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
      oldText: 'foo',
      newText: 'bar',
      pos: 5,
      attrsDiff: null,
    });
    expect(diff.contentDiff.length).toBeGreaterThan(0);
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
