import { parsePageInstruction } from './page-instruction.js';

/**
 * Processes a SECTIONPAGES instruction and creates a `sd:sectionPageCount` node.
 *
 * @param {import('../../v2/types/index.js').OpenXmlNode[]} nodesToCombine The nodes between separate and end.
 * @param {string} [instrText] The SECTIONPAGES instruction text.
 * @param {unknown} [_docxOrFieldRunRPr] The parsed docx in the main import path, or w:rPr in header/footer-only preprocessing.
 * @param {Array<{type: string, text?: string}> | null} [_instructionTokens] Raw instruction tokens.
 * @param {import('../../v2/types/index.js').OpenXmlNode | null} [fieldRunRPr=null] The w:rPr node captured from field sequence nodes.
 * @returns {import('../../v2/types/index.js').OpenXmlNode[]}
 */
export function preProcessSectionPagesInstruction(
  nodesToCombine,
  instrText = '',
  _docxOrFieldRunRPr = null,
  _instructionTokens,
  fieldRunRPr = null,
) {
  const effectiveFieldRunRPr = fieldRunRPr ?? (_docxOrFieldRunRPr?.name === 'w:rPr' ? _docxOrFieldRunRPr : null);
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

  if (!foundContentRPr && effectiveFieldRunRPr && effectiveFieldRunRPr.name === 'w:rPr') {
    sectionPageCountNode.elements = [effectiveFieldRunRPr];
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
