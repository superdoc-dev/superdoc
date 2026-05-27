import { normalizeFieldContentToParagraphs } from './normalize-field-content.js';

/**
 * Processes a BIBLIOGRAPHY instruction and creates an `sd:bibliography` node.
 *
 * BIBLIOGRAPHY syntax: BIBLIOGRAPHY (with optional switches like `\l 1033`)
 *
 * @param {import('../../v2/types/index.js').OpenXmlNode[]} nodesToCombine The nodes to combine.
 * @param {string} instrText The instruction text.
 * @returns {import('../../v2/types/index.js').OpenXmlNode[]}
 */
export function preProcessBibliographyInstruction(nodesToCombine, instrText) {
  return [
    {
      name: 'sd:bibliography',
      type: 'element',
      attributes: {
        instruction: instrText,
      },
      elements: normalizeFieldContentToParagraphs(nodesToCombine),
    },
  ];
}
