import { translator as wBookmarkStartTranslator } from '../../v3/handlers/w/bookmark-start/index.js';

/**
 * @type {import("docxImporter").NodeHandler}
 */
export const handleBookmarkNode = (params) => {
  const { nodes, nodeListHandler, editor } = params;
  if (nodes.length === 0 || nodes[0].name !== 'w:bookmarkStart') {
    return { nodes: [], consumed: 0 };
  }
  const node = nodes[0];

  // Check if this bookmark is a custom mark
  const customMarks = editor?.extensionService?.extensions?.filter((e) => e.isExternal === true) || [];
  const bookmarkName = node.attributes['w:name']?.split(';')[0];
  const customMark = customMarks.find((mark) => mark.name === bookmarkName);
  if (customMark) {
    const bookmarkEndIndex = nodes.findIndex(
      (n) => n.name === 'w:bookmarkEnd' && n.attributes['w:id'] === node.attributes['w:id'],
    );
    const textNodes = nodes.slice(1, bookmarkEndIndex);

    const attrs = {};
    node.attributes['w:name'].split(';').forEach((name) => {
      const [key, value] = name.split('=');
      if (key && value) {
        attrs[key] = value;
      }
    });

    const translatedText = nodeListHandler.handler({
      ...params,
      nodes: textNodes,
      path: [...(params.path || []), node],
    });
    translatedText.forEach((n) => {
      n.marks.push({
        type: customMark.name,
        attrs,
      });
    });
    return {
      nodes: translatedText,
      consumed: translatedText.length + 2,
    };
  }

  const encoded = wBookmarkStartTranslator.encode({ ...params, nodes: [node] });
  if (!encoded) {
    return { nodes: [], consumed: 0 };
  }
  return { nodes: [encoded], consumed: 1 };
};

/**
 * @type {import("docxImporter").NodeHandlerEntry}
 */
export const bookmarkNodeHandlerEntity = {
  handlerName: 'bookmarkNodeHandler',
  handler: handleBookmarkNode,
};
