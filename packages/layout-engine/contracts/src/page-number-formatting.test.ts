import { describe, expect, it } from 'vitest';
import { formatPageNumber, formatPageNumberFieldValue } from './page-number-formatting.js';

describe('page number formatting', () => {
  it('formats the supported Word page number formats', () => {
    expect(formatPageNumber(5, 'decimal')).toBe('5');
    expect(formatPageNumber(5, 'upperRoman')).toBe('V');
    expect(formatPageNumber(5, 'lowerRoman')).toBe('v');
    expect(formatPageNumber(27, 'upperLetter')).toBe('AA');
    expect(formatPageNumber(28, 'upperLetter')).toBe('BB');
    expect(formatPageNumber(703, 'lowerLetter')).toBe('a'.repeat(28));
    expect(formatPageNumber(12, 'numberInDash')).toBe('- 12 -');
  });

  it('normalizes page numbers before formatting', () => {
    expect(formatPageNumber(4.9, 'decimal')).toBe('4');
    expect(formatPageNumber(0, 'upperLetter')).toBe('A');
    expect(formatPageNumber(Number.NaN, 'decimal')).toBe('1');
  });

  it('falls back to decimal for unsupported runtime formats', () => {
    expect(formatPageNumber(5, 'chicago' as never)).toBe('5');
  });

  it('falls back to decimal for roman numerals beyond 3999', () => {
    expect(formatPageNumber(4000, 'upperRoman')).toBe('4000');
  });

  it('applies decimal zero padding for field values', () => {
    expect(formatPageNumberFieldValue(7, { format: 'decimal', zeroPadding: 3 })).toBe('007');
    expect(formatPageNumberFieldValue(7, { format: 'lowerRoman', zeroPadding: 3 })).toBe('vii');
  });
});
