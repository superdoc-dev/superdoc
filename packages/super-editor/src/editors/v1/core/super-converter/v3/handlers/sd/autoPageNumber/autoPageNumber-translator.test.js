// @ts-check
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { config, translator } from './autoPageNumber-translator.js';
import { NodeTranslator } from '../../../node-translator/node-translator.js';
import { processOutputMarks } from '../../../../exporter.js';
import { parseMarks } from './../../../../v2/importer/markImporter.js';

vi.mock('../../../../exporter.js', () => ({
  processOutputMarks: vi.fn(() => []),
}));

vi.mock('./../../../../v2/importer/markImporter.js', () => ({
  parseMarks: vi.fn(() => []),
}));

describe('sd:autoPageNumber translator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('exposes correct config meta', () => {
    expect(config.xmlName).toBe('sd:autoPageNumber');
    expect(config.sdNodeOrKeyName).toBe('page-number');
    expect(config.type).toBe(NodeTranslator.translatorTypes.NODE);
  });

  it('builds NodeTranslator instance', () => {
    expect(translator).toBeInstanceOf(NodeTranslator);
  });

  describe('encode', () => {
    it('encodes a sd:autoPageNumber node and captures marks from rPr', () => {
      const marks = [{ type: 'textStyle', attrs: { fontSize: '12pt' } }];
      vi.mocked(parseMarks).mockReturnValue(marks);

      const params = {
        nodes: [
          {
            name: 'sd:autoPageNumber',
            elements: [
              {
                name: 'w:rPr',
                elements: [{ name: 'w:b' }],
              },
              {
                name: 'w:t',
                elements: [{ type: 'text', text: 'ignored' }],
              },
            ],
          },
        ],
      };

      const result = config.encode(params);

      expect(parseMarks).toHaveBeenCalledTimes(1);
      expect(parseMarks).toHaveBeenCalledWith(params.nodes[0].elements[0]);
      expect(result).toEqual({
        type: 'page-number',
        attrs: {
          marksAsAttrs: marks,
        },
      });
    });

    it('falls back to an empty rPr object when run properties are missing', () => {
      config.encode({
        nodes: [
          {
            name: 'sd:autoPageNumber',
            elements: [],
          },
        ],
      });

      expect(parseMarks).toHaveBeenCalledTimes(1);
      expect(parseMarks).toHaveBeenCalledWith({ elements: [] });
    });
  });

  describe('decode', () => {
    it('decodes a page-number node back into the PAGE field structure', () => {
      const processedMarks = [{ name: 'w:b' }];
      vi.mocked(processOutputMarks).mockReturnValue(processedMarks);

      const node = {
        type: 'page-number',
        attrs: {
          marksAsAttrs: [{ type: 'bold' }],
        },
      };

      const result = config.decode({ node });

      expect(processOutputMarks).toHaveBeenCalledTimes(1);
      expect(processOutputMarks).toHaveBeenCalledWith(node.attrs.marksAsAttrs);
      expect(result).toEqual([
        {
          name: 'w:r',
          elements: [
            {
              name: 'w:rPr',
              elements: processedMarks,
            },
            {
              name: 'w:fldChar',
              attributes: {
                'w:fldCharType': 'begin',
              },
            },
          ],
        },
        {
          name: 'w:r',
          elements: [
            {
              name: 'w:rPr',
              elements: processedMarks,
            },
            {
              name: 'w:instrText',
              attributes: {
                'xml:space': 'preserve',
              },
              elements: [
                {
                  type: 'text',
                  text: ' PAGE',
                },
              ],
            },
          ],
        },
        {
          name: 'w:r',
          elements: [
            {
              name: 'w:rPr',
              elements: processedMarks,
            },
            {
              name: 'w:fldChar',
              attributes: {
                'w:fldCharType': 'separate',
              },
            },
          ],
        },
        {
          name: 'w:r',
          elements: [
            {
              name: 'w:rPr',
              elements: processedMarks,
            },
            {
              name: 'w:fldChar',
              attributes: {
                'w:fldCharType': 'end',
              },
            },
          ],
        },
      ]);
    });

    it('passes an empty marks array to processOutputMarks when marks are missing', () => {
      config.decode({
        node: {
          type: 'page-number',
          attrs: {},
        },
      });

      expect(processOutputMarks).toHaveBeenCalledTimes(1);
      expect(processOutputMarks).toHaveBeenCalledWith([]);
    });
  });
});
