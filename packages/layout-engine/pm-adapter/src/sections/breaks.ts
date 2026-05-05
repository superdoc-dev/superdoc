/**
 * Section Breaks Module
 *
 * Functions for creating section break blocks and determining page boundary requirements.
 */

import type { SectionBreakBlock, FlowBlock } from '@superdoc/contracts';
import { widthsEqual } from '@superdoc/contracts';
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
    !!(
      a.columnsPx &&
      b.columnsPx &&
      a.columnsPx.count === b.columnsPx.count &&
      a.columnsPx.gap === b.columnsPx.gap &&
      a.columnsPx.equalWidth === b.columnsPx.equalWidth &&
      widthsEqual(a.columnsPx.widths, b.columnsPx.widths)
    );

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
      // `typeIsExplicit` is set only when `<w:type>` was authored in the
      // source XML. We omit the field entirely when it would be `false` so
      // we don't widen `attrs` for the (vast majority of) sectPrs that
      // omit `<w:type>` — that would produce a doc-wide snapshot diff
      // against historical references on every existing fixture.
      // The layout-engine's column-balance gate reads this to distinguish
      // a body sectPr that defaulted to `nextPage` (Word does not balance,
      // sd-1655-col-sep-3-equal-columns) from one with
      // `<w:type w:val="continuous"/>` written out (Word balances,
      // sd-1480-two-col-tab-positions, even single-page).
      ...(section.typeIsExplicit ? { typeIsExplicit: true as const } : {}),
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

/**
 * Minimal mutable sectionState shape used by section-break emission helpers.
 * Kept local so callers can pass `NodeHandlerContext['sectionState']` directly.
 */
interface SectionStateMutable {
  ranges: SectionRange[];
  currentSectionIndex: number;
  currentParagraphIndex: number;
}

/**
 * Emit the next section's sectionBreak block if the dispatch loop has reached
 * that section's starting top-level node index.
 *
 * ECMA-376 §17.6.17: a section is defined by its end-tagged `<w:sectPr>`. All
 * body children preceding that tag — paragraphs, tables, top-level drawings —
 * belong to the section that ENDS at the tag. This helper fires BEFORE any
 * such node so the appropriate section config is active by the time the node
 * is laid out.
 *
 * Calling it from the main dispatch loop covers every top-level node type —
 * present and future — with no per-handler opt-in. Paragraph-index emission
 * still handles transitions inside SDT child content.
 */
export function maybeEmitNextSectionBreakForNode(args: {
  sectionState: {
    ranges: SectionRange[];
    currentSectionIndex: number;
    currentNodeIndex: number;
  };
  nextBlockId: BlockIdGenerator;
  pushBlock: (block: SectionBreakBlock) => void;
}): void {
  const { sectionState, nextBlockId, pushBlock } = args;
  if (sectionState.ranges.length === 0) return;
  if (sectionState.currentSectionIndex >= sectionState.ranges.length - 1) return;

  const nextSection = sectionState.ranges[sectionState.currentSectionIndex + 1];
  if (!nextSection) return;
  if (sectionState.currentNodeIndex !== nextSection.startNodeIndex) return;

  const currentSection = sectionState.ranges[sectionState.currentSectionIndex];
  const requiresPageBoundary =
    shouldRequirePageBoundary(currentSection, nextSection) || hasIntrinsicBoundarySignals(nextSection);
  const extraAttrs = requiresPageBoundary ? { requirePageBoundary: true } : undefined;
  pushBlock(createSectionBreakBlock(nextSection, nextBlockId, extraAttrs));
  sectionState.currentSectionIndex++;
}

/**
 * Emit a pending section break before a paragraph if the current paragraph
 * index matches the start of the next section.
 *
 * Centralizes the "check, emit, advance" pattern for handlers that process
 * paragraph children directly, including SDT handlers. This keeps nested
 * paragraph traversal in sync with `findParagraphsWithSectPr`.
 *
 * No-op when:
 *   - sectionState is undefined or has no ranges
 *   - currentParagraphIndex doesn't match the next section's startParagraphIndex
 *
 * Side effects (when emitted):
 *   - Pushes a sectionBreak block onto `blocks`
 *   - Invokes `recordBlockKind`
 *   - Increments `sectionState.currentSectionIndex`
 */
export function emitPendingSectionBreakForParagraph(args: {
  sectionState: SectionStateMutable | undefined;
  nextBlockId: BlockIdGenerator;
  blocks: FlowBlock[];
  recordBlockKind?: (kind: FlowBlock['kind']) => void;
}): void {
  const { sectionState, nextBlockId, blocks, recordBlockKind } = args;
  if (!sectionState || sectionState.ranges.length === 0) return;

  const nextSection = sectionState.ranges[sectionState.currentSectionIndex + 1];
  if (!nextSection || sectionState.currentParagraphIndex !== nextSection.startParagraphIndex) return;

  const currentSection = sectionState.ranges[sectionState.currentSectionIndex];
  const requiresPageBoundary =
    shouldRequirePageBoundary(currentSection, nextSection) || hasIntrinsicBoundarySignals(nextSection);
  const extraAttrs = requiresPageBoundary ? { requirePageBoundary: true } : undefined;
  const sectionBreak = createSectionBreakBlock(nextSection, nextBlockId, extraAttrs);
  blocks.push(sectionBreak);
  recordBlockKind?.(sectionBreak.kind);
  sectionState.currentSectionIndex++;
}
