/**
 * @superdoc/engines-lists contract
 *
 * Formats list labels and computes hanging indents for multi-level numbering.
 * Extracted from PM list helpers and DOCX numbering utilities to ensure consistent
 * marker generation across PM and layout.
 */

export interface NumberingLevel {
  format: 'decimal' | 'lowerLetter' | 'upperLetter' | 'lowerRoman' | 'upperRoman' | 'bullet' | 'custom';
  text: string; // lvlText template (e.g., "%1.", "(%2)", "•")
  start: number; // Starting number for this level
  indent: {
    left: number; // pt
    hanging: number; // pt
  };
  alignment?: 'left' | 'center' | 'right';
}

/**
 * Format a list label from a numbering level definition.
 *
 * Handles template substitution (e.g., "%1." → "1."), numbering formats
 * (Arabic, Roman, alphabetic), and custom bullet characters.
 *
 * @param level - Numbering level definition
 * @param indices - Array of indices for each level (e.g., [1, 2] for "1.b")
 * @returns Formatted label text and estimated width in pt
 *
 * @example
 * formatListLabel(
 *   { format: 'decimal', text: '%1.', start: 1, ... },
 *   [3]
 * ) // → { text: '3.', width: 12 }
 *
 * @example
 * formatListLabel(
 *   { format: 'lowerLetter', text: '%1)', start: 1, ... },
 *   [2]
 * ) // → { text: 'b)', width: 10 }
 */
export function formatListLabel(level: NumberingLevel, indices: number[]): { text: string; width: number } {
  const { format, text: template, start } = level;

  // For bullet lists, return the template directly
  if (format === 'bullet' || format === 'custom') {
    return {
      text: template,
      width: estimateTextWidth(template),
    };
  }

  // Replace %N placeholders with formatted numbers
  let result = template;
  for (let i = 0; i < indices.length; i++) {
    const placeholder = `%${i + 1}`;
    if (result.includes(placeholder)) {
      const formattedNum = formatNumber(indices[i] + start - 1, format);
      result = result.replace(placeholder, formattedNum);
    }
  }

  return {
    text: result,
    width: estimateTextWidth(result),
  };
}

/**
 * Compute hanging indent values for a list level.
 *
 * Returns the marker width, hanging indent (marker gutter), and first-line indent
 * based on the level's DOCX-derived indent metadata.
 *
 * @param level - Numbering level definition
 * @returns Indent values in pt
 */
export function computeListIndent(level: NumberingLevel): {
  labelWidth: number;
  hangingIndent: number;
  firstLineIndent: number;
} {
  const { indent } = level;

  return {
    labelWidth: Math.abs(indent.hanging),
    hangingIndent: indent.hanging,
    firstLineIndent: indent.left - Math.abs(indent.hanging),
  };
}

// Helper: Format a number according to the numbering format
function formatNumber(num: number, format: NumberingLevel['format']): string {
  switch (format) {
    case 'decimal':
      return num.toString();

    case 'lowerLetter':
      return toLetter(num, false);

    case 'upperLetter':
      return toLetter(num, true);

    case 'lowerRoman':
      return toRoman(num).toLowerCase();

    case 'upperRoman':
      return toRoman(num);

    default:
      return num.toString();
  }
}

// Helper: Convert number to letter (1→a, 2→b, ..., 27→aa)
function toLetter(num: number, uppercase: boolean): string {
  let result = '';
  let n = num;

  while (n > 0) {
    const remainder = (n - 1) % 26;
    const char = String.fromCharCode((uppercase ? 65 : 97) + remainder);
    result = char + result;
    n = Math.floor((n - 1) / 26);
  }

  return result || (uppercase ? 'A' : 'a');
}

// Helper: Convert number to Roman numerals
function toRoman(num: number): string {
  const lookup: [number, string][] = [
    [1000, 'M'],
    [900, 'CM'],
    [500, 'D'],
    [400, 'CD'],
    [100, 'C'],
    [90, 'XC'],
    [50, 'L'],
    [40, 'XL'],
    [10, 'X'],
    [9, 'IX'],
    [5, 'V'],
    [4, 'IV'],
    [1, 'I'],
  ];

  let result = '';
  let remaining = num;

  for (const [value, numeral] of lookup) {
    while (remaining >= value) {
      result += numeral;
      remaining -= value;
    }
  }

  return result;
}

// Helper: Estimate text width in pt (very rough approximation)
// Real implementation should use font metrics
function estimateTextWidth(text: string): number {
  // Rough estimate: ~7pt per character for typical list markers
  return text.length * 7;
}
