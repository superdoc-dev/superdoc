import { extractFieldKeyword } from '../field-keyword.js';
import { CASE_INSENSITIVE_GENERAL_FORMATS, GENERAL_FORMATS } from './page-number-field-switches.js';

const TOKEN_PATTERN = /"((?:[^"\\]|\\.)*)"|\\[#*](?=\s|$)|\\[^\s]+|[^\s]+/g;

/**
 * @typedef {'next' | 'current'} SeqMode
 * @typedef {{ picture: string }} SeqNumericPictureFormat
 * @typedef {{
 *   instruction: string,
 *   keyword: string,
 *   identifier: string,
 *   fieldArgument: string,
 *   sequenceMode: SeqMode,
 *   hideResult: boolean,
 *   restartNumber: number | null,
 *   restartLevel: number | null,
 *   format: string,
 *   pageNumberFieldFormat?: import('@superdoc/contracts').PageNumberFieldFormat,
 *   numericPictureFormat: SeqNumericPictureFormat | null,
 *   hasGeneralFormat: boolean,
 *   unknownSwitches: string[],
 * }} ParsedSeqInstruction
 *
 * @typedef {{
 *   identifier: string,
 *   fieldArgument: string,
 *   sequenceMode: SeqMode,
 *   hideResult: boolean,
 *   restartNumber: number | null,
 *   restartLevel: number | null,
 *   format: string,
 *   hasGeneralFormat: boolean,
 *   pageNumberFieldFormat: import('@superdoc/contracts').PageNumberFieldFormat | null,
 *   numericPictureFormat: SeqNumericPictureFormat | null,
 * }} SequenceFieldParsedAttrs
 */

/**
 * @param {string} instruction
 * @returns {ParsedSeqInstruction}
 */
export function parseSeqInstruction(instruction) {
  const rawInstruction = typeof instruction === 'string' ? instruction : '';
  const tokens = tokenizeInstruction(rawInstruction);
  const keyword = tokens[0]?.value ?? '';
  const result = createEmptyParse(rawInstruction, keyword);

  if (extractFieldKeyword(rawInstruction) !== 'SEQ') {
    return result;
  }

  let sawSwitch = false;

  for (let index = 1; index < tokens.length; index += 1) {
    const token = tokens[index].value;
    if (!token) continue;

    if (token.startsWith('\\')) {
      sawSwitch = true;
      const attachedValueSwitch = parseAttachedNumericSwitch(token);
      const normalized = (attachedValueSwitch?.switchToken ?? token).toLowerCase();

      if (normalized === '\\n') {
        result.sequenceMode = 'next';
        continue;
      }

      if (normalized === '\\c') {
        result.sequenceMode = 'current';
        continue;
      }

      if (normalized === '\\h') {
        result.hideResult = true;
        continue;
      }

      if (normalized === '\\r') {
        const value = attachedValueSwitch?.value ?? tokens[index + 1]?.value;
        if (value != null && (attachedValueSwitch || !value.startsWith('\\'))) {
          const parsed = parseInteger(value);
          if (parsed != null) result.restartNumber = parsed;
          if (!attachedValueSwitch) index += 1;
        }
        continue;
      }

      if (normalized === '\\s') {
        const value = attachedValueSwitch?.value ?? tokens[index + 1]?.value;
        if (value != null && (attachedValueSwitch || !value.startsWith('\\'))) {
          const parsed = parseInteger(value);
          if (parsed != null && parsed >= 1 && parsed <= 9) result.restartLevel = parsed;
          if (!attachedValueSwitch) index += 1;
        }
        continue;
      }

      const attachedGeneralFormat = parseAttachedGeneralFormatSwitch(token);
      if (normalized === '\\*' || attachedGeneralFormat != null) {
        const value = attachedGeneralFormat ?? tokens[index + 1]?.value;
        if (value != null && (attachedGeneralFormat != null || !value.startsWith('\\'))) {
          result.format = value;
          result.hasGeneralFormat = true;
          applyGeneralFormat(result, value);
          if (attachedGeneralFormat == null) index += 1;
        } else {
          result.unknownSwitches.push(token);
        }
        continue;
      }

      const attachedNumericPicture = parseAttachedNumericPictureSwitch(token);
      if (normalized === '\\#' || attachedNumericPicture != null) {
        const value = attachedNumericPicture ?? tokens[index + 1]?.value;
        if (value != null && (attachedNumericPicture != null || !value.startsWith('\\'))) {
          if (result.numericPictureFormat == null) {
            result.numericPictureFormat = { picture: value };
          } else {
            result.unknownSwitches.push(token, value);
          }
          if (attachedNumericPicture == null) index += 1;
        } else {
          result.unknownSwitches.push(token);
        }
        continue;
      }

      result.unknownSwitches.push(token);
      // Unknown switch arity is ambiguous; preserve the adjacent value token
      // when present so later phases do not silently drop raw instruction data.
      const value = tokens[index + 1]?.value;
      if (value != null && !value.startsWith('\\')) {
        result.unknownSwitches.push(value);
        index += 1;
      }
      continue;
    }

    if (!result.identifier) {
      result.identifier = normalizeSeqIdentifier(token);
      continue;
    }

    if (!sawSwitch && !result.fieldArgument) {
      result.fieldArgument = token;
    }
  }

  return result;
}

