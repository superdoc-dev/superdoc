import { buildBlockFieldNode } from './build-block-field-node.js';

/**
 * Processes a BIBLIOGRAPHY instruction and creates an `sd:bibliography` node.
 *
 * BIBLIOGRAPHY syntax: BIBLIOGRAPHY (with optional switches like `\l 1033`)
 *
 * @param {import('../../v2/types/index.js').OpenXmlNode[]} nodesToCombine The nodes to combine.
 * @param {string} instrText The instruction text.
 * @param {{ instructionTokens?: Array<{type: string, text?: string}> | null }} [options]
 * @param {Array<{type: string, text?: string}>} [legacyInstructionTokens] Legacy raw instruction tokens.
 * @returns {import('../../v2/types/index.js').OpenXmlNode[]}
 */
export function preProcessBibliographyInstruction(
  nodesToCombine,
  instrText,
  options = {},
  legacyInstructionTokens = null,
) {
  const instructionTokens = options?.instructionTokens ?? legacyInstructionTokens;
  return buildBlockFieldNode('sd:bibliography', nodesToCombine, instrText, instructionTokens);
}
