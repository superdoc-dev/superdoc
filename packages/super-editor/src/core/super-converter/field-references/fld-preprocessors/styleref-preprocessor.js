/**
 * Processes a STYLEREF instruction and creates an `sd:crossReference` node.
 *
 * STYLEREF syntax: STYLEREF "styleName" [\l] [\n] [\p] [\r] [\t] [\w]
 *
 * @param {import('../../v2/types/index.js').OpenXmlNode[]} nodesToCombine The nodes to combine.
 * @param {string} instrText The instruction text.
 * @returns {import('../../v2/types/index.js').OpenXmlNode[]}
 */
export function preProcessStylerefInstruction(nodesToCombine, instrText) {
  return [
    {
      name: 'sd:crossReference',
      type: 'element',
      attributes: {
        instruction: instrText,
        fieldType: 'STYLEREF',
      },
      elements: nodesToCombine,
    },
  ];
}
