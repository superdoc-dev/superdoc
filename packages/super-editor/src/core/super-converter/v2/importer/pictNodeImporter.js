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
 * @type {import("@converter/v2/importer/docxImporter").NodeHandlerEntry}
 */
export const pictNodeHandlerEntity = {
  handlerName: 'handlePictNode',
  handler: (params) => {
    const { nodes } = params || {};
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
    return {
      nodes: Array.isArray(result) ? result : [result],
      consumed: 1,
    };
  },
};

export const handlePictNode = pictNodeHandlerEntity.handler;
