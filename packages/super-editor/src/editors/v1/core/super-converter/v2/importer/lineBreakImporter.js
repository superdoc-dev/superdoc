// @ts-check
import { translator } from '../../v3/handlers/w/br/index.js';

/**
 * Line break node handler
 * @param {import('../../v3/node-translator').SCEncoderConfig} params
 * @returns {Object} Handler result
 */
export const handler = (params) => {
  const { nodes } = params;
  if (nodes.length === 0 || nodes[0].name !== 'w:br') {
    return { nodes: [], consumed: 0 };
  }

  const result = translator.encode(params);
  if (!result) return { nodes: [], consumed: 0 };

  return {
    nodes: [result],
    consumed: 1,
  };
};

/**
 * Line break node handler entity
 * @type {Object} Handler entity
 */
export const lineBreakNodeHandlerEntity = {
  handlerName: 'lineBreakNodeHandler',
  handler,
};
