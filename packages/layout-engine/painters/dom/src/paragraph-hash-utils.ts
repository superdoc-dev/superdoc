import type { ParagraphBorders, ParagraphBorder } from '@superdoc/contracts';

/**
 * Hash helpers are duplicated from layout-bridge to avoid a circular dependency
 * (layout-bridge imports DOM_CLASS_NAMES from painter-dom). Keep these helpers
 * in sync with layout-bridge when formatting changes need cache invalidation.
 */

export const hashParagraphBorder = (border: ParagraphBorder): string => {
  const parts: string[] = [];
  if (border.style !== undefined) parts.push(`s:${border.style}`);
  if (border.width !== undefined) parts.push(`w:${border.width}`);
  if (border.color !== undefined) parts.push(`c:${border.color}`);
  if (border.space !== undefined) parts.push(`sp:${border.space}`);
  return parts.join(',');
};

export const hashParagraphBorders = (borders: ParagraphBorders): string => {
  const parts: string[] = [];
  if (borders.top) parts.push(`t:[${hashParagraphBorder(borders.top)}]`);
  if (borders.right) parts.push(`r:[${hashParagraphBorder(borders.right)}]`);
  if (borders.bottom) parts.push(`b:[${hashParagraphBorder(borders.bottom)}]`);
  if (borders.left) parts.push(`l:[${hashParagraphBorder(borders.left)}]`);
  if (borders.between) parts.push(`bw:[${hashParagraphBorder(borders.between)}]`);
  return parts.join(';');
};
