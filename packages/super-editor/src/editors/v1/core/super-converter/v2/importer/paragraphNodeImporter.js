// @ts-check
import { translator as wPNodeTranslator } from '../../v3/handlers/w/p/index.js';

const PARAGRAPH_PROPERTIES_XML_NAME = 'w:pPr';
const BLOCK_FIELD_XML_NAMES = new Set(['sd:tableOfContents', 'sd:index', 'sd:bibliography', 'sd:tableOfAuthorities']);

const hasMeaningfulParagraphContent = (elements = []) =>
  elements.some((element) => element?.name && element.name !== PARAGRAPH_PROPERTIES_XML_NAME);

const hoistBlockFieldNodes = (params, paragraphNode) => {
  const paragraphElements = Array.isArray(paragraphNode?.elements) ? paragraphNode.elements : [];
  const blockFieldElements = paragraphElements.filter((element) => BLOCK_FIELD_XML_NAMES.has(element?.name));
  if (blockFieldElements.length === 0) return null;

  const nodes = [];
  const remainingElements = paragraphElements.filter((element) => !BLOCK_FIELD_XML_NAMES.has(element?.name));

  if (hasMeaningfulParagraphContent(remainingElements)) {
    const paragraph = wPNodeTranslator.encode({
      ...params,
      nodes: [
        {
          ...paragraphNode,
          elements: remainingElements,
        },
      ],
    });
    if (paragraph) {
      nodes.push(paragraph);
    }
  }

  blockFieldElements.forEach((blockFieldElement) => {
    nodes.push(
      ...params.nodeListHandler.handler({
        ...params,
        nodes: [blockFieldElement],
        path: [...(params.path || []), paragraphNode],
      }),
    );
  });

  return nodes;
};

/**
 * Special cases of w:p based on paragraph properties
 *
 * If we detect a list node, we need to get all nodes that are also lists and process them together
 * in order to combine list item nodes into list nodes.
 *
 * @param {import('../../v3/node-translator').SCEncoderConfig} params
 * @returns {Object} Handler result
 */
export const handleParagraphNode = (params) => {
  const { nodes } = params;
  if (nodes.length === 0 || nodes[0].name !== 'w:p') {
    return { nodes: [], consumed: 0 };
  }

  const hoistedNodes = hoistBlockFieldNodes(params, nodes[0]);
  if (hoistedNodes) {
    return { nodes: hoistedNodes, consumed: 1 };
  }

  const schemaNode = wPNodeTranslator.encode(params);
  const newNodes = Array.isArray(schemaNode) ? schemaNode : schemaNode ? [schemaNode] : [];
  return { nodes: newNodes, consumed: 1 };
};

/**
 * Paragraph node handler entity
 * @type {Object} Handler entity
 */
export const paragraphNodeHandlerEntity = {
  handlerName: 'paragraphNodeHandler',
  handler: handleParagraphNode,
};
