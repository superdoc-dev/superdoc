// @ts-check
import { translator as wBookmarkEndTranslator } from '../../v3/handlers/w/bookmark-end/index.js';

/**
 * Bookmark end node handler
 * @param {import('../../v3/node-translator').SCEncoderConfig} params
 * @returns {Object} Handler result
 */
export const handleBookmarkEndNode = (params) => {
  const { nodes } = params;
  if (!nodes.length || nodes[0].name !== 'w:bookmarkEnd') {
    return { nodes: [], consumed: 0 };
  }

  const node = wBookmarkEndTranslator.encode(params);
  if (!node) return { nodes: [], consumed: 0 };

  return { nodes: [node], consumed: 1 };
};

/**
 * Bookmark end node handler entity
 * @type {Object} Handler entity
 */
export const bookmarkEndNodeHandlerEntity = {
  handlerName: 'w:bookmarkEndTranslator',
  handler: handleBookmarkEndNode,
};
