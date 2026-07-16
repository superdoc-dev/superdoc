// @ts-check
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { config, translator } from './sectionPageCount-translator.js';
import { NodeTranslator } from '../../../node-translator/node-translator.js';
import { processOutputMarks } from '../../../../exporter.js';
import { parseMarks } from './../../../../v2/importer/markImporter.js';

vi.mock('../../../../exporter.js', () => ({
  processOutputMarks: vi.fn(() => []),
}));

vi.mock('./../../../../v2/importer/markImporter.js', () => ({
  parseMarks: vi.fn(() => []),
}));

describe('sd:sectionPageCount translator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('exposes correct config meta', () => {
    expect(config.xmlName).toBe('sd:sectionPageCount');
    expect(config.sdNodeOrKeyName).toBe('section-page-count');
    expect(config.type).toBe(NodeTranslator.translatorTypes.NODE);
    expect(translator).toBeInstanceOf(NodeTranslator);
  });

  it('encodes sd:sectionPageCount with marks, instruction, cached text, and page-number formatting attrs', () => {
    const marks = [{ type: 'textStyle', attrs: { fontSize: '12pt' } }];
    vi.mocked(parseMarks).mockReturnValue(marks);

    const result = config.encode({
      nodes: [
        {
          name: 'sd:sectionPageCount',
          attributes: {
            instruction: 'SECTIONPAGES \\# "000"',
            pageNumberFormat: 'decimal',
            pageNumberZeroPadding: 3,
            importedCachedText: 'iv',
          },
          elements: [{ name: 'w:rPr', elements: [{ name: 'w:b' }] }],
        },
      ],
    });

    expect(result).toEqual({
      type: 'section-page-count',
      attrs: {
        marksAsAttrs: marks,
        instruction: 'SECTIONPAGES \\# "000"',
        pageNumberFormat: 'decimal',
        pageNumberZeroPadding: 3,
        importedCachedText: 'iv',
      },
    });
  });

  it('preserves imported instruction and marks SECTIONPAGES dirty on export', () => {
    vi.mocked(processOutputMarks).mockReturnValue([{ name: 'w:b' }]);

    const result = config.decode({
      node: {
        type: 'section-page-count',
        attrs: {
          marksAsAttrs: [{ type: 'bold' }],
          instruction: 'SECTIONPAGES \\* Roman \\* MERGEFORMAT',
          importedCachedText: 'IV',
        },
      },
    });

    expect(result[0].elements[1].attributes).toEqual({ 'w:fldCharType': 'begin', 'w:dirty': 'true' });
    expect(result[1].elements[1].elements[0].text).toBe(' SECTIONPAGES \\* Roman \\* MERGEFORMAT');
    expect(result[3].elements[1].elements[0].text).toBe('IV');
  });

  it('synthesizes SECTIONPAGES switch when only pageNumberFormat is present', () => {
    const result = config.decode({
      node: {
        type: 'section-page-count',
        attrs: {
          pageNumberFormat: 'lowerRoman',
          resolvedText: 'iii',
        },
      },
    });

    expect(result[1].elements[1].elements[0].text).toBe(' SECTIONPAGES \\* roman');
    expect(result[3].elements[1].elements[0].text).toBe('iii');
  });

  it('synthesizes SECTIONPAGES numeric picture switches when only zero-padding attrs are present', () => {
    const result = config.decode({
      node: {
        type: 'section-page-count',
        attrs: {
          pageNumberFormat: 'decimal',
          pageNumberZeroPadding: 3,
          resolvedText: '007',
        },
      },
    });

    expect(result[1].elements[1].elements[0].text).toBe(' SECTIONPAGES \\* Arabic \\# 000');
    expect(result[3].elements[1].elements[0].text).toBe('007');
  });

  it('falls back to plain SECTIONPAGES without instruction or supported format', () => {
    const result = config.decode({
      node: {
        type: 'section-page-count',
        attrs: {},
        content: [{ type: 'text', text: '2' }],
      },
    });

    expect(result[1].elements[1].elements[0].text).toBe(' SECTIONPAGES');
    expect(result[3].elements[1].elements[0].text).toBe('2');
  });
});
