// @ts-check
import { NodeTranslator } from '@translator';
import { exportSchemaToJson } from '../../../../exporter.js';

/** @type {import('@translator').XmlNodeName} */
const XML_NODE_NAME = 'sd:tableOfContents';

/** @type {import('@translator').SuperDocNodeOrKeyName} */
const SD_NODE_NAME = 'tableOfContents';

/**
 * Encode a <sd:tableOfContents> node as a SuperDoc tableOfContents node.
 * @param {import('@translator').SCEncoderConfig} [params]
 * @returns {import('@translator').SCEncoderResult}
 */
/**
 * Derives rightAlignPageNumbers from the first entry paragraph's tab stops.
 * Returns true if any tab stop has tabType 'right', false otherwise.
 * @param {Array<{attrs?: {paragraphProperties?: {tabStops?: Array<{tab?: {tabType?: string}}>}}}>} content
 * @returns {boolean}
 */
function deriveRightAlignPageNumbers(content) {
  for (const para of content) {
    const tabStops = para?.attrs?.paragraphProperties?.tabStops;
    if (!Array.isArray(tabStops) || tabStops.length === 0) continue;
    return tabStops.some((ts) => ts?.tab?.tabType === 'right');
  }
  // No entry paragraphs with tab stops — default true matches Word's typical behavior
  return true;
}

const encode = (params) => {
  const { nodes = [], nodeListHandler } = params || {};
  const node = nodes[0];

  let processedContent = nodeListHandler.handler({
    ...params,
    nodes: node.elements || [],
  });
  const parentAcceptsBlocks = params?.extraParams?.parentAcceptsBlocks !== false;
  const hasParagraphBlocks = (processedContent || []).some((child) => child?.type === 'paragraph');
  if (parentAcceptsBlocks && !hasParagraphBlocks) {
    processedContent = [
      {
        type: 'paragraph',
        content: processedContent.filter((child) => Boolean(child && child.type)),
      },
    ];
  }
  const inlineField = !parentAcceptsBlocks;
  const attrs = {
    instruction: node.attributes?.instruction || '',
  };
  if (!inlineField) {
    attrs.rightAlignPageNumbers = deriveRightAlignPageNumbers(processedContent);
  }
  const processedNode = {
    type: inlineField ? 'tableOfContentsInline' : 'tableOfContents',
    attrs,
    content: processedContent,
  };

  return processedNode;
};

/**
 * Decode the tableOfContents node back into OOXML <w:br>.
 * @param {import('@translator').SCDecoderConfig} params
 * @returns {import('@translator').SCDecoderResult[]}
 */
const decode = (params) => {
  const { node } = params;
  const isInlineNode = node.type === 'tableOfContentsInline';
  const tocContent = Array.isArray(node.content) ? node.content : [];
  const inlineContentNodes = isInlineNode
    ? tocContent.flatMap((n) => {
        const exported = exportSchemaToJson({ ...params, node: n });
        if (!exported) return [];
        return Array.isArray(exported) ? exported : [exported];
      })
    : [];
  const blockContentNodes = isInlineNode ? [] : tocContent.map((n) => exportSchemaToJson({ ...params, node: n }));

  // Inject the fldChar begin, instrText and fldChar separate into the first child (after any existing pPr)
  const tocBeginElements = [
    {
      name: 'w:r',
      elements: [{ name: 'w:fldChar', attributes: { 'w:fldCharType': 'begin' }, elements: [] }],
    },
    {
      name: 'w:r',
      elements: [
        {
          name: 'w:instrText',
          attributes: { 'xml:space': 'preserve' },
          elements: [{ text: node.attrs?.instruction || '', type: 'text', name: '#text', elements: [] }],
        },
      ],
    },
    { name: 'w:r', elements: [{ name: 'w:fldChar', attributes: { 'w:fldCharType': 'separate' }, elements: [] }] },
  ];
  const tocEndElements = [
    { name: 'w:r', elements: [{ name: 'w:fldChar', attributes: { 'w:fldCharType': 'end' }, elements: [] }] },
  ];

  if (isInlineNode) {
    return [...tocBeginElements, ...inlineContentNodes, ...tocEndElements];
  }

  if (blockContentNodes.length > 0) {
    const firstParagraph = blockContentNodes[0];
    let insertIndex = 0;
    if (firstParagraph.elements) {
      const pPrIndex = firstParagraph.elements.findIndex((el) => el.name === 'w:pPr');
      insertIndex = pPrIndex >= 0 ? pPrIndex + 1 : 0;
    } else {
      firstParagraph.elements = [];
    }

    firstParagraph.elements.splice(insertIndex, 0, ...tocBeginElements);
  } else {
    // If there are no paragraphs, create one with the TOC begin elements
    blockContentNodes.push({
      name: 'w:p',
      elements: tocBeginElements,
    });
  }

  const lastParagraph = blockContentNodes[blockContentNodes.length - 1];
  if (lastParagraph.elements) {
    lastParagraph.elements.push(...tocEndElements);
  } else {
    lastParagraph.elements = [...tocEndElements];
  }

  return blockContentNodes;
};

/** @type {import('@translator').NodeTranslatorConfig} */
export const config = {
  xmlName: XML_NODE_NAME,
  sdNodeOrKeyName: SD_NODE_NAME,
  type: NodeTranslator.translatorTypes.NODE,
  encode,
  decode,
};

/**
 * The NodeTranslator instance for the sd:tableOfContents element.
 * This element represents a table of contents in a document and is added during
 * preprocessing of w:fldChar elements
 * @type {import('@translator').NodeTranslator}
 * @see {@link https://ecma-international.org/publications-and-standards/standards/ecma-376/} "Fundamentals And Markup Language Reference", page 1251
 */
export const translator = NodeTranslator.from(config);
