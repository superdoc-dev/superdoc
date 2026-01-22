// @ts-check
import { translator as pictTranslator } from '../../v3/handlers/w/pict/pict-translator';
import { translator as w_pPrTranslator } from '../../v3/handlers/w/pPr';
import { parseProperties } from './importerHelpers.js';

/** @type {Set<string>} */
const INLINE_PICT_RESULT_TYPES = new Set(['image', 'contentBlock']);

/**
 * Build paragraph attributes from a w:p node for wrapping inline pict results.
 * @param {Object} pNode - The XML w:p node
 * @param {Object} params - Import params containing docx context
 * @returns {Object} Paragraph attributes including paragraphProperties, rsidRDefault, filename
 */
const buildParagraphAttrsFromPNode = (pNode, params) => {
  const { attributes = {} } = parseProperties(pNode);
  const pPr = pNode?.elements?.find((el) => el.name === 'w:pPr');
  const inlineParagraphProperties = pPr ? w_pPrTranslator.encode({ ...params, nodes: [pPr] }) || {} : {};

  return {
    ...attributes,
    paragraphProperties: inlineParagraphProperties,
    rsidRDefault: pNode?.attributes?.['w:rsidRDefault'],
    filename: params?.filename,
  };
};

export const handlePictNode = (params) => {
  const { nodes } = params;

  if (!nodes.length || nodes[0].name !== 'w:p') {
    return { nodes: [], consumed: 0 };
  }

  const pNode = nodes[0];
  const runs = pNode.elements?.filter((el) => el.name === 'w:r') || [];

  let pict = null;
  for (const run of runs) {
    const foundPict = run.elements?.find((el) => el.name === 'w:pict');
    if (foundPict) {
      pict = foundPict;
      break;
    }
  }

  // if there is no pict, then process as a paragraph or list.
  if (!pict) {
    return { nodes: [], consumed: 0 };
  }

  const node = pict;
  const result = pictTranslator.encode({ ...params, extraParams: { node, pNode } });

  if (!result) {
    return { nodes: [], consumed: 0 };
  }

  const shouldWrapInParagraph = INLINE_PICT_RESULT_TYPES.has(result.type);
  const wrappedNode = shouldWrapInParagraph
    ? {
        type: 'paragraph',
        content: [result],
        attrs: buildParagraphAttrsFromPNode(pNode, params),
        marks: [],
      }
    : result;

  return {
    nodes: [wrappedNode],
    consumed: 1,
  };
};

export const pictNodeHandlerEntity = {
  handlerName: 'handlePictNode',
  handler: handlePictNode,
};
