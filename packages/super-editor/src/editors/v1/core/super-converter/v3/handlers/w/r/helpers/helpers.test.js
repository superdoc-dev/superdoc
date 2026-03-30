import { describe, it, expect, afterEach, vi } from 'vitest';
import { cloneMark, cloneXmlNode, applyRunPropertiesTemplate, resolveFontFamily } from './helpers.js';

describe('w:r helper utilities', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('resolveFontFamily', () => {
    it('uses east Asia font only when node contains East Asian characters', () => {
      const attrs = { fontFamily: 'Helvetica, sans-serif', eastAsiaFontFamily: 'Meiryo, sans-serif' };

      const latinResult = resolveFontFamily(attrs, 'Hello');
      expect(latinResult).toEqual({ fontFamily: 'Helvetica, sans-serif' });

      const eastAsiaResult = resolveFontFamily(attrs, '你好');
      expect(eastAsiaResult).toEqual({ fontFamily: 'Meiryo, sans-serif' });
    });

    it('drops east Asia hint when node has no text and no primary font', () => {
      const attrs = { eastAsiaFontFamily: 'Meiryo, sans-serif' };
      expect(resolveFontFamily(attrs, '')).toEqual(attrs);
    });
  });

  describe('merge helpers', () => {
    it('cloneMark copies nested runProperties', () => {
      const mark = { type: 'run', attrs: { runProperties: [{ xmlName: 'w:b', attributes: {} }] } };
      const clone = cloneMark(mark);
      expect(clone).toEqual(mark);
      expect(clone.attrs.runProperties).not.toBe(mark.attrs.runProperties);
    });

    it('cloneXmlNode deep clones nested elements', () => {
      const node = {
        name: 'w:r',
        attributes: { id: '1' },
        elements: [{ name: 'w:t', elements: [{ type: 'text', text: 'Hello' }] }],
      };
      const clone = cloneXmlNode(node);
      expect(clone).toEqual(node);
      expect(clone).not.toBe(node);
      expect(clone.elements[0]).not.toBe(node.elements[0]);
      expect(clone.elements[0].elements[0]).not.toBe(node.elements[0].elements[0]);
    });

    it('applyRunPropertiesTemplate adds run props to nodes', () => {
      const template = {
        name: 'w:rPr',
        attributes: { 'w:rsidR': '001' },
        elements: [{ name: 'w:b' }, { name: 'w:color', attributes: { 'w:val': 'FF0000' } }],
      };

      const runNode = { name: 'w:r', elements: [{ name: 'w:t' }] };
      applyRunPropertiesTemplate(runNode, template);

      const rPr = runNode.elements[0];
      expect(rPr.name).toBe('w:rPr');
      expect(rPr.attributes).toEqual({ 'w:rsidR': '001' });
      expect(rPr.elements).toHaveLength(2);
      expect(rPr.elements[0]).toEqual({ name: 'w:b' });
      expect(rPr.elements[0]).not.toBe(template.elements[0]);
      expect(rPr.elements[1]).toEqual({ name: 'w:color', attributes: { 'w:val': 'FF0000' } });

      applyRunPropertiesTemplate(runNode, template);
      expect(rPr.elements).toHaveLength(2);
    });
  });
});
