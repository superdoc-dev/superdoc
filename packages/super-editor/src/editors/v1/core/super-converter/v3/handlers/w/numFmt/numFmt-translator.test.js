import { describe, it, expect } from 'vitest';
import { translator } from './numFmt-translator.js';

describe('numFmt-translator', () => {
  describe('decode', () => {
    it('should return the decoded attributes from a node', () => {
      const node = {
        attrs: {
          numFmt: {
            val: 'decimal',
            format: '1.',
          },
        },
      };
      expect(translator.decode({ node })).toEqual({
        attributes: {
          'w:val': 'decimal',
          'w:format': '1.',
        },
      });
    });

    it('should return only the existing attributes from a node', () => {
      const node = {
        attrs: {
          numFmt: {
            val: 'decimal',
          },
        },
      };
      expect(translator.decode({ node })).toEqual({
        attributes: {
          'w:val': 'decimal',
        },
      });
    });

    it('should return undefined if "numFmt" attribute is not present in the node', () => {
      const node = {
        attrs: {},
      };
      expect(translator.decode({ node })).toBeUndefined();
    });

    it('should return undefined if "numFmt" attribute is an empty object', () => {
      const node = {
        attrs: {
          numFmt: {},
        },
      };
      expect(translator.decode({ node })).toBeUndefined();
    });
  });

  describe('encode', () => {
    it('should return the encoded attributes for a w:numFmt node', () => {
      const sdNode = {
        attributes: {
          'w:val': 'decimal',
          'w:format': '1.',
        },
      };
      expect(translator.encode({ nodes: [sdNode] })).toEqual({
        val: 'decimal',
        format: '1.',
      });
    });

    it('should return only the existing attributes for a w:numFmt node', () => {
      const sdNode = {
        attributes: {
          'w:val': 'decimal',
        },
      };
      expect(translator.encode({ nodes: [sdNode] })).toEqual({
        val: 'decimal',
      });
    });

    it('should return an empty object for a w:numFmt node if no attributes are passed', () => {
      const sdNode = {
        attributes: {},
      };
      expect(translator.encode({ nodes: [sdNode] })).toEqual({});
    });
  });
});
