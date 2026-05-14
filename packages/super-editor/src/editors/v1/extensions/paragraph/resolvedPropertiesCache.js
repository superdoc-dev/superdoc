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

/**
 * Resolve the OOXML cascade for a *hypothetical* inline props object —
 * used by commands that need to know what would resolve if the inline
 * override were modified or removed. Not cached (the input does not
 * correspond to a real node identity).
 * @returns The resolved paragraph properties, or the inline props
 *   unchanged when the converter is unavailable (e.g., headless tests).
 */
export function resolveHypotheticalParagraphProperties(editor, $pos, inlineProps) {
  if (!editor?.converter) return inlineProps;
  const tableNode = findParentNodeClosestToPos($pos, (node) => node.type.name === 'table');
  const tableStyleId = tableNode?.node.attrs.tableStyleId || null;
  return resolveParagraphProperties(
    {
      translatedNumbering: editor.converter.translatedNumbering,
      translatedLinkedStyles: editor.converter.translatedLinkedStyles,
    },
    inlineProps,
    tableStyleId,
  );
}
