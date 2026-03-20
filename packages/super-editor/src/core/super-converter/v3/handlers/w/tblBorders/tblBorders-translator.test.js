import { describe, it, expect, mock } from 'bun:test';
// Mock the individual border property translators
mock.module('../bottom', () => ({
  translator: {
    xmlName: 'w:bottom',
    sdNodeOrKeyName: 'bottom',
    encode: mock(() => 'encoded_bottom'),
    decode: mock(() => ({ name: 'w:bottom' })),
  },
}));
mock.module('../end', () => ({
  translator: {
    xmlName: 'w:end',
    sdNodeOrKeyName: 'end',
    encode: mock(() => 'encoded_end'),
    decode: mock(() => ({ name: 'w:end' })),
  },
}));
mock.module('../insideH', () => ({
  translator: {
    xmlName: 'w:insideH',
    sdNodeOrKeyName: 'insideH',
    encode: mock(() => 'encoded_insideH'),
    decode: mock(() => ({ name: 'w:insideH' })),
  },
}));
mock.module('../insideV', () => ({
  translator: {
    xmlName: 'w:insideV',
    sdNodeOrKeyName: 'insideV',
    encode: mock(() => 'encoded_insideV'),
    decode: mock(() => ({ name: 'w:insideH' })),
  },
}));
mock.module('../left', () => ({
  translator: {
    xmlName: 'w:left',
    sdNodeOrKeyName: 'left',
    encode: mock(() => 'encoded_left'),
    decode: mock(() => ({ name: 'w:left' })),
  },
}));
mock.module('../right', () => ({
  translator: {
    xmlName: 'w:right',
    sdNodeOrKeyName: 'right',
    encode: mock(() => 'encoded_right'),
    decode: mock(() => ({ name: 'w:right' })),
  },
}));
mock.module('../start', () => ({
  translator: {
    xmlName: 'w:start',
    sdNodeOrKeyName: 'start',
    encode: mock(() => 'encoded_start'),
    decode: mock(() => ({ name: 'w:start' })),
  },
}));
mock.module('../top', () => ({
  translator: {
    xmlName: 'w:top',
    sdNodeOrKeyName: 'top',
    encode: mock(() => 'encoded_top'),
    decode: mock(() => ({ name: 'w:top' })),
  },
}));

const { translator } = await import('./tblBorders-translator.js');

describe('w:tblBorders translator', () => {
  describe('config', () => {
    it('should have correct properties', () => {
      expect(translator.xmlName).toBe('w:tblBorders');
      expect(translator.sdNodeOrKeyName).toBe('borders');
    });
  });

  describe('encode', () => {
    it('encodes a <w:tblBorders> element by calling its property translators', () => {
      const params = {
        nodes: [
          {
            name: 'w:tblBorders',
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

    it('returns undefined for an empty <w:tblBorders> element', () => {
      const params = {
        nodes: [
          {
            name: 'w:tblBorders',
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

      expect(result.name).toBe('w:tblBorders');
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
