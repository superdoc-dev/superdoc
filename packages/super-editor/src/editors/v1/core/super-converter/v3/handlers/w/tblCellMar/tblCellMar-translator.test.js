import { describe, it, expect, vi } from 'vitest';

// Mock the individual margin property translators
vi.mock('../bottom', () => ({
  marginBottomTranslator: {
    xmlName: 'w:bottom',
    sdNodeOrKeyName: 'marginBottom',
    encode: vi.fn(() => 'encoded_marginBottom'),
    decode: vi.fn(() => ({ name: 'w:bottom' })),
  },
}));
vi.mock('../end', () => ({
  marginEndTranslator: {
    xmlName: 'w:end',
    sdNodeOrKeyName: 'marginEnd',
    encode: vi.fn(() => 'encoded_marginEnd'),
    decode: vi.fn(() => ({ name: 'w:end' })),
  },
}));
vi.mock('../left', () => ({
  marginLeftTranslator: {
    xmlName: 'w:left',
    sdNodeOrKeyName: 'marginLeft',
    encode: vi.fn(() => 'encoded_marginLeft'),
    decode: vi.fn(() => ({ name: 'w:left' })),
  },
}));
vi.mock('../right', () => ({
  marginRightTranslator: {
    xmlName: 'w:right',
    sdNodeOrKeyName: 'marginRight',
    encode: vi.fn(() => 'encoded_marginRight'),
    decode: vi.fn(() => ({ name: 'w:right' })),
  },
}));
vi.mock('../start', () => ({
  marginStartTranslator: {
    xmlName: 'w:start',
    sdNodeOrKeyName: 'marginStart',
    encode: vi.fn(() => 'encoded_marginStart'),
    decode: vi.fn(() => ({ name: 'w:start' })),
  },
}));
vi.mock('../top', () => ({
  marginTopTranslator: {
    xmlName: 'w:top',
    sdNodeOrKeyName: 'marginTop',
    encode: vi.fn(() => 'encoded_marginTop'),
    decode: vi.fn(() => ({ name: 'w:top' })),
  },
}));

import { translator } from './tblCellMar-translator.js';
import { NodeTranslator } from '@translator';

describe('w:tblCellMar translator', () => {
  describe('config', () => {
    it('should have correct properties', () => {
      expect(translator.xmlName).toBe('w:tblCellMar');
      expect(translator.sdNodeOrKeyName).toBe('cellMargins');
    });
  });

  describe('encode', () => {
    it('encodes a <w:tblCellMar> element by calling its property translators', () => {
      const params = {
        nodes: [
          {
            name: 'w:tblCellMar',
            elements: [
              { name: 'w:top', attributes: { 'w:w': '100' } },
              { name: 'w:left', attributes: { 'w:w': '120' } },
              { name: 'w:start', attributes: { 'w:w': '140' } },
            ],
          },
        ],
      };

      const result = translator.encode(params);

      // The result should be an object with keys matching the sdNodeOrKeyName of the child translators
      expect(result).toEqual({
        marginTop: 'encoded_marginTop',
        marginLeft: 'encoded_marginLeft',
        marginStart: 'encoded_marginStart',
      });
    });

    it('returns undefined for an empty <w:tblCellMar> element', () => {
      const params = {
        nodes: [
          {
            name: 'w:tblCellMar',
            elements: [],
          },
        ],
      };

      const result = translator.encode(params);
      expect(result).toBeUndefined();
    });
  });

  describe('decode', () => {
    it('decodes a cellMargins object in CT_TblCellMar sequence order', () => {
      // CT_TblCellMar has identical sequence to CT_TcMar per ECMA-376 §A.1:
      // top, start, left, bottom, end, right. Insertion order is scrambled
      // here to prove the decoder sorts rather than emitting in attr order.
      const params = {
        node: {
          attrs: {
            cellMargins: {
              marginRight: { value: 120 },
              marginTop: { value: 100 },
              marginBottom: { value: 140 },
            },
          },
        },
      };

      const result = translator.decode(params);

      expect(result.name).toBe('w:tblCellMar');
      // Sequence: top (0), bottom (3), right (5). Position-by-position.
      expect(result.elements).toEqual([{ name: 'w:top' }, { name: 'w:bottom' }, { name: 'w:right' }]);
    });

    it('emits all six children in CT_TblCellMar sequence order when present', () => {
      const params = {
        node: {
          attrs: {
            cellMargins: {
              marginEnd: { value: 60 },
              marginRight: { value: 70 },
              marginBottom: { value: 40 },
              marginLeft: { value: 30 },
              marginStart: { value: 20 },
              marginTop: { value: 10 },
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
