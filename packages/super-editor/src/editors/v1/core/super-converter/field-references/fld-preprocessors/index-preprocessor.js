import { buildBlockFieldNode } from './build-block-field-node.js';

/**
 * Processes an INDEX instruction and creates an `sd:index` node.
 * @param {import('../../v2/types/index.js').OpenXmlNode[]} nodesToCombine The nodes to combine.
 * @param {string} instrText The instruction text.
 * @param {{ instructionTokens?: Array<{type: string, text?: string}> | null }} [options]
 * @returns {import('../../v2/types/index.js').OpenXmlNode[]}
 */
export function preProcessIndexInstruction(nodesToCombine, instrText, options = {}, legacyInstructionTokens = null) {
  const instructionTokens = options?.instructionTokens ?? legacyInstructionTokens;
  return buildBlockFieldNode('sd:index', nodesToCombine, instrText, instructionTokens);
}
