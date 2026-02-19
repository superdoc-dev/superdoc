import { describe, it, expect } from 'vitest';
import { translator } from './tblLook-translator.js';

describe('w:tblLook translator', () => {
  describe('encode', () => {
    it('converts boolean string values to booleans', () => {
      const result = translator.encode({
        nodes: [
          {
            attributes: {
              'w:firstColumn': '1',
              'w:firstRow': 'true',
              'w:lastColumn': '0',
              'w:lastRow': 'false',
              'w:noHBand': '1',
              'w:noVBand': '0',
              'w:val': 'someValue',
            },
          },
        ],
      });
      expect(result).toEqual({
        firstColumn: true,
        firstRow: true,
        lastColumn: false,
        lastRow: false,
        noHBand: true,
        noVBand: false,
        val: 'someValue',
      });
    });

    it('decodes w:val bitmask into conditional flags', () => {
      const result = translator.encode({
        nodes: [
          {
            attributes: {
              'w:val': '04A0',
            },
          },
        ],
      });

      expect(result).toEqual({
        val: '04A0',
        firstRow: true,
        lastRow: false,
        firstColumn: true,
        lastColumn: false,
        noHBand: false,
        noVBand: true,
      });
    });
  });

  describe('decode', () => {
    it('converts boolean values to "1" and "0" strings', () => {
      const attrs = {
        tblLook: {
          firstColumn: true,
          lastRow: false,
          noHBand: true,
        },
      };
      const { attributes: result } = translator.decode({ node: { attrs } });
      expect(result).toEqual({
        'w:firstColumn': '1',
        'w:noHBand': '1',
        'w:lastRow': '0',
      });
    });

    it('returns undefined if tblLook is an empty object', () => {
      expect(translator.decode({ node: { attrs: { tblLook: {} } } })).toBeUndefined();
    });
  });

  it('has correct metadata', () => {
    expect(translator.xmlName).toBe('w:tblLook');
    expect(translator.sdNodeOrKeyName).toBe('tblLook');
  });
});
