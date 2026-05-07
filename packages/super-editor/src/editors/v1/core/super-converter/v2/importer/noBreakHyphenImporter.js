// @ts-check
import { translator as wNoBreakHyphenNodeTranslator } from '../../v3/handlers/w/noBreakHyphen/index.js';

/**
 * Non-breaking hyphen node handler.
 * Captures <w:noBreakHyphen/> before it falls through to the passthrough handler.
 * @param {import('../../v3/node-translator').SCEncoderConfig} params
 * @returns {Object} Handler result
 */
const handleNoBreakHyphenNode = (params) => {
  const { nodes } = params;
  if (!nodes.length || nodes[0].name !== 'w:noBreakHyphen') {
    return { nodes: [], consumed: 0 };
  }
  const node = wNoBreakHyphenNodeTranslator.encode(params);
  return { nodes: [node], consumed: 1 };
};

/**
 * Non-breaking hyphen node handler entity.
 * @type {Object} Handler entity
 */
export const noBreakHyphenNodeEntityHandler = {
  handlerName: 'w:noBreakHyphenTranslator',
  handler: handleNoBreakHyphenNode,
};
