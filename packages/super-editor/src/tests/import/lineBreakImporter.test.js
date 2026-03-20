import { describe, it, expect } from 'vitest';
import { config } from '../../core/super-converter/v3/handlers/w/br/br-translator.js';
import {
  encode as lineBreakTypeEncode,
  decode as lineBreakTypeDecode,
} from '../../core/super-converter/v3/handlers/w/br/attributes/w-line-break-type.js';
import {
  encode as wClearEncode,
  decode as wClearDecode,
} from '../../core/super-converter/v3/handlers/w/br/attributes/w-clear.js';

describe('LineBreak (w:br) translator - v3', () => {
  describe('encode (OOXML -> SuperDoc)', () => {
    it('encodes to type=lineBreak by default (no attrs)', () => {
      const res = config.encode({}, /* encodedAttrs */ undefined);
      expect(res).toEqual({ type: 'lineBreak' });
    });

    it('encodes page breaks to type=hardBreak', () => {
      // simulate attribute encoding phase
      const encodedAttrs = {
        lineBreakType: lineBreakTypeEncode({ 'w:type': 'page' }),
      };
      const res = config.encode({}, encodedAttrs);
      expect(res.type).toBe('hardBreak');
      expect(res.attrs).toEqual({ lineBreakType: 'page' });
    });

    it('keeps type=lineBreak for textWrapping (or other non-page types)', () => {
      const encodedAttrs1 = {
        lineBreakType: lineBreakTypeEncode({ 'w:type': 'textWrapping' }),
      };
      const res1 = config.encode({}, encodedAttrs1);
      expect(res1.type).toBe('lineBreak');
      expect(res1.attrs).toEqual({ lineBreakType: 'textWrapping' });

      const encodedAttrs2 = {
        lineBreakType: lineBreakTypeEncode({ 'w:type': 'column' }),
      };
      const res2 = config.encode({}, encodedAttrs2);
      expect(res2.type).toBe('lineBreak');
      expect(res2.attrs).toEqual({ lineBreakType: 'column' });
    });

    it('passes through supported attributes (lineBreakType, clear)', () => {
      const encodedAttrs = {
        lineBreakType: lineBreakTypeEncode({ 'w:type': 'textWrapping' }),
        clear: wClearEncode({ 'w:clear': 'left' }),
      };
      const res = config.encode({}, encodedAttrs);
      expect(res).toEqual({
        type: 'lineBreak',
        attrs: { lineBreakType: 'textWrapping', clear: 'left' },
      });
    });
  });

  describe('decode (SuperDoc -> OOXML)', () => {
    it('wraps <w:br> in a <w:r>', () => {
      const res = config.decode({ node: { type: 'lineBreak' } }, /* decodedAttrs */ undefined);
      expect(res).toBeTruthy();
      expect(res.name).toBe('w:r');
      expect(Array.isArray(res.elements)).toBe(true);
      expect(res.elements[0]).toEqual({ name: 'w:br' });
    });

    it('copies decoded attributes onto <w:br>', () => {
      // simulate attribute decoding phase
      const decodedAttrs = {
        'w:type': lineBreakTypeDecode({ lineBreakType: 'textWrapping' }),
        'w:clear': wClearDecode({ clear: 'all' }),
      };
      const res = config.decode({ node: { type: 'lineBreak' } }, decodedAttrs);
      expect(res.name).toBe('w:r');
      expect(res.elements[0]).toEqual({
        name: 'w:br',
        attributes: { 'w:type': 'textWrapping', 'w:clear': 'all' },
      });
    });

    it('works for hardBreak nodes too (type guard is not enforced)', () => {
      const decodedAttrs = { 'w:type': 'page' };
      const res = config.decode({ node: { type: 'hardBreak' } }, decodedAttrs);
      expect(res.name).toBe('w:r');
      expect(res.elements[0]).toEqual({
        name: 'w:br',
        attributes: { 'w:type': 'page' },
      });
    });

    it('returns undefined when params.node is missing', () => {
      const res = config.decode({}, {});
      expect(res).toBeUndefined();
    });
  });

  describe('attributes metadata', () => {
    it('exposes correct attribute handler mappings', () => {
      const map = config.attributes.map((a) => [a.xmlName, a.sdName]);
      expect(map).toContainEqual(['w:type', 'lineBreakType']);
      expect(map).toContainEqual(['w:clear', 'clear']);
    });
  });
});
