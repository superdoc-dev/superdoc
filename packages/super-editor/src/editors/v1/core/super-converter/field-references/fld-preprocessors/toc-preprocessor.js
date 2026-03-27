/**
 * Processes a TOC instruction and creates a `sd:tableOfContents` node.
 * @param {import('../../v2/types/index.js').OpenXmlNode[]} nodesToCombine The nodes to combine.
 * @param {string} instrText The instruction text.
 * @returns {import('../../v2/types/index.js').OpenXmlNode[]}
 * @see {@link https://ecma-international.org/publications-and-standards/standards/ecma-376/} "Fundamentals And Markup Language Reference", page 1251
 */
export function preProcessTocInstruction(nodesToCombine, instrText) {
  return [
    {
      name: 'sd:tableOfContents',
      type: 'element',
      attributes: {
        instruction: instrText,
      },
      elements: nodesToCombine,
    },
  ];
}
