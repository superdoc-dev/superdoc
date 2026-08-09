import type { ParagraphBorder, ParagraphBorders } from '@superdoc/contracts';

/**
 * Hashes a single paragraph border for equality comparison.
 *
 * Duplicated from painters/dom/src/paragraph-hash-utils.ts to avoid a
 * circular dependency (painter-dom → layout-resolved is not allowed).
 * Keep the two copies in sync.
 */
const hashParagraphBorder = (border: ParagraphBorder): string => {
  const parts: string[] = [];
  if (border.style !== undefined) parts.push(`s:${border.style}`);
  if (border.width !== undefined) parts.push(`w:${border.width}`);
  if (border.color !== undefined) parts.push(`c:${border.color}`);
  if (border.space !== undefined) parts.push(`sp:${border.space}`);
  return parts.join(',');
};

/**
 * Hashes a full paragraph borders object for grouping comparison.
 *
 * Two paragraph fragments with the same hash belong to the same border group
 * per ECMA-376 §17.3.1.24.
 */
export const hashParagraphBorders = (borders: ParagraphBorders): string => {
  const parts: string[] = [];
  if (borders.top) parts.push(`t:[${hashParagraphBorder(borders.top)}]`);
  if (borders.right) parts.push(`r:[${hashParagraphBorder(borders.right)}]`);
  if (borders.bottom) parts.push(`b:[${hashParagraphBorder(borders.bottom)}]`);
  if (borders.left) parts.push(`l:[${hashParagraphBorder(borders.left)}]`);
  if (borders.between) parts.push(`bw:[${hashParagraphBorder(borders.between)}]`);
  return parts.join(';');
};
