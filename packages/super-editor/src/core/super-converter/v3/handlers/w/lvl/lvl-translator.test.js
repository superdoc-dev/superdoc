import { describe, it, expect } from 'vitest';
import { translator } from './lvl-translator.js';
import { NodeTranslator } from '@translator';

describe('w:lvl translator', () => {
  describe('config', () => {
    it('should have correct properties', () => {
      expect(translator.xmlName).toBe('w:lvl');
      expect(translator.sdNodeOrKeyName).toBe('lvl');
      expect(translator).toBeInstanceOf(NodeTranslator);
    });
  });

  describe('encode', () => {
    it('should encode nested level properties correctly', () => {
      const xmlNode = {
        name: 'w:lvl',
        elements: [
          { name: 'w:start', attributes: { 'w:val': '1' } },
          { name: 'w:lvlPicBulletId', attributes: { 'w:val': '2' } },
          { name: 'w:isLgl' },
          { name: 'w:pStyle', attributes: { 'w:val': 'Heading1' } },
          { name: 'w:suff', attributes: { 'w:val': 'space' } },
          { name: 'w:lvlText', attributes: { 'w:val': '%1.' } },
          { name: 'w:lvlJc', attributes: { 'w:val': 'center' } },
          { name: 'w:numFmt', attributes: { 'w:val': 'decimal', 'w:format': '1.' } },
          { name: 'w:legacy', attributes: { 'w:legacy': '1', 'w:legacySpace': '120', 'w:legacyIndent': '240' } },
          { name: 'w:pPr', elements: [{ name: 'w:keepNext' }] },
          { name: 'w:rPr', elements: [{ name: 'w:b' }] },
        ],
      };

      const result = translator.encode({ nodes: [xmlNode] });

      expect(result).toEqual({
        start: 1,
        lvlPicBulletId: 2,
        isLgl: true,
        styleId: 'Heading1',
        suff: 'space',
        lvlText: '%1.',
        lvlJc: 'center',
        numFmt: { val: 'decimal', format: '1.' },
        legacy: { legacy: true, legacySpace: 120, legacyIndent: 240 },
        paragraphProperties: { keepNext: true },
        runProperties: { bold: true },
      });
    });

    it('should return undefined if no child properties are present', () => {
      const xmlNode = { name: 'w:lvl', elements: [] };
      const result = translator.encode({ nodes: [xmlNode] });
      expect(result).toBeUndefined();
    });
  });

  describe('decode', () => {
    it('should decode a lvl object correctly', () => {
      const superDocNode = {
        attrs: {
          lvl: {
            start: 1,
            lvlPicBulletId: 2,
            isLgl: true,
            styleId: 'Heading1',
            suff: 'space',
            lvlText: '%1.',
            lvlJc: 'center',
            numFmt: { val: 'decimal', format: '1.' },
            legacy: { legacy: true, legacySpace: 120, legacyIndent: 240 },
            paragraphProperties: { keepNext: true },
            runProperties: { bold: true },
          },
        },
      };

      const result = translator.decode({ node: superDocNode });

      expect(result.name).toBe('w:lvl');
      expect(result.elements).toEqual(
        expect.arrayContaining([
          { name: 'w:start', attributes: { 'w:val': '1' } },
          { name: 'w:lvlPicBulletId', attributes: { 'w:val': '2' } },
          { name: 'w:isLgl', attributes: {} },
          { name: 'w:pStyle', attributes: { 'w:val': 'Heading1' } },
          { name: 'w:suff', attributes: { 'w:val': 'space' } },
          { name: 'w:lvlText', attributes: { 'w:val': '%1.' } },
          { name: 'w:lvlJc', attributes: { 'w:val': 'center' } },
          { name: 'w:numFmt', attributes: { 'w:val': 'decimal', 'w:format': '1.' } },
          {
            name: 'w:legacy',
            attributes: { 'w:legacy': '1', 'w:legacySpace': '120', 'w:legacyIndent': '240' },
          },
          { name: 'w:pPr', type: 'element', attributes: {}, elements: [{ name: 'w:keepNext', attributes: {} }] },
          { name: 'w:rPr', type: 'element', attributes: {}, elements: [{ name: 'w:b', attributes: {} }] },
        ]),
      );
    });

    it('should return undefined if no lvl properties are present', () => {
      const result = translator.decode({ node: { attrs: {} } });
      expect(result).toBeUndefined();
    });
  });
});
