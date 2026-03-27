/**
 * Processes a BIBLIOGRAPHY instruction and creates an `sd:bibliography` node.
 *
 * BIBLIOGRAPHY syntax: BIBLIOGRAPHY (no switches)
 *
 * @param {import('../../v2/types/index.js').OpenXmlNode[]} nodesToCombine The nodes to combine.
 * @param {string} instrText The instruction text.
 * @returns {import('../../v2/types/index.js').OpenXmlNode[]}
 */
export function preProcessBibliographyInstruction(nodesToCombine, instrText) {
  const contentNodes =
    Array.isArray(nodesToCombine) && nodesToCombine.length > 0
      ? nodesToCombine
      : [
          {
            name: 'w:p',
            type: 'element',
            elements: [],
          },
        ];

  return [
    {
      name: 'sd:bibliography',
      type: 'element',
      attributes: {
        instruction: instrText,
      },
      elements: contentNodes,
    },
  ];
}
