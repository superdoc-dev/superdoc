// @ts-check

/**
 * @typedef {Object} InstructionToken
 * @property {string} type - The token type ('text' or 'tab')
 * @property {string} [text] - The text content (for 'text' type tokens)
 */

/**
 * Builds OOXML instruction elements from instruction text and tokens.
 *
 * This function handles the conversion of instruction data back to OOXML format,
 * preserving tab tokens that may appear in INDEX field switches.
 *
 * @param {string | null | undefined} instruction - The instruction text string
 * @param {InstructionToken[] | null | undefined} instructionTokens - Raw instruction tokens preserving tabs
 * @returns {Array<Object>} Array of OOXML instruction elements
 *
 * @example
 * // With tokens (preserves tabs)
 * buildInstructionElements('INDEX \\e "\t"', [
 *   { type: 'text', text: 'INDEX \\e "' },
 *   { type: 'tab' },
 *   { type: 'text', text: '"' }
 * ]);
 *
 * @example
 * // Without tokens (simple instruction)
 * buildInstructionElements('TOC \\o "1-3"', null);
 */
export const buildInstructionElements = (instruction, instructionTokens) => {
  const tokens = Array.isArray(instructionTokens) ? instructionTokens : [];

  if (tokens.length > 0) {
    return tokens.map((token) => {
      if (token?.type === 'tab') {
        return { name: 'w:tab', elements: [] };
      }
      const text = token?.text ?? '';
      return {
        name: 'w:instrText',
        attributes: { 'xml:space': 'preserve' },
        elements: [{ type: 'text', text }],
      };
    });
  }

  return [
    {
      name: 'w:instrText',
      attributes: { 'xml:space': 'preserve' },
      elements: [{ type: 'text', text: instruction ?? '' }],
    },
  ];
};
