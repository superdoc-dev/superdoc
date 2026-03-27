import { describe, it, expect } from 'vitest';
import { translator } from './lvlOverride-translator.js';
import { NodeTranslator } from '@translator';

describe('w:lvlOverride translator', () => {
  describe('config', () => {
    it('should have correct properties', () => {
      expect(translator.xmlName).toBe('w:lvlOverride');
      expect(translator.sdNodeOrKeyName).toBe('lvlOverride');
      expect(translator).toBeInstanceOf(NodeTranslator);
    });
  });

  describe('encode', () => {
    it('should encode nested level override properties correctly', () => {
      const xmlNode = {
        name: 'w:lvlOverride',
        attributes: { 'w:ilvl': '2' },
        elements: [
          { name: 'w:startOverride', attributes: { 'w:val': '3' } },
          { name: 'w:lvl', elements: [{ name: 'w:lvlText', attributes: { 'w:val': '%1.' } }] },
        ],
      };

      const result = translator.encode({ nodes: [xmlNode] });

      expect(result).toEqual({
        ilvl: 2,
        startOverride: 3,
        lvl: { lvlText: '%1.' },
      });
    });

    it('should return attributes if no child properties are present', () => {
      const xmlNode = { name: 'w:lvlOverride', attributes: { 'w:ilvl': '2' }, elements: [] };
      const result = translator.encode({ nodes: [xmlNode] });
      expect(result).toEqual({ ilvl: 2 });
    });
  });

  describe('decode', () => {
    it('should decode a lvlOverride object correctly', () => {
      const superDocNode = {
        attrs: {
          lvlOverride: {
            ilvl: 2,
            startOverride: 3,
            lvl: { lvlText: '%1.' },
          },
        },
      };

      const result = translator.decode({ node: superDocNode });

      expect(result.name).toBe('w:lvlOverride');
      expect(result.attributes).toEqual({ 'w:ilvl': '2' });
      expect(result.elements).toEqual(
        expect.arrayContaining([
          { name: 'w:startOverride', attributes: { 'w:val': '3' } },
          {
            name: 'w:lvl',
            type: 'element',
            attributes: {},
            elements: [{ name: 'w:lvlText', attributes: { 'w:val': '%1.' } }],
          },
        ]),
      );
    });

    it('should return undefined if no lvlOverride properties are present', () => {
      const result = translator.decode({ node: { attrs: {} } });
      expect(result).toBeUndefined();
    });
  });
});
