import { resolveParagraphProperties } from '@superdoc/style-engine/ooxml';
import { findParentNodeClosestToPos } from '@helpers/index.js';

const resolvedParagraphPropertiesCache = new WeakMap();

export function getResolvedParagraphProperties(node) {
  return resolvedParagraphPropertiesCache.get(node);
}

export function calculateResolvedParagraphProperties(editor, node, $pos) {
  if (!editor.converter) {
    return node.attrs.paragraphProperties || {};
  }
  const cached = getResolvedParagraphProperties(node);
  if (cached) {
    return cached;
  }
  const tableNode = findParentNodeClosestToPos($pos, (node) => node.type.name === 'table');
  const tableStyleId = tableNode?.node.attrs.tableStyleId || null;
  const paragraphProperties = resolveParagraphProperties(
    {
      translatedNumbering: editor.converter.translatedNumbering,
      translatedLinkedStyles: editor.converter.translatedLinkedStyles,
    },
    node.attrs.paragraphProperties || {},
    tableStyleId,
  );
  resolvedParagraphPropertiesCache.set(node, paragraphProperties);
  return paragraphProperties;
}
