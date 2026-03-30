import { describe, it, expect } from 'vitest';

import { translator } from './color-translator.js';
import { NodeTranslator } from '../../../node-translator/node-translator.js';

describe('w:color translator (attribute)', () => {
  it('exposes correct translator meta', () => {
    expect(translator.xmlName).toBe('w:color');
    expect(translator.sdNodeOrKeyName).toBe('color');
  });

  it('builds NodeTranslator instance', () => {
    expect(translator).toBeInstanceOf(NodeTranslator);
    expect(translator.xmlName).toBe('w:color');
    expect(translator.sdNodeOrKeyName).toBe('color');
  });

  describe('encode', () => {
    it('returns encoded attributes directly', () => {
      const out = translator.encode({
        nodes: [
          {
            attributes: { 'w:val': '00FF00', 'w:themeColor': 'accent1' },
          },
        ],
      });
      expect(out).toEqual({ val: '00FF00', themeColor: 'accent1' });
    });

    it('returns empty attributes when nothing encoded', () => {
      const out = translator.encode({ nodes: [{ attributes: {} }] });
      expect(out).toEqual({});
    });
  });
});
