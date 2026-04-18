import { describe, it, expect } from 'vitest';
import {
  coerceRelativeHeight,
  normalizeZIndex,
  OOXML_Z_INDEX_BASE,
  resolveFloatingZIndex,
  getFragmentZIndex,
} from './ooxml-z-index.js';

describe('ooxml-z-index', () => {
  describe('coerceRelativeHeight', () => {
    it('returns number when given a finite number', () => {
      expect(coerceRelativeHeight(251658240)).toBe(251658240);
      expect(coerceRelativeHeight(0)).toBe(0);
    });

    it('returns number when given a numeric string', () => {
      expect(coerceRelativeHeight('251658240')).toBe(251658240);
      expect(coerceRelativeHeight('251659318')).toBe(251659318);
    });

    it('returns undefined for non-finite number', () => {
      expect(coerceRelativeHeight(NaN)).toBeUndefined();
      expect(coerceRelativeHeight(Infinity)).toBeUndefined();
    });

    it('returns undefined for empty or invalid string', () => {
      expect(coerceRelativeHeight('')).toBeUndefined();
      expect(coerceRelativeHeight('   ')).toBeUndefined();
      expect(coerceRelativeHeight('abc')).toBeUndefined();
    });

    it('returns undefined for null, undefined, or non-number/string', () => {
      expect(coerceRelativeHeight(null)).toBeUndefined();
      expect(coerceRelativeHeight(undefined)).toBeUndefined();
      expect(coerceRelativeHeight({})).toBeUndefined();
    });
  });

  describe('normalizeZIndex', () => {
    it('returns 0 for OOXML base relativeHeight', () => {
      expect(normalizeZIndex({ relativeHeight: OOXML_Z_INDEX_BASE })).toBe(0);
      expect(normalizeZIndex({ relativeHeight: '251658240' })).toBe(0);
    });

    it('returns positive z-index for relativeHeight above base', () => {
      expect(normalizeZIndex({ relativeHeight: OOXML_Z_INDEX_BASE + 2 })).toBe(2);
      expect(normalizeZIndex({ relativeHeight: OOXML_Z_INDEX_BASE + 51 })).toBe(51);
      expect(normalizeZIndex({ relativeHeight: '251658291' })).toBe(51);
    });

    it('returns undefined when relativeHeight is missing or invalid', () => {
      expect(normalizeZIndex({})).toBeUndefined();
      expect(normalizeZIndex(null)).toBeUndefined();
      expect(normalizeZIndex(undefined)).toBeUndefined();
      expect(normalizeZIndex({ relativeHeight: '' })).toBeUndefined();
    });
  });

  describe('resolveFloatingZIndex', () => {
    it('returns 0 when behindDoc is true', () => {
      expect(resolveFloatingZIndex(true, 42)).toBe(0);
      expect(resolveFloatingZIndex(true, undefined)).toBe(0);
      expect(resolveFloatingZIndex(true, 0)).toBe(0);
    });

    it('returns raw value when non-behindDoc and raw >= 1', () => {
      expect(resolveFloatingZIndex(false, 5)).toBe(5);
      expect(resolveFloatingZIndex(false, 100)).toBe(100);
    });

    it('clamps raw 0 to 1 for non-behindDoc', () => {
      expect(resolveFloatingZIndex(false, 0)).toBe(1);
    });

    it('returns fallback when raw is undefined', () => {
      expect(resolveFloatingZIndex(false, undefined)).toBe(1);
      expect(resolveFloatingZIndex(false, undefined, 5)).toBe(5);
    });

    it('clamps fallback to at least 1', () => {
      expect(resolveFloatingZIndex(false, undefined, 0)).toBe(1);
      expect(resolveFloatingZIndex(false, undefined, -1)).toBe(1);
    });
  });

  describe('getFragmentZIndex', () => {
    it('uses block.zIndex when set', () => {
      const block = {
        kind: 'image' as const,
        id: 'img-1',
        src: 'x.png',
        zIndex: 42,
        attrs: { originalAttributes: { relativeHeight: OOXML_Z_INDEX_BASE } },
      };
      expect(getFragmentZIndex(block)).toBe(42);
    });

    it('derives z-index from attrs.originalAttributes.relativeHeight (number)', () => {
      const block = {
        kind: 'image' as const,
        id: 'img-1',
        src: 'x.png',
        attrs: { originalAttributes: { relativeHeight: OOXML_Z_INDEX_BASE + 10 } },
      };
      expect(getFragmentZIndex(block)).toBe(10);
    });

    it('derives z-index from attrs.originalAttributes.relativeHeight (string)', () => {
      const block = {
        kind: 'image' as const,
        id: 'img-1',
        src: 'x.png',
        attrs: { originalAttributes: { relativeHeight: '251658250' } },
      };
      expect(getFragmentZIndex(block)).toBe(10);
    });

    it('preserves high z-index for wrapped anchored objects', () => {
      const block = {
        kind: 'image' as const,
        id: 'img-1',
        src: 'x.png',
        anchor: { isAnchored: true, behindDoc: false },
        wrap: { type: 'Through' as const },
        zIndex: 7168,
      };
      expect(getFragmentZIndex(block)).toBe(7168);
    });

    it('preserves relativeHeight z-index for wrap None anchored objects', () => {
      const block = {
        kind: 'image' as const,
        id: 'img-1',
        src: 'x.png',
        anchor: { isAnchored: true, behindDoc: false },
        wrap: { type: 'None' as const },
        attrs: { originalAttributes: { relativeHeight: OOXML_Z_INDEX_BASE + 10 } },
      };
      expect(getFragmentZIndex(block)).toBe(10);
    });

    it('returns 0 when anchor.behindDoc is true and no zIndex/originalAttributes', () => {
      const block = {
        kind: 'image' as const,
        id: 'img-1',
        src: 'x.png',
        anchor: { isAnchored: true, behindDoc: true },
      };
      expect(getFragmentZIndex(block)).toBe(0);
    });

    it('returns 1 when not behindDoc and no zIndex/originalAttributes', () => {
      const block = {
        kind: 'image' as const,
        id: 'img-1',
        src: 'x.png',
      };
      expect(getFragmentZIndex(block)).toBe(1);
    });

    it('does not treat base relativeHeight as behindDoc when behindDoc is false', () => {
      const block = {
        kind: 'image' as const,
        id: 'img-1',
        src: 'x.png',
        anchor: { isAnchored: true, behindDoc: false },
        attrs: { originalAttributes: { relativeHeight: OOXML_Z_INDEX_BASE } },
      };
      expect(getFragmentZIndex(block)).toBeGreaterThan(0);
    });

    it('forces behindDoc fragments to zIndex 0 even with relativeHeight', () => {
      const block = {
        kind: 'image' as const,
        id: 'img-1',
        src: 'x.png',
        anchor: { isAnchored: true, behindDoc: true },
        attrs: { originalAttributes: { relativeHeight: OOXML_Z_INDEX_BASE + 5 } },
      };
      expect(getFragmentZIndex(block)).toBe(0);
    });

    it('works for drawing blocks', () => {
      const block = {
        kind: 'drawing' as const,
        id: 'd-1',
        drawingKind: 'vectorShape' as const,
        attrs: { originalAttributes: { relativeHeight: OOXML_Z_INDEX_BASE + 5 } },
      };
      expect(getFragmentZIndex(block)).toBe(5);
    });
  });
});
