// @ts-check
import { describe, it, expect } from 'vitest';
import { translator } from './caps-translator.js';
import { NodeTranslator } from '../../../node-translator/node-translator.js';

describe('w:caps translator (attribute)', () => {
  it('exposes correct translator meta', () => {
    expect(translator.xmlName).toBe('w:caps');
    expect(translator.sdNodeOrKeyName).toBe('textTransform');
  });

  describe('encode', () => {
    it('encodes to uppercase when val is not "false" or "0"', () => {
      const params = { nodes: [{ attributes: { 'w:val': '1' } }] };
      const out = translator.encode(params);
      expect(out).toEqual('uppercase');
    });

    it('encodes to "none" when val is "false"', () => {
      const params = { nodes: [{ attributes: { 'w:val': 'false' } }] };
      const out = translator.encode(params);
      expect(out).toEqual('none');
    });

    it('encodes to "none" when val is "0"', () => {
      const params = { nodes: [{ attributes: { 'w:val': '0' } }] };
      const out = translator.encode(params);
      expect(out).toEqual('none');
    });

    it('encodes to uppercase when attributes are empty', () => {
      const params = { nodes: [{ attributes: {} }] };
      const out = translator.encode(params);
      expect(out).toEqual('uppercase');
    });
  });
});
