// @ts-check

/**
 * Get the format configuration for a given numbering format
 * Maps user-friendly format names to Word's numbering format specifications
 * @param {string} format - The numbering format key
 * @returns {Object|null} Configuration object with fmt and lvlText, or null if format is invalid
 */
export function getFormatConfig(format) {
  const configs = {
    decimalPlain: {
      fmt: 'decimal',
      lvlText: '%1',
    },
    decimal: {
      fmt: 'decimal',
      lvlText: '%1.',
    },
    decimalParen: {
      fmt: 'decimal',
      lvlText: '%1)',
    },
    upperLetter: {
      fmt: 'upperLetter',
      lvlText: '%1.',
    },
    lowerLetter: {
      fmt: 'lowerLetter',
      lvlText: '%1.',
    },
    letterParen: {
      fmt: 'lowerLetter',
      lvlText: '%1)',
    },
    upperRoman: {
      fmt: 'upperRoman',
      lvlText: '%1.',
    },
    lowerRoman: {
      fmt: 'lowerRoman',
      lvlText: '%1.',
    },
  };

  return configs[format] || null;
}
