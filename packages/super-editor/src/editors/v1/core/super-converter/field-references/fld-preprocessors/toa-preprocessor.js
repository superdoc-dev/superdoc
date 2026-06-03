import { buildBlockFieldNode } from './build-block-field-node.js';

/**
 * Processes a TOA (Table of Authorities) instruction and creates an `sd:tableOfAuthorities` node.
 *
 * TOA syntax: TOA [\c category] [\h] [\p] [\e "separator"] [\g "range separator"] [\l "page-range separator"] [\f]
 *
 * @param {import('../../v2/types/index.js').OpenXmlNode[]} nodesToCombine The nodes to combine.
 * @param {string} instrText The instruction text.
 * @param {{ instructionTokens?: Array<{type: string, text?: string}> | null }} [options]
 * @returns {import('../../v2/types/index.js').OpenXmlNode[]}
 */
export function preProcessToaInstruction(nodesToCombine, instrText, options = {}, legacyInstructionTokens = null) {
  const instructionTokens = options?.instructionTokens ?? legacyInstructionTokens;
  return buildBlockFieldNode('sd:tableOfAuthorities', nodesToCombine, instrText, instructionTokens);
}
