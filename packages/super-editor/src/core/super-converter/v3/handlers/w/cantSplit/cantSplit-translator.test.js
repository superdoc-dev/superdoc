import { describe, it, expect } from 'vitest';
import { translator } from './cantSplit-translator.js';

describe('w:cantSplit translator', () => {
  it('encodes w:cantSplit to true', () => {
    expect(translator.encode({ nodes: [{ attributes: { 'w:val': '1' } }] })).toBe(true);
    expect(translator.encode({ nodes: [{ attributes: { 'w:val': 'true' } }] })).toBe(true);
    expect(translator.encode({ nodes: [{ attributes: {} }] })).toBe(true); // defaults to '1'
  });

  it('encodes w:cantSplit to false', () => {
    expect(translator.encode({ nodes: [{ attributes: { 'w:val': '0' } }] })).toBe(false);
    expect(translator.encode({ nodes: [{ attributes: { 'w:val': 'false' } }] })).toBe(false);
  });

  it('decodes cantSplit: true to w:cantSplit element', () => {
    expect(translator.decode({ node: { attrs: { cantSplit: true } } })).toEqual({ attributes: {} });
  });

  it('decodes cantSplit: false to undefined', () => {
    expect(translator.decode({ node: { attrs: { cantSplit: false } } })).toBeUndefined();
    expect(translator.decode({ node: { attrs: {} } })).toBeUndefined();
  });

  it('has correct metadata', () => {
    expect(translator.xmlName).toBe('w:cantSplit');
    expect(translator.sdNodeOrKeyName).toBe('cantSplit');
  });
});
