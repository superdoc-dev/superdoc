import { extractParagraphs, getTextContent } from './utils';

/**
 * Creates a lightweight mock paragraph node for tests.
 * @param {string} text
 * @param {Record<string, any>} [attrs={}]
 * @returns {object}
 */
const createParagraphNode = (text, attrs = {}) => ({
  type: { name: 'paragraph' },
  attrs,
  textContent: text,
  content: { size: text.length },
  nodesBetween: (from, to, callback) => {
    callback({ isText: true, text }, 0);
  },
});

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
    expect(paragraphs[0]).toMatchObject({ node: firstParagraph, pos: 0, text: 'First paragraph' });
    expect(paragraphs[1]).toMatchObject({ node: secondParagraph, pos: 10, text: 'Second paragraph' });
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
  it('Handles basic text nodes', () => {
    const mockParagraph = {
      content: {
        size: 5,
      },
      nodesBetween: (from, to, callback) => {
        callback({ isText: true, text: 'Hello' }, 0);
      },
    };

    const result = getTextContent(mockParagraph);
    expect(result.text).toBe('Hello');
    expect(result.resolvePosition(0)).toBe(1);
    expect(result.resolvePosition(4)).toBe(5);
  });

  it('Handles leaf nodes with leafText', () => {
    const mockParagraph = {
      content: {
        size: 4,
      },
      nodesBetween: (from, to, callback) => {
        callback({ isLeaf: true, type: { spec: { leafText: () => 'Leaf' } } }, 0);
      },
    };

    const result = getTextContent(mockParagraph);
    expect(result.text).toBe('Leaf');
    expect(result.resolvePosition(0)).toBe(1);
    expect(result.resolvePosition(3)).toBe(4);
  });

  it('Handles mixed content', () => {
    const mockParagraph = {
      content: {
        size: 9,
      },
      nodesBetween: (from, to, callback) => {
        callback({ isText: true, text: 'Hello' }, 0);
        callback({ isLeaf: true, type: { spec: { leafText: () => 'Leaf' } } }, 5);
      },
    };

    const result = getTextContent(mockParagraph);
    expect(result.text).toBe('HelloLeaf');
    expect(result.resolvePosition(0)).toBe(1);
    expect(result.resolvePosition(5)).toBe(6);
    expect(result.resolvePosition(9)).toBe(10);
  });

  it('Handles empty content', () => {
    const mockParagraph = {
      content: {
        size: 0,
      },
      nodesBetween: () => {},
    };

    const result = getTextContent(mockParagraph);
    expect(result.text).toBe('');
    expect(result.resolvePosition(0)).toBe(1);
  });

  it('Handles nested nodes', () => {
    const mockParagraph = {
      content: {
        size: 6,
      },
      nodesBetween: (from, to, callback) => {
        callback({ isText: true, text: 'Nested' }, 0);
      },
    };

    const result = getTextContent(mockParagraph);
    expect(result.text).toBe('Nested');
    expect(result.resolvePosition(0)).toBe(1);
    expect(result.resolvePosition(6)).toBe(7);
  });
});
