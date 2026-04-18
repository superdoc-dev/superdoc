import { describe, it, expect } from 'vitest';
import { translator } from './docDefaults-translator.js';
import { NodeTranslator } from '@translator';

describe('w:docDefaults translator', () => {
  describe('config', () => {
    it('should have correct properties', () => {
      expect(translator.xmlName).toBe('w:docDefaults');
      expect(translator.sdNodeOrKeyName).toBe('docDefaults');
      expect(translator).toBeInstanceOf(NodeTranslator);
    });
  });

  describe('encode', () => {
    it('should encode default run and paragraph properties', () => {
      const xmlNode = {
        name: 'w:docDefaults',
        elements: [
          {
            name: 'w:rPrDefault',
            elements: [{ name: 'w:rPr', elements: [{ name: 'w:b' }] }],
          },
          {
            name: 'w:pPrDefault',
            elements: [{ name: 'w:pPr', elements: [{ name: 'w:keepNext' }] }],
          },
        ],
      };

      const result = translator.encode({ nodes: [xmlNode] });

      expect(result).toEqual({
        runProperties: { bold: true },
        paragraphProperties: { keepNext: true },
      });
    });

    it('should return undefined if no default properties are present', () => {
      const xmlNode = { name: 'w:docDefaults', elements: [] };
      const result = translator.encode({ nodes: [xmlNode] });
      expect(result).toBeUndefined();
    });
  });

  describe('decode', () => {
    it('should decode docDefaults into wrapped properties', () => {
      const superDocNode = {
        attrs: {
          docDefaults: {
            runProperties: { bold: true },
            paragraphProperties: { keepNext: true },
          },
        },
      };

      const result = translator.decode({ node: superDocNode });

      expect(result.name).toBe('w:docDefaults');
      expect(result.elements).toEqual(
        expect.arrayContaining([
          {
            name: 'w:rPrDefault',
            type: 'element',
            elements: [{ name: 'w:rPr', type: 'element', attributes: {}, elements: [{ name: 'w:b', attributes: {} }] }],
          },
          {
            name: 'w:pPrDefault',
            type: 'element',
            elements: [
              { name: 'w:pPr', type: 'element', attributes: {}, elements: [{ name: 'w:keepNext', attributes: {} }] },
            ],
          },
        ]),
      );
    });

    it('should return undefined if no docDefaults are present', () => {
      const result = translator.decode({ node: { attrs: {} } });
      expect(result).toBeUndefined();
    });
  });
});
