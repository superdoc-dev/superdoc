const GENERAL_FORMATS = new Map([
  ['Arabic', 'decimal'],
  ['roman', 'lowerRoman'],
  ['ROMAN', 'upperRoman'],
  ['alphabetic', 'lowerLetter'],
  ['ALPHABETIC', 'upperLetter'],
  ['ArabicDash', 'numberInDash'],
]);

/**
 * @param {string} instruction
 * @param {'PAGE' | 'NUMPAGES'} fieldType
 * @returns {{ instruction?: string, pageNumberFormat?: string, pageNumberZeroPadding?: number }}
 */
export function parsePageNumberFieldSwitches(instruction, fieldType) {
  const normalizedInstruction = typeof instruction === 'string' ? instruction.trim().replace(/\s+/g, ' ') : fieldType;
  const result = {};

  if (normalizedInstruction && normalizedInstruction !== fieldType) {
    result.instruction = normalizedInstruction;
  }

  for (const match of normalizedInstruction.matchAll(/\\\*\s+("[^"]+"|\S+)/g)) {
    const rawValue = unquote(match[1]);
    const mapped = GENERAL_FORMATS.get(rawValue);
    if (mapped) {
      result.pageNumberFormat = mapped;
      break;
    }
  }

  for (const match of normalizedInstruction.matchAll(/\\#\s+("[^"]+"|\S+)/g)) {
    const picture = unquote(match[1]);
    if (/^0+$/.test(picture)) {
      result.pageNumberFormat ??= 'decimal';
      result.pageNumberZeroPadding = picture.length;
      break;
    }
  }

  return result;
}

/**
 * @param {number} pageNumber
 * @param {{ pageNumberFormat?: string | null, pageNumberZeroPadding?: number | null }} attrs
 */
export function formatPageNumberFieldValue(pageNumber, attrs = {}) {
  const value = Math.max(1, Math.trunc(Number.isFinite(pageNumber) ? pageNumber : 1));
  const format = attrs.pageNumberFormat || 'decimal';
  const formatted = formatPageNumberByFormat(value, format);
  return attrs.pageNumberZeroPadding && format === 'decimal'
    ? formatted.padStart(attrs.pageNumberZeroPadding, '0')
    : formatted;
}

/**
 * @param {string} value
 */
function unquote(value) {
  return value.startsWith('"') && value.endsWith('"') ? value.slice(1, -1) : value;
}

/**
 * @param {number} value
 * @param {string} format
 */
function formatPageNumberByFormat(value, format) {
  switch (format) {
    case 'upperRoman':
      return toRoman(value);
    case 'lowerRoman':
      return toRoman(value).toLowerCase();
    case 'upperLetter':
      return toLetters(value);
    case 'lowerLetter':
      return toLetters(value).toLowerCase();
    case 'numberInDash':
      return `-${value}-`;
    case 'decimal':
    default:
      return String(value);
  }
}

/**
 * @param {number} value
 */
function toRoman(value) {
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

/**
 * @param {number} value
 */
function toLetters(value) {
  let n = Math.max(1, value);
  let result = '';
  while (n > 0) {
    const remainder = (n - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    n = Math.floor((n - 1) / 26);
  }
  return result;
}
