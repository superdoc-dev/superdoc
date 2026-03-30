/**
 * Processes a PAGEREF instruction and creates a `sd:pageReference` node.
 * @param {import('../../v2/types/index.js').OpenXmlNode[]} nodesToCombine The nodes to combine.
 * @param {string} instrText The instruction text.
 * @returns {import('../../v2/types/index.js').OpenXmlNode[]}
 * @see {@link https://ecma-international.org/publications-and-standards/standards/ecma-376/} "Fundamentals And Markup Language Reference", page 1234
 */
export function preProcessPageRefInstruction(nodesToCombine, instrText) {
  const pageRefNode = {
    name: 'sd:pageReference',
    type: 'element',
    attributes: {
      instruction: instrText,
    },
    elements: nodesToCombine,
  };
  return [pageRefNode];
}
