import { describe, it, expect } from 'vitest';

import { translator } from './vanish-translator.js';
import { NodeTranslator } from '../../../node-translator/node-translator.js';

describe('w:vanish translator (attribute)', () => {
  it('exposes correct translator meta', () => {
    expect(translator.xmlName).toBe('w:vanish');
    expect(translator.sdNodeOrKeyName).toBe('vanish');
    expect(typeof translator.encode).toBe('function');
  });

  it('builds NodeTranslator instance', () => {
    expect(translator).toBeInstanceOf(NodeTranslator);
    expect(translator.xmlName).toBe('w:vanish');
    expect(translator.sdNodeOrKeyName).toBe('vanish');
  });

  describe('encode', () => {
    it('encodes with provided w:val as-is', () => {
      const params = { nodes: [{ attributes: { 'w:val': '1' } }] };
      const out = translator.encode(params);
      expect(out).toBe(true);
    });

    it('passes through raw attributes when missing encoded boolean', () => {
      const params = { nodes: [{ attributes: {} }] };
      const out = translator.encode(params);
      expect(out).toBe(true);
    });
  });
});
