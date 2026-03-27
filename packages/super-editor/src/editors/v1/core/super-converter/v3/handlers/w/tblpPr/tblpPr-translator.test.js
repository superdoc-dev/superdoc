import { describe, it, expect } from 'vitest';
import { translator } from './tblpPr-translator.js';

describe('w:tblpPr translator', () => {
  describe('encode', () => {
    it('extracts and maps string attributes correctly', () => {
      const result = translator.encode({
        nodes: [
          {
            attributes: {
              'w:leftFromText': '100',
              'w:horzAnchor': 'margin',
            },
          },
        ],
      });
      expect(result).toEqual({
        leftFromText: 100,
        horzAnchor: 'margin',
      });
    });

    it('extracts, parses, and maps integer attributes correctly', () => {
      const result = translator.encode({
        nodes: [
          {
            attributes: {
              'w:tblpX': '123',
              'w:tblpY': '456',
              'w:tblpXSpec': 'left',
            },
          },
        ],
      });
      expect(result).toEqual({
        tblpX: 123,
        tblpY: 456,
        tblpXSpec: 'left',
      });
    });

    it('returns undefined if no attributes are present', () => {
      const result = translator.encode({ nodes: [{ attributes: {} }] });
      expect(result).toBeUndefined();
    });

    it('returns undefined if all attributes are falsy', () => {
      const result = translator.encode({
        nodes: [
          {
            attributes: {
              'w:leftFromText': '',
            },
          },
        ],
      });
      expect(result).toBeUndefined();
    });
  });

  describe('decode', () => {
    it('creates a w:tblpPr element with string attributes', () => {
      const attrs = {
        floatingTableProperties: {
          leftFromText: '100',
          horzAnchor: 'margin',
        },
      };
      const { attributes: result } = translator.decode({ node: { attrs } });
      expect(result).toEqual({
        'w:leftFromText': '100',
        'w:horzAnchor': 'margin',
      });
    });

    it('creates a w:tblpPr element with integer attributes converted to string', () => {
      const attrs = {
        floatingTableProperties: {
          tblpX: 123,
          tblpY: 456,
          tblpXSpec: 'left',
        },
      };
      const { attributes: result } = translator.decode({ node: { attrs } });
      expect(result).toEqual({
        'w:tblpX': '123',
        'w:tblpY': '456',
        'w:tblpXSpec': 'left',
      });
    });

    it('returns undefined if floatingTableProperties property is missing', () => {
      expect(translator.decode({ node: { attrs: {} } })).toBeUndefined();
    });

    it('returns undefined if floatingTableProperties property is empty', () => {
      expect(translator.decode({ node: { attrs: { floatingTableProperties: {} } } })).toBeUndefined();
    });
  });

  it('has correct metadata', () => {
    expect(translator.xmlName).toBe('w:tblpPr');
    expect(translator.sdNodeOrKeyName).toBe('floatingTableProperties');
  });
});
