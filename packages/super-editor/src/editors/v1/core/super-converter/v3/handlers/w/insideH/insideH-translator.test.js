import { describe, it, expect } from 'vitest';
import { translator } from './insideH-translator.js';

describe('w:insideH border translator', () => {
  describe('encode', () => {
    it('encodes a complex <w:insideH> border element correctly', () => {
      const result = translator.encode({
        nodes: [
          {
            attributes: {
              'w:val': 'single',
              'w:color': 'FF0000',
              'w:sz': '8',
              'w:space': '4',
              'w:shadow': '1',
              'w:frame': 'true',
            },
          },
        ],
      });

      expect(result).toEqual({
        val: 'single',
        color: '#FF0000',
        size: 8,
        space: 4,
        shadow: true,
        frame: true,
      });
    });
  });

  describe('decode', () => {
    it('decodes a complex insideH border object correctly', () => {
      const { attributes: result } = translator.decode({
        node: {
          attrs: {
            insideH: {
              val: 'double',
              color: '#00FF00',
              size: 12,
              space: 2,
              shadow: false,
              frame: false,
            },
          },
        },
      });

      expect(result).toEqual({
        'w:val': 'double',
        'w:color': '00FF00',
        'w:sz': '12',
        'w:space': '2',
        'w:shadow': '0',
        'w:frame': '0',
      });
    });
  });

  describe('metadata', () => {
    it('has correct xmlName', () => {
      expect(translator.xmlName).toBe('w:insideH');
    });

    it('has correct sdNodeOrKeyName', () => {
      expect(translator.sdNodeOrKeyName).toBe('insideH');
    });
  });
});
