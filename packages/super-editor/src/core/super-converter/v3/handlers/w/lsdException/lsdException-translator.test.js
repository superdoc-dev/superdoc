import { describe, it, expect } from 'vitest';
import { translator } from './lsdException-translator.js';
import { NodeTranslator } from '@translator';

describe('w:lsdException translator', () => {
  describe('config', () => {
    it('should have correct properties', () => {
      expect(translator.xmlName).toBe('w:lsdException');
      expect(translator.sdNodeOrKeyName).toBe('lsdException');
      expect(translator).toBeInstanceOf(NodeTranslator);
    });
  });

  describe('encode', () => {
    it('should encode lsdException attributes correctly', () => {
      const xmlNode = {
        name: 'w:lsdException',
        attributes: {
          'w:name': 'NoList',
          'w:locked': '1',
          'w:qFormat': '1',
          'w:semiHidden': '0',
          'w:unhideWhenUsed': '1',
          'w:uiPriority': '99',
        },
      };

      const result = translator.encode({ nodes: [xmlNode] });

      expect(result).toEqual({
        name: 'NoList',
        locked: true,
        qFormat: true,
        semiHidden: false,
        unhideWhenUsed: true,
        uiPriority: 99,
      });
    });

    it('should return an empty object when no attributes are present', () => {
      const xmlNode = { name: 'w:lsdException', attributes: {} };
      const result = translator.encode({ nodes: [xmlNode] });
      expect(result).toEqual({});
    });
  });

  describe('decode', () => {
    it('should decode a lsdException object correctly', () => {
      const superDocNode = {
        attrs: {
          lsdException: {
            name: 'NoList',
            locked: true,
            qFormat: true,
            semiHidden: false,
            unhideWhenUsed: true,
            uiPriority: 99,
          },
        },
      };

      const result = translator.decode({ node: superDocNode });

      expect(result).toEqual({
        name: 'w:lsdException',
        attributes: {
          'w:name': 'NoList',
          'w:locked': '1',
          'w:qFormat': '1',
          'w:semiHidden': '0',
          'w:unhideWhenUsed': '1',
          'w:uiPriority': '99',
        },
      });
    });

    it('should return undefined if no lsdException is present', () => {
      const result = translator.decode({ node: { attrs: {} } });
      expect(result).toBeUndefined();
    });

    it('should return undefined if lsdException is empty', () => {
      const result = translator.decode({ node: { attrs: { lsdException: {} } } });
      expect(result).toBeUndefined();
    });
  });
});
