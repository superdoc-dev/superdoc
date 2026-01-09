import { describe, it, expect } from 'vitest';
import { translator } from './style-translator.js';
import { NodeTranslator } from '@translator';

describe('w:style translator', () => {
  describe('config', () => {
    it('should have correct properties', () => {
      expect(translator.xmlName).toBe('w:style');
      expect(translator.sdNodeOrKeyName).toBe('style');
      expect(translator).toBeInstanceOf(NodeTranslator);
    });
  });

  describe('encode', () => {
    it('should encode nested style properties correctly', () => {
      const xmlNode = {
        name: 'w:style',
        attributes: { 'w:type': 'paragraph', 'w:styleId': 'CustomStyle' },
        elements: [
          { name: 'w:name', attributes: { 'w:val': 'Custom Style' } },
          { name: 'w:aliases', attributes: { 'w:val': 'Alias1,Alias2' } },
          { name: 'w:uiPriority', attributes: { 'w:val': '1' } },
          { name: 'w:pPr', elements: [{ name: 'w:keepNext' }] },
          { name: 'w:rPr', elements: [{ name: 'w:b' }] },
        ],
      };

      const result = translator.encode({ nodes: [xmlNode] });

      expect(result).toEqual({
        type: 'paragraph',
        styleId: 'CustomStyle',
        name: 'Custom Style',
        aliases: 'Alias1,Alias2',
        uiPriority: 1,
        paragraphProperties: { keepNext: true },
        runProperties: { bold: true },
      });
    });

    it('should return undefined if no child properties are present', () => {
      const xmlNode = { name: 'w:style', elements: [] };
      const result = translator.encode({ nodes: [xmlNode] });
      expect(result).toBeUndefined();
    });
  });

  describe('decode', () => {
    it('should decode a style object correctly', () => {
      const superDocNode = {
        attrs: {
          style: {
            name: 'Custom Style',
            aliases: 'Alias1,Alias2',
            uiPriority: 1,
            paragraphProperties: { keepNext: true },
            runProperties: { bold: true },
          },
        },
      };

      const result = translator.decode({ node: superDocNode });

      expect(result.name).toBe('w:style');
      expect(result.elements).toEqual(
        expect.arrayContaining([
          { name: 'w:name', attributes: { 'w:val': 'Custom Style' } },
          { name: 'w:aliases', attributes: { 'w:val': 'Alias1,Alias2' } },
          { name: 'w:uiPriority', attributes: { 'w:val': '1' } },
          { name: 'w:pPr', type: 'element', attributes: {}, elements: [{ name: 'w:keepNext', attributes: {} }] },
          { name: 'w:rPr', type: 'element', attributes: {}, elements: [{ name: 'w:b', attributes: {} }] },
        ]),
      );
    });

    it('should return undefined if no style properties are present', () => {
      const result = translator.decode({ node: { attrs: {} } });
      expect(result).toBeUndefined();
    });
  });
});
