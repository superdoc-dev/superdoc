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
  if (childElements.length && params.nodeListHandler?.handler) {
    // Run children for import side effects only (e.g. highlight-color registration on
    // the converter); the returned nodes are intentionally not used as content. See the
    // note on `content` below.
    params.nodeListHandler.handler({
      ...params,
      nodes: childElements,
      path: [...(params.path || []), node],
    });
  }

  if (originalElements?.length) {
    originalXml.elements = originalElements;
  }

  // AIDEV-NOTE: passthroughInline and passthroughBlock are both atom: true with no
  // content expression (extensions/passthrough/passthrough.js). Child markup (e.g.
  // w:instrText for MERGEFIELD) must live ONLY in attrs.originalXml, which export reads
  // back verbatim. Attaching content makes y-prosemirror drop the node on collab
  // hydration, so a joining lane loses the field instruction (SD-3363). Do not attach
  // content to either passthrough type.
  const passthroughNode = {
    type: isInlineContext(params.path, node.name) ? 'passthroughInline' : 'passthroughBlock',
    attrs: {
      originalName: node.name,
      originalXml,
    },
    marks: [],
    content: undefined,
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
