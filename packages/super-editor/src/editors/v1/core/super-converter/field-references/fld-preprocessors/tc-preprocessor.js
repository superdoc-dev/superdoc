/**
 * Processes a TC (table of contents entry) instruction and creates an `sd:tableOfContentsEntry` node.
 * @param {import('../../v2/types/index.js').OpenXmlNode[]} nodesToCombine The nodes to combine.
 * @param {string} instrText The instruction text.
 * @param {{ instructionTokens?: Array<{type: string, text?: string}> | null }} [options]
 * @returns {import('../../v2/types/index.js').OpenXmlNode[]}
 */
export function preProcessTcInstruction(nodesToCombine, instrText, options = {}) {
  const instructionTokens = options.instructionTokens ?? null;
  return [
    {
      name: 'sd:tableOfContentsEntry',
      type: 'element',
      attributes: {
        instruction: instrText,
        ...(instructionTokens ? { instructionTokens } : {}),
      },
      elements: nodesToCombine,
    },
  ];
}