/**
 * @param {string} instruction
 */
export function isSeqInstruction(instruction) {
  return extractFieldKeyword(instruction) === 'SEQ';
}

/**
 * @param {unknown} identifier
 */
export function normalizeSeqIdentifier(identifier) {
  return typeof identifier === 'string' ? identifier.trim() : '';
}

/**
 * Project parsed SEQ instruction metadata into sequenceField PM attrs.
 *
 * @param {ParsedSeqInstruction} parsed
 * @returns {SequenceFieldParsedAttrs}
 */
export function sequenceFieldAttrsFromParsed(parsed) {
  return {
    identifier: parsed.identifier,
    fieldArgument: parsed.fieldArgument,
    sequenceMode: parsed.sequenceMode,
    hideResult: parsed.hideResult,
    restartNumber: parsed.restartNumber,
    restartLevel: parsed.restartLevel,
    format: parsed.hasGeneralFormat ? parsed.format : 'ARABIC',
    hasGeneralFormat: parsed.hasGeneralFormat,
    pageNumberFieldFormat: parsed.pageNumberFieldFormat ?? null,
    numericPictureFormat: parsed.numericPictureFormat,
  };
}

/**
 * @param {string} instruction
 */
function tokenizeInstruction(instruction) {
  const tokens = [];
  for (const match of instruction.matchAll(TOKEN_PATTERN)) {
    tokens.push({ value: match[1] !== undefined ? unescapeQuotedToken(match[1]) : match[0] });
  }
  return tokens;
}

/**
 * @param {string} instruction
 * @param {string} keyword
 * @returns {ParsedSeqInstruction}
 */
function createEmptyParse(instruction, keyword) {
  return {
    instruction,
    keyword,
    identifier: '',
    fieldArgument: '',
    sequenceMode: 'next',
    hideResult: false,
    restartNumber: null,
    restartLevel: null,
    format: 'Arabic',
    numericPictureFormat: null,
    hasGeneralFormat: false,
    unknownSwitches: [],
  };
}

/**
 * @param {string} value
 */
function parseInteger(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || !Number.isInteger(number)) return null;
  return Math.trunc(number);
}

/**
 * Word often serializes numeric SEQ switches without a separating space
 * (`\r0`, `\s1`). Normalize those into the same path as `\r 0` / `\s 1`.
 *
 * @param {string} token
 */
function parseAttachedNumericSwitch(token) {
  const match = /^\\([rRsS])([+-]?\d+(?:\.\d+)?)$/.exec(token);
  if (!match) return null;
  return {
    switchToken: `\\${match[1]}`,
    value: match[2],
  };
}

/**
 * Word can serialize general-format switches without a separating space
 * (`\*roman`). Normalize those into the same path as `\* roman`.
 *
 * @param {string} token
 */
function parseAttachedGeneralFormatSwitch(token) {
  const match = /^\\\*(\S+)$/.exec(token);
  return normalizeAttachedSwitchValue(match?.[1]);
}

/**
 * Keep attached numeric picture switches (`\#00`) equivalent to `\# 00`.
 *
 * @param {string} token
 */
function parseAttachedNumericPictureSwitch(token) {
  const match = /^\\#(\S+)$/.exec(token);
  return normalizeAttachedSwitchValue(match?.[1]);
}

/**
 * @param {string | undefined} value
 */
function normalizeAttachedSwitchValue(value) {
  if (value == null) return null;
  if (value.startsWith('"') && value.endsWith('"')) {
    return unescapeQuotedToken(value.slice(1, -1));
  }
  return value;
}

/**
 * @param {ParsedSeqInstruction} result
 * @param {string} value
 */
function applyGeneralFormat(result, value) {
  const mapped = GENERAL_FORMATS.get(value) ?? CASE_INSENSITIVE_GENERAL_FORMATS.get(value.toLowerCase());
  if (mapped) {
    result.pageNumberFieldFormat = { format: mapped };
  }
}

/**
 * @param {string} value
 */
function unescapeQuotedToken(value) {
  return value.replace(/\\(["\\])/g, '$1');
}
