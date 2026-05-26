/**
 * Processes a TC (table of contents entry) instruction and creates an `sd:tableOfContentsEntry` node.
 * @param {import('../../v2/types/index.js').OpenXmlNode[]} nodesToCombine The nodes to combine.
 * @param {string} instrText The instruction text.
 * @param {import('../../v2/docxHelper').ParsedDocx} [_docx] The docx object (unused).
 * @param {Array<{type: string, text?: string}>} [instructionTokens] Raw instruction tokens.
 * @returns {import('../../v2/types/index.js').OpenXmlNode[]}
 */
export function preProcessTcInstruction(nodesToCombine, instrText, _docx, instructionTokens = null) {
  // SD-3227 / SD-3229: a `_Toc...` bookmark embedded inside the TC field
  // instruction gets swallowed by the synthesized `sd:tableOfContentsEntry`
  // atom wrapper — `buildPositionMap` does not visit its descendants, so the
  // bookmark name is never indexed (breaks Section link navigation) and the
  // resulting PM node tends to be dropped (breaks TOC rebuild). Hoist
  // `w:bookmarkStart` / `w:bookmarkEnd` nodes back out as paragraph-level
  // siblings: starts go before the entry, ends after — same logical position
  // they had inside the field, but visible to the rest of the importer.
  const startBookmarks = [];
  const endBookmarks = [];
  const innerNodes = [];
  for (const child of nodesToCombine) {
    if (child?.name === 'w:bookmarkStart') startBookmarks.push(child);
    else if (child?.name === 'w:bookmarkEnd') endBookmarks.push(child);
    else innerNodes.push(child);
  }

  return [
    ...startBookmarks,
    {
      name: 'sd:tableOfContentsEntry',
      type: 'element',
      attributes: {
        instruction: instrText,
        ...(instructionTokens ? { instructionTokens } : {}),
      },
      elements: innerNodes,
    },
    ...endBookmarks,
  ];
}
