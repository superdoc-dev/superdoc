import { describe, it, expect } from 'vitest';
import { translator } from './legacy-translator.js';

describe('legacy-translator', () => {
  describe('decode', () => {
    it('should return the decoded attributes from a node', () => {
      const node = {
        attrs: {
          legacy: {
            legacy: true,
            legacySpace: 120,
            legacyIndent: 240,
          },
        },
      };
      expect(translator.decode({ node })).toEqual({
        attributes: {
          'w:legacy': '1',
          'w:legacySpace': '120',
          'w:legacyIndent': '240',
        },
      });
    });

    it('should return only the existing attributes from a node', () => {
      const node = {
        attrs: {
          legacy: {
            legacySpace: 120,
          },
        },
      };
      expect(translator.decode({ node })).toEqual({
        attributes: {
          'w:legacySpace': '120',
        },
      });
    });

    it('should return undefined if "legacy" attribute is not present in the node', () => {
      const node = {
        attrs: {},
      };
      expect(translator.decode({ node })).toBeUndefined();
    });

    it('should return undefined if "legacy" attribute is an empty object', () => {
      const node = {
        attrs: {
          legacy: {},
        },
      };
      expect(translator.decode({ node })).toBeUndefined();
    });

    it('should handle numeric string values for integer attributes', () => {
      const node = {
        attrs: {
          legacy: {
            legacySpace: '120',
            legacyIndent: '240',
          },
        },
      };
      expect(translator.decode({ node })).toEqual({
        attributes: {
          'w:legacySpace': '120',
          'w:legacyIndent': '240',
        },
      });
    });
  });

  describe('encode', () => {
    it('should return the encoded attributes for a w:legacy node', () => {
      const sdNode = {
        attributes: {
          'w:legacy': '1',
          'w:legacySpace': '120',
          'w:legacyIndent': '240',
        },
      };
      expect(translator.encode({ nodes: [sdNode] })).toEqual({
        legacy: true,
        legacySpace: 120,
        legacyIndent: 240,
      });
    });

    it('should return only the existing attributes for a w:legacy node', () => {
      const sdNode = {
        attributes: {
          'w:legacySpace': '120',
        },
      };
      expect(translator.encode({ nodes: [sdNode] })).toEqual({
        legacySpace: 120,
      });
    });

    it('should return an empty object for a w:legacy node if no attributes are passed', () => {
      const sdNode = {
        attributes: {},
      };
      expect(translator.encode({ nodes: [sdNode] })).toEqual({});
    });
  });
});
