/**
 * Determine whether a translated PM JSON node should be treated as inline.
 *
 * Falls back to known inline leaf types when schema metadata is unavailable.
 *
 * @param {unknown} node
 * @param {import('prosemirror-model').Schema | undefined} schema
 * @returns {boolean}
 */
const INLINE_FALLBACK_TYPES = new Set([
  'text',
  'run',
  'bookmarkStart',
  'bookmarkEnd',
  'tab',
  'lineBreak',
  'hardBreak',
  'commentRangeStart',
  'commentRangeEnd',
  'commentReference',
  'permStart',
  'permEnd',
  'footnoteReference',
  'endnoteReference',
  'fieldAnnotation',
  'structuredContent',
  'passthroughInline',
  'page-number',
  'total-page-number',
  'pageReference',
  'crossReference',
  'citation',
  'authorityEntry',
  'sequenceField',
  'indexEntry',
  'tableOfContentsEntry',
]);

export function isInlineNode(node, schema) {
  if (!node || typeof node !== 'object' || typeof node.type !== 'string') return false;

  const nodeType = schema?.nodes?.[node.type];
  if (nodeType) {
    if (typeof nodeType.isInline === 'boolean') return nodeType.isInline;
    if (nodeType.spec?.group && typeof nodeType.spec.group === 'string') {
      return nodeType.spec.group.split(' ').includes('inline');
    }
  }

  return INLINE_FALLBACK_TYPES.has(node.type);
}
