import { describe, it, expect } from 'vitest';

import { translator } from './tcMar-translator.js';

describe('w:tcMar translator', () => {
  describe('config', () => {
    it('should have correct properties', () => {
      expect(translator.xmlName).toBe('w:tcMar');
      expect(translator.sdNodeOrKeyName).toBe('cellMargins');
    });
  });

  describe('encode', () => {
    it('encodes a <w:tcMar> element with margin properties', () => {
      const params = {
        nodes: [
          {
            name: 'w:tcMar',
            type: 'element',
            attributes: {},
            elements: [
              { name: 'w:top', type: 'element', attributes: { 'w:w': '10', 'w:type': 'dxa' }, elements: [] },
              { name: 'w:left', type: 'element', attributes: { 'w:w': '20', 'w:type': 'dxa' }, elements: [] },
              { name: 'w:bottom', type: 'element', attributes: { 'w:w': '30', 'w:type': 'dxa' }, elements: [] },
            ],
          },
        ],
      };

      const result = translator.encode(params);

      expect(result).toEqual({
        marginTop: { value: 10, type: 'dxa' },
        marginLeft: { value: 20, type: 'dxa' },
        marginBottom: { value: 30, type: 'dxa' },
      });
    });

    it('returns undefined for an empty <w:tcMar> element', () => {
      const params = {
        nodes: [
          {
            name: 'w:tcMar',
            elements: [],
          },
        ],
      };

      const result = translator.encode(params);
      expect(result).toBeUndefined();
    });

    it('ignores unknown elements', () => {
      const params = {
        nodes: [
          {
            name: 'w:tcMar',
            elements: [
              { name: 'w:top', type: 'element', attributes: { 'w:w': '10', 'w:type': 'dxa' }, elements: [] },
              { name: 'w:unknown', type: 'element', attributes: { 'w:val': 'test' }, elements: [] },
            ],
          },
        ],
      };

      const result = translator.encode(params);

      expect(result).toEqual({
        marginTop: { value: 10, type: 'dxa' },
      });
    });
  });

  describe('decode', () => {
    it('decodes a cellMargins object into a <w:tcMar> element in CT_TcMar sequence order', () => {
      // Insertion order here is intentionally scrambled to prove the decoder
      // sorts into the ECMA-376 §A.1 CT_TcMar sequence: top, start, left,
      // bottom, end, right.
      const params = {
        node: {
          attrs: {
            cellMargins: {
              marginRight: { value: 20, type: 'dxa' },
              marginStart: { value: 30, type: 'dxa' },
              marginTop: { value: 10, type: 'dxa' },
            },
          },
        },
      };

      const result = translator.decode(params);

      expect(result.name).toBe('w:tcMar');
      // Sequence: top (0), start (1), right (5). Note: position-by-position.
      expect(result.elements).toEqual([
        expect.objectContaining({ name: 'w:top', attributes: { 'w:w': '10', 'w:type': 'dxa' } }),
        expect.objectContaining({ name: 'w:start', attributes: { 'w:w': '30', 'w:type': 'dxa' } }),
        expect.objectContaining({ name: 'w:right', attributes: { 'w:w': '20', 'w:type': 'dxa' } }),
      ]);
    });

    it('emits all six children in CT_TcMar sequence order when present', () => {
      const params = {
        node: {
          attrs: {
            cellMargins: {
              marginEnd: { value: 60, type: 'dxa' },
              marginRight: { value: 70, type: 'dxa' },
              marginBottom: { value: 40, type: 'dxa' },
              marginLeft: { value: 30, type: 'dxa' },
              marginStart: { value: 20, type: 'dxa' },
              marginTop: { value: 10, type: 'dxa' },
            },
          },
        },
      };

      const result = translator.decode(params);
      const names = result.elements.map((el) => el.name);
      expect(names).toEqual(['w:top', 'w:start', 'w:left', 'w:bottom', 'w:end', 'w:right']);
    });

    it('returns undefined for an empty cellMargins object', () => {
      const params = {
        node: {
          attrs: {
            cellMargins: {},
          },
        },
      };
      const result = translator.decode(params);
      expect(result).toBeUndefined();
    });

    it('handles a missing cellMargins attribute gracefully', () => {
      const params = {
        node: {
          attrs: {},
        },
      };
      const result = translator.decode(params);
      expect(result).toBeUndefined();
    });
  });
});
