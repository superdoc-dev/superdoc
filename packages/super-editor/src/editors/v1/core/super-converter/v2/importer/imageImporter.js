import { translator as wDrawingNodeTranslator } from '@converter/v3/handlers/w/drawing';
import { handleImageNode } from '@converter/v3/handlers/wp/helpers/encode-image-node-helpers.js';

/**
 * @type {import("docxImporter").NodeHandler}
 */
export const handleDrawingNode = (params) => {
  const { nodes } = params;

  const validNodes = ['w:drawing', 'w:p'];
  if (nodes.length === 0 || !validNodes.includes(nodes[0].name)) {
    return { nodes: [], consumed: 0 };
  }

  const mainNode = nodes[0];
  let node;

  if (mainNode.name === 'w:drawing') node = mainNode;
  else node = mainNode.elements.find((el) => el.name === 'w:drawing');

  if (!node) {
    return { nodes: [], consumed: 0 };
  }

  // Ensure params.nodes[0] is the w:drawing node for the translator
  const translatorParams = { ...params, nodes: [node] };
  const schemaNode = wDrawingNodeTranslator.encode(translatorParams);
  const newNodes = schemaNode ? [schemaNode] : [];
  return { nodes: newNodes, consumed: 1 };
};

/**
 * Temporary helper kept for compatibility with legacy tests and call sites.
 * Delegates to the shared v3 image handler so transformed attributes stay in sync.
 *
 * @param {Object} node wp:inline or wp:anchor node
 * @param {string|null} filename current document part filename
 * @param {Object} params remaining importer params
 * @returns {Object|null}
 */
export const handleImageImport = (node, filename, params = {}) => {
  if (!node) return null;

  const handlerParams = {
    ...params,
    filename: filename || params.filename,
    nodes: [node],
  };

  const isAnchor = node.name === 'wp:anchor';
  return handleImageNode(node, handlerParams, isAnchor);
};

/**
 * @type {import("docxImporter").NodeHandlerEntry}
 */
export const drawingNodeHandlerEntity = {
  handlerName: 'drawingNodeHandler',
  handler: handleDrawingNode,
};
