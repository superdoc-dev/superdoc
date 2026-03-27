import { describe, it, expect } from 'vitest';

import { translator } from './rFonts-translator.js';
import { NodeTranslator } from '../../../node-translator/node-translator.js';

describe('w:rFonts translator (attribute)', () => {
  it('builds NodeTranslator instance with correct meta', () => {
    expect(translator).toBeInstanceOf(NodeTranslator);
    expect(translator.xmlName).toBe('w:rFonts');
    expect(translator.sdNodeOrKeyName).toBe('fontFamily');
  });

  describe('encode', () => {
    it('preserves all provided font attributes and maps eastAsia to w:val when present', () => {
      const params = {
        nodes: [
          {
            attributes: { 'w:eastAsia': 'Arial', 'w:ascii': 'Calibri', 'w:hAnsi': 'Calibri', 'w:cs': 'Noto Sans' },
          },
        ],
      };
      const out = translator.encode(params);
      expect(out).toEqual({
        eastAsia: 'Arial',
        ascii: 'Calibri',
        hAnsi: 'Calibri',
        cs: 'Noto Sans',
      });
    });
  });

  describe('decode', () => {
    it('maps all provided font attributes under fontFamily key', () => {
      const params = {
        node: {
          attrs: {
            fontFamily: {
              eastAsia: 'Arial',
              ascii: 'Calibri',
              hAnsi: 'Calibri',
              cs: 'Noto Sans',
            },
          },
        },
      };
      const out = translator.decode(params);
      expect(out).toEqual({
        attributes: {
          'w:ascii': 'Calibri',
          'w:cs': 'Noto Sans',
          'w:eastAsia': 'Arial',
          'w:hAnsi': 'Calibri',
        },
      });
    });

    it('returns undefined when no font attributes are present', () => {
      const params = { node: { name: 'w:rFonts', attrs: {} } };
      const out = translator.decode(params);
      expect(out).toBeUndefined();
    });
  });
});
