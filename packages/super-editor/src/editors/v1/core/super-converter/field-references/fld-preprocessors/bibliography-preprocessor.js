import { buildBlockFieldNode } from './build-block-field-node.js';

/**
 * Processes a BIBLIOGRAPHY instruction and creates an `sd:bibliography` node.
 *
 * BIBLIOGRAPHY syntax: BIBLIOGRAPHY (with optional switches like `\l 1033`)
 *
 * @param {import('../../v2/types/index.js').OpenXmlNode[]} nodesToCombine The nodes to combine.
 * @param {string} instrText The instruction text.
 * @param {import('../../v2/docxHelper').ParsedDocx} [_docx] The docx object (unused).
 * @param {Array<{type: string, text?: string}>} [instructionTokens] Raw instruction tokens.
 * @returns {import('../../v2/types/index.js').OpenXmlNode[]}
 */
export function preProcessBibliographyInstruction(nodesToCombine, instrText, _docx, instructionTokens = null) {
  return buildBlockFieldNode('sd:bibliography', nodesToCombine, instrText, instructionTokens);
}
