import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../pPr/pPr-translator.js', () => ({
  translator: {
    decode: vi.fn(),
  },
}));

import { generateParagraphProperties } from './generate-paragraph-properties.js';
import { translator as wPPrNodeTranslator } from '../../pPr/pPr-translator.js';

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
    expect(wPPrNodeTranslator.decode).toHaveBeenCalledWith({
      node: {
        ...node,
        attrs: { paragraphProperties: { spacing: { line: 240 } } },
      },
    });
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
});
