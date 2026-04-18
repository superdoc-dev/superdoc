import { describe, it, expect } from 'vitest';
import { translator } from './abstractNum-translator.js';
import { NodeTranslator } from '@translator';

describe('w:abstractNum translator', () => {
  describe('config', () => {
    it('should have correct properties', () => {
      expect(translator.xmlName).toBe('w:abstractNum');
      expect(translator.sdNodeOrKeyName).toBe('abstractNum');
      expect(translator).toBeInstanceOf(NodeTranslator);
    });
  });

  describe('encode', () => {
    it('should encode abstract numbering properties correctly', () => {
      const xmlNode = {
        name: 'w:abstractNum',
        attributes: { 'w:abstractNumId': '1' },
        elements: [
          { name: 'w:nsid', attributes: { 'w:val': '10' } },
          { name: 'w:tmpl', attributes: { 'w:val': '20' } },
          { name: 'w:name', attributes: { 'w:val': 'List Numbering' } },
          { name: 'w:styleLink', attributes: { 'w:val': 'ListStyle' } },
          { name: 'w:numStyleLink', attributes: { 'w:val': 'ListNumStyle' } },
          { name: 'w:multiLevelType', attributes: { 'w:val': 'multilevel' } },
          {
            name: 'w:lvl',
            attributes: { 'w:ilvl': '1' },
            elements: [{ name: 'w:lvlText', attributes: { 'w:val': '%1.' } }],
          },
          {
            name: 'w:lvl',
            attributes: { 'w:ilvl': '2' },
            elements: [{ name: 'w:lvlText', attributes: { 'w:val': '%2.' } }],
          },
          {
            name: 'w:lvl',
            attributes: { 'w:ilvl': '3' },
            elements: [{ name: 'w:lvlText', attributes: { 'w:val': '%3.' } }],
          },
          {
            name: 'w:lvl',
            attributes: { 'w:ilvl': '4' },
            elements: [{ name: 'w:lvlText', attributes: { 'w:val': '%4.' } }],
          },
          {
            name: 'w:lvl',
            attributes: { 'w:ilvl': '5' },
            elements: [{ name: 'w:lvlText', attributes: { 'w:val': '%5.' } }],
          },
          {
            name: 'w:lvl',
            attributes: { 'w:ilvl': '6' },
            elements: [{ name: 'w:lvlText', attributes: { 'w:val': '%6.' } }],
          },
          {
            name: 'w:lvl',
            attributes: { 'w:ilvl': '7' },
            elements: [{ name: 'w:lvlText', attributes: { 'w:val': '%7.' } }],
          },
          {
            name: 'w:lvl',
            attributes: { 'w:ilvl': '8' },
            elements: [{ name: 'w:lvlText', attributes: { 'w:val': '%8.' } }],
          },
          {
            name: 'w:lvl',
            attributes: { 'w:ilvl': '9' },
            elements: [{ name: 'w:lvlText', attributes: { 'w:val': '%9.' } }],
          },
        ],
      };

      const result = translator.encode({ nodes: [xmlNode] });

      expect(result).toEqual({
        abstractNumId: 1,
        nsid: 10,
        tmpl: 20,
        name: 'List Numbering',
        styleLink: 'ListStyle',
        numStyleLink: 'ListNumStyle',
        multiLevelType: 'multilevel',
        levels: {
          1: {
            ilvl: 1,
            lvlText: '%1.',
          },
          2: {
            ilvl: 2,
            lvlText: '%2.',
          },
          3: {
            ilvl: 3,
            lvlText: '%3.',
          },
          4: {
            ilvl: 4,
            lvlText: '%4.',
          },
          5: {
            ilvl: 5,
            lvlText: '%5.',
          },
          6: {
            ilvl: 6,
            lvlText: '%6.',
          },
          7: {
            ilvl: 7,
            lvlText: '%7.',
          },
          8: {
            ilvl: 8,
            lvlText: '%8.',
          },
          9: {
            ilvl: 9,
            lvlText: '%9.',
          },
        },
      });
    });

    it('should return attributes when no child properties are present', () => {
      const xmlNode = { name: 'w:abstractNum', attributes: { 'w:abstractNumId': '1' }, elements: [] };
      const result = translator.encode({ nodes: [xmlNode] });
      expect(result).toEqual({ abstractNumId: 1 });
    });
  });

  describe('decode', () => {
    it('should decode an abstractNum object correctly', () => {
      const superDocNode = {
        attrs: {
          abstractNum: {
            abstractNumId: 1,
            levels: {
              1: {
                lvlText: '%1.',
              },
            },
          },
        },
      };

      const result = translator.decode({ node: superDocNode });

      expect(result.name).toBe('w:abstractNum');
      expect(result.attributes).toEqual({ 'w:abstractNumId': '1' });
      expect(result.elements).toEqual(
        expect.arrayContaining([
          {
            name: 'w:lvl',
            type: 'element',
            attributes: {},
            elements: [{ name: 'w:lvlText', attributes: { 'w:val': '%1.' } }],
          },
        ]),
      );
    });

    it('should return undefined if no abstractNum is present', () => {
      const result = translator.decode({ node: { attrs: {} } });
      expect(result).toBeUndefined();
    });
  });
});
