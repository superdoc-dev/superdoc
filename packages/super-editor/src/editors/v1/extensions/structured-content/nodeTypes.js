export const STRUCTURED_CONTENT_NODE_TYPES = new Set(['structuredContent', 'structuredContentBlock']);

export function isStructuredContentNodeType(nodeTypeName) {
  return STRUCTURED_CONTENT_NODE_TYPES.has(nodeTypeName);
}
