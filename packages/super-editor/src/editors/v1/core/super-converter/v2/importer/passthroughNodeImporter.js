import { carbonCopy } from '@core/utilities/carbonCopy.js';
import { registeredHandlers } from '../../v3/handlers/index.js';
import { isInlineContext } from '@core/super-converter/utils/inlineContext.js';

export { isInlineContext };

/**
 * @type {import('docxImporter').NodeHandler}
 */
export const handlePassthroughNode = (params) => {
  const { nodes = [] } = params;
  const node = nodes[0];
  if (!node) return { nodes: [], consumed: 0 };

  // If we already have a v3 translator, this isn't a passthrough candidate
  // commentReference is handled with comments list import
  if (registeredHandlers[node.name] || node.name === 'w:commentReference') {
    return { nodes: [], consumed: 0 };
  }

  const originalXml = carbonCopy(node) || {};
  const originalElementsSource = originalXml.elements;
  const originalElements = originalElementsSource ? carbonCopy(originalElementsSource) : [];

  const childElements = Array.isArray(node.elements) ? node.elements : [];
  let childContent = [];
  if (childElements.length && params.nodeListHandler?.handler) {
    const childParams = {
      ...params,
      nodes: childElements,
      path: [...(params.path || []), node],
    };
    childContent = params.nodeListHandler.handler(childParams) || [];
  }

  if (originalElements?.length) {
    originalXml.elements = originalElements;
  }

  const passthroughNode = {
    type: isInlineContext(params.path, node.name) ? 'passthroughInline' : 'passthroughBlock',
    attrs: {
      originalName: node.name,
      originalXml,
    },
    marks: [],
    content: childContent,
  };

  return {
    nodes: [passthroughNode],
    consumed: 1,
  };
};

/**
 * @type {import('docxImporter').NodeHandlerEntry}
 */
export const passthroughNodeHandlerEntity = {
  handlerName: 'passthroughNodeHandler',
  handler: handlePassthroughNode,
};
