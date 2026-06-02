export type PageNumberFieldFormat = {
  format?: 'decimal' | 'upperRoman' | 'lowerRoman' | 'upperLetter' | 'lowerLetter' | 'numberInDash';
  zeroPadding?: number;
};

export type PageNumberFormat = NonNullable<PageNumberFieldFormat['format']>;
export type PageNumberChapterSeparator = 'hyphen' | 'period' | 'colon' | 'emDash' | 'enDash';

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
  const normalized = Math.max(1, value);
  const index = (normalized - 1) % 26;
  const repeatCount = Math.floor((normalized - 1) / 26) + 1;
  return String.fromCharCode(65 + index).repeat(repeatCount);
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
      return `- ${value} -`;
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

export function formatChapterPageNumberText(args: {
  pageComponent: string;
  chapterNumberText?: string;
  chapterSeparator?: PageNumberChapterSeparator;
}): string {
  if (!args.chapterNumberText) {
    return args.pageComponent;
  }

  const separator = (() => {
    switch (args.chapterSeparator ?? 'hyphen') {
      case 'period':
        return '.';
      case 'colon':
        return ':';
      case 'emDash':
        return '\u2014';
      case 'enDash':
        return '\u2013';
      case 'hyphen':
      default:
        return '\u2011';
    }
  })();

  return `${args.chapterNumberText}${separator}${args.pageComponent}`;
}

export function formatSectionPageNumberText(args: {
  displayNumber: number;
  pageFormat: PageNumberFormat;
  chapterNumberText?: string;
  chapterSeparator?: PageNumberChapterSeparator;
}): string {
  return formatChapterPageNumberText({
    pageComponent: formatPageNumber(args.displayNumber, args.pageFormat),
    chapterNumberText: args.chapterNumberText,
    chapterSeparator: args.chapterSeparator,
  });
}
