/**
 * Processes a NUMPAGES instruction and creates a `sd:totalPageNumber` node.
 *
 * @param {import('../../v2/types/index.js').OpenXmlNode[]} nodesToCombine The nodes between separate and end.
 * @param {string} [_instrText] The instruction text (unused for NUMPAGES).
 * @param {import('../../v2/types/index.js').OpenXmlNode | null} [fieldRunRPr=null] The w:rPr node captured from field sequence nodes (begin, instrText, or separate). This is where Word stores styling for page number fields when no content exists between separate and end markers. Must be a node with name === 'w:rPr' to be used; other node types are ignored for safety.
 * @returns {import('../../v2/types/index.js').OpenXmlNode[]}
 * @see {@link https://ecma-international.org/publications-and-standards/standards/ecma-376/} "Fundamentals And Markup Language Reference", page 1233
 */
export function preProcessNumPagesInstruction(nodesToCombine, _instrText, fieldRunRPr = null) {
  const totalPageNumNode = {
    name: 'sd:totalPageNumber',
    type: 'element',
  };

  // First, try to get rPr from content nodes (between separate and end)
  // This is the original behavior and takes priority if content exists with styling
  let foundContentRPr = false;
  nodesToCombine.forEach((n) => {
    const rPrNode = n.elements?.find((el) => el.name === 'w:rPr');
    if (rPrNode) {
      totalPageNumNode.elements = [rPrNode];
      foundContentRPr = true;
    }
  });

  // If no rPr was found in content nodes, use the rPr captured from the field sequence
  // (begin, instrText, or separate nodes) where Word stores the styling for page numbers
  // Validate that fieldRunRPr is actually a w:rPr node before using it
  if (!foundContentRPr && fieldRunRPr && fieldRunRPr.name === 'w:rPr') {
    totalPageNumNode.elements = [fieldRunRPr];
  }

  return [totalPageNumNode];
}
