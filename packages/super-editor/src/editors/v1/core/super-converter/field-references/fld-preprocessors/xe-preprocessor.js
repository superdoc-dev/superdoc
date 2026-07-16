/**
 * Processes an XE (index entry) instruction and creates an `sd:indexEntry` node.
 * @param {import('../../v2/types/index.js').OpenXmlNode[]} nodesToCombine The nodes to combine.
 * @param {string} instrText The instruction text.
 * @param {{ instructionTokens?: Array<{type: string, text?: string}> | null }} [options]
 * @returns {import('../../v2/types/index.js').OpenXmlNode[]}
 */
export function preProcessXeInstruction(nodesToCombine, instrText, options = {}) {
  const instructionTokens = options.instructionTokens ?? null;
  return [
    {
      name: 'sd:indexEntry',
      type: 'element',
      attributes: {
        instruction: instrText,
        ...(instructionTokens ? { instructionTokens } : {}),
      },
      elements: nodesToCombine,
    },
  ];
}
