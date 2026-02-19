import { carbonCopy } from '@core/utilities/carbonCopy.js';
import { mergeTextNodes } from '@converter/v2/importer/index.js';
import { parseProperties } from '@converter/v2/importer/importerHelpers.js';
import { resolveParagraphProperties } from '@converter/styles';
import { translator as w_pPrTranslator } from '@converter/v3/handlers/w/pPr';

function getTableStyleId(path) {
  const tbl = path.find((ancestor) => ancestor.name === 'w:tbl');
  if (!tbl) {
    return;
  }
  const tblPr = tbl.elements?.find((child) => child.name === 'w:tblPr');
  if (!tblPr) {
    return;
  }
  const tblStyle = tblPr.elements?.find((child) => child.name === 'w:tblStyle');
  if (!tblStyle) {
    return;
  }
  return tblStyle.attributes?.['w:val'];
}

/**
 * Paragraph node handler
 * @param {import('@translator').SCEncoderConfig} params
 * @returns {Object} Handler result
 */
export const handleParagraphNode = (params) => {
  const { nodes, nodeListHandler, filename } = params;

  const node = carbonCopy(nodes[0]);
  let schemaNode;

  const pPr = node.elements?.find((el) => el.name === 'w:pPr');
  let inlineParagraphProperties = {};
  if (pPr) {
    inlineParagraphProperties = w_pPrTranslator.encode({ ...params, nodes: [pPr] }) || {};
  }

  // Resolve paragraph properties according to styles hierarchy
  const tableStyleId = getTableStyleId(params.path || []);
  const resolvedParagraphProperties = resolveParagraphProperties(params, inlineParagraphProperties, { tableStyleId });

  const { elements = [], attributes = {}, marks = [] } = parseProperties(node, params.docx);
  const childContent = [];
  if (elements.length) {
    const updatedElements = elements.map((el) => {
      if (!el.marks) el.marks = [];
      el.marks.push(...marks);
      return el;
    });

    const childParams = {
      ...params,
      nodes: updatedElements,
      extraParams: {
        ...params.extraParams,
        paragraphProperties: resolvedParagraphProperties,
        numberingDefinedInline: Boolean(inlineParagraphProperties.numberingProperties),
      },
      path: [...(params.path || []), node],
    };
    const translatedChildren = nodeListHandler.handler(childParams);
    childContent.push(...translatedChildren);
  }

  schemaNode = {
    type: 'paragraph',
    content: childContent,
    attrs: { ...attributes },
    marks: [],
  };

  schemaNode.type = 'paragraph';

  // Pull out some commonly used properties to top-level attrs
  schemaNode.attrs.paragraphProperties = inlineParagraphProperties;
  schemaNode.attrs.rsidRDefault = node.attributes?.['w:rsidRDefault'];
  schemaNode.attrs.filename = filename;

  // Normalize text nodes.
  if (schemaNode && schemaNode.content) {
    schemaNode = {
      ...schemaNode,
      content: mergeTextNodes(schemaNode.content),
    };
  }

  // Pass through this paragraph's sectPr, if any
  const sectPr = pPr?.elements?.find((el) => el.name === 'w:sectPr');
  if (sectPr) {
    schemaNode.attrs.paragraphProperties.sectPr = sectPr;
    schemaNode.attrs.pageBreakSource = 'sectPr';
  }

  return schemaNode;
};
