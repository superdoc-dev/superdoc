/**
 * Processes a TOA (Table of Authorities) instruction and creates an `sd:tableOfAuthorities` node.
 *
 * TOA syntax: TOA [\c category] [\h] [\p] [\e "separator"] [\g "range separator"] [\l "page-range separator"] [\f]
 *
 * @param {import('../../v2/types/index.js').OpenXmlNode[]} nodesToCombine The nodes to combine.
 * @param {string} instrText The instruction text.
 * @param {import('../../v2/docxHelper').ParsedDocx} [_docx] The docx object (unused).
 * @param {Array<{type: string, text?: string}>} [instructionTokens] Raw instruction tokens.
 * @returns {import('../../v2/types/index.js').OpenXmlNode[]}
 */
export function preProcessToaInstruction(nodesToCombine, instrText, _docx, instructionTokens = null) {
  return [
    {
      name: 'sd:tableOfAuthorities',
      type: 'element',
      attributes: {
        instruction: instrText,
        ...(instructionTokens ? { instructionTokens } : {}),
      },
      elements: nodesToCombine,
    },
  ];
}
