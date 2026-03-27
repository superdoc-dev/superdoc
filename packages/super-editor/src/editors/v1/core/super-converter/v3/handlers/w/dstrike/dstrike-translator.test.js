import { describe, it, expect } from 'vitest';

import { translator } from './dstrike-translator.js';
import { NodeTranslator } from '../../../node-translator/node-translator.js';

describe('w:dstrike translator (attribute)', () => {
  it('exposes correct config meta', () => {
    expect(translator.xmlName).toBe('w:dstrike');
    expect(translator.sdNodeOrKeyName).toBe('dstrike');
  });

  it('builds NodeTranslator instance', () => {
    expect(translator).toBeInstanceOf(NodeTranslator);
    expect(translator.xmlName).toBe('w:dstrike');
    expect(translator.sdNodeOrKeyName).toBe('dstrike');
  });

  describe('encode', () => {
    it('normalizes boolean attributes', () => {
      const params = { nodes: [{ attributes: { 'w:val': '0' } }] };
      const outFalse = translator.encode(params, { dstrike: false });
      expect(outFalse).toEqual(false);

      const outTrue = translator.encode({ nodes: [{ attributes: { 'w:val': '1' } }] });
      expect(outTrue).toEqual(true);

      const fallback = translator.encode({ nodes: [{ attributes: {} }] });
      expect(fallback).toEqual(true);
    });
  });
});
