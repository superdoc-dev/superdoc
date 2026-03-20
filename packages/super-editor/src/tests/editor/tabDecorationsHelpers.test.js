import { describe, it, expect } from 'vitest';
import {
  calculateIndentFallback,
  findNextTabIndex,
  findDecimalBreakPos,
  measureRangeWidth,
} from '@extensions/tab/helpers/tabDecorations.js';
import { pixelsToTwips } from '@converter/helpers';

describe('tab decoration helpers', () => {
  describe('calculateIndentFallback', () => {
    it('returns combined first line and hanging indents with left margin', () => {
      const indent = { left: pixelsToTwips(12), firstLine: pixelsToTwips(36), hanging: pixelsToTwips(10) };

      expect(calculateIndentFallback(indent)).toBe(38);
    });
  });

  describe('findNextTabIndex', () => {
    it('returns the index of the next tab node', () => {
      const flattened = [
        { node: { type: { name: 'text' } } },
        { node: { type: { name: 'tab' } } },
        { node: { type: { name: 'text' } } },
      ];

      expect(findNextTabIndex(flattened, 0)).toBe(1);
      expect(findNextTabIndex(flattened, 2)).toBe(-1);
    });
  });

  describe('findDecimalBreakPos', () => {
    it('finds the position of the decimal separator before the next tab', () => {
      const flattened = [
        { pos: 5, node: { type: { name: 'text' }, text: 'abc' } },
        { pos: 10, node: { type: { name: 'text' }, text: '12.34' } },
        { pos: 20, node: { type: { name: 'tab' } } },
      ];

      expect(findDecimalBreakPos(flattened, 0, '.')).toBe(13); // pos 10 + index 2 + 1
      expect(findDecimalBreakPos(flattened, 2, '.')).toBeNull();
    });

    it('supports comma decimal separators', () => {
      const flattened = [
        { pos: 5, node: { type: { name: 'text' }, text: 'abc' } },
        { pos: 10, node: { type: { name: 'text' }, text: '12,34' } },
        { pos: 20, node: { type: { name: 'tab' } } },
      ];

      // pos 10 + index 2 + 1
      expect(findDecimalBreakPos(flattened, 0, ',')).toBe(13);
    });
  });

  describe('measureRangeWidth', () => {
    it('falls back to coordinate based measurement when DOM lookup fails', () => {
      const view = {
        domAtPos: () => {
          throw new Error('no dom');
        },
        coordsAtPos: (pos) => ({ left: pos * 10 }),
      };

      expect(measureRangeWidth(view, 1, 3)).toBe(20);
    });
  });
});
