import { carbonCopy } from '@core/utilities/carbonCopy.js';
import { mergeTextNodes } from '@converter/v2/importer/index.js';
import { parseProperties } from '@converter/v2/importer/importerHelpers.js';
import { resolveParagraphProperties } from '@converter/styles';
import { translator as w_pPrTranslator } from '@converter/v3/handlers/w/pPr';
import { isInlineNode } from '../../../helpers/is-inline-node.js';

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

function cloneParagraphAttrsForFragment(attrs, { keepSectPr = false } = {}) {
  if (!attrs) return {};

  const nextAttrs = { ...attrs };
  if (attrs.paragraphProperties && typeof attrs.paragraphProperties === 'object') {
    nextAttrs.paragraphProperties = { ...attrs.paragraphProperties };
    if (!keepSectPr) {
      delete nextAttrs.paragraphProperties.sectPr;
    }
  }

  if (!keepSectPr) {
    delete nextAttrs.pageBreakSource;
  }

  return nextAttrs;
}

function hasSectionBreakAttrs(attrs) {
  return Boolean(attrs?.paragraphProperties?.sectPr);
}

function cloneWrapperParagraphAttrs(attrs) {
  return cloneParagraphAttrsForFragment(attrs, { keepSectPr: true });
}

function normalizeParagraphChildren(children, schema, textblockAttrs) {
  const normalized = [];
  let pendingInline = [];

  const flushInline = () => {
    if (!pendingInline.length) return;
    normalized.push({
      type: 'paragraph',
      attrs: null,
      content: pendingInline,
      marks: [],
    });
    pendingInline = [];
  };

  for (const child of children || []) {
    if (isInlineNode(child, schema)) {
      pendingInline.push(child);
      continue;
    }

    flushInline();
    if (child != null) normalized.push(child);
  }

  flushInline();

  const lastNodeIndex = normalized.length - 1;
  const isSingleBlockResult = normalized.length === 1 && normalized[0] != null && normalized[0]?.type !== 'paragraph';
  const paragraphIndexes = normalized.reduce((indexes, node, index) => {
    if (node?.type === 'paragraph') indexes.push(index);
    return indexes;
  }, []);
  const lastParagraphIndex = paragraphIndexes.length ? paragraphIndexes[paragraphIndexes.length - 1] : -1;
  const shouldAttachWrapperParagraph =
    isSingleBlockResult || (hasSectionBreakAttrs(textblockAttrs) && lastNodeIndex !== lastParagraphIndex);

  paragraphIndexes.forEach((index) => {
    normalized[index] = {
      ...normalized[index],
      attrs: cloneParagraphAttrsForFragment(textblockAttrs, {
        keepSectPr: !shouldAttachWrapperParagraph && index === lastParagraphIndex,
      }),
    };
  });

  if (shouldAttachWrapperParagraph) {
    const lastNode = normalized[lastNodeIndex];
    normalized[lastNodeIndex] = {
      ...lastNode,
      attrs: {
        ...(lastNode?.attrs || {}),
        wrapperParagraph: cloneWrapperParagraphAttrs(textblockAttrs),
      },
    };
  }

  return normalized;
}

/**
 * Paragraph node handler
 * @param {import('@translator').SCEncoderConfig} params
 * @returns {Object} Handler result
 */
export const handleParagraphNode = (params) => {
  const { nodes, nodeListHandler, filename, editor } = params;

  const node = carbonCopy(nodes[0]);
  let schemaNode;

  const pPr = node.elements?.find((el) => el.name === 'w:pPr');
  let inlineParagraphProperties = {};
  if (pPr) {
    inlineParagraphProperties = w_pPrTranslator.encode({ ...params, nodes: [pPr] }) || {};
    // Mark which runProperties were in w:pPr's w:rPr so export can omit style-inherited
    if (inlineParagraphProperties.runProperties && typeof inlineParagraphProperties.runProperties === 'object') {
      inlineParagraphProperties.runPropertiesInlineKeys = Object.keys(inlineParagraphProperties.runProperties);
    }
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
        inlineParagraphProperties,
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

  // Pass through this paragraph's sectPr, if any
  const sectPr = pPr?.elements?.find((el) => el.name === 'w:sectPr');
  if (sectPr) {
    schemaNode.attrs.paragraphProperties.sectPr = sectPr;
    schemaNode.attrs.pageBreakSource = 'sectPr';
  }

  const normalizedNodes = normalizeParagraphChildren(schemaNode.content, editor?.schema, schemaNode.attrs).map(
    (node) => {
      if (node?.type !== 'paragraph' || !Array.isArray(node.content)) return node;
      return {
        ...node,
        content: mergeTextNodes(node.content),
      };
    },
  );

  if (!normalizedNodes.length) {
    return {
      ...schemaNode,
      content: mergeTextNodes(schemaNode.content || []),
    };
  }

  if (normalizedNodes.length === 1 && normalizedNodes[0]?.type === 'paragraph') {
    return normalizedNodes[0];
  }

  return normalizedNodes;
};
