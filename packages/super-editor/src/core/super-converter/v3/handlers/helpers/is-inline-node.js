/**
 * Determine whether a translated PM JSON node should be treated as inline.
 *
 * Falls back to known inline leaf types when schema metadata is unavailable.
 *
 * @param {unknown} node
 * @param {import('prosemirror-model').Schema | undefined} schema
 * @returns {boolean}
 */
export function isInlineNode(node, schema) {
  if (!node || typeof node !== 'object' || typeof node.type !== 'string') return false;
  if (node.type === 'text') return true;
  if (node.type === 'bookmarkStart' || node.type === 'bookmarkEnd') return true;

  const nodeType = schema?.nodes?.[node.type];
  if (nodeType) {
    if (typeof nodeType.isInline === 'boolean') return nodeType.isInline;
    if (nodeType.spec?.group && typeof nodeType.spec.group === 'string') {
      return nodeType.spec.group.split(' ').includes('inline');
    }
  }

  return false;
}
