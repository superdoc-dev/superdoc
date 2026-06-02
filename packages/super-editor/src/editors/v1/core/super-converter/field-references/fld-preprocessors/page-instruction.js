const PAGE_VALUE_FORMAT_SWITCHES = {
  Arabic: 'decimal',
  Roman: 'upperRoman',
  ROMAN: 'upperRoman',
  roman: 'lowerRoman',
  ALPHABETIC: 'upperLetter',
  alphabetic: 'lowerLetter',
  ArabicDash: 'numberInDash',
};

/**
 * Parses the supported PAGE/SECTIONPAGES value-format switches from an OOXML field instruction.
 * Field dispatch is case-insensitive; value-format switches preserve ECMA casing.
 *
 * @param {string} instruction
 * @param {string} [expectedKeyword='PAGE']
 * @returns {{ instruction: string, pageNumberFormat?: string }}
 */
export function parsePageInstruction(instruction, expectedKeyword = 'PAGE') {
  const rawInstruction = String(instruction ?? '').trim();
  const tokens = rawInstruction.match(/"[^"]*"|'[^']*'|\\\*|\\[^\s]+|[^\s]+/g) ?? [];
  const keyword = tokens[0]?.toUpperCase();
  if (keyword !== expectedKeyword.toUpperCase()) {
    return { instruction: rawInstruction };
  }

  for (let i = 1; i < tokens.length - 1; i += 1) {
    if (tokens[i] !== '\\*') continue;
    const switchName = tokens[i + 1];
    const pageNumberFormat = PAGE_VALUE_FORMAT_SWITCHES[switchName];
    if (pageNumberFormat) {
      return { instruction: rawInstruction, pageNumberFormat };
    }
  }

  return { instruction: rawInstruction };
}

/**
 * @param {string} pageNumberFormat
 * @returns {string | undefined}
 */
export function pageNumberFormatToInstructionSwitch(pageNumberFormat) {
  for (const [switchName, format] of Object.entries(PAGE_VALUE_FORMAT_SWITCHES)) {
    if (format === pageNumberFormat) {
      return switchName;
    }
  }
  return undefined;
}
