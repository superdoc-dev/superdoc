import { describe, it, expect } from 'vitest';
import { config } from './index.js';

describe('w:tab translator config', () => {
  describe('encode', () => {
    it('encodes to a SuperDoc tab by default', () => {
      const res = config.encode({}, undefined);
      // encode(_, encodedAttrs = {}) sets attrs: {} because {} is truthy
      expect(res).toEqual({ type: 'tab', attrs: {} });
    });

    it('passes through provided encodedAttrs as attrs', () => {
      const encoded = { tabType: 'left', pos: '720', leader: 'dot' };
      const res = config.encode({}, encoded);
      expect(res.type).toBe('tab');
      expect(res.attrs).toEqual(encoded);
    });

    it('adds empty attrs object when encodedAttrs is an empty object', () => {
      const res = config.encode({}, {});
      expect(res).toEqual({ type: 'tab', attrs: {} });
    });

    it('keeps falsy-but-valid values from encodedAttrs (0, "", false)', () => {
      const encoded = { tabType: 'left', pos: '', leader: false };
      const res = config.encode({}, encoded);
      expect(res.attrs).toEqual({ tabType: 'left', pos: '', leader: false });
    });
  });

  describe('decode', () => {
    it('wraps <w:tab> in a <w:r> run', () => {
      const res = config.decode({ node: { type: 'tab' } }, undefined);
      expect(res).toBeTruthy();
      expect(res.name).toBe('w:r');
      expect(Array.isArray(res.elements)).toBe(true);
      // decode(_, decodedAttrs = {}) sets attributes: {} because {} is truthy
      expect(res.elements[0]).toEqual({ name: 'w:tab', attributes: {}, elements: [] });
    });

    it('copies decodedAttrs to <w:tab>.attributes verbatim', () => {
      const decoded = { 'w:val': 'left', 'w:pos': '720', 'w:leader': 'dot', 'w:custom': 'foo' };
      const res = config.decode({ node: { type: 'tab' } }, decoded);
      expect(res.name).toBe('w:r');
      expect(res.elements[0]).toEqual({ name: 'w:tab', attributes: decoded, elements: [] });
    });

    it('returns undefined when params.node is missing', () => {
      const res = config.decode({}, { 'w:val': 'left' });
      expect(res).toBeUndefined();
    });
  });

  describe('decode — marks and run props', () => {
    it('adds run props from node.marks before <w:tab>', () => {
      const res = config.decode({ node: { type: 'tab', marks: [{ type: 'bold' }, { type: 'italic' }] } }, undefined);
      expect(res).toBeTruthy();
      expect(res.name).toBe('w:r');
      expect(Array.isArray(res.elements)).toBe(true);

      expect(res.elements[0].name).toBe('w:rPr');
      const childNames = res.elements[0].elements.map((el) => el.name);
      expect(childNames).toContain('w:b');
      expect(childNames).toContain('w:i');
      expect(res.elements[1]).toEqual({ name: 'w:tab', attributes: {}, elements: [] });
    });

    it('does not add run props when node.marks is empty', () => {
      const res = config.decode({ node: { type: 'tab', marks: [] } }, undefined);
      expect(res.name).toBe('w:r');
      expect(res.elements).toEqual([{ name: 'w:tab', attributes: {}, elements: [] }]);
    });

    it('still places run props before <w:tab> when decodedAttrs are present', () => {
      const decoded = { 'w:val': 'left', 'w:custom': 'foo' };
      const res = config.decode({ node: { type: 'tab', marks: [{ type: 'bold' }] } }, decoded);

      expect(res.name).toBe('w:r');
      expect(res.elements[0].name).toBe('w:rPr');
      expect(res.elements[1]).toEqual({
        name: 'w:tab',
        attributes: { 'w:val': 'left', 'w:custom': 'foo' },
        elements: [],
      });
    });

    it('does not add run props when node.marks is missing', () => {
      const res = config.decode({ node: { type: 'tab' } }, undefined);
      expect(res.elements).toEqual([{ name: 'w:tab', attributes: {}, elements: [] }]);
    });

    it('preserves textStyle.styleId as w:rStyle in tab run props', () => {
      const res = config.decode(
        { node: { type: 'tab', marks: [{ type: 'textStyle', attrs: { styleId: 'Emphasis' } }] } },
        undefined,
      );

      expect(res.name).toBe('w:r');
      expect(res.elements[0].name).toBe('w:rPr');
      const rStyle = res.elements[0].elements.find((el) => el.name === 'w:rStyle');
      expect(rStyle?.attributes?.['w:val']).toBe('Emphasis');
    });
  });
});
