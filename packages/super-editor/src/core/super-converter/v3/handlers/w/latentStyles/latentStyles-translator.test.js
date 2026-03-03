import { describe, it, expect } from 'vitest';
import { translator } from './latentStyles-translator.js';
import { NodeTranslator } from '@translator';

describe('w:latentStyles translator', () => {
  describe('config', () => {
    it('should have correct properties', () => {
      expect(translator.xmlName).toBe('w:latentStyles');
      expect(translator.sdNodeOrKeyName).toBe('latentStyles');
      expect(translator).toBeInstanceOf(NodeTranslator);
    });
  });

  describe('encode', () => {
    it('should encode latentStyles attributes and exceptions as arrays', () => {
      const xmlNode = {
        name: 'w:latentStyles',
        attributes: {
          'w:defLockedState': '1',
          'w:defUIPriority': '99',
          'w:defSemiHidden': '0',
          'w:defUnhideWhenUsed': '1',
          'w:defQFormat': '1',
          'w:count': '376',
        },
        elements: [
          {
            name: 'w:lsdException',
            attributes: {
              'w:name': 'NoList',
              'w:locked': '1',
              'w:qFormat': '1',
              'w:semiHidden': '0',
              'w:unhideWhenUsed': '1',
              'w:uiPriority': '99',
            },
          },
          {
            name: 'w:lsdException',
            attributes: {
              'w:name': 'Normal',
              'w:uiPriority': '0',
            },
          },
        ],
      };

      const result = translator.encode({ nodes: [xmlNode] });

      expect(result).toEqual({
        lsdExceptions: [
          {
            name: 'NoList',
            locked: true,
            qFormat: true,
            semiHidden: false,
            unhideWhenUsed: true,
            uiPriority: 99,
          },
          {
            name: 'Normal',
            uiPriority: 0,
          },
        ],
        defLockedState: true,
        defUIPriority: 99,
        defSemiHidden: false,
        defUnhideWhenUsed: true,
        defQFormat: true,
        count: 376,
      });
    });

    it('preserves document order of lsdExceptions', () => {
      const xmlNode = {
        name: 'w:latentStyles',
        attributes: {},
        elements: [
          { name: 'w:lsdException', attributes: { 'w:name': 'B' } },
          { name: 'w:lsdException', attributes: { 'w:name': 'A' } },
        ],
      };

      const result = translator.encode({ nodes: [xmlNode] });
      expect(result.lsdExceptions.map((e) => e.name)).toEqual(['B', 'A']);
    });
  });

  describe('decode', () => {
    it('should decode latentStyles into OOXML elements', () => {
      const superDocNode = {
        attrs: {
          latentStyles: {
            defLockedState: true,
            defUIPriority: 99,
            defSemiHidden: false,
            defUnhideWhenUsed: true,
            defQFormat: true,
            count: 376,
            lsdExceptions: [
              {
                name: 'NoList',
                locked: true,
                qFormat: true,
                semiHidden: false,
                unhideWhenUsed: true,
                uiPriority: 99,
              },
            ],
          },
        },
      };

      const result = translator.decode({ node: superDocNode });

      expect(result).toEqual({
        name: 'w:latentStyles',
        attributes: {
          'w:defLockedState': '1',
          'w:defUIPriority': '99',
          'w:defSemiHidden': '0',
          'w:defUnhideWhenUsed': '1',
          'w:defQFormat': '1',
          'w:count': '376',
        },
        elements: [
          {
            name: 'w:lsdException',
            attributes: {
              'w:name': 'NoList',
              'w:locked': '1',
              'w:qFormat': '1',
              'w:semiHidden': '0',
              'w:unhideWhenUsed': '1',
              'w:uiPriority': '99',
            },
          },
        ],
      });
    });

    it('should return undefined if no latentStyles are present', () => {
      const result = translator.decode({ node: { attrs: {} } });
      expect(result).toBeUndefined();
    });
  });
});
