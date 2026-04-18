import { describe, it, expect } from 'vitest';
import { translator } from './eastAsianLayout-translator.js';

describe('w:eastAsianLayout translator', () => {
  describe('encode', () => {
    it('encodes all eastAsianLayout attributes with correct types', () => {
      const xmlNode = {
        name: 'w:eastAsianLayout',
        attributes: {
          'w:id': '42',
          'w:combine': '1',
          'w:combineBrackets': 'square',
          'w:vert': '0',
          'w:vertCompress': 'on',
        },
      };

      const result = translator.encode({ nodes: [xmlNode] });

      expect(result).toEqual({
        id: 42,
        combine: true,
        combineBrackets: 'square',
        vert: false,
        vertCompress: true,
      });
    });

    it('omits missing attributes and returns an empty object when none are present', () => {
      const partialNode = {
        name: 'w:eastAsianLayout',
        attributes: {
          'w:combineBrackets': 'angle',
          'w:vert': '1',
        },
      };

      expect(translator.encode({ nodes: [partialNode] })).toEqual({
        combineBrackets: 'angle',
        vert: true,
      });

      const emptyNode = {
        name: 'w:eastAsianLayout',
        attributes: {},
      };

      expect(translator.encode({ nodes: [emptyNode] })).toEqual({});
    });
  });

  describe('decode', () => {
    it('decodes SuperDoc attributes into a w:eastAsianLayout element', () => {
      const superDocNode = {
        attrs: {
          eastAsianLayout: {
            id: 7,
            combine: false,
            combineBrackets: 'curly',
            vert: true,
            vertCompress: false,
          },
        },
      };

      const result = translator.decode({ node: superDocNode });

      expect(result).toEqual({
        attributes: {
          'w:id': '7',
          'w:combine': '0',
          'w:combineBrackets': 'curly',
          'w:vert': '1',
          'w:vertCompress': '0',
        },
      });
    });

    it('returns undefined when eastAsianLayout has no attributes', () => {
      expect(translator.decode({ node: { attrs: { eastAsianLayout: {} } } })).toBeUndefined();
      expect(translator.decode({ node: { attrs: {} } })).toBeUndefined();
    });
  });

  it('has correct metadata', () => {
    expect(translator.xmlName).toBe('w:eastAsianLayout');
    expect(translator.sdNodeOrKeyName).toBe('eastAsianLayout');
  });
});
