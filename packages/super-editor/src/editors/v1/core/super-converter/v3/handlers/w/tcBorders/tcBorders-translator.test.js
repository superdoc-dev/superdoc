import { describe, it, expect, vi } from 'vitest';

// Mock the individual border property translators
vi.mock('../bottom', () => ({
  translator: {
    xmlName: 'w:bottom',
    sdNodeOrKeyName: 'bottom',
    encode: vi.fn(() => 'encoded_bottom'),
    decode: vi.fn(() => ({ name: 'w:bottom' })),
  },
}));
vi.mock('../end', () => ({
  translator: {
    xmlName: 'w:end',
    sdNodeOrKeyName: 'end',
    encode: vi.fn(() => 'encoded_end'),
    decode: vi.fn(() => ({ name: 'w:end' })),
  },
}));
vi.mock('../insideH', () => ({
  translator: {
    xmlName: 'w:insideH',
    sdNodeOrKeyName: 'insideH',
    encode: vi.fn(() => 'encoded_insideH'),
    decode: vi.fn(() => ({ name: 'w:insideH' })),
  },
}));
vi.mock('../insideV', () => ({
  translator: {
    xmlName: 'w:insideV',
    sdNodeOrKeyName: 'insideV',
    encode: vi.fn(() => 'encoded_insideV'),
    decode: vi.fn(() => ({ name: 'w:insideV' })),
  },
}));
vi.mock('../left', () => ({
  translator: {
    xmlName: 'w:left',
    sdNodeOrKeyName: 'left',
    encode: vi.fn(() => 'encoded_left'),
    decode: vi.fn(() => ({ name: 'w:left' })),
  },
}));
vi.mock('../right', () => ({
  translator: {
    xmlName: 'w:right',
    sdNodeOrKeyName: 'right',
    encode: vi.fn(() => 'encoded_right'),
    decode: vi.fn(() => ({ name: 'w:right' })),
  },
}));
vi.mock('../start', () => ({
  translator: {
    xmlName: 'w:start',
    sdNodeOrKeyName: 'start',
    encode: vi.fn(() => 'encoded_start'),
    decode: vi.fn(() => ({ name: 'w:start' })),
  },
}));
vi.mock('../top', () => ({
  translator: {
    xmlName: 'w:top',
    sdNodeOrKeyName: 'top',
    encode: vi.fn(() => 'encoded_top'),
    decode: vi.fn(() => ({ name: 'w:top' })),
  },
}));

import { translator } from './tcBorders-translator.js';

describe('w:tcBorders translator', () => {
  describe('config', () => {
    it('should have correct properties', () => {
      expect(translator.xmlName).toBe('w:tcBorders');
      expect(translator.sdNodeOrKeyName).toBe('borders');
    });
  });

  describe('encode', () => {
    it('encodes a <w:tcBorders> element by calling its property translators', () => {
      const params = {
        nodes: [
          {
            name: 'w:tcBorders',
            elements: [
              { name: 'w:top', attributes: { 'w:val': 'single' } },
              { name: 'w:left', attributes: { 'w:val': 'double' } },
              { name: 'w:insideH', attributes: { 'w:val': 'dashed' } },
              { name: 'w:insideV', attributes: { 'w:val': 'dashed' } },
            ],
          },
        ],
      };

      const result = translator.encode(params);

      // The result should be an object with keys matching the sdNodeOrKeyName of the child translators
      expect(result).toEqual({
        top: 'encoded_top',
        left: 'encoded_left',
        insideH: 'encoded_insideH',
        insideV: 'encoded_insideV',
      });
    });

    it('returns undefined for an empty <w:tcBorders> element', () => {
      const params = {
        nodes: [
          {
            name: 'w:tcBorders',
            elements: [],
          },
        ],
      };

      const result = translator.encode(params);
      expect(result).toBeUndefined();
    });
  });

  describe('decode', () => {
    it('decodes a borders object by calling its property translators', () => {
      const params = {
        node: {
          attrs: {
            borders: {
              top: { val: 'single' },
              right: { val: 'double' },
              start: { val: 'dashed' },
            },
          },
        },
      };

      const result = translator.decode(params);

      expect(result.name).toBe('w:tcBorders');
      expect(result.elements).toEqual([
        // The order depends on Object.keys, which is generally insertion order for non-numeric keys
        { name: 'w:top' },
        { name: 'w:right' },
        { name: 'w:start' },
      ]);
    });

    it('returns undefined for an empty borders object', () => {
      const params = {
        node: {
          attrs: {
            borders: {},
          },
        },
      };
      const result = translator.decode(params);
      expect(result).toBeUndefined();
    });

    it('handles a missing borders attribute gracefully', () => {
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
