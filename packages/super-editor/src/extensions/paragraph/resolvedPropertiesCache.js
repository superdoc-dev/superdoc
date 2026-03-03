import { resolveParagraphProperties } from '@superdoc/style-engine/ooxml';
import { findParentNodeClosestToPos } from '@helpers/index.js';

let resolvedParagraphPropertiesCache = new WeakMap();

/**
 * Clears all cached resolved paragraph properties.
 *
 * Cache keys are PM node references, so replacing the WeakMap is the only
 * practical way to invalidate all entries at once.
 */
export function clearResolvedParagraphPropertiesCache() {
  resolvedParagraphPropertiesCache = new WeakMap();
}

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
      translatedNumbering: editor.converter.parts?.numbering ?? editor.converter.translatedNumbering,
      translatedLinkedStyles: editor.converter.parts?.styles ?? editor.converter.translatedLinkedStyles,
    },
    node.attrs.paragraphProperties || {},
    tableStyleId,
  );
  resolvedParagraphPropertiesCache.set(node, paragraphProperties);
  return paragraphProperties;
}
