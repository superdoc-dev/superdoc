/**
 * Processes a CITATION instruction and creates an `sd:citation` node.
 *
 * CITATION syntax: CITATION tag [\l locale] [\m tag2] [\m tag3] ...
 *
 * @param {import('../../v2/types/index.js').OpenXmlNode[]} nodesToCombine The nodes to combine.
 * @param {string} instrText The instruction text.
 * @param {{ instructionTokens?: Array<{type: string, text?: string}> | null }} [options]
 * @returns {import('../../v2/types/index.js').OpenXmlNode[]}
 */
export function preProcessCitationInstruction(nodesToCombine, instrText, options = {}) {
  const instructionTokens = options.instructionTokens ?? null;
  return [
    {
      name: 'sd:citation',
      type: 'element',
      attributes: {
        instruction: instrText,
        ...(instructionTokens ? { instructionTokens } : {}),
      },
      elements: nodesToCombine,
    },
  ];
}
