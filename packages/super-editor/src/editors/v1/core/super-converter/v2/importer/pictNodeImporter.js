// @ts-check
import { pictNodeTypeStrategy } from '@converter/v3/handlers/w/pict/helpers/pict-node-type-strategy';

/**
 * v2 handler that matches `w:pict` elements and delegates to the pict
 * node-type strategy for import.
 *
 * NOTE: We intentionally avoid importing pict-translator here to prevent a
 * circular initialisation chain:
 *   pictNodeImporter → pict-translator → translate-content-block → exporter
 *     → SuperConverter → docxImporter → pictNodeImporter
 *
 * @type {import("./types/index.js").NodeHandler}
 */
export const handlePictNode = (params) => {
  const { nodes } = params;
  if (!Array.isArray(nodes) || nodes.length === 0 || nodes[0]?.name !== 'w:pict') {
    return { nodes: [], consumed: 0 };
  }
  const pict = nodes[0];
  const { type: pictType, handler } = pictNodeTypeStrategy(pict);
  if (!handler || pictType === 'unknown') {
    return { nodes: [], consumed: 0 };
  }
  const result = handler({ params, pict });
  if (!result) return { nodes: [], consumed: 0 };
  const resultNodes = Array.isArray(result) ? result : [result];
  // Block nodes (e.g. shapeContainer from v:textbox) cannot be returned from
  // run-level parsing — the v2 handler list runs inside w:r children where only
  // inline nodes are valid.  Skip them here so the paragraph-level importer
  // handles the whole w:p instead.
  const BLOCK_TYPES = new Set(['shapeContainer', 'shapeTextbox']);
  if (resultNodes.some((n) => BLOCK_TYPES.has(n.type))) {
    return { nodes: [], consumed: 0 };
  }
  return {
    nodes: resultNodes,
    consumed: 1,
  };
};

/**
 * @type {import("./types/index.js").NodeHandlerEntry}
 */
export const pictNodeHandlerEntity = {
  handlerName: 'handlePictNode',
  handler: handlePictNode,
};
