// @ts-check
import { translator as wBookmarkStartTranslator } from '../../v3/handlers/w/bookmark-start/index.js';
import { handleBookmarkNode as handleLegacyBookmarkNode } from './bookmarkNodeImporter.js';

/**
 * Bookmark start node handler
 * @param {import('../../v3/node-translator').SCEncoderConfig} params
 * @returns {Object} Handler result
 */
export const handleBookmarkStartNode = (params) => {
  const { nodes } = params;
  if (!nodes.length || nodes[0].name !== 'w:bookmarkStart') {
    return { nodes: [], consumed: 0 };
  }

  if (isCustomMarkBookmark(nodes[0], params.editor)) {
    return handleLegacyBookmarkNode(params);
  }

  const node = wBookmarkStartTranslator.encode(params);
  if (!node) return { nodes: [], consumed: 0 };

  return { nodes: [node], consumed: 1 };
};

const isCustomMarkBookmark = (bookmarkStartNode, editor) => {
  if (!bookmarkStartNode?.attributes || !editor?.extensionService?.extensions) {
    return false;
  }

  const rawBookmarkName = bookmarkStartNode.attributes['w:name'];
  if (!rawBookmarkName || typeof rawBookmarkName !== 'string') {
    return false;
  }

  const [bookmarkName, ...bookmarkPayloadParts] = rawBookmarkName.split(';');
  if (!bookmarkName) {
    return false;
  }

  const customMarks = editor.extensionService.extensions.filter((extension) => extension.isExternal === true);
  const matchesCustomMarkName = customMarks.some((mark) => mark.name === bookmarkName);
  if (!matchesCustomMarkName) {
    return false;
  }

  // Custom mark bookmarks encode mark attributes in the payload portion of the name (e.g. key=value).
  return bookmarkPayloadParts.some((part) => part && part.includes('='));
};

/**
 * Bookmark start node handler entity
 * @type {Object} Handler entity
 */
export const bookmarkStartNodeHandlerEntity = {
  handlerName: 'w:bookmarkStartTranslator',
  handler: handleBookmarkStartNode,
};
