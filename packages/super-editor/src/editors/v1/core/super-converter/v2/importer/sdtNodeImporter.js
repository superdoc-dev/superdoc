// @ts-check
import { translator as sdtTranslator } from '../../v3/handlers/w/sdt/sdt-translator';

export const handleSdtNode = (params) => {
  const { nodes } = params;

  if (nodes.length === 0 || nodes[0].name !== 'w:sdt') {
    return { nodes: [], consumed: 0 };
  }

  const result = sdtTranslator.encode(params);

  if (!result) {
    return { nodes: [], consumed: 0 };
  }

  // "handleDocPartObj" returns an array.
  const resultNodes = Array.isArray(result) ? result : [result];

  return {
    nodes: resultNodes,
    consumed: 1,
  };
};

/**
 * @type {Object}
 */
export const sdtNodeHandlerEntity = {
  handlerName: 'sdtNodeHandler',
  handler: handleSdtNode,
};
