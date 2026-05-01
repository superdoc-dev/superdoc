/**
 * Processes NUMWORDS and NUMCHARS instructions into `sd:documentStatField` nodes.
 *
 * Follows the same pattern as page-preprocessor.js / num-pages-preprocessor.js:
 * captures rPr from content nodes first, falls back to field-sequence rPr.
 *
 * @param {import('../../v2/types/index.js').OpenXmlNode[]} nodesToCombine The nodes between separate and end.
 * @param {string} instrText The full instruction string (e.g. "NUMWORDS" or "NUMCHARS \* MERGEFORMAT").
 * @param {import('../../v2/docxHelper').ParsedDocx | import('../../v2/types/index.js').OpenXmlNode | null} [_docxOrFieldRunRPr=null] In the generic body pipeline this position still carries `docx`; in header/footer standalone processing it carries the captured w:rPr.
 * @param {Array<{type: string, text?: string}> | import('../../v2/types/index.js').OpenXmlNode | null} [instructionTokensOrFieldRunRPr=null] Raw instruction tokens in the generic body pipeline, or a legacy w:rPr position in alternate callers.
 * @param {import('../../v2/types/index.js').OpenXmlNode | null} [fieldRunRPr=null] The w:rPr node captured from field sequence nodes for complex body fields.
 * @returns {import('../../v2/types/index.js').OpenXmlNode[]}
 */
export function preProcessDocumentStatInstruction(
  nodesToCombine,
  instrText,
  _docxOrFieldRunRPr = null,
  instructionTokensOrFieldRunRPr = null,
  fieldRunRPr = null,
) {
  const effectiveFieldRunRPr =
    fieldRunRPr ??
    (instructionTokensOrFieldRunRPr?.name === 'w:rPr' ? instructionTokensOrFieldRunRPr : null) ??
    (_docxOrFieldRunRPr?.name === 'w:rPr' ? _docxOrFieldRunRPr : null);
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
  if (!foundContentRPr && effectiveFieldRunRPr && effectiveFieldRunRPr.name === 'w:rPr') {
    statFieldNode.elements = [effectiveFieldRunRPr, ...nodesToCombine];
  }

  return [statFieldNode];
}
