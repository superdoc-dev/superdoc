import { describe, it, expect } from 'vitest';

import { translator } from './bCs-translator.js';

describe('w:bCs translator (attribute)', () => {
  it('exposes correct translator meta', () => {
    expect(translator.xmlName).toBe('w:bCs');
    expect(translator.sdNodeOrKeyName).toBe('boldCs');
  });

  describe('encode', () => {
    it('encodes with provided w:val as-is', () => {
      const params = { nodes: [{ attributes: { 'w:val': '1' } }] };
      const out = translator.encode(params);
      expect(out).toEqual(true);
    });

    it('passes through raw attributes when missing encoded boolean', () => {
      const params = { nodes: [{ attributes: {} }] };
      const out = translator.encode(params);
      expect(out).toEqual(true);
    });
  });
});
