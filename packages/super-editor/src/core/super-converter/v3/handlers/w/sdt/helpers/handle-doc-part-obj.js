/**
 * @param {Object} params
 * @returns {Array|null}
 */
export function handleDocPartObj(params) {
  const { nodes } = params;

  if (nodes.length === 0 || nodes[0].name !== 'w:sdt') {
    return null;
  }

  const node = nodes[0];
  const sdtPr = node.elements.find((el) => el.name === 'w:sdtPr');
  const docPartObj = sdtPr?.elements.find((el) => el.name === 'w:docPartObj');
  const docPartGallery = docPartObj?.elements.find((el) => el.name === 'w:docPartGallery');
  const docPartGalleryType = docPartGallery?.attributes?.['w:val'] ?? null;

  const content = node?.elements.find((el) => el.name === 'w:sdtContent');

  // Use specific handler if available, otherwise fall back to generic handler
  const handler = validGalleryTypeMap[docPartGalleryType] || genericDocPartHandler;
  const result = handler({
    ...params,
    nodes: [content],
    extraParams: { ...(params.extraParams || {}), sdtPr, docPartGalleryType },
  });

  return result;
}

/**
 * Handler for Table of Contents docPartGallery type.
 * Processes ToC content and preserves sdtPr for round-trip.
 * @param {Object} params - The handler parameters
 * @param {Array} params.nodes - Array containing the w:sdtContent node
 * @param {Object} params.nodeListHandler - Handler for processing child nodes
 * @param {Object} params.extraParams - Extra parameters containing sdtPr
 * @param {Object} params.extraParams.sdtPr - The original sdtPr element for passthrough
 * @param {Array} [params.path] - Current processing path for nested nodes
 * @returns {Object} Document part object node configured for Table of Contents
 */
export const tableOfContentsHandler = (params) => {
  const node = params.nodes[0];
  const translatedContent = translateTocSdtContent(node, params);
  const normalizedContent = normalizeDocPartContent(translatedContent);
  const sdtPr = params.extraParams.sdtPr;
  const id = sdtPr.elements?.find((el) => el.name === 'w:id')?.attributes['w:val'] || '';
  const docPartObj = sdtPr?.elements.find((el) => el.name === 'w:docPartObj');
  // Per OOXML spec: presence of w:docPartUnique element = true, absence = false
  const docPartUnique = docPartObj?.elements.some((el) => el.name === 'w:docPartUnique') ?? false;

  const result = {
    type: 'documentPartObject',
    content: normalizedContent,
    attrs: {
      id,
      docPartGallery: 'Table of Contents',
      docPartUnique,
      sdtPr, // Passthrough for round-trip preservation
    },
  };
  return result;
};

/**
 * Generic handler for unknown docPartGallery types.
 * Translates content for display but preserves full sdtPr for round-trip preservation.
 * @param {Object} params - The handler parameters
 * @param {Array} params.nodes - Array containing the w:sdtContent node
 * @param {Object} params.nodeListHandler - Handler for processing child nodes
 * @param {Object} params.extraParams - Extra parameters containing sdtPr and docPartGalleryType
 * @param {Object} params.extraParams.sdtPr - The original sdtPr element for passthrough
 * @param {string} params.extraParams.docPartGalleryType - The type of document part gallery
 * @param {Array} [params.path] - Current processing path for nested nodes
 * @returns {Object} Document part object node with content, type, and attrs including sdtPr passthrough
 */
export const genericDocPartHandler = (params) => {
  const node = params.nodes[0];
  const translatedContent = params.nodeListHandler.handler({
    ...params,
    nodes: node.elements,
    path: [...(params.path || []), node],
  });
  const sdtPr = params.extraParams.sdtPr;
  const docPartGalleryType = params.extraParams.docPartGalleryType;
  const id = sdtPr?.elements?.find((el) => el.name === 'w:id')?.attributes['w:val'] || '';
  const docPartObj = sdtPr?.elements.find((el) => el.name === 'w:docPartObj');
  const docPartGallery =
    docPartGalleryType ??
    docPartObj?.elements?.find((el) => el.name === 'w:docPartGallery')?.attributes?.['w:val'] ??
    null;
  // Per OOXML spec: presence of w:docPartUnique element = true, absence = false
  const docPartUnique = docPartObj?.elements.some((el) => el.name === 'w:docPartUnique') ?? false;

  const result = {
    type: 'documentPartObject',
    content: translatedContent,
    attrs: {
      id,
      docPartGallery,
      docPartUnique,
      sdtPr, // Passthrough for round-trip preservation of all sdtPr elements
    },
  };
  return result;
};

const validGalleryTypeMap = {
  'Table of Contents': tableOfContentsHandler,
};

const inlineNodeTypes = new Set(['bookmarkStart', 'bookmarkEnd']);
const SD_TOC_XML_NAME = 'sd:tableOfContents';
const PARAGRAPH_XML_NAME = 'w:p';
const PARAGRAPH_PROPERTIES_XML_NAME = 'w:pPr';
const wrapInlineNode = (node) => ({
  type: 'paragraph',
  content: [node],
});

const hasMeaningfulParagraphContent = (elements = []) =>
  elements.some((element) => element?.name && element.name !== PARAGRAPH_PROPERTIES_XML_NAME);

const translateNodes = (params, nodes, pathTail = []) =>
  params.nodeListHandler.handler({
    ...params,
    nodes,
    path: [...(params.path || []), ...pathTail],
  });

/**
 * Hoists sd:tableOfContents blocks out of their wrapper paragraph so the
 * resulting PM tree can represent them as block children of documentPartObject.
 *
 * @param {Object} sdtContent
 * @param {Object} params
 * @returns {Array}
 */
const translateTocSdtContent = (sdtContent, params) => {
  const translatedContent = [];
  const parentPath = [sdtContent];

  (sdtContent?.elements || []).forEach((child) => {
    const childElements = Array.isArray(child?.elements) ? child.elements : [];
    const tocElements =
      child?.name === PARAGRAPH_XML_NAME ? childElements.filter((el) => el?.name === SD_TOC_XML_NAME) : [];

    if (tocElements.length === 0) {
      translatedContent.push(...translateNodes(params, [child], parentPath));
      return;
    }

    const remainingElements = childElements.filter((el) => el?.name !== SD_TOC_XML_NAME);
    if (hasMeaningfulParagraphContent(remainingElements)) {
      translatedContent.push(
        ...translateNodes(
          params,
          [
            {
              ...child,
              elements: remainingElements,
            },
          ],
          parentPath,
        ),
      );
    }

    tocElements.forEach((tocElement) => {
      translatedContent.push(...translateNodes(params, [tocElement], [...parentPath, child]));
    });
  });

  return translatedContent;
};

export const normalizeDocPartContent = (nodes = []) => {
  const normalized = [];
  nodes.forEach((node) => {
    if (inlineNodeTypes.has(node?.type)) {
      normalized.push(wrapInlineNode(node));
    } else {
      normalized.push(node);
    }
  });
  return normalized;
};
