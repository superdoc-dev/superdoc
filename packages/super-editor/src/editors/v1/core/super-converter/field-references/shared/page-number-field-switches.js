import { formatPageNumberFieldValue as formatSharedPageNumberFieldValue } from '@superdoc/contracts';

export const GENERAL_FORMATS = new Map([
  ['Arabic', 'decimal'],
  ['roman', 'lowerRoman'],
  ['Roman', 'upperRoman'],
  ['ROMAN', 'upperRoman'],
  ['alphabetic', 'lowerLetter'],
  ['ALPHABETIC', 'upperLetter'],
  ['ArabicDash', 'numberInDash'],
  ['Ordinal', 'ordinal'],
]);

export const CASE_INSENSITIVE_GENERAL_FORMATS = new Map([
  ['arabic', 'decimal'],
  ['arabicdash', 'numberInDash'],
]);

/**
 * @param {string} instruction
 * @param {'PAGE' | 'NUMPAGES' | 'SECTIONPAGES'} fieldType
 * @returns {{ instruction?: string, pageNumberFormat?: string, pageNumberZeroPadding?: number, pageNumberNumericPicture?: string }}
 */
export function parsePageNumberFieldSwitches(instruction, fieldType) {
  const switchInstruction = typeof instruction === 'string' ? instruction.trim() : fieldType;
  const normalizedInstruction = switchInstruction.replace(/\s+/g, ' ');
  const result = {};

  if (normalizedInstruction && normalizedInstruction !== fieldType) {
    result.instruction = normalizedInstruction;
  }

  for (const match of switchInstruction.matchAll(/\\\*\s+("[^"]+"|\S+)/g)) {
    const rawValue = unquote(match[1]);
    const mapped = GENERAL_FORMATS.get(rawValue) ?? CASE_INSENSITIVE_GENERAL_FORMATS.get(rawValue.toLowerCase());
    if (mapped) {
      result.pageNumberFormat = mapped;
      break;
    }
  }

  for (const match of switchInstruction.matchAll(/\\#\s+("[^"]+"|\S+)/g)) {
    const picture = unquote(match[1]);
    if (!picture) continue;

    if (/^0+$/.test(picture)) {
      result.pageNumberFormat ??= 'decimal';
      result.pageNumberZeroPadding = picture.length;
    } else {
      result.pageNumberNumericPicture = picture;
    }

    break;
  }

  return result;
}

/**
 * @param {number} pageNumber
 * @param {{ pageNumberFormat?: string | null, pageNumberZeroPadding?: number | null, pageNumberNumericPicture?: string | null }} attrs
 */
export function formatPageNumberFieldValue(pageNumber, attrs = {}) {
  return formatSharedPageNumberFieldValue(pageNumber, {
    format: attrs.pageNumberFormat || 'decimal',
    zeroPadding: attrs.pageNumberZeroPadding ?? undefined,
    numericPicture: attrs.pageNumberNumericPicture ?? undefined,
  });
}

/**
 * @param {string} value
 */
function unquote(value) {
  return value.startsWith('"') && value.endsWith('"') ? value.slice(1, -1) : value;
}
