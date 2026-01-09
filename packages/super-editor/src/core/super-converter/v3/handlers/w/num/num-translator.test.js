import { describe, it, expect } from 'vitest';
import { translator } from './num-translator.js';
import { NodeTranslator } from '@translator';

describe('w:num translator', () => {
  describe('config', () => {
    it('should have correct properties', () => {
      expect(translator.xmlName).toBe('w:num');
      expect(translator.sdNodeOrKeyName).toBe('num');
      expect(translator).toBeInstanceOf(NodeTranslator);
    });
  });

  describe('encode', () => {
    it('should encode nested num properties correctly', () => {
      const xmlNode = {
        name: 'w:num',
        attributes: { 'w:numId': '5' },
        elements: [
          { name: 'w:abstractNumId', attributes: { 'w:val': '2' } },
          {
            name: 'w:lvlOverride',
            attributes: { 'w:ilvl': '1' },
            elements: [
              { name: 'w:startOverride', attributes: { 'w:val': '3' } },
              { name: 'w:lvl', elements: [{ name: 'w:lvlText', attributes: { 'w:val': '%1.' } }] },
            ],
          },
        ],
      };

      const result = translator.encode({ nodes: [xmlNode] });

      expect(result).toEqual({
        numId: 5,
        abstractNumId: 2,
        lvlOverrides: {
          1: {
            ilvl: 1,
            startOverride: 3,
            lvl: { lvlText: '%1.' },
          },
        },
      });
    });

    it('should return attributes when no child properties are present', () => {
      const xmlNode = { name: 'w:num', attributes: { 'w:numId': '5' }, elements: [] };
      const result = translator.encode({ nodes: [xmlNode] });
      expect(result).toEqual({ numId: 5 });
    });
  });

  describe('decode', () => {
    it('should decode a styles object correctly', () => {
      const superDocNode = {
        attrs: {
          num: {
            numId: 5,
            abstractNumId: 2,
            lvlOverrides: {
              1: {
                ilvl: 1,
                startOverride: 3,
                lvl: { lvlText: '%1.' },
              },
            },
          },
        },
      };

      const result = translator.decode({ node: superDocNode });

      expect(result.name).toBe('w:num');
      expect(result.attributes).toEqual({ 'w:numId': '5' });
      expect(result.elements).toEqual([
        { name: 'w:abstractNumId', attributes: { 'w:val': '2' } },
        {
          name: 'w:lvlOverride',
          type: 'element',
          attributes: { 'w:ilvl': '1' },
          elements: [
            { name: 'w:startOverride', attributes: { 'w:val': '3' } },
            {
              name: 'w:lvl',
              type: 'element',
              attributes: {},
              elements: [{ name: 'w:lvlText', attributes: { 'w:val': '%1.' } }],
            },
          ],
        },
      ]);
    });

    it('should return undefined if no styles are present', () => {
      const result = translator.decode({ node: { attrs: {} } });
      expect(result).toBeUndefined();
    });
  });
});
