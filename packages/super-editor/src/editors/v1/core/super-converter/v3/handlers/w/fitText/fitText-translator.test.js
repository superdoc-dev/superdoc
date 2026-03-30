import { describe, it, expect } from 'vitest';
import { translator } from './fitText-translator.js';

describe('w:fitText translator', () => {
  describe('encode', () => {
    it('encodes integer attributes w:val and w:id', () => {
      const xmlNode = {
        name: 'w:fitText',
        attributes: {
          'w:val': '2400',
          'w:id': '3',
        },
      };

      const result = translator.encode({ nodes: [xmlNode] });

      expect(result).toEqual({
        val: 2400,
        id: 3,
      });
    });

    it('omits missing attributes and returns an empty object when none are present', () => {
      const partialNode = {
        name: 'w:fitText',
        attributes: { 'w:id': '7' },
      };

      expect(translator.encode({ nodes: [partialNode] })).toEqual({ id: 7 });

      const emptyNode = {
        name: 'w:fitText',
        attributes: {},
      };

      expect(translator.encode({ nodes: [emptyNode] })).toEqual({});
    });
  });

  describe('decode', () => {
    it('decodes SuperDoc attrs into a w:fitText element', () => {
      const superDocNode = {
        attrs: {
          fitText: {
            val: 1800,
            id: 9,
          },
        },
      };

      const result = translator.decode({ node: superDocNode });

      expect(result).toEqual({
        attributes: {
          'w:val': '1800',
          'w:id': '9',
        },
      });
    });

    it('returns undefined when fitText has no attributes', () => {
      expect(translator.decode({ node: { attrs: { fitText: {} } } })).toBeUndefined();
      expect(translator.decode({ node: { attrs: {} } })).toBeUndefined();
    });
  });

  it('has correct metadata', () => {
    expect(translator.xmlName).toBe('w:fitText');
    expect(translator.sdNodeOrKeyName).toBe('fitText');
  });
});
