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
    it('decodes a cellMargins object into a <w:tcMar> element', () => {
      const params = {
        node: {
          attrs: {
            cellMargins: {
              marginTop: { value: 10, type: 'dxa' },
              marginRight: { value: 20, type: 'dxa' },
              marginStart: { value: 30, type: 'dxa' },
            },
          },
        },
      };

      const result = translator.decode(params);

      expect(result.name).toBe('w:tcMar');
      const expectedElements = [
        expect.objectContaining({ name: 'w:top', attributes: { 'w:w': '10', 'w:type': 'dxa' } }),
        expect.objectContaining({ name: 'w:right', attributes: { 'w:w': '20', 'w:type': 'dxa' } }),
        expect.objectContaining({ name: 'w:start', attributes: { 'w:w': '30', 'w:type': 'dxa' } }),
      ];
      expect(result.elements).toEqual(expect.arrayContaining(expectedElements));
      expect(result.elements.length).toBe(3);
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
