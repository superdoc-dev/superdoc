import { describe, it, expect } from 'vitest';
import { translator } from './lang-translator';

describe('lang-translator', () => {
  describe('decode', () => {
    it('should return the decoded attributes from a node', () => {
      const node = {
        attrs: {
          lang: {
            val: 'en-US',
            eastAsia: 'ja-JP',
            bidi: 'ar-SA',
          },
        },
      };
      expect(translator.decode({ node })).toEqual({
        attributes: {
          'w:val': 'en-US',
          'w:eastAsia': 'ja-JP',
          'w:bidi': 'ar-SA',
        },
      });
    });

    it('should return only the existing attributes from a node', () => {
      const node = {
        attrs: {
          lang: {
            val: 'en-US',
          },
        },
      };
      expect(translator.decode({ node })).toEqual({
        attributes: {
          'w:val': 'en-US',
        },
      });
    });

    it('should return undefined if "lang" attribute is not present in the node', () => {
      const node = {
        attrs: {},
      };
      expect(translator.decode({ node })).toBeUndefined();
    });

    it('should return undefined if "lang" attribute is an empty object', () => {
      const node = {
        attrs: {
          lang: {},
        },
      };
      expect(translator.decode({ node })).toBeUndefined();
    });
  });

  describe('encode', () => {
    it('should return the encoded attributes for a w:lang node', () => {
      const sdNode = {
        attributes: {
          'w:val': 'en-US',
          'w:eastAsia': 'ja-JP',
          'w:bidi': 'ar-SA',
        },
      };
      expect(translator.encode({ nodes: [sdNode] })).toEqual({
        val: 'en-US',
        eastAsia: 'ja-JP',
        bidi: 'ar-SA',
      });
    });

    it('should return only the existing attributes for a w:lang node', () => {
      const sdNode = {
        attributes: {
          'w:val': 'en-US',
        },
      };
      expect(translator.encode({ nodes: [sdNode] })).toEqual({
        val: 'en-US',
      });
    });

    it('should return an empty object for a w:lang node if no attributes are passed', () => {
      const sdNode = {
        attributes: {},
      };
      expect(translator.encode({ nodes: [sdNode] })).toEqual({});
    });
  });
});
