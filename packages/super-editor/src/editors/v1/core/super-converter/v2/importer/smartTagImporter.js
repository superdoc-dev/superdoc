// @ts-check
import { translator as wSmartTagNodeTranslator } from '../../v3/handlers/w/smartTag/index.js';

/**
 * Smart-tag node handler (SD-2647 / SD-3298).
 *
 * Captures `<w:smartTag>` before it falls through to the passthrough handler.
 * Without this entry the wrapper is hidden as `passthroughInline`, dropping
 * its visible children (e.g. WIPO ST.3 country-region names inside the
 * customer IT-945 doc).
 *
 * @param {import('../../v3/node-translator').SCEncoderConfig} params
 * @returns {Object} Handler result
 */
const handleSmartTagNode = (params) => {
  const { nodes } = params;
  if (!nodes.length || nodes[0].name !== 'w:smartTag') {
    return { nodes: [], consumed: 0 };
  }
  const result = wSmartTagNodeTranslator.encode(params);
  if (!result) return { nodes: [], consumed: 0 };
  return {
    nodes: Array.isArray(result) ? result : [result],
    consumed: 1,
  };
};

/**
 * Smart-tag node handler entity. Slotted into `defaultNodeListHandler`
 * BEFORE `passthroughNodeHandlerEntity`.
 *
 * @type {Object}
 */
export const smartTagNodeEntityHandler = {
  handlerName: 'w:smartTagTranslator',
  handler: handleSmartTagNode,
};
