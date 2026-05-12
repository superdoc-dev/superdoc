/**
 * Processes a SEQ instruction and creates an `sd:sequenceField` node.
 *
 * SEQ syntax: SEQ identifier [\* formatSwitch] [\s level] [\r N] [\c] [\n] [\h]
 *
 * @param {import('../../v2/types/index.js').OpenXmlNode[]} nodesToCombine The nodes to combine.
 * @param {string} instrText The instruction text.
 * @param {{ instructionTokens?: Array<{type: string, text?: string}> | null }} [options]
 * @returns {import('../../v2/types/index.js').OpenXmlNode[]}
 */
export function preProcessSeqInstruction(nodesToCombine, instrText, options = {}) {
  const instructionTokens = options.instructionTokens ?? null;
  return [
    {
      name: 'sd:sequenceField',
      type: 'element',
      attributes: {
        instruction: instrText,
        ...(instructionTokens ? { instructionTokens } : {}),
      },
      elements: nodesToCombine,
    },
  ];
}
