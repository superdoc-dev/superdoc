import { describe, it, expect } from 'vitest';
import { isOffValue, isNegatedMark, negationChecks } from '../../components/toolbar/format-negation.js';

describe('formatting negation helpers', () => {
  describe('isOffValue', () => {
    it('returns true for common falsy indicators', () => {
      expect(isOffValue('0')).toBe(true);
      expect(isOffValue('false')).toBe(true);
      expect(isOffValue('OFF')).toBe(true);
      expect(isOffValue(0)).toBe(true);
    });

    it('returns false for nullish or non-off values', () => {
      expect(isOffValue(null)).toBe(false);
      expect(isOffValue(undefined)).toBe(false);
      expect(isOffValue('1')).toBe(false);
      expect(isOffValue('true')).toBe(false);
    });
  });

  describe('isNegatedMark', () => {
    it('detects negated bold marks by value', () => {
      expect(isNegatedMark('bold', { value: '0' })).toBe(true);
      expect(isNegatedMark('bold', { value: '1' })).toBe(false);
    });

    it('detects negated underline via underlineType or value', () => {
      expect(isNegatedMark('underline', { underlineType: 'none' })).toBe(true);
      expect(isNegatedMark('underline', { value: '0' })).toBe(true);
      expect(isNegatedMark('underline', { underlineType: 'single' })).toBe(false);
    });

    it('detects color negation using inherit and null values', () => {
      expect(isNegatedMark('color', { color: 'inherit' })).toBe(true);
      expect(isNegatedMark('color', { color: null })).toBe(true);
      expect(isNegatedMark('color', { color: '#000000' })).toBe(false);
    });

    it('detects highlight negation using transparent or none', () => {
      expect(isNegatedMark('highlight', { color: 'transparent' })).toBe(true);
      expect(isNegatedMark('highlight', { color: 'none' })).toBe(true);
      expect(isNegatedMark('highlight', { color: '#ffff00' })).toBe(false);
    });

    it('returns false for unsupported mark names', () => {
      expect(isNegatedMark('unknown', { value: '0' })).toBe(false);
    });
  });

  it('exposes negation checkers for supported marks', () => {
    expect(Object.keys(negationChecks)).toEqual(
      expect.arrayContaining(['bold', 'italic', 'strike', 'underline', 'color', 'highlight']),
    );
  });
});
