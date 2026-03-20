import { describe, it, expect, vi } from 'vitest';
// Mock the individual border property translators
vi.mock('../bottom', () => ({
  translator: {
    xmlName: 'w:bottom',
    sdNodeOrKeyName: 'bottom',
    encode: mock(() => 'encoded_bottom'),
    decode: mock(() => ({ name: 'w:bottom' })),
  },
}));
vi.mock('../end', () => ({
  translator: {
    xmlName: 'w:end',
    sdNodeOrKeyName: 'end',
    encode: mock(() => 'encoded_end'),
    decode: mock(() => ({ name: 'w:end' })),
  },
}));
vi.mock('../insideH', () => ({
  translator: {
    xmlName: 'w:insideH',
    sdNodeOrKeyName: 'insideH',
    encode: mock(() => 'encoded_insideH'),
    decode: mock(() => ({ name: 'w:insideH' })),
  },
}));
vi.mock('../insideV', () => ({
  translator: {
    xmlName: 'w:insideV',
    sdNodeOrKeyName: 'insideV',
    encode: mock(() => 'encoded_insideV'),
    decode: mock(() => ({ name: 'w:insideV' })),
  },
}));
vi.mock('../left', () => ({
  translator: {
    xmlName: 'w:left',
    sdNodeOrKeyName: 'left',
    encode: mock(() => 'encoded_left'),
    decode: mock(() => ({ name: 'w:left' })),
  },
}));
vi.mock('../right', () => ({
  translator: {
    xmlName: 'w:right',
    sdNodeOrKeyName: 'right',
    encode: mock(() => 'encoded_right'),
    decode: mock(() => ({ name: 'w:right' })),
  },
}));
vi.mock('../start', () => ({
  translator: {
    xmlName: 'w:start',
    sdNodeOrKeyName: 'start',
    encode: mock(() => 'encoded_start'),
    decode: mock(() => ({ name: 'w:start' })),
  },
}));
vi.mock('../top', () => ({
  translator: {
    xmlName: 'w:top',
    sdNodeOrKeyName: 'top',
    encode: mock(() => 'encoded_top'),
    decode: mock(() => ({ name: 'w:top' })),
  },
}));

const { translator } = await import('./tcBorders-translator.js');

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
