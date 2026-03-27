import { describe, it, expect } from 'vitest';

import { translator } from './i-translator.js';
import { NodeTranslator } from '../../../node-translator/node-translator.js';

describe('w:i translator (attribute)', () => {
  it('exposes correct translator meta', () => {
    expect(translator.xmlName).toBe('w:i');
    expect(translator.sdNodeOrKeyName).toBe('italic');
  });

  it('builds NodeTranslator instance', () => {
    expect(translator).toBeInstanceOf(NodeTranslator);
    expect(translator.xmlName).toBe('w:i');
    expect(translator.sdNodeOrKeyName).toBe('italic');
  });

  describe('encode', () => {
    it('copies existing w:val', () => {
      const params = { nodes: [{ attributes: { 'w:val': '0' } }] };
      const out = translator.encode(params);
      expect(out).toBe(false);
    });

    it('defaults w:val to null when missing', () => {
      const params = { nodes: [{ attributes: {} }] };
      const out = translator.encode(params);
      expect(out).toBe(true);
    });
  });
});
