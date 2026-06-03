/**
 * Processes NUMWORDS and NUMCHARS instructions into `sd:documentStatField` nodes.
 *
 * Follows the same pattern as page-preprocessor.js / num-pages-preprocessor.js:
 * captures rPr from content nodes first, falls back to field-sequence rPr.
 *
 * @param {import('../../v2/types/index.js').OpenXmlNode[]} nodesToCombine The nodes between separate and end.
 * @param {string} instrText The full instruction string (e.g. "NUMWORDS" or "NUMCHARS \* MERGEFORMAT").
 * @param {{ docx?: import('../../v2/docxHelper').ParsedDocx, instructionTokens?: Array<{type: string, text?: string}> | null, fieldRunRPr?: import('../../v2/types/index.js').OpenXmlNode | null }} [options]
 * @returns {import('../../v2/types/index.js').OpenXmlNode[]}
 */
export function preProcessDocumentStatInstruction(nodesToCombine, instrText, options = {}) {
  const fieldRunRPr = options.fieldRunRPr ?? null;
  const statFieldNode = {
    name: 'sd:documentStatField',
    type: 'element',
    attributes: {
      instruction: instrText,
    },
    elements: [...nodesToCombine],
  };

  // Priority 1: Extract rPr from content nodes (between separate and end)
  let foundContentRPr = false;
  nodesToCombine.forEach((n) => {
    const rPrNode = n.elements?.find((el) => el.name === 'w:rPr');
    if (rPrNode) {
      if (!statFieldNode.elements) statFieldNode.elements = [];
      // Prepend rPr so the translator can find it
      statFieldNode.elements = [rPrNode, ...nodesToCombine];
      foundContentRPr = true;
    }
  });

  // Priority 2: Use rPr from field sequence if content has none
  if (!foundContentRPr && fieldRunRPr && fieldRunRPr.name === 'w:rPr') {
    statFieldNode.elements = [fieldRunRPr, ...nodesToCombine];
  }

  return [statFieldNode];
}
