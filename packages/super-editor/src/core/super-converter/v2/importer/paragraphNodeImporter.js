// @ts-check
import { translator as wPNodeTranslator } from '../../v3/handlers/w/p/index.js';

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
