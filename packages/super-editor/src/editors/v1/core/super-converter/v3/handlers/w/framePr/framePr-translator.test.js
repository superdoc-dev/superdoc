import { describe, it, expect } from 'vitest';
import { translator } from './framePr-translator';

describe('framePr-translator', () => {
  describe('decode', () => {
    it('should decode a full framePr object', () => {
      const framePr = {
        anchorLock: true,
        dropCap: 'drop',
        h: 100,
        hAnchor: 'text',
        hRule: 'exact',
        hSpace: 10,
        lines: 3,
        vAnchor: 'page',
        vSpace: 20,
        w: 200,
        wrap: 'around',
        x: 30,
        xAlign: 'left',
        y: 40,
        yAlign: 'top',
      };
      const result = translator.decode({ node: { attrs: { framePr } } });
      expect(result).toEqual({
        attributes: {
          'w:anchorLock': '1',
          'w:dropCap': 'drop',
          'w:h': '100',
          'w:hAnchor': 'text',
          'w:hRule': 'exact',
          'w:hSpace': '10',
          'w:lines': '3',
          'w:vAnchor': 'page',
          'w:vSpace': '20',
          'w:w': '200',
          'w:wrap': 'around',
          'w:x': '30',
          'w:xAlign': 'left',
          'w:y': '40',
          'w:yAlign': 'top',
        },
      });
    });

    it('should decode a minimal framePr object with "w" attribute', () => {
      const framePr = { w: 200 };
      const result = translator.decode({ node: { attrs: { framePr } } });
      expect(result).toEqual({
        attributes: {
          'w:w': '200',
        },
      });
    });

    it('should return undefined for an empty framePr object', () => {
      const framePr = {};
      const result = translator.decode({ node: { attrs: { framePr } } });
      expect(result).toBeUndefined();
    });

    it('should return undefined if framePr object is not present', () => {
      const result = translator.decode({ node: { attrs: {} } });
      expect(result).toBeUndefined();
    });

    it('should handle numeric string values for integer attributes', () => {
      const framePr = { w: '300' };
      const result = translator.decode({ node: { attrs: { framePr } } });
      expect(result).toEqual({
        attributes: {
          'w:w': '300',
        },
      });
    });
  });

  describe('encode', () => {
    // The current implementation of encode is likely incorrect, as it checks for a 'value' property
    // which is not set by any of the attribute handlers. Thus, it will always return undefined.
    // These tests reflect the current behavior. If the implementation is fixed, these tests will need to be updated.

    it('should encode a full w:framePr element', () => {
      const nodes = [
        {
          name: 'w:framePr',
          attributes: {
            'w:anchorLock': '1',
            'w:dropCap': 'drop',
            'w:h': '100',
            'w:hAnchor': 'text',
            'w:hRule': 'exact',
            'w:hSpace': '10',
            'w:lines': '3',
            'w:vAnchor': 'page',
            'w:vSpace': '20',
            'w:w': '200',
            'w:wrap': 'around',
            'w:x': '30',
            'w:xAlign': 'left',
            'w:y': '40',
            'w:yAlign': 'top',
          },
          elements: [],
        },
      ];
      const result = translator.encode({ nodes });
      expect(result).toEqual({
        anchorLock: true,
        dropCap: 'drop',
        h: 100,
        hAnchor: 'text',
        hRule: 'exact',
        hSpace: 10,
        lines: 3,
        vAnchor: 'page',
        vSpace: 20,
        w: 200,
        wrap: 'around',
        x: 30,
        xAlign: 'left',
        y: 40,
        yAlign: 'top',
      });
    });

    it('should encode a minimal w:framePr element with "w:w" attribute', () => {
      const nodes = [
        {
          name: 'w:framePr',
          attributes: {
            'w:w': '200',
          },
          elements: [],
        },
      ];
      const result = translator.encode({ nodes });
      expect(result).toEqual({ w: 200 });
    });
  });
});
