import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NodeTranslator, TranslatorTypes } from './index.js';

describe('NodeTranslator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('exposes TranslatorTypes and static translatorTypes', () => {
    expect(TranslatorTypes).toEqual({ NODE: 'node', ATTRIBUTE: 'attribute' });
    expect(NodeTranslator.translatorTypes).toBe(TranslatorTypes);
  });

  it('NodeTranslator.from validates encode/decode and returns a frozen instance', () => {
    const cfg = {
      xmlName: 'w:test',
      sdNodeOrKeyName: 'test',
      encode: vi.fn(() => ({ type: 'x' })),
      decode: vi.fn(() => ({ name: 'w:x', elements: [] })),
      attributes: [],
    };
    const t = NodeTranslator.from(cfg);
    expect(Object.isFrozen(t)).toBe(true);
    expect(t.xmlName).toBe('w:test');
    expect(t.sdNodeOrKeyName).toBe('test');
    expect(typeof t.encode).toBe('function');
    expect(typeof t.decode).toBe('function');
  });

  it('NodeTranslator.from throws when encode is not a function', () => {
    const bad = { xmlName: 'x', sdNodeOrKeyName: 'y', encode: null, decode: () => ({}) };
    expect(() => NodeTranslator.from(bad)).toThrow(/encode\/decode must be functions/);
  });

  it('NodeTranslator.from throws when decode is provided but not a function', () => {
    const bad = { xmlName: 'x', sdNodeOrKeyName: 'y', encode: () => ({}), decode: 123 };
    expect(() => NodeTranslator.from(bad)).toThrow(/encode\/decode must be functions/);
  });

  it('defaults matchesEncode/matchesDecode to functions returning true', () => {
    const cfg = {
      xmlName: 'w:test',
      sdNodeOrKeyName: 'test',
      encode: vi.fn(() => ({ type: 'x' })),
      decode: vi.fn(() => ({ name: 'w:x', elements: [] })),
    };
    const t = NodeTranslator.from(cfg);
    expect(t.matchesEncode([], {})).toBe(true);
    expect(t.matchesDecode({}, {})).toBe(true);
  });

  describe('encodeAttributes', () => {
    it('calls attribute encoders; keeps 0, "", false; drops null/undefined;', () => {
      const encA = vi.fn(() => 0); // keep
      const encB = vi.fn(() => ''); // keep
      const encC = vi.fn(() => false); // keep
      const encD = vi.fn(() => null); // drop
      const encE = vi.fn(() => undefined); // drop

      const t = NodeTranslator.from({
        xmlName: 'w:test',
        sdNodeOrKeyName: 'test',
        encode: vi.fn(() => ({ type: 'x' })),
        decode: vi.fn(() => ({ name: 'w:x', elements: [] })),
        attributes: [
          { xmlName: 'w:a', sdName: 'a', encode: encA },
          { xmlName: 'w:b', sdName: 'b', encode: encB },
          { xmlName: 'w:c', sdName: 'c', encode: encC },
          { xmlName: 'w:d', sdName: 'd', encode: encD },
          { xmlName: 'w:e', sdName: 'e', encode: encE },
        ],
      });

      const res = t.encodeAttributes({
        nodes: [{ attributes: { 'w:x': 'x' } }],
      });

      expect(res).toEqual({ a: 0, b: '', c: false });

      expect(encA).toHaveBeenCalledTimes(1);
      expect(encB).toHaveBeenCalledTimes(1);
      expect(encC).toHaveBeenCalledTimes(1);
      expect(encD).toHaveBeenCalledTimes(1);
      expect(encE).toHaveBeenCalledTimes(1);
    });

    it('skips attributes without an encode function', () => {
      const enc = vi.fn(() => 'ok');
      const t = NodeTranslator.from({
        xmlName: 'w:test',
        sdNodeOrKeyName: 'test',
        encode: vi.fn(() => ({ type: 'x' })),
        decode: vi.fn(() => ({ name: 'w:x', elements: [] })),
        attributes: [
          { xmlName: 'w:a', sdName: 'a', encode: enc },
          { xmlName: 'w:b', sdName: 'b' }, // no encode
        ],
      });

      const res = t.encodeAttributes({ nodes: [{ attributes: {} }] });
      expect(res).toEqual({ a: 'ok' });
      expect(enc).toHaveBeenCalledTimes(1);
    });

    it('handles missing params/nodes gracefully', () => {
      const enc = vi.fn(() => 'x');
      const t = NodeTranslator.from({
        xmlName: 'w:test',
        sdNodeOrKeyName: 'test',
        encode: vi.fn(() => ({ type: 'x' })),
        decode: vi.fn(() => ({ name: 'w:x', elements: [] })),
        attributes: [{ xmlName: 'w:a', sdName: 'a', encode: enc }],
      });

      const res = t.encodeAttributes({});
      expect(res).toEqual({ a: 'x' });
    });
  });

  describe('decodeAttributes', () => {
    it('calls attribute decoders; keeps 0, "", false; drops null/undefined;', () => {
      const decA = vi.fn(() => 0); // keep
      const decB = vi.fn(() => ''); // keep
      const decC = vi.fn(() => false); // keep
      const decD = vi.fn(() => null); // drop
      const decE = vi.fn(() => undefined); // drop

      const t = NodeTranslator.from({
        xmlName: 'w:test',
        sdNodeOrKeyName: 'test',
        encode: vi.fn(() => ({ type: 'x' })),
        decode: vi.fn(() => ({ name: 'w:x', elements: [] })),
        attributes: [
          { xmlName: 'w:a', sdName: 'a', decode: decA },
          { xmlName: 'w:b', sdName: 'b', decode: decB },
          { xmlName: 'w:c', sdName: 'c', decode: decC },
          { xmlName: 'w:d', sdName: 'd', decode: decD },
          { xmlName: 'w:e', sdName: 'e', decode: decE },
        ],
      });

      const res = t.decodeAttributes({
        node: { attrs: { a: 1 } },
      });

      expect(res).toEqual({ 'w:a': 0, 'w:b': '', 'w:c': false });

      expect(decA).toHaveBeenCalledTimes(1);
      expect(decB).toHaveBeenCalledTimes(1);
      expect(decC).toHaveBeenCalledTimes(1);
      expect(decD).toHaveBeenCalledTimes(1);
      expect(decE).toHaveBeenCalledTimes(1);
    });

    it('skips attributes without a decode function', () => {
      const dec = vi.fn(() => 'ok');
      const t = NodeTranslator.from({
        xmlName: 'w:test',
        sdNodeOrKeyName: 'test',
        encode: vi.fn(() => ({ type: 'x' })),
        decode: vi.fn(() => ({ name: 'w:x', elements: [] })),
        attributes: [
          { xmlName: 'w:a', sdName: 'a', decode: dec },
          { xmlName: 'w:b', sdName: 'b' }, // no decode
        ],
      });

      const res = t.decodeAttributes({ node: { attrs: {} } });
      expect(res).toEqual({ 'w:a': 'ok' });
      expect(dec).toHaveBeenCalledTimes(1);
    });

    it('handles missing params/node gracefully', () => {
      const dec = vi.fn(() => 'x');
      const t = NodeTranslator.from({
        xmlName: 'w:test',
        sdNodeOrKeyName: 'test',
        encode: vi.fn(() => ({ type: 'x' })),
        decode: vi.fn(() => ({ name: 'w:x', elements: [] })),
        attributes: [{ xmlName: 'w:a', sdName: 'a', decode: dec }],
      });

      const res = t.decodeAttributes({});
      expect(res).toEqual({ 'w:a': 'x' });
    });
  });

  describe('encode / decode wrappers', () => {
    it('encode() passes cleaned encodedAttrs into encodeFn and returns its result', () => {
      const encA = vi.fn(() => 0);
      const encB = vi.fn(() => null); // dropped
      const encodeFn = vi.fn((_params, encodedAttrs) => ({ type: 'result', attrs: encodedAttrs }));

      const t = NodeTranslator.from({
        xmlName: 'w:test',
        sdNodeOrKeyName: 'test',
        encode: encodeFn,
        decode: vi.fn(() => ({ name: 'w:x', elements: [] })),
        attributes: [
          { xmlName: 'w:a', sdName: 'a', encode: encA },
          { xmlName: 'w:b', sdName: 'b', encode: encB },
        ],
      });

      const params = { nodes: [{ attributes: { 'w:a': 'x' } }] };
      const out = t.encode(params);

      expect(encodeFn).toHaveBeenCalledTimes(1);
      const cleaned = encodeFn.mock.calls[0][1];
      expect(cleaned).toEqual({ a: 0 });

      expect(out).toEqual({ type: 'result', attrs: { a: 0 } });
    });

    it('decode() passes cleaned decodedAttrs into decodeFn and returns its result', () => {
      const decA = vi.fn(() => '');
      const decB = vi.fn(() => undefined); // dropped
      const decodeFn = vi.fn((_params, decodedAttrs) => ({
        name: 'w:out',
        elements: [{ name: 'w:child' }],
        attrs: decodedAttrs,
      }));

      const t = NodeTranslator.from({
        xmlName: 'w:test',
        sdNodeOrKeyName: 'test',
        encode: vi.fn(() => ({ type: 'x' })),
        decode: decodeFn,
        attributes: [
          { xmlName: 'w:a', sdName: 'a', decode: decA },
          { xmlName: 'w:b', sdName: 'b', decode: decB },
        ],
      });

      const params = { node: { attrs: { a: 1 } } };
      const out = t.decode(params);

      expect(decodeFn).toHaveBeenCalledTimes(1);
      const cleaned = decodeFn.mock.calls[0][1];
      expect(cleaned).toEqual({ 'w:a': '' });

      expect(out).toEqual({
        name: 'w:out',
        elements: [{ name: 'w:child' }],
        attrs: { 'w:a': '' },
      });
    });

    it('returns undefined from decode() when no decodeFn provided', () => {
      const t = NodeTranslator.from({
        xmlName: 'w:test',
        sdNodeOrKeyName: 'test',
        encode: vi.fn(() => ({ type: 'x' })),
        // no decode
      });

      const out = t.decode({ node: { attrs: {} } });
      expect(out).toBeUndefined();
    });
  });

  it('toString() includes xmlName and priority', () => {
    const t = NodeTranslator.from({
      xmlName: 'w:test',
      sdNodeOrKeyName: 'test',
      encode: vi.fn(() => ({ type: 'x' })),
      decode: vi.fn(() => ({ name: 'w:x', elements: [] })),
      priority: 7,
    });
    expect(t.toString()).toBe('NodeTranslator(w:test, priority=7)');
  });
});
