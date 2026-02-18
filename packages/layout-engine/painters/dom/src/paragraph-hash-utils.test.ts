import { describe, expect, it } from 'vitest';
import {
  getRunStringProp,
  getRunNumberProp,
  getRunBooleanProp,
  getRunUnderlineStyle,
  getRunUnderlineColor,
} from './paragraph-hash-utils.js';
import type { Run, TextRun } from '@superdoc/contracts';

describe('paragraph-hash-utils', () => {
  describe('getRunStringProp', () => {
    it('returns string value when property exists', () => {
      const run: TextRun = { text: 'hello', fontFamily: 'Arial', fontSize: 12, color: '#FF0000' };
      expect(getRunStringProp(run, 'color')).toBe('#FF0000');
    });

    it('returns empty string when property does not exist', () => {
      const run: TextRun = { text: 'hello', fontFamily: 'Arial', fontSize: 12 };
      expect(getRunStringProp(run, 'color')).toBe('');
    });

    it('returns empty string when property is not a string', () => {
      const run: TextRun = { text: 'hello', fontFamily: 'Arial', fontSize: 12, bold: true };
      expect(getRunStringProp(run, 'bold')).toBe('');
    });
  });

  describe('getRunNumberProp', () => {
    it('returns number value when property exists', () => {
      const run: TextRun = { text: 'hello', fontFamily: 'Arial', fontSize: 12 };
      expect(getRunNumberProp(run, 'fontSize')).toBe(12);
    });

    it('returns 0 when property does not exist', () => {
      const run: TextRun = { text: 'hello', fontFamily: 'Arial', fontSize: 12 };
      expect(getRunNumberProp(run, 'letterSpacing')).toBe(0);
    });
  });

  describe('getRunBooleanProp', () => {
    it('returns boolean value when property exists', () => {
      const run: TextRun = { text: 'hello', fontFamily: 'Arial', fontSize: 12, bold: true };
      expect(getRunBooleanProp(run, 'bold')).toBe(true);
    });

    it('returns false when property does not exist', () => {
      const run: TextRun = { text: 'hello', fontFamily: 'Arial', fontSize: 12 };
      expect(getRunBooleanProp(run, 'bold')).toBe(false);
    });
  });

  describe('getRunUnderlineStyle', () => {
    it('returns underline style when present', () => {
      const run: TextRun = {
        text: 'hello',
        fontFamily: 'Arial',
        fontSize: 12,
        underline: { style: 'dashed' },
      };
      expect(getRunUnderlineStyle(run)).toBe('dashed');
    });

    it('returns underline style with color present', () => {
      const run: TextRun = {
        text: 'hello',
        fontFamily: 'Arial',
        fontSize: 12,
        underline: { style: 'wavy', color: '#00FF00' },
      };
      expect(getRunUnderlineStyle(run)).toBe('wavy');
    });

    it('returns empty string when underline has no style', () => {
      const run: TextRun = {
        text: 'hello',
        fontFamily: 'Arial',
        fontSize: 12,
        underline: { color: '#00FF00' },
      };
      expect(getRunUnderlineStyle(run)).toBe('');
    });

    it('returns empty string when underline is not present', () => {
      const run: TextRun = { text: 'hello', fontFamily: 'Arial', fontSize: 12 };
      expect(getRunUnderlineStyle(run)).toBe('');
    });

    it('returns empty string for non-text runs without underline', () => {
      const run: Run = { kind: 'lineBreak' };
      expect(getRunUnderlineStyle(run)).toBe('');
    });

    it('returns "single" when underline is boolean true', () => {
      const run = { text: 'hello', fontFamily: 'Arial', fontSize: 12, underline: true } as Run;
      expect(getRunUnderlineStyle(run)).toBe('single');
    });

    it('returns empty string when underline is boolean false', () => {
      const run = { text: 'hello', fontFamily: 'Arial', fontSize: 12, underline: false } as Run;
      expect(getRunUnderlineStyle(run)).toBe('');
    });
  });

  describe('getRunUnderlineColor', () => {
    it('returns underline color when present', () => {
      const run: TextRun = {
        text: 'hello',
        fontFamily: 'Arial',
        fontSize: 12,
        underline: { color: '#FF0000' },
      };
      expect(getRunUnderlineColor(run)).toBe('#FF0000');
    });

    it('returns underline color with style present', () => {
      const run: TextRun = {
        text: 'hello',
        fontFamily: 'Arial',
        fontSize: 12,
        underline: { style: 'double', color: '#0000FF' },
      };
      expect(getRunUnderlineColor(run)).toBe('#0000FF');
    });

    it('returns empty string when underline has no color', () => {
      const run: TextRun = {
        text: 'hello',
        fontFamily: 'Arial',
        fontSize: 12,
        underline: { style: 'single' },
      };
      expect(getRunUnderlineColor(run)).toBe('');
    });

    it('returns empty string when underline is not present', () => {
      const run: TextRun = { text: 'hello', fontFamily: 'Arial', fontSize: 12 };
      expect(getRunUnderlineColor(run)).toBe('');
    });

    it('returns empty string for non-text runs without underline', () => {
      const run: Run = { kind: 'lineBreak' };
      expect(getRunUnderlineColor(run)).toBe('');
    });
  });

  describe('underline hashing for table runs (regression test)', () => {
    it('correctly extracts underline properties for cache invalidation', () => {
      // This test verifies that underline style and color can be correctly extracted
      // for table cell run hashing. Previously, getRunStringProp(run, 'underline')
      // was used which always returned '' because underline is an object, not a string.
      const runWithUnderline: TextRun = {
        text: 'table cell text',
        fontFamily: 'Arial',
        fontSize: 12,
        underline: { style: 'dashed', color: '#00FF00' },
      };

      const runWithoutUnderline: TextRun = {
        text: 'table cell text',
        fontFamily: 'Arial',
        fontSize: 12,
      };

      // Both style and color should be extracted for the run with underline
      expect(getRunUnderlineStyle(runWithUnderline)).toBe('dashed');
      expect(getRunUnderlineColor(runWithUnderline)).toBe('#00FF00');

      // Empty strings for the run without underline
      expect(getRunUnderlineStyle(runWithoutUnderline)).toBe('');
      expect(getRunUnderlineColor(runWithoutUnderline)).toBe('');

      // Verify that changing underline properties produces different hash inputs
      const runWithDifferentStyle: TextRun = {
        text: 'table cell text',
        fontFamily: 'Arial',
        fontSize: 12,
        underline: { style: 'wavy', color: '#00FF00' },
      };

      const runWithDifferentColor: TextRun = {
        text: 'table cell text',
        fontFamily: 'Arial',
        fontSize: 12,
        underline: { style: 'dashed', color: '#FF0000' },
      };

      // Different style should produce different hash input
      expect(getRunUnderlineStyle(runWithDifferentStyle)).not.toBe(getRunUnderlineStyle(runWithUnderline));

      // Different color should produce different hash input
      expect(getRunUnderlineColor(runWithDifferentColor)).not.toBe(getRunUnderlineColor(runWithUnderline));
    });
  });
});
