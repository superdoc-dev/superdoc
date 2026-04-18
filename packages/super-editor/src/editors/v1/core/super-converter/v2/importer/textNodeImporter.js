import { translator as wTextTranslator } from '@converter/v3/handlers/w/t';

/**
 * @type {import("docxImporter").NodeHandler}
 */
export const handleTextNode = (params) => {
  const { nodes, insideTrackChange } = params;
  if (nodes.length === 0 || !(nodes[0].name === 'w:t' || (insideTrackChange && nodes[0].name === 'w:delText'))) {
    return { nodes: [], consumed: 0 };
  }
  const node = nodes[0];

  const resultNode = wTextTranslator.encode({
    ...params,
    extraParams: {
      ...(params.extraParams || {}),
      node,
    },
  });

  if (!resultNode) return { nodes: [], consumed: 0 };

  return {
    nodes: [resultNode],
    consumed: 1,
  };
};

/**
 * @type {import("docxImporter").NodeHandlerEntry}
 */
export const textNodeHandlerEntity = {
  handlerName: 'textNodeHandler',
  handler: handleTextNode,
};
