/**
 * Section Breaks Module
 *
 * Functions for creating section break blocks and determining page boundary requirements.
 */

import type { SectionBreakBlock, FlowBlock } from '@superdoc/contracts';
import type { PMNode } from '../types.js';
import type { SectionRange, SectionSignature, SectPrElement } from './types.js';

type BlockIdGenerator = (kind: string) => string;

/**
 * Type guard: checks if a value is a SectPrElement
 */
export function isSectPrElement(value: unknown): value is SectPrElement {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as SectPrElement).type === 'element' &&
    (value as SectPrElement).name === 'w:sectPr'
  );
}

/**
 * Type guard: checks if a paragraph node has sectPr in its properties
 */
export function hasSectPr(node: PMNode): boolean {
  if (node.type !== 'paragraph' || !node.attrs) return false;
  const attrs = node.attrs as Record<string, unknown>;
  const paragraphProperties = attrs.paragraphProperties;
  if (!paragraphProperties || typeof paragraphProperties !== 'object') return false;
  const sectPr = (paragraphProperties as Record<string, unknown>).sectPr;
  // Accept both OOXML-shaped elements and normalized plain JSON with elements[]
  return (
    isSectPrElement(sectPr) ||
    (typeof sectPr === 'object' && sectPr !== null && 'elements' in sectPr && Array.isArray(sectPr.elements))
  );
}

/**
 * Safely get sectPr from paragraph node attributes
 */
export function getSectPrFromNode(node: PMNode): SectPrElement | null {
  if (!node.attrs) return null;
  const attrs = node.attrs as Record<string, unknown>;
  const paragraphProperties = attrs.paragraphProperties;
  if (!paragraphProperties || typeof paragraphProperties !== 'object') return null;
  const sectPr = (paragraphProperties as Record<string, unknown>).sectPr;
  return isSectPrElement(sectPr) ? sectPr : null;
}

/**
 * Type guard: checks if a block is a section break
 */
export function isSectionBreakBlock(block: unknown): block is SectionBreakBlock {
  return typeof block === 'object' && block !== null && (block as FlowBlock).kind === 'sectionBreak';
}

/**
 * Shallow equality check for Record<string, unknown> objects.
 */
export function shallowObjectEquals(x?: Record<string, unknown>, y?: Record<string, unknown>): boolean {
  if (!x && !y) return true;
  if (!x || !y) return false;
  const kx = Object.keys(x);
  const ky = Object.keys(y);
  if (kx.length !== ky.length) return false;
  return kx.every((k) => x[k] === y[k]);
}

/**
 * Deep equality check for SectionSignature objects to determine if
 * two section configurations are identical.
 */
export function signaturesEqual(a: SectionSignature, b: SectionSignature): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;

  const pageSizeEq =
    (!a.pageSizePx && !b.pageSizePx) ||
    !!(a.pageSizePx && b.pageSizePx && a.pageSizePx.w === b.pageSizePx.w && a.pageSizePx.h === b.pageSizePx.h);

  const columnsEq =
    (!a.columnsPx && !b.columnsPx) ||
    !!(a.columnsPx && b.columnsPx && a.columnsPx.count === b.columnsPx.count && a.columnsPx.gap === b.columnsPx.gap);

  const numberingEq =
    (!a?.numbering && !b?.numbering) ||
    (Boolean(a?.numbering) &&
      Boolean(b?.numbering) &&
      (a?.numbering?.format ?? null) === (b?.numbering?.format ?? null) &&
      (a?.numbering?.start ?? null) === (b?.numbering?.start ?? null));

  return (
    (a.titlePg ?? false) === (b.titlePg ?? false) &&
    a.headerPx === b.headerPx &&
    a.footerPx === b.footerPx &&
    pageSizeEq &&
    a.orientation === b.orientation &&
    shallowObjectEquals(a.headerRefs ?? {}, b.headerRefs ?? {}) &&
    shallowObjectEquals(a.footerRefs ?? {}, b.footerRefs ?? {}) &&
    columnsEq &&
    numberingEq
  );
}

/**
 * Helper: Create a section break block from a section range.
 * Centralizes the section break creation logic to avoid duplication.
 */
export function createSectionBreakBlock(
  section: SectionRange,
  blockIdGen: BlockIdGenerator,
  extraAttrs?: Record<string, unknown>,
): SectionBreakBlock {
  return {
    kind: 'sectionBreak',
    id: blockIdGen('sectionBreak'),
    margins: section.margins ?? { header: 0, footer: 0 },
    type: section.type,
    attrs: {
      source: 'sectPr',
      sectionIndex: section.sectionIndex,
      ...extraAttrs,
    },
    ...(section.pageSize && { pageSize: section.pageSize }),
    ...(section.orientation && { orientation: section.orientation }),
    ...(section.columns && { columns: section.columns }),
    ...(section.numbering ? { numbering: section.numbering } : {}),
    ...(section.headerRefs && { headerRefs: section.headerRefs }),
    ...(section.footerRefs && { footerRefs: section.footerRefs }),
    ...(section.vAlign && { vAlign: section.vAlign }),
  } as SectionBreakBlock;
}

/**
 * Determine if a section break requires a page boundary based on property changes.
 *
 * While Word allows continuous sections to change headers/footers/margins mid-page,
 * certain property changes ALWAYS force a page break regardless of section type:
 * - Orientation changes (portrait ↔ landscape)
 * - Page size changes (letter → legal, etc.)
 *
 * This matches Word's actual behavior where physical page constraints override
 * the section type's intent to be continuous.
 *
 * @param current - Current section range
 * @param next - Next section range
 * @returns true if property changes require a forced page boundary
 */
export function shouldRequirePageBoundary(current: SectionRange, next: SectionRange | undefined): boolean {
  if (!next) return false;

  // Orientation change ALWAYS forces page break (Word behavior)
  if (current.orientation && next.orientation && current.orientation !== next.orientation) {
    return true;
  }

  // Page size change ALWAYS forces page break (Word behavior)
  if (current.pageSize && next.pageSize) {
    if (current.pageSize.w !== next.pageSize.w || current.pageSize.h !== next.pageSize.h) {
      return true;
    }
  }

  return false;
}

/**
 * Check if a section has intrinsic properties that require a page boundary.
 *
 * **Currently disabled** - always returns false.
 *
 * Rationale: Properties like titlePg, headers, footers, page size, and margins were previously
 * considered "intrinsic signals" that forced page breaks. However, this broke mid-page section
 * changes and violated Word's continuous section behavior.
 *
 * @param section - Section range to check (unused)
 * @returns false - no intrinsic signals force page boundaries
 */
export function hasIntrinsicBoundarySignals(_: SectionRange): boolean {
  return false;
}
