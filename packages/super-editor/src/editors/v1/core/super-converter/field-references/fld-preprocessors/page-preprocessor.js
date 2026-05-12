import { parsePageNumberFieldSwitches } from '../shared/page-number-field-switches.js';

/**
 * Processes a PAGE instruction and creates a `sd:autoPageNumber` node.
 *
 * @param {import('../../v2/types/index.js').OpenXmlNode[]} nodesToCombine The nodes between separate and end.
 * @param {string} [_instrText] The instruction text (unused for PAGE).
 * @param {{ docx?: import('../../v2/docxHelper').ParsedDocx, instructionTokens?: Array<{type: string, text?: string}> | null, fieldRunRPr?: import('../../v2/types/index.js').OpenXmlNode | null }} [options]
 * @returns {import('../../v2/types/index.js').OpenXmlNode[]}
 * @see {@link https://ecma-international.org/publications-and-standards/standards/ecma-376/} "Fundamentals And Markup Language Reference", page 1234
 */
export function preProcessPageInstruction(nodesToCombine, instrText = 'PAGE', options = {}) {
  const fieldRunRPr = options.fieldRunRPr ?? null;
  const fieldAttrs = parsePageNumberFieldSwitches(instrText, 'PAGE');
  const pageNumNode = {
    name: 'sd:autoPageNumber',
    type: 'element',
    ...(Object.keys(fieldAttrs).length > 0 ? { attributes: fieldAttrs } : {}),
  };

  // First, try to get rPr from content nodes (between separate and end)
  // This is the original behavior and takes priority if content exists with styling
  let foundContentRPr = false;
  nodesToCombine.forEach((n) => {
    const rPrNode = n.elements?.find((el) => el.name === 'w:rPr');
    if (rPrNode) {
      pageNumNode.elements = [rPrNode];
      foundContentRPr = true;
    }
  });

  // If no rPr was found in content nodes, use the rPr captured from the field sequence
  // (begin, instrText, or separate nodes) where Word stores the styling for page numbers.
  if (!foundContentRPr && fieldRunRPr && fieldRunRPr.name === 'w:rPr') {
    pageNumNode.elements = [fieldRunRPr];
  }

  return [pageNumNode];
}
