// @ts-check
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { config, translator } from './totalPageNumber-translator.js';
import { NodeTranslator } from '../../../node-translator/node-translator.js';
import { processOutputMarks } from '../../../../exporter.js';
import { parseMarks } from './../../../../v2/importer/markImporter.js';

vi.mock('../../../../exporter.js', () => ({
  processOutputMarks: vi.fn(() => []),
}));

vi.mock('./../../../../v2/importer/markImporter.js', () => ({
  parseMarks: vi.fn(() => []),
}));

vi.mock('../build-complex-field-runs.js', async (importOriginal) => {
  const actual = await importOriginal();
  return actual;
});

describe('sd:totalPageNumber translator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('exposes correct config meta', () => {
    expect(config.xmlName).toBe('sd:totalPageNumber');
    expect(config.sdNodeOrKeyName).toBe('total-page-number');
    expect(config.type).toBe(NodeTranslator.translatorTypes.NODE);
  });

  it('builds NodeTranslator instance', () => {
    expect(translator).toBeInstanceOf(NodeTranslator);
  });

  describe('encode', () => {
    it('encodes a sd:totalPageNumber node capturing marks from rPr', () => {
      const marks = [{ type: 'textStyle', attrs: { fontSize: '16pt' } }];
      vi.mocked(parseMarks).mockReturnValue(marks);

      const params = {
        nodes: [
          {
            name: 'sd:totalPageNumber',
            elements: [
              {
                name: 'w:rPr',
                elements: [{ name: 'w:i' }],
              },
            ],
          },
        ],
      };

      const result = config.encode(params);

      expect(parseMarks).toHaveBeenCalledTimes(1);
      expect(parseMarks).toHaveBeenCalledWith(params.nodes[0].elements[0]);
      expect(result).toEqual({
        type: 'total-page-number',
        attrs: {
          marksAsAttrs: marks,
          importedCachedText: null,
        },
      });
    });

    it('preserves importedCachedText from preprocessor attributes', () => {
      vi.mocked(parseMarks).mockReturnValue([]);

      const result = config.encode({
        nodes: [
          {
            name: 'sd:totalPageNumber',
            attributes: { importedCachedText: '5' },
            elements: [],
          },
        ],
      });

      expect(result.attrs.importedCachedText).toBe('5');
    });

    it('falls back to an empty rPr object when run properties are missing', () => {
      config.encode({
        nodes: [
          {
            name: 'sd:totalPageNumber',
            elements: [],
          },
        ],
      });

      expect(parseMarks).toHaveBeenCalledTimes(1);
      expect(parseMarks).toHaveBeenCalledWith({ elements: [] });
    });
  });

  describe('decode', () => {
    it('marks NUMPAGES dirty when no cache map is provided (non-paginated)', () => {
      vi.mocked(processOutputMarks).mockReturnValue([{ name: 'w:u' }]);

      const node = {
        type: 'total-page-number',
        attrs: { marksAsAttrs: [{ type: 'underline' }] },
        content: [{ type: 'text', text: '5' }],
      };

      const result = config.decode({ node });

      expect(result).toHaveLength(5);
      expect(result[0].elements[1].attributes).toEqual({
        'w:fldCharType': 'begin',
        'w:dirty': 'true',
      });
      // Cached text from node content
      expect(result[3].elements[1].elements[0].text).toBe('5');
    });

    it('omits w:dirty when cache map has a fresh NUMPAGES value (paginated)', () => {
      vi.mocked(processOutputMarks).mockReturnValue([]);

      const cacheMap = new Map([['NUMPAGES', '12']]);
      const node = {
        type: 'total-page-number',
        attrs: {},
        content: [{ type: 'text', text: '5' }],
      };

      const result = config.decode({ node, statFieldCacheMap: cacheMap });

      expect(result).toHaveLength(5);
      // Begin run should NOT have w:dirty
      expect(result[0].elements[1].attributes).toEqual({
        'w:fldCharType': 'begin',
      });
      // Cached text should come from the cache map, not node content
      expect(result[3].elements[1].elements[0].text).toBe('12');
    });

    it('falls back to resolvedText when cache map is absent', () => {
      vi.mocked(processOutputMarks).mockReturnValue([]);

      const node = {
        type: 'total-page-number',
        attrs: { resolvedText: '8', importedCachedText: '3' },
      };

      const result = config.decode({ node });

      // resolvedText takes priority over importedCachedText
      expect(result[3].elements[1].elements[0].text).toBe('8');
    });

    it('falls back to importedCachedText when no resolvedText or cache map', () => {
      vi.mocked(processOutputMarks).mockReturnValue([]);

      const node = {
        type: 'total-page-number',
        attrs: { importedCachedText: '3' },
      };

      const result = config.decode({ node });

      expect(result[3].elements[1].elements[0].text).toBe('3');
    });

    it('produces a valid 5-run structure with empty text when all fallbacks are empty', () => {
      vi.mocked(processOutputMarks).mockReturnValue([]);

      const result = config.decode({
        node: {
          type: 'total-page-number',
          attrs: {},
        },
      });

      expect(result).toHaveLength(5);
      expect(result[0].elements[1].attributes['w:fldCharType']).toBe('begin');
      expect(result[3].elements[1].name).toBe('w:t');
      expect(result[3].elements[1].elements[0].text).toBe('');
      expect(result[4].elements[1].attributes['w:fldCharType']).toBe('end');
    });
  });
});
