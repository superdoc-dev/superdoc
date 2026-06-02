import { parsePageInstruction } from './page-instruction.js';

/**
 * Processes a SECTIONPAGES instruction and creates a `sd:sectionPageCount` node.
 *
 * @param {import('../../v2/types/index.js').OpenXmlNode[]} nodesToCombine The nodes between separate and end.
 * @param {string} [instrText] The SECTIONPAGES instruction text.
 * @param {import('../../v2/docxHelper').ParsedDocx} [_docx] The docx object.
 * @param {Array<{type: string, text?: string}> | null} [_instructionTokens] Raw instruction tokens.
 * @param {import('../../v2/types/index.js').OpenXmlNode | null} [fieldRunRPr=null] The w:rPr node captured from field sequence nodes.
 * @returns {import('../../v2/types/index.js').OpenXmlNode[]}
 */
export function preProcessSectionPagesInstruction(
  nodesToCombine,
  instrText = '',
  _docx,
  _instructionTokens,
  fieldRunRPr = null,
) {
  const parsedInstruction = parsePageInstruction(instrText, 'SECTIONPAGES');
  const sectionPageCountNode = {
    name: 'sd:sectionPageCount',
    type: 'element',
    attributes: {
      instruction: parsedInstruction.instruction,
      ...(parsedInstruction.pageNumberFormat ? { pageNumberFormat: parsedInstruction.pageNumberFormat } : {}),
    },
  };

  const cachedText = extractCachedText(nodesToCombine);
  if (cachedText) {
    sectionPageCountNode.attributes.importedCachedText = cachedText;
  }

  let foundContentRPr = false;
  nodesToCombine.forEach((n) => {
    const rPrNode = n.elements?.find((el) => el.name === 'w:rPr');
    if (rPrNode) {
      sectionPageCountNode.elements = [rPrNode];
      foundContentRPr = true;
    }
  });

  if (!foundContentRPr && fieldRunRPr && fieldRunRPr.name === 'w:rPr') {
    sectionPageCountNode.elements = [fieldRunRPr];
  }

  return [sectionPageCountNode];
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
