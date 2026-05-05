import { describe, it, expect } from 'vitest';
import { config } from './index.js';

describe('w:noBreakHyphen translator config', () => {
  describe('encode', () => {
    it('encodes to a SuperDoc noBreakHyphen atom by default', () => {
      const res = config.encode({}, undefined);
      expect(res).toEqual({ type: 'noBreakHyphen' });
    });

    it('omits attrs when encodedAttrs is empty', () => {
      const res = config.encode({}, {});
      expect(res).toEqual({ type: 'noBreakHyphen' });
      expect(res.attrs).toBeUndefined();
    });

    it('passes through provided encodedAttrs as attrs', () => {
      const encoded = { foo: 'bar' };
      const res = config.encode({}, encoded);
      expect(res.type).toBe('noBreakHyphen');
      expect(res.attrs).toEqual(encoded);
    });

    it('config exposes the expected xmlName and sdNodeOrKeyName', () => {
      expect(config.xmlName).toBe('w:noBreakHyphen');
      expect(config.sdNodeOrKeyName).toBe('noBreakHyphen');
    });
  });

  describe('decode', () => {
    it('wraps <w:noBreakHyphen/> in a <w:r> run', () => {
      const res = config.decode({ node: { type: 'noBreakHyphen' } }, undefined);
      expect(res).toBeTruthy();
      expect(res.name).toBe('w:r');
      expect(Array.isArray(res.elements)).toBe(true);
      expect(res.elements[0]).toEqual({ name: 'w:noBreakHyphen', elements: [] });
    });

    it('returns the bare element when extraParams.skipRun is set', () => {
      const res = config.decode({ node: { type: 'noBreakHyphen' }, extraParams: { skipRun: true } }, undefined);
      expect(res).toEqual({ name: 'w:noBreakHyphen', elements: [] });
    });

    it('returns undefined when params.node is missing', () => {
      const res = config.decode({}, {});
      expect(res).toBeUndefined();
    });

    it('preserves decodedAttrs as element attributes', () => {
      const decoded = { 'w:custom': 'foo' };
      const res = config.decode({ node: { type: 'noBreakHyphen' } }, decoded);
      expect(res.elements[0]).toEqual({ name: 'w:noBreakHyphen', elements: [], attributes: decoded });
    });
  });

  describe('decode — marks and run props', () => {
    it('adds run props from node.marks before <w:noBreakHyphen/>', () => {
      const res = config.decode(
        { node: { type: 'noBreakHyphen', marks: [{ type: 'bold' }, { type: 'italic' }] } },
        undefined,
      );
      expect(res.name).toBe('w:r');
      expect(res.elements[0].name).toBe('w:rPr');
      const childNames = res.elements[0].elements.map((el) => el.name);
      expect(childNames).toContain('w:b');
      expect(childNames).toContain('w:i');
      expect(res.elements[1]).toEqual({ name: 'w:noBreakHyphen', elements: [] });
    });

    it('does not add run props when node.marks is empty and no inherited rPr', () => {
      const res = config.decode({ node: { type: 'noBreakHyphen', marks: [] } }, undefined);
      expect(res.name).toBe('w:r');
      expect(res.elements).toEqual([{ name: 'w:noBreakHyphen', elements: [] }]);
    });

    it('inherits run properties from extraParams.runProperties', () => {
      const res = config.decode(
        {
          node: { type: 'noBreakHyphen', marks: [] },
          extraParams: { runProperties: { bold: true } },
        },
        undefined,
      );
      expect(res.elements[0].name).toBe('w:rPr');
      const childNames = res.elements[0].elements.map((el) => el.name);
      expect(childNames).toContain('w:b');
    });

    it('node.marks override inherited run properties on conflict', () => {
      const res = config.decode(
        {
          node: { type: 'noBreakHyphen', marks: [{ type: 'bold', attrs: { value: false } }] },
          extraParams: { runProperties: { bold: true } },
        },
        undefined,
      );
      expect(res.elements[0].name).toBe('w:rPr');
      const wB = res.elements[0].elements.find((el) => el.name === 'w:b');
      expect(wB?.attributes?.['w:val']).toBe('0');
    });
  });

  describe('round-trip identity', () => {
    it('encode then decode produces a run wrapping the original element', () => {
      const encoded = config.encode({}, undefined);
      expect(encoded.type).toBe('noBreakHyphen');
      const decoded = config.decode({ node: encoded }, undefined);
      expect(decoded.name).toBe('w:r');
      expect(decoded.elements.find((el) => el.name === 'w:noBreakHyphen')).toBeTruthy();
    });
  });

  describe('decode — link mark', () => {
    // When translateChildNodes groups link-marked siblings, it dispatches the
    // group through whichever translator owns the first node's type. A linked
    // noBreakHyphen as the first/only child must therefore emit <w:hyperlink>
    // — same contract as the text translator.
    it('emits <w:hyperlink> for a noBreakHyphen carrying a link mark', () => {
      const linkMark = {
        type: 'link',
        attrs: { href: 'https://example.com', rId: 'rId7', anchor: null, history: null, tooltip: null, target: null },
      };
      const res = config.decode({
        node: { type: 'noBreakHyphen', marks: [linkMark] },
        relationships: [],
      });
      expect(res?.name).toBe('w:hyperlink');
      // The hyperlink wrapper should contain the run with the bare element inside.
      const wR = res.elements.find((el) => el.name === 'w:r');
      expect(wR).toBeTruthy();
      expect(wR.elements.some((el) => el.name === 'w:noBreakHyphen')).toBe(true);
    });

    it('does not delegate when extraParams.linkProcessed is set (avoids loops)', () => {
      const linkMark = {
        type: 'link',
        attrs: { href: 'https://example.com', rId: 'rId7', anchor: null, history: null, tooltip: null, target: null },
      };
      const res = config.decode({
        node: { type: 'noBreakHyphen', marks: [linkMark] },
        extraParams: { linkProcessed: true },
      });
      // With linkProcessed=true, we fall through to the normal run-wrapped output.
      expect(res?.name).toBe('w:r');
      expect(res.elements.some((el) => el.name === 'w:noBreakHyphen')).toBe(true);
    });
  });
});
