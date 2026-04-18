/**
 * Processes a NOTEREF instruction and creates an `sd:crossReference` node.
 *
 * NOTEREF syntax: NOTEREF bookmarkName [\h] [\f] [\p]
 *
 * @param {import('../../v2/types/index.js').OpenXmlNode[]} nodesToCombine The nodes to combine.
 * @param {string} instrText The instruction text.
 * @returns {import('../../v2/types/index.js').OpenXmlNode[]}
 */
export function preProcessNoterefInstruction(nodesToCombine, instrText) {
  return [
    {
      name: 'sd:crossReference',
      type: 'element',
      attributes: {
        instruction: instrText,
        fieldType: 'NOTEREF',
      },
      elements: nodesToCombine,
    },
  ];
}
