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

  describe('lastRow / lastColumn roundtrip', () => {
    it('roundtrips explicit lastRow=true', () => {
      const encoded = translator.encode({
        nodes: [{ attributes: { 'w:lastRow': '1' } }],
      });
      expect(encoded.lastRow).toBe(true);

      const { attributes: decoded } = translator.decode({
        node: { attrs: { tblLook: { lastRow: true } } },
      });
      expect(decoded['w:lastRow']).toBe('1');
    });

    it('roundtrips explicit lastRow=false', () => {
      const encoded = translator.encode({
        nodes: [{ attributes: { 'w:lastRow': '0' } }],
      });
      expect(encoded.lastRow).toBe(false);

      const { attributes: decoded } = translator.decode({
        node: { attrs: { tblLook: { lastRow: false } } },
      });
      expect(decoded['w:lastRow']).toBe('0');
    });

    it('roundtrips explicit lastColumn=true', () => {
      const encoded = translator.encode({
        nodes: [{ attributes: { 'w:lastColumn': '1' } }],
      });
      expect(encoded.lastColumn).toBe(true);

      const { attributes: decoded } = translator.decode({
        node: { attrs: { tblLook: { lastColumn: true } } },
      });
      expect(decoded['w:lastColumn']).toBe('1');
    });

    it('roundtrips explicit lastColumn=false', () => {
      const encoded = translator.encode({
        nodes: [{ attributes: { 'w:lastColumn': '0' } }],
      });
      expect(encoded.lastColumn).toBe(false);

      const { attributes: decoded } = translator.decode({
        node: { attrs: { tblLook: { lastColumn: false } } },
      });
      expect(decoded['w:lastColumn']).toBe('0');
    });

    it('decodes lastRow and lastColumn from w:val fallback when attrs absent', () => {
      // 0x05E0 = firstRow(0x20) + lastRow(0x40) + firstColumn(0x80) + lastColumn(0x100) + noVBand(0x400)
      const encoded = translator.encode({
        nodes: [{ attributes: { 'w:val': '05E0' } }],
      });
      expect(encoded.lastRow).toBe(true);
      expect(encoded.lastColumn).toBe(true);
    });
  });

  it('has correct metadata', () => {
    expect(translator.xmlName).toBe('w:tblLook');
    expect(translator.sdNodeOrKeyName).toBe('tblLook');
  });
});
