import { describe, it, expect } from 'vitest';
import { translator } from './cnfStyle-translator.js';

describe('w:cnfStyle translator', () => {
  describe('encode', () => {
    it('converts various truthy and falsy string values to booleans', () => {
      const result = translator.encode({
        nodes: [
          {
            attributes: {
              'w:evenHBand': '1',
              'w:evenVBand': 'true',
              'w:firstColumn': '0',
              'w:firstRow': 'false',
              'w:lastColumn': '1',
              'w:oddHBand': 'something-else',
            },
          },
        ],
      });
      expect(result).toEqual({
        evenHBand: true,
        evenVBand: true,
        firstColumn: false,
        firstRow: false,
        lastColumn: true,
        oddHBand: false,
      });
    });

    it('returns undefined if there are no attributes', () => {
      const result = translator.encode({ nodes: [{ attributes: {} }] });
      expect(result).toBeUndefined();
    });
  });

  describe('decode', () => {
    it('converts boolean values to "1" and "0" strings', () => {
      const attrs = {
        cnfStyle: {
          evenHBand: true,
          firstColumn: false,
          lastRow: true,
          oddVBand: false,
        },
      };
      const { attributes: result } = translator.decode({ node: { attrs } });
      expect(result).toEqual({
        'w:evenHBand': '1',
        'w:firstColumn': '0',
        'w:lastRow': '1',
        'w:oddVBand': '0',
      });
    });

    it('returns undefined if attrs.cnfStyle is missing', () => {
      expect(translator.decode({ node: { attrs: {} } })).toBeUndefined();
    });

    it('returns undefined if attrs.cnfStyle is empty', () => {
      expect(translator.decode({ node: { attrs: { cnfStyle: {} } } })).toBeUndefined();
    });
  });

  it('has correct metadata', () => {
    expect(translator.xmlName).toBe('w:cnfStyle');
    expect(translator.sdNodeOrKeyName).toBe('cnfStyle');
  });
});
