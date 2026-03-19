import { describe, expect, it } from 'vitest';
import { getListOrdinalFromPath, getListRendering } from './list-rendering';

describe('list-rendering helpers', () => {
  describe('getListRendering', () => {
    it('normalizes marker text, numbering type, and numeric paths', () => {
      expect(
        getListRendering({
          markerText: '1.',
          numberingType: 'decimal',
          path: [1, '2', 'bad', 3],
        }),
      ).toEqual({
        markerText: '1.',
        numberingType: 'decimal',
        path: [1, 2, 3],
      });
    });

    it('returns undefined when no usable list metadata exists', () => {
      expect(getListRendering({})).toBeUndefined();
      expect(getListRendering(null)).toBeUndefined();
    });
  });

  describe('getListOrdinalFromPath', () => {
    it('returns the last positive ordinal from a path', () => {
      expect(getListOrdinalFromPath([1, 2, 3])).toBe(3);
      expect(getListOrdinalFromPath(['1', '2'])).toBe(2);
    });

    it('returns undefined for empty or invalid paths', () => {
      expect(getListOrdinalFromPath([])).toBeUndefined();
      expect(getListOrdinalFromPath(['bad'])).toBeUndefined();
      expect(getListOrdinalFromPath(null)).toBeUndefined();
    });
  });
});
