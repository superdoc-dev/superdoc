/**
 * Processes a REF instruction and creates an `sd:crossReference` node.
 *
 * REF syntax: REF bookmarkName [\h] [\p] [\r] [\n] [\w] [\d "separator"]
 *
 * @param {import('../../v2/types/index.js').OpenXmlNode[]} nodesToCombine The nodes to combine.
 * @param {string} instrText The instruction text.
 * @returns {import('../../v2/types/index.js').OpenXmlNode[]}
 */
export function preProcessRefInstruction(nodesToCombine, instrText) {
  return [
    {
      name: 'sd:crossReference',
      type: 'element',
      attributes: {
        instruction: instrText,
        fieldType: 'REF',
      },
      elements: nodesToCombine,
    },
  ];
}
