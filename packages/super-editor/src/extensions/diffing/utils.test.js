import { extractParagraphs, getTextContent } from './utils';

const buildRuns = (text, attrs = {}) => text.split('').map((char) => ({ char, runAttrs: JSON.stringify(attrs) }));

const createParagraphNode = (text, attrs = {}) => ({
  type: { name: 'paragraph' },
  attrs,
  textContent: text,
  content: { size: text.length },
  nodesBetween: (from, to, callback) => {
    callback({ isText: true, text }, 0);
  },
  nodeAt: () => ({ attrs }),
});

const createParagraphWithSegments = (segments, contentSize) => {
  const computedSegments = segments.map((segment) => {
    const segmentText = segment.text ?? segment.leafText();
    const length = segmentText.length;
    return {
      ...segment,
      length,
      start: segment.start ?? 0,
      attrs: segment.attrs ?? {},
    };
  });
  const size =
    contentSize ?? computedSegments.reduce((max, segment) => Math.max(max, segment.start + segment.length), 0);
  const attrsMap = new Map();
  computedSegments.forEach((segment) => {
    attrsMap.set(segment.start - 1, segment.attrs);
  });

  return {
    content: { size },
    nodesBetween: (from, to, callback) => {
      computedSegments.forEach((segment) => {
        if (segment.text != null) {
          callback({ isText: true, text: segment.text }, segment.start);
        } else {
          callback({ isLeaf: true, type: { spec: { leafText: segment.leafText } } }, segment.start);
        }
      });
    },
    nodeAt: (pos) => ({ attrs: attrsMap.get(pos) ?? {} }),
  };
};

describe('extractParagraphs', () => {
  it('collects paragraph nodes in document order', () => {
    const firstParagraph = createParagraphNode('First paragraph', { paraId: 'para-1' });
    const nonParagraph = {
      type: { name: 'heading' },
      attrs: { paraId: 'heading-1' },
    };
    const secondParagraph = createParagraphNode('Second paragraph', { paraId: 'para-2' });
    const pmDoc = {
      descendants: (callback) => {
        callback(firstParagraph, 0);
        callback(nonParagraph, 5);
        callback(secondParagraph, 10);
      },
    };

    const paragraphs = extractParagraphs(pmDoc);

    expect(paragraphs).toHaveLength(2);
    expect(paragraphs[0]).toMatchObject({ node: firstParagraph, pos: 0 });
    expect(paragraphs[0].text).toEqual(buildRuns('First paragraph', { paraId: 'para-1' }));
    expect(paragraphs[0].fullText).toBe('First paragraph');
    expect(paragraphs[1]).toMatchObject({ node: secondParagraph, pos: 10 });
    expect(paragraphs[1].text).toEqual(buildRuns('Second paragraph', { paraId: 'para-2' }));
  });

  it('includes position resolvers for paragraphs with missing IDs', () => {
    const firstParagraph = createParagraphNode('Anonymous first');
    const secondParagraph = createParagraphNode('Anonymous second');
    const pmDoc = {
      descendants: (callback) => {
        callback(firstParagraph, 2);
        callback(secondParagraph, 8);
      },
    };

    const paragraphs = extractParagraphs(pmDoc);

    expect(paragraphs).toHaveLength(2);
    expect(paragraphs[0].pos).toBe(2);
    expect(paragraphs[1].pos).toBe(8);
    expect(paragraphs[0].resolvePosition(0)).toBe(3);
    expect(paragraphs[1].resolvePosition(4)).toBe(13);
  });
});

describe('getTextContent', () => {
  it('handles basic text nodes', () => {
    const mockParagraph = createParagraphWithSegments([{ text: 'Hello', start: 0, attrs: { bold: true } }], 5);

    const result = getTextContent(mockParagraph);
    expect(result.text).toEqual(buildRuns('Hello', { bold: true }));
    expect(result.resolvePosition(0)).toBe(1);
    expect(result.resolvePosition(4)).toBe(5);
  });

  it('handles leaf nodes with leafText', () => {
    const mockParagraph = createParagraphWithSegments(
      [{ leafText: () => 'Leaf', start: 0, attrs: { type: 'leaf' } }],
      4,
    );

    const result = getTextContent(mockParagraph);
    expect(result.text).toEqual(buildRuns('Leaf', { type: 'leaf' }));
    expect(result.resolvePosition(0)).toBe(1);
    expect(result.resolvePosition(3)).toBe(4);
  });

  it('handles mixed content', () => {
    const mockParagraph = createParagraphWithSegments([
      { text: 'Hello', start: 0, attrs: { bold: true } },
      { leafText: () => 'Leaf', start: 5, attrs: { italic: true } },
    ]);

    const result = getTextContent(mockParagraph);
    expect(result.text).toEqual([...buildRuns('Hello', { bold: true }), ...buildRuns('Leaf', { italic: true })]);
    expect(result.resolvePosition(0)).toBe(1);
    expect(result.resolvePosition(5)).toBe(6);
    expect(result.resolvePosition(9)).toBe(10);
  });

  it('handles empty content', () => {
    const mockParagraph = createParagraphWithSegments([], 0);

    const result = getTextContent(mockParagraph);
    expect(result.text).toEqual([]);
    expect(result.resolvePosition(0)).toBe(1);
  });

  it('applies paragraph position offsets to the resolver', () => {
    const mockParagraph = createParagraphWithSegments([{ text: 'Nested', start: 0 }], 6);

    const result = getTextContent(mockParagraph, 10);
    expect(result.text).toEqual(buildRuns('Nested', {}));
    expect(result.resolvePosition(0)).toBe(11);
    expect(result.resolvePosition(6)).toBe(17);
  });
});
