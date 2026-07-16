import { CASE_INSENSITIVE_GENERAL_FORMATS, GENERAL_FORMATS } from './page-number-field-switches.js';

const TOKEN_PATTERN = /"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'|\\[#*]|\\[^\s]+|[^\s]+/g;

/**
 * @param {string} instruction
 * @returns {{
 *   instruction: string,
 *   bookmarkId: string,
 *   hasHyperlinkSwitch: boolean,
 *   hasRelativePositionSwitch: boolean,
 *   pageNumberFieldFormat?: { format?: string, zeroPadding?: number },
 *   numericPictureFormat?: { picture: string },
 *   fieldResultFormat?: 'charformat' | 'mergeformat',
 *   unsupportedGeneralFormat?: string,
 *   rawSwitches: Array<{ switch: string, value?: string }>,
 * }}
 */
export function parsePageRefInstruction(instruction) {
  const rawInstruction = typeof instruction === 'string' ? instruction.trim() : '';
  const tokens = tokenizeInstruction(rawInstruction);
  const result = {
    instruction: rawInstruction,
    bookmarkId: '',
    hasHyperlinkSwitch: false,
    hasRelativePositionSwitch: false,
    rawSwitches: [],
  };

  if (!tokens.length || !/^PAGEREF$/i.test(tokens[0].value)) {
    return result;
  }

  for (let index = 1; index < tokens.length; index += 1) {
    const token = tokens[index].value;
    if (!token) continue;

    if (token.startsWith('\\')) {
      const normalized = token.toLowerCase();
      if (normalized === '\\h') {
        result.hasHyperlinkSwitch = true;
        result.rawSwitches.push({ switch: token });
        continue;
      }
      if (normalized === '\\p') {
        result.hasRelativePositionSwitch = true;
        result.rawSwitches.push({ switch: token });
        continue;
      }
      if (token === '\\*') {
        const value = tokens[index + 1]?.value;
        if (value != null) {
          result.rawSwitches.push({ switch: token, value });
          applyGeneralFormat(result, value);
          index += 1;
        } else {
          result.rawSwitches.push({ switch: token });
        }
        continue;
      }
      if (token === '\\#') {
        const value = tokens[index + 1]?.value;
        if (value != null) {
          result.rawSwitches.push({ switch: token, value });
          result.numericPictureFormat = { picture: value };
          if (/^0+$/.test(value)) {
            result.pageNumberFieldFormat = { ...(result.pageNumberFieldFormat ?? {}), zeroPadding: value.length };
          }
          index += 1;
        } else {
          result.rawSwitches.push({ switch: token });
        }
        continue;
      }

      result.rawSwitches.push({ switch: token });
      continue;
    }

    if (!result.bookmarkId) {
      result.bookmarkId = token;
    }
  }

  return result;
}

/**
 * @param {string} instruction
 */
function tokenizeInstruction(instruction) {
  const tokens = [];
  for (const match of instruction.matchAll(TOKEN_PATTERN)) {
    tokens.push({ value: unescapeQuotedToken(match[1] ?? match[2] ?? match[0]) });
  }
  return tokens;
}

/**
 * @param {string} value
 */
function unescapeQuotedToken(value) {
  return value.replace(/\\(["'\\])/g, '$1');
}

/**
 * @param {ReturnType<typeof parsePageRefInstruction>} result
 * @param {string} value
 */
function applyGeneralFormat(result, value) {
  const normalized = value.toLowerCase();
  if (normalized === 'charformat') {
    result.fieldResultFormat = 'charformat';
    return;
  }
  if (normalized === 'mergeformat') {
    result.fieldResultFormat = 'mergeformat';
    return;
  }

  const mapped = GENERAL_FORMATS.get(value) ?? CASE_INSENSITIVE_GENERAL_FORMATS.get(normalized);
  if (mapped) {
    result.pageNumberFieldFormat = { ...(result.pageNumberFieldFormat ?? {}), format: mapped };
  } else {
    result.unsupportedGeneralFormat = value;
  }
}
