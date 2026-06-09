export type PageNumberFieldFormat = {
  format?: 'decimal' | 'upperRoman' | 'lowerRoman' | 'upperLetter' | 'lowerLetter' | 'numberInDash' | 'ordinal';
  zeroPadding?: number;
  numericPicture?: string;
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

function toOrdinal(value: number): string {
  const remainder = value % 100;
  if (remainder >= 11 && remainder <= 13) return `${value}th`;

  switch (value % 10) {
    case 1:
      return `${value}st`;
    case 2:
      return `${value}nd`;
    case 3:
      return `${value}rd`;
    default:
      return `${value}th`;
  }
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
    case 'ordinal':
      return toOrdinal(value);
    case 'decimal':
    default:
      return String(value);
  }
}

export function formatPageNumberFieldValue(pageNumber: number, fieldFormat?: PageNumberFieldFormat): string {
  if (fieldFormat?.numericPicture) {
    const value = Math.max(1, Math.trunc(Number.isFinite(pageNumber) ? pageNumber : 1));
    return formatIntegerWithNumericPicture(value, fieldFormat.numericPicture);
  }

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

/**
 * Formats integer page field values with a Word numeric picture subset.
 * Unsupported ECMA features are intentionally out of scope here: backtick
 * numbered-item references, localized separators, and fractional rounding.
 */
export function formatIntegerWithNumericPicture(value: number, picture: string): string {
  const integerValue = Math.trunc(Number.isFinite(value) ? value : 0);
  const sections = splitPictureSections(typeof picture === 'string' && picture.length > 0 ? picture : '0');
  const hasExplicitNegativeSection = integerValue < 0 && sections[1] != null;
  const section =
    integerValue > 0 ? sections[0] : integerValue < 0 ? (sections[1] ?? sections[0]) : (sections[2] ?? sections[0]);
  return formatNumericPictureSection(
    Math.abs(integerValue),
    integerValue < 0,
    section ?? '0',
    hasExplicitNegativeSection,
  );
}

function splitPictureSections(picture: string): string[] {
  const sections: string[] = [];
  let current = '';
  let inQuote = false;

  for (let index = 0; index < picture.length; index += 1) {
    const char = picture[index]!;
    if (char === "'") {
      inQuote = !inQuote;
      current += char;
      continue;
    }
    if (char === ';' && !inQuote) {
      sections.push(current);
      current = '';
      continue;
    }
    current += char;
  }

  sections.push(current);
  return sections;
}

type PictureToken =
  | { kind: 'placeholder'; value: '0' | '#' | 'x' | ',' | '.' | '+' | '-' }
  | { kind: 'literal'; value: string };

function tokenizePicture(section: string): PictureToken[] {
  const tokens: PictureToken[] = [];
  for (let index = 0; index < section.length; index += 1) {
    const char = section[index]!;
    if (char === "'") {
      let literal = '';
      index += 1;
      while (index < section.length && section[index] !== "'") {
        literal += section[index]!;
        index += 1;
      }
      tokens.push({ kind: 'literal', value: literal });
      continue;
    }
    if (char === '0' || char === '#' || char === 'x' || char === ',' || char === '.' || char === '+' || char === '-') {
      tokens.push({ kind: 'placeholder', value: char });
    } else {
      tokens.push({ kind: 'literal', value: char });
    }
  }
  return tokens;
}

function formatNumericPictureSection(
  value: number,
  isNegative: boolean,
  section: string,
  suppressDefaultNegative = false,
): string {
  const tokens = tokenizePicture(section);
  const decimalIndex = tokens.findIndex((token) => token.kind === 'placeholder' && token.value === '.');
  const integerTokens = decimalIndex >= 0 ? tokens.slice(0, decimalIndex) : tokens;
  const fractionalTokens = decimalIndex >= 0 ? tokens.slice(decimalIndex + 1) : [];
  const integerPart = formatIntegerPictureTokens(value, isNegative, integerTokens, suppressDefaultNegative);
  const fractionalPart = formatFractionalPictureTokens(fractionalTokens);
  return fractionalTokens.length > 0 ? `${integerPart}.${fractionalPart}` : integerPart;
}

function formatIntegerPictureTokens(
  value: number,
  isNegative: boolean,
  tokens: PictureToken[],
  suppressDefaultNegative: boolean,
): string {
  let xIndex = -1;
  for (let index = tokens.length - 1; index >= 0; index -= 1) {
    const token = tokens[index]!;
    if (token.kind === 'placeholder' && token.value === 'x') {
      xIndex = index;
      break;
    }
  }
  const activeTokens = xIndex >= 0 ? tokens.slice(xIndex + 1) : tokens;
  const placeholderCount = activeTokens.filter(
    (token) => token.kind === 'placeholder' && (token.value === '0' || token.value === '#'),
  ).length;
  const rawDigits = String(value);
  const digits = xIndex >= 0 && placeholderCount > 0 ? rawDigits.slice(-placeholderCount) : rawDigits;
  let digitIndex = digits.length - 1;
  let output = '';
  let signSlot: '+' | '-' | null = null;
  const hasGrouping = activeTokens.some((token) => token.kind === 'placeholder' && token.value === ',');

  for (let index = activeTokens.length - 1; index >= 0; index -= 1) {
    const token = activeTokens[index]!;
    if (token.kind === 'literal') {
      output = token.value + output;
      continue;
    }

    switch (token.value) {
      case '0':
        output = (digitIndex >= 0 ? digits[digitIndex] : '0') + output;
        digitIndex -= 1;
        break;
      case '#':
        if (digitIndex >= 0) {
          output = digits[digitIndex]! + output;
          digitIndex -= 1;
        }
        break;
      case '+':
      case '-':
        signSlot = token.value;
        break;
      case ',':
      case 'x':
      case '.':
        break;
    }
  }

  if (placeholderCount > 0 && xIndex < 0 && digitIndex >= 0) {
    output = digits.slice(0, digitIndex + 1) + output;
  }
  if (hasGrouping) {
    output = applyGrouping(output);
  }
  if (signSlot === '+') {
    output = `${isNegative ? '-' : '+'}${output}`;
  } else if (signSlot === '-') {
    output = `${isNegative ? '-' : ' '}${output}`;
  } else if (isNegative && !suppressDefaultNegative) {
    output = `-${output}`;
  }
  return output;
}

function formatFractionalPictureTokens(tokens: PictureToken[]): string {
  let output = '';
  for (const token of tokens) {
    if (token.kind === 'literal') {
      output += token.value;
      continue;
    }
    if (token.value === '0') {
      output += '0';
    } else if (token.value !== '#') {
      output += token.value;
    }
  }
  return output;
}

function applyGrouping(value: string): string {
  const match = value.match(/^([^0-9]*)([0-9]+)(.*)$/);
  if (!match) return value;
  return `${match[1]}${match[2].replace(/\B(?=(\d{3})+(?!\d))/g, ',')}${match[3]}`;
}
