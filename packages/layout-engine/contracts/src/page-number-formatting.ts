export type PageNumberFieldFormat = {
  format?: 'decimal' | 'upperRoman' | 'lowerRoman' | 'upperLetter' | 'lowerLetter' | 'numberInDash';
  zeroPadding?: number;
};

export type PageNumberFormat = NonNullable<PageNumberFieldFormat['format']>;

function toUpperRoman(value: number): string {
  if (value < 1 || value > 3999) return String(value);

  const values = [1000, 900, 500, 400, 100, 90, 50, 40, 10, 9, 5, 4, 1];
  const numerals = ['M', 'CM', 'D', 'CD', 'C', 'XC', 'L', 'XL', 'X', 'IX', 'V', 'IV', 'I'];
  let remaining = value;
  let result = '';

  for (let i = 0; i < values.length; i += 1) {
    while (remaining >= values[i]) {
      result += numerals[i];
      remaining -= values[i];
    }
  }

  return result;
}

function toUpperLetter(value: number): string {
  let n = Math.max(1, value);
  let result = '';

  while (n > 0) {
    const remainder = (n - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    n = Math.floor((n - 1) / 26);
  }

  return result;
}

export function formatPageNumber(pageNumber: number, format: PageNumberFormat): string {
  const value = Math.max(1, Math.trunc(Number.isFinite(pageNumber) ? pageNumber : 1));

  switch (format) {
    case 'upperRoman':
      return toUpperRoman(value);
    case 'lowerRoman':
      return toUpperRoman(value).toLowerCase();
    case 'upperLetter':
      return toUpperLetter(value);
    case 'lowerLetter':
      return toUpperLetter(value).toLowerCase();
    case 'numberInDash':
      return `-${value}-`;
    case 'decimal':
    default:
      return String(value);
  }
}

export function formatPageNumberFieldValue(pageNumber: number, fieldFormat?: PageNumberFieldFormat): string {
  const format = fieldFormat?.format ?? 'decimal';
  const formatted = formatPageNumber(pageNumber, format);
  return fieldFormat?.zeroPadding && format === 'decimal'
    ? formatted.padStart(fieldFormat.zeroPadding, '0')
    : formatted;
}
