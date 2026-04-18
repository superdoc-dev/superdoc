import { describe, it, expect } from 'vitest';
import { config } from './index.js';

describe('w:br translator config', () => {
  describe('encode', () => {
    it('encodes to a SuperDoc lineBreak by default', () => {
      const res = config.encode({}, undefined);
      expect(res).toEqual({ type: 'lineBreak' });
    });

    it('encodes to a SuperDoc hardBreak when lineBreakType === "page"', () => {
      const res = config.encode({}, { lineBreakType: 'page' });
      expect(res.type).toBe('hardBreak');
      // attrs should be passed through (if provided)
      expect(res.attrs).toEqual({ lineBreakType: 'page' });
    });

    it('keeps type=lineBreak when lineBreakType is textWrapping (or anything not "page")', () => {
      const res1 = config.encode({}, { lineBreakType: 'textWrapping' });
      expect(res1.type).toBe('lineBreak');
      expect(res1.attrs).toEqual({ lineBreakType: 'textWrapping' });

      const res2 = config.encode({}, { lineBreakType: 'column' });
      expect(res2.type).toBe('lineBreak');
      expect(res2.attrs).toEqual({ lineBreakType: 'column' });

      const res3 = config.encode({}, { clear: 'all' }); // attrs without lineBreakType
      expect(res3.type).toBe('lineBreak');
      expect(res3.attrs).toEqual({ clear: 'all' });
    });

    it('includes all provided encoded attributes on the SuperDoc node', () => {
      const encodedAttrs = { lineBreakType: 'textWrapping', clear: 'left', extra: 'x' };
      const res = config.encode({}, encodedAttrs);
      expect(res.type).toBe('lineBreak');
      expect(res.attrs).toEqual(encodedAttrs);
    });
  });

  describe('decode', () => {
    it('wraps <w:br> in a <w:r> run (Google Docs compatibility)', () => {
      const res = config.decode({ node: { type: 'lineBreak' } }, undefined);
      // shape: { name: 'w:r', elements: [ { name: 'w:br', (attributes?) } ] }
      expect(res).toBeTruthy();
      expect(res.name).toBe('w:r');
      expect(Array.isArray(res.elements)).toBe(true);
      expect(res.elements[0]).toEqual({ name: 'w:br' });
    });

    it('copies decoded attributes onto <w:br>', () => {
      const decodedAttrs = { 'w:type': 'textWrapping', 'w:clear': 'all' };
      const res = config.decode({ node: { type: 'lineBreak' } }, decodedAttrs);
      expect(res.name).toBe('w:r');
      expect(res.elements[0]).toEqual({
        name: 'w:br',
        attributes: { 'w:type': 'textWrapping', 'w:clear': 'all' },
      });
    });

    it('returns undefined when params.node is missing', () => {
      const res = config.decode(
        {
          /* no node */
        },
        { 'w:type': 'page' },
      );
      expect(res).toBeUndefined();
    });

    it('does not require specific SuperDoc node type for decoding (guard only)', () => {
      // decode only checks for presence of params.node; it doesn't branch on type
      const res = config.decode({ node: { type: 'hardBreak' } }, { 'w:type': 'page' });
      expect(res.name).toBe('w:r');
      expect(res.elements[0]).toEqual({
        name: 'w:br',
        attributes: { 'w:type': 'page' },
      });
    });
  });

  describe('attributes mapping metadata', () => {
    it('exposes expected attributes handlers (w:type -> lineBreakType, w:clear -> clear)', () => {
      const attrMap = config.attributes;
      // Expect exactly two mappings with the right names
      const names = attrMap.map((a) => [a.xmlName, a.sdName]);
      expect(names).toContainEqual(['w:type', 'lineBreakType']);
      expect(names).toContainEqual(['w:clear', 'clear']);

      // Handlers should be functions
      const byXml = Object.fromEntries(attrMap.map((a) => [a.xmlName, a]));
      expect(typeof byXml['w:type'].encode).toBe('function');
      expect(typeof byXml['w:type'].decode).toBe('function');
      expect(typeof byXml['w:clear'].encode).toBe('function');
      expect(typeof byXml['w:clear'].decode).toBe('function');
    });
  });
});
