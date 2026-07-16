import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../pPr/pPr-translator.js', () => ({
  translator: {
    decode: vi.fn(),
  },
}));

import { generateParagraphProperties } from './generate-paragraph-properties.js';
import { translator as wPPrNodeTranslator } from '../../pPr/pPr-translator.js';
import { TrackFormatMarkName } from '@extensions/track-changes/constants.js';

describe('generateParagraphProperties', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deep clones paragraphProperties before decoding', () => {
    const paragraphProperties = {
      indent: { left: 5, right: 10 },
    };
    const node = { type: 'paragraph', attrs: { paragraphProperties } };

    wPPrNodeTranslator.decode.mockImplementation(({ node: decodeNode }) => {
      decodeNode.attrs.paragraphProperties.indent.left = 99;
      return { type: 'element', name: 'w:pPr', elements: [] };
    });

    generateParagraphProperties({ node });

    const clonedProperties = wPPrNodeTranslator.decode.mock.calls[0][0].node.attrs.paragraphProperties;

    expect(clonedProperties).not.toBe(paragraphProperties);
    expect(clonedProperties.indent).not.toBe(paragraphProperties.indent);
    expect(paragraphProperties.indent.left).toBe(5);
  });

  it('returns decoder output when no section properties are provided', () => {
    const pPrNode = { type: 'element', name: 'w:pPr', elements: [] };
    wPPrNodeTranslator.decode.mockReturnValue(pPrNode);
    const node = {
      type: 'paragraph',
      attrs: { paragraphProperties: { spacing: { line: 240 } } },
    };

    const result = generateParagraphProperties({ node });

    expect(result).toBe(pPrNode);
    expect(wPPrNodeTranslator.decode).toHaveBeenCalledTimes(1);
    // objectContaining: the pPr decode also receives the Word-id allocator
    // threading (converter + currentPartPath); this test only cares about node.
    expect(wPPrNodeTranslator.decode).toHaveBeenCalledWith(
      expect.objectContaining({
        node: {
          ...node,
          attrs: { paragraphProperties: { spacing: { line: 240 } } },
        },
      }),
    );
  });

  it('appends sectPr to decoded paragraph properties', () => {
    const existingElement = { name: 'w:jc' };
    const sectPr = { name: 'w:sectPr' };
    const decoded = { type: 'element', name: 'w:pPr', elements: [existingElement] };
    wPPrNodeTranslator.decode.mockReturnValue(decoded);
    const node = { type: 'paragraph', attrs: { paragraphProperties: { sectPr } } };

    const result = generateParagraphProperties({ node });

    expect(result.elements).toHaveLength(2);
    expect(result.elements[0]).toBe(existingElement);
    expect(result.elements[1]).toBe(sectPr);
  });

  it('inserts sectPr before pPrChange to satisfy CT_PPr ordering', () => {
    const jc = { name: 'w:jc' };
    const pPrChange = { name: 'w:pPrChange' };
    const sectPr = { name: 'w:sectPr' };
    const decoded = { type: 'element', name: 'w:pPr', elements: [jc, pPrChange] };
    wPPrNodeTranslator.decode.mockReturnValue(decoded);
    const node = { type: 'paragraph', attrs: { paragraphProperties: { sectPr } } };

    const result = generateParagraphProperties({ node });

    expect(result.elements).toEqual([jc, sectPr, pPrChange]);
  });

  it('creates paragraph properties when decoder returns nothing but sectPr exists', () => {
    wPPrNodeTranslator.decode.mockReturnValue(undefined);
    const sectPr = { name: 'w:sectPr', elements: [] };
    const node = { type: 'paragraph', attrs: { paragraphProperties: { sectPr } } };

    const result = generateParagraphProperties({ node });

    expect(result).toEqual({
      type: 'element',
      name: 'w:pPr',
      elements: [sectPr],
    });
  });

  it('preserves runProperties when runPropertiesInlineKeys is missing for backward compatibility', () => {
    const paragraphProperties = { spacing: { line: 240 }, runProperties: { bold: true } };
    const node = { type: 'paragraph', attrs: { paragraphProperties } };
    wPPrNodeTranslator.decode.mockImplementation(({ node: decodeNode }) => {
      expect(decodeNode.attrs.paragraphProperties.runProperties).toEqual({ bold: true });
      return { type: 'element', name: 'w:pPr', elements: [] };
    });

    generateParagraphProperties({ node });

    expect(wPPrNodeTranslator.decode).toHaveBeenCalledWith(
      expect.objectContaining({
        node: expect.objectContaining({
          attrs: expect.objectContaining({
            paragraphProperties: expect.objectContaining({ runProperties: { bold: true } }),
          }),
        }),
      }),
    );
  });

  it('strips runProperties when runPropertiesInlineKeys is empty array', () => {
    const paragraphProperties = {
      spacing: { line: 240 },
      runProperties: { bold: true },
      runPropertiesInlineKeys: [],
    };
    const node = { type: 'paragraph', attrs: { paragraphProperties } };
    wPPrNodeTranslator.decode.mockImplementation(({ node: decodeNode }) => {
      expect(decodeNode.attrs.paragraphProperties.runProperties).toBeUndefined();
      return { type: 'element', name: 'w:pPr', elements: [] };
    });

    generateParagraphProperties({ node });

    expect(wPPrNodeTranslator.decode).toHaveBeenCalledWith(
      expect.objectContaining({
        node: expect.objectContaining({
          attrs: expect.objectContaining({
            paragraphProperties: expect.not.objectContaining({ runProperties: expect.anything() }),
          }),
        }),
      }),
    );
  });

  it('passes filtered runProperties when runPropertiesInlineKeys is set and non-empty', () => {
    const paragraphProperties = {
      spacing: { line: 240 },
      runProperties: { bold: true, color: 'FF0000' },
      runPropertiesInlineKeys: ['bold'],
    };
    const node = { type: 'paragraph', attrs: { paragraphProperties } };
    wPPrNodeTranslator.decode.mockImplementation(({ node: decodeNode }) => {
      expect(decodeNode.attrs.paragraphProperties.runProperties).toEqual({ bold: true });
      return { type: 'element', name: 'w:pPr', elements: [] };
    });

    generateParagraphProperties({ node });

    expect(wPPrNodeTranslator.decode).toHaveBeenCalledWith(
      expect.objectContaining({
        node: expect.objectContaining({
          attrs: expect.objectContaining({
            paragraphProperties: expect.objectContaining({ runProperties: { bold: true } }),
          }),
        }),
      }),
    );
  });

  it('strips runProperties when runPropertiesInlineKeys has no matching keys', () => {
    const paragraphProperties = {
      runProperties: { color: 'FF0000' },
      runPropertiesInlineKeys: ['bold'],
    };
    const node = { type: 'paragraph', attrs: { paragraphProperties } };
    wPPrNodeTranslator.decode.mockImplementation(({ node: decodeNode }) => {
      expect(decodeNode.attrs.paragraphProperties.runProperties).toBeUndefined();
      return { type: 'element', name: 'w:pPr', elements: [] };
    });

    generateParagraphProperties({ node });
  });

  it('adds only a Word-visible paragraph mark insertion for paragraphSplit tracking', () => {
    const node = {
      type: 'paragraph',
      attrs: { paragraphProperties: {} },
      content: [
        {
          type: 'text',
          text: 'llo',
          marks: [
            {
              type: TrackFormatMarkName,
              attrs: {
                id: 'logical-change-id',
                author: 'Reviewer',
                date: '2026-06-01T17:00:00Z',
                before: [{ type: 'paragraphSplit', attrs: { anchor: 'inserted', offset: 2 } }],
                after: [{ type: 'paragraphSplit', attrs: { anchor: 'inserted' } }],
              },
            },
          ],
        },
      ],
    };
    wPPrNodeTranslator.decode.mockImplementation(({ node: decodeNode }) => {
      expect(decodeNode.attrs.paragraphProperties.change).toBeUndefined();
      return {
        type: 'element',
        name: 'w:pPr',
        elements: [],
      };
    });

    const result = generateParagraphProperties({
      node,
    });

    expect(result.elements).toEqual([
      {
        type: 'element',
        name: 'w:rPr',
        elements: [
          {
            type: 'element',
            name: 'w:ins',
            attributes: {
              'w:id': expect.stringMatching(/^\d+$/),
              'w:author': 'Reviewer',
              'w:date': '2026-06-01T17:00:00Z',
            },
          },
        ],
      },
    ]);
    expect(result.elements[0].elements[0].attributes['w:id']).toMatch(/^\d+$/);
  });

  it('uses the Word revision id allocator for paragraphSplit export elements', () => {
    const allocate = vi.fn(() => '12');
    const node = {
      type: 'paragraph',
      attrs: { paragraphProperties: {} },
      content: [
        {
          type: 'text',
          text: 'Beta',
          marks: [
            {
              type: TrackFormatMarkName,
              attrs: {
                id: 'logical-change-id',
                sourceId: '',
                author: 'Reviewer',
                date: '2026-06-01T17:00:00Z',
                before: [{ type: 'paragraphSplit', attrs: { anchor: 'inserted', offset: 2 } }],
                after: [{ type: 'paragraphSplit', attrs: { anchor: 'inserted' } }],
              },
            },
          ],
        },
      ],
    };
    wPPrNodeTranslator.decode.mockImplementation(({ node: decodeNode }) => {
      expect(decodeNode.attrs.paragraphProperties.change).toBeUndefined();
      return {
        type: 'element',
        name: 'w:pPr',
        elements: [],
      };
    });

    const result = generateParagraphProperties({
      node,
      converter: { wordIdAllocator: { allocate } },
      currentPartPath: 'word/header1.xml',
    });

    expect(allocate).toHaveBeenCalledTimes(1);
    expect(allocate).toHaveBeenCalledWith({
      partPath: 'word/header1.xml',
      sourceId: '',
      logicalId: 'logical-change-id',
    });
    expect(result.elements[0].elements[0].attributes['w:id']).toBe('12');
  });

  it('inserts a new paragraph-mark w:rPr after paragraph properties and before w:pPrChange', () => {
    const pStyle = { type: 'element', name: 'w:pStyle' };
    const spacing = { type: 'element', name: 'w:spacing' };
    const pPrChange = { type: 'element', name: 'w:pPrChange' };
    const node = {
      type: 'paragraph',
      attrs: { paragraphProperties: {} },
      content: [
        {
          type: 'text',
          text: 'llo',
          marks: [
            {
              type: TrackFormatMarkName,
              attrs: {
                id: 'logical-change-id',
                author: 'Reviewer',
                date: '2026-06-01T17:00:00Z',
                before: [{ type: 'paragraphSplit', attrs: { anchor: 'inserted', offset: 2 } }],
                after: [{ type: 'paragraphSplit', attrs: { anchor: 'inserted' } }],
              },
            },
          ],
        },
      ],
    };
    wPPrNodeTranslator.decode.mockReturnValue({
      type: 'element',
      name: 'w:pPr',
      elements: [pStyle, spacing, pPrChange],
    });

    const result = generateParagraphProperties({ node });

    const names = result.elements.map((element) => element.name);
    expect(names).toEqual(['w:pStyle', 'w:spacing', 'w:rPr', 'w:pPrChange']);
    const runProperties = result.elements[2];
    expect(runProperties.elements[0].name).toBe('w:ins');
  });

  it('inserts a new paragraph-mark w:rPr before terminal w:sectPr and w:pPrChange', () => {
    const pStyle = { type: 'element', name: 'w:pStyle' };
    const spacing = { type: 'element', name: 'w:spacing' };
    const sectPr = { type: 'element', name: 'w:sectPr' };
    const pPrChange = { type: 'element', name: 'w:pPrChange' };
    const node = {
      type: 'paragraph',
      attrs: { paragraphProperties: {} },
      content: [
        {
          type: 'text',
          text: 'llo',
          marks: [
            {
              type: TrackFormatMarkName,
              attrs: {
                id: 'logical-change-id',
                author: 'Reviewer',
                date: '2026-06-01T17:00:00Z',
                before: [{ type: 'paragraphSplit', attrs: { anchor: 'inserted', offset: 2 } }],
                after: [{ type: 'paragraphSplit', attrs: { anchor: 'inserted' } }],
              },
            },
          ],
        },
      ],
    };
    wPPrNodeTranslator.decode.mockReturnValue({
      type: 'element',
      name: 'w:pPr',
      elements: [pStyle, spacing, sectPr, pPrChange],
    });

    const result = generateParagraphProperties({ node });

    const names = result.elements.map((element) => element.name);
    expect(names).toEqual(['w:pStyle', 'w:spacing', 'w:rPr', 'w:sectPr', 'w:pPrChange']);
  });

  it('emits the paragraph-split w:ins when a marked child precedes an unmarked child during traversal', () => {
    const paragraphSplitMark = {
      type: TrackFormatMarkName,
      attrs: {
        id: 'logical-change-id',
        author: 'Reviewer',
        date: '2026-06-01T17:00:00Z',
        before: [{ type: 'paragraphSplit', attrs: { anchor: 'inserted', offset: 2 } }],
        after: [{ type: 'paragraphSplit', attrs: { anchor: 'inserted' } }],
      },
    };
    // PM-like node: descendants() visits a marked child, then a later unmarked child.
    // A non-sticky search would clear the found mark on the second visit.
    const node = {
      type: 'paragraph',
      attrs: { paragraphProperties: {} },
      marks: [],
      descendants(callback) {
        const markedChild = { marks: [paragraphSplitMark] };
        const unmarkedChild = { marks: [] };
        callback(markedChild);
        // ProseMirror's descendants()/nodesBetween() return value controls
        // whether the current child is descended into; it does not stop later
        // siblings from being visited.
        callback(unmarkedChild);
      },
    };
    wPPrNodeTranslator.decode.mockReturnValue({ type: 'element', name: 'w:pPr', elements: [] });

    const result = generateParagraphProperties({ node });

    expect(result.elements).toHaveLength(1);
    expect(result.elements[0].name).toBe('w:rPr');
    expect(result.elements[0].elements[0].name).toBe('w:ins');
  });

  it('does not add paragraphSplit export elements for ordinary tracked formatting', () => {
    const node = {
      type: 'paragraph',
      attrs: { paragraphProperties: {} },
      content: [
        {
          type: 'text',
          text: 'Hello',
          marks: [
            {
              type: TrackFormatMarkName,
              attrs: {
                id: 'format-change-id',
                before: [{ type: 'bold', attrs: { value: true } }],
                after: [],
              },
            },
          ],
        },
      ],
    };
    wPPrNodeTranslator.decode.mockImplementation(({ node: decodeNode }) => {
      expect(decodeNode.attrs.paragraphProperties.change).toBeUndefined();
      return { type: 'element', name: 'w:pPr', elements: [] };
    });

    generateParagraphProperties({ node });
  });
});
