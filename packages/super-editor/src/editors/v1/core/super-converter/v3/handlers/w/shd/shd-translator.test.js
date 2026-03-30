import { describe, it, expect } from 'vitest';
import { translator } from './shd-translator.js';

describe('w:shd translator', () => {
  describe('encode', () => {
    it('extracts and maps all attributes correctly', () => {
      const result = translator.encode({
        nodes: [
          {
            attributes: {
              'w:val': 'clear',
              'w:color': 'auto',
              'w:fill': 'FFFFFF',
              'w:themeColor': 'accent1',
            },
          },
        ],
      });
      expect(result).toEqual({
        val: 'clear',
        color: 'auto',
        fill: 'FFFFFF',
        themeColor: 'accent1',
      });
    });

    it('returns undefined if no attributes are present', () => {
      const result = translator.encode({ nodes: [{ attributes: {} }] });
      expect(result).toBeUndefined();
    });

    it('returns undefined if all attributes are falsy', () => {
      const result = translator.encode({
        nodes: [
          {
            attributes: {
              'w:val': '',
            },
          },
        ],
      });
      expect(result).toEqual({
        val: '',
      });
    });
  });

  describe('decode', () => {
    it('creates a w:shd element with attributes', () => {
      const attrs = {
        shading: {
          val: 'clear',
          color: 'auto',
          fill: 'FFFFFF',
        },
      };
      const { attributes: result } = translator.decode({ node: { attrs } });
      expect(result).toEqual({
        'w:val': 'clear',
        'w:color': 'auto',
        'w:fill': 'FFFFFF',
      });
    });

    it('returns undefined if shading property is missing', () => {
      expect(translator.decode({ node: { attrs: {} } })).toBeUndefined();
    });

    it('returns undefined if shading property is empty', () => {
      expect(translator.decode({ node: { attrs: { shading: {} } } })).toBeUndefined();
    });
  });

  it('has correct metadata', () => {
    expect(translator.xmlName).toBe('w:shd');
    expect(translator.sdNodeOrKeyName).toBe('shading');
  });
});
