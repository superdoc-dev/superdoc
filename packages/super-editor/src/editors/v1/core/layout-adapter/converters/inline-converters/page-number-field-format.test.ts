import { describe, expect, it } from 'vitest';
import { getPageNumberFieldFormat } from './page-number-field-format.js';

describe('getPageNumberFieldFormat', () => {
  it('normalizes PAGE/NUMPAGES format attributes for layout runs', () => {
    expect(
      getPageNumberFieldFormat({
        pageNumberFormat: 'decimal',
        pageNumberZeroPadding: 2,
      }),
    ).toEqual({ format: 'decimal', zeroPadding: 2 });
  });

  it('threads ordinal and numeric-picture attributes for layout runs', () => {
    expect(
      getPageNumberFieldFormat({
        pageNumberFormat: 'ordinal',
        pageNumberNumericPicture: '#,##0',
      }),
    ).toEqual({ format: 'ordinal', numericPicture: '#,##0' });
  });

  it('ignores invalid format attributes', () => {
    expect(getPageNumberFieldFormat(undefined)).toBeUndefined();
    expect(getPageNumberFieldFormat({ pageNumberFormat: 1, pageNumberZeroPadding: Number.NaN })).toBeUndefined();
  });
});
