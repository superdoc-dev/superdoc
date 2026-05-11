import { parsePageNumberFieldSwitches } from '../shared/page-number-field-switches.js';

/**
 * Processes a NUMPAGES instruction and creates a `sd:totalPageNumber` node.
 *
 * @param {import('../../v2/types/index.js').OpenXmlNode[]} nodesToCombine The nodes between separate and end.
 * @param {string} [_instrText] The instruction text (unused for NUMPAGES).
 * @param {import('../../v2/docxHelper').ParsedDocx | import('../../v2/types/index.js').OpenXmlNode | null} [_docxOrFieldRunRPr=null] The generic body pipeline passes docx here; standalone field processing passes the captured w:rPr.
 * @param {Array<{type: string, text?: string}> | import('../../v2/types/index.js').OpenXmlNode | null} [instructionTokensOrFieldRunRPr=null] Raw instruction tokens in the body pipeline, or a legacy w:rPr position in alternate callers.
 * @param {import('../../v2/types/index.js').OpenXmlNode | null} [fieldRunRPr=null] The w:rPr node captured from field sequence nodes.
 * @returns {import('../../v2/types/index.js').OpenXmlNode[]}
 * @see {@link https://ecma-international.org/publications-and-standards/standards/ecma-376/} "Fundamentals And Markup Language Reference", page 1233
 */
export function preProcessNumPagesInstruction(
  nodesToCombine,
  instrText = 'NUMPAGES',
  _docxOrFieldRunRPr = null,
  instructionTokensOrFieldRunRPr = null,
  fieldRunRPr = null,
) {
  const effectiveFieldRunRPr =
    fieldRunRPr ??
    (instructionTokensOrFieldRunRPr?.name === 'w:rPr' ? instructionTokensOrFieldRunRPr : null) ??
    (_docxOrFieldRunRPr?.name === 'w:rPr' ? _docxOrFieldRunRPr : null);
  const fieldAttrs = parsePageNumberFieldSwitches(instrText, 'NUMPAGES');
  const totalPageNumNode = {
    name: 'sd:totalPageNumber',
    type: 'element',
    attributes: { ...fieldAttrs },
  };

  // Extract the cached display text from content nodes so the encoder can
  // preserve it for the NUMPAGES fallback path (headless / no-pagination).
  const cachedText = extractCachedText(nodesToCombine);
  if (cachedText) {
    totalPageNumNode.attributes.importedCachedText = cachedText;
  }

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
  // (begin, instrText, or separate nodes) where Word stores the styling for page numbers.
  if (!foundContentRPr && effectiveFieldRunRPr && effectiveFieldRunRPr.name === 'w:rPr') {
    totalPageNumNode.elements = [effectiveFieldRunRPr];
  }

  return [totalPageNumNode];
}

/**
 * Extracts cached display text from content runs (between separate and end).
 * @param {import('../../v2/types/index.js').OpenXmlNode[]} nodes
 * @returns {string}
 */
function extractCachedText(nodes) {
  const texts = [];
  for (const node of nodes) {
    const textEl = node.elements?.find((el) => el.name === 'w:t');
    if (textEl) {
      const text = textEl.elements?.[0]?.text ?? '';
      if (text) texts.push(text);
    }
  }
  return texts.join('');
}
