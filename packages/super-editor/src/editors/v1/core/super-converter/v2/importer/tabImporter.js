// @ts-check
import { translator as wTabNodeTranslator } from '../../v3/handlers/w/tab/index.js';

/**
 * Tab node handler
 * @param {import('../../v3/node-translator').SCEncoderConfig} params
 * @returns {Object} Handler result
 */
const handleTabNode = (params) => {
  const { nodes } = params;
  if (!nodes.length || nodes[0].name !== 'w:tab') {
    return { nodes: [], consumed: 0 };
  }
  const node = wTabNodeTranslator.encode(params);
  return { nodes: [node], consumed: 1 };
};

/**
 * Tab node handler entity
 * @type {Object} Handler entity
 */
export const tabNodeEntityHandler = {
  handlerName: 'w:tabTranslator',
  handler: handleTabNode,
};
