import { translator as wDelTranslator } from '@converter/v3/handlers/w/del';
import { translator as wInsTranslator } from '@converter/v3/handlers/w/ins';

const isTrackChangeElement = (node) => node?.name === 'w:del' || node?.name === 'w:ins';

const unwrapTrackChangeNode = (node) => {
  if (!node) {
    return null;
  }

  if (isTrackChangeElement(node)) {
    return node;
  }

  if (node.name === 'w:sdt') {
    const content = node.elements?.find((element) => element.name === 'w:sdtContent');
    if (!content?.elements?.length) {
      return null;
    }

    for (const child of content.elements) {
      const trackChange = unwrapTrackChangeNode(child);
      if (trackChange) {
        return trackChange;
      }
    }
  }

  return null;
};

/**
 * @type {import("docxImporter").NodeHandler}
 */
export const handleTrackChangeNode = (params) => {
  const { nodes } = params;
  if (nodes.length === 0) {
    return { nodes: [], consumed: 0 };
  }

  const mainNode = unwrapTrackChangeNode(nodes[0]);
  if (!mainNode) {
    return { nodes: [], consumed: 0 };
  }

  let result;

  const translatorParams = {
    ...params,
    nodes: [mainNode],
  };

  switch (mainNode.name) {
    case 'w:del':
      result = wDelTranslator.encode({
        ...translatorParams,
        extraParams: {
          ...translatorParams.extraParams,
          node: mainNode,
        },
      });
      break;
    case 'w:ins':
      result = wInsTranslator.encode({
        ...translatorParams,
        extraParams: {
          ...translatorParams.extraParams,
          node: mainNode,
        },
      });
      break;
  }

  return { nodes: result, consumed: 1 };
};

/**
 * @type {import("docxImporter").NodeHandlerEntry}
 */
export const trackChangeNodeHandlerEntity = {
  handlerName: 'trackChangeNodeHandler',
  handler: handleTrackChangeNode,
};

export const __testables__ = {
  unwrapTrackChangeNode,
};
