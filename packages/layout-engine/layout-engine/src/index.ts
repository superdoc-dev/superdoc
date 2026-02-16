import type {
  ColumnLayout,
  FlowBlock,
  Fragment,
  HeaderFooterLayout,
  ImageBlock,
  ImageMeasure,
  ImageFragment,
  ImageFragmentMetadata,
  Layout,
  ListMeasure,
  Measure,
  Page,
  PageMargins,
  ParagraphBlock,
  ParagraphMeasure,
  SectionBreakBlock,
  SectionVerticalAlign,
  TableBlock,
  TableMeasure,
  TableFragment,
  SectionMetadata,
  DrawingBlock,
  DrawingMeasure,
  DrawingFragment,
  SectionNumbering,
} from '@superdoc/contracts';
import { createFloatingObjectManager, computeAnchorX } from './floating-objects.js';
import { computeNextSectionPropsAtBreak } from './section-props';
import {
  scheduleSectionBreak as scheduleSectionBreakExport,
  type SectionState,
  applyPendingToActive,
} from './section-breaks.js';
import { layoutParagraphBlock } from './layout-paragraph.js';
import { layoutImageBlock } from './layout-image.js';
import { layoutDrawingBlock } from './layout-drawing.js';
import { layoutTableBlock, createAnchoredTableFragment, ANCHORED_TABLE_FULL_WIDTH_RATIO } from './layout-table.js';
import { collectAnchoredDrawings, collectAnchoredTables, collectPreRegisteredAnchors } from './anchors.js';
import { createPaginator, type PageState, type ConstraintBoundary } from './paginator.js';
import { formatPageNumber } from './pageNumbering.js';
import { shouldSuppressSpacingForEmpty } from './layout-utils.js';
import { balancePageColumns } from './column-balancing.js';
import { getFragmentZIndex } from '@superdoc/pm-adapter/utilities.js';

type PageSize = { w: number; h: number };
type Margins = {
  top: number;
  right: number;
  bottom: number;
  left: number;
  header?: number;
  footer?: number;
};

type NormalizedColumns = ColumnLayout & { width: number };

/**
 * Default paragraph line height in pixels used for vertical alignment calculations
 * when actual height is not available in the measure data.
 * This is a fallback estimate for paragraph and list-item fragments.
 */
const DEFAULT_PARAGRAPH_LINE_HEIGHT_PX = 20;

/**
 * Type guard to check if a fragment has a height property.
 * Image, Drawing, and Table fragments all have a required height property.
 *
 * @param fragment - The fragment to check
 * @returns True if the fragment is ImageFragment, DrawingFragment, or TableFragment
 */
function hasHeight(fragment: Fragment): fragment is ImageFragment | DrawingFragment | TableFragment {
  return fragment.kind === 'image' || fragment.kind === 'drawing' || fragment.kind === 'table';
}

/**
 * Read the paragraph spacing-before value (legacy key aware), normalized to pixels.
 *
 * @param block - Paragraph block to read spacing from
 * @returns Non-negative spacing-before value in pixels
 */
function getParagraphSpacingBefore(block: ParagraphBlock): number {
  const spacing = block.attrs?.spacing as Record<string, unknown> | undefined;
  const value = spacing?.before ?? spacing?.lineSpaceBefore;
  if (shouldSuppressSpacingForEmpty(block, 'before')) return 0;
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0;
}

/**
 * Read the paragraph spacing-after value (legacy key aware), normalized to pixels.
 *
 * @param block - Paragraph block to read spacing from
 * @returns Non-negative spacing-after value in pixels
 */
function getParagraphSpacingAfter(block: ParagraphBlock): number {
  const spacing = block.attrs?.spacing as Record<string, unknown> | undefined;
  const value = spacing?.after ?? spacing?.lineSpaceAfter;
  if (shouldSuppressSpacingForEmpty(block, 'after')) return 0;
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0;
}

/**
 * Get the layout height contribution for a measured block.
 *
 * @param block - Flow block associated with the measure
 * @param measure - Measure for the block
 * @returns Height in pixels for keep-next calculations
 */
function getMeasureHeight(block: FlowBlock, measure: Measure): number {
  switch (measure.kind) {
    case 'paragraph':
      return measure.totalHeight;
    case 'table':
      return measure.totalHeight;
    case 'list':
      return measure.totalHeight;
    case 'image':
    case 'drawing':
      return measure.height;
    case 'sectionBreak':
    case 'pageBreak':
    case 'columnBreak':
      return 0;
    default: {
      const _exhaustive: never = measure;
      return block.kind === 'paragraph' ? DEFAULT_PARAGRAPH_LINE_HEIGHT_PX : 0;
    }
  }
}

// ConstraintBoundary and PageState now come from paginator

/**
 * Represents a chain of consecutive paragraphs with keepNext=true.
 *
 * In OOXML, the `w:keepNext` property indicates that a paragraph should stay on the same
 * page as the following paragraph. When multiple consecutive paragraphs all have keepNext,
 * they form an indivisible "chain" that Word treats as a single unit for pagination.
 *
 * For example, given paragraphs A, B, C, D where A, B, C have keepNext=true:
 * - The chain includes A, B, C (memberIndices)
 * - D is the "anchor" - the paragraph the chain must stay with
 * - If the combined height of A+B+C+D.firstLine doesn't fit, the entire chain moves to the next page
 *
 * @see ECMA-376 Part 1, Section 17.3.1.14 (keepNext)
 */
type KeepNextChain = {
  /** Index of the first paragraph in the chain (the chain "starter") */
  startIndex: number;
  /** Index of the last paragraph with keepNext=true in the chain */
  endIndex: number;
  /** All paragraph indices that are members of this chain (inclusive of start and end) */
  memberIndices: number[];
  /**
   * Index of the paragraph immediately after the chain (the "anchor").
   * This is the paragraph that the chain must stay with on the same page.
   * Set to -1 if there is no valid anchor (e.g., chain at end of document or followed by a break).
   */
  anchorIndex: number;
};

/**
 * Pre-computes keepNext chains for correct pagination grouping.
 *
 * This function scans the document blocks to identify sequences of consecutive paragraphs
 * that all have `keepNext=true`. These sequences form "chains" that must be treated as
 * indivisible units during pagination - if the chain doesn't fit on the current page,
 * the entire chain moves to the next page together.
 *
 * Algorithm:
 * 1. Iterate through blocks looking for paragraphs with keepNext=true
 * 2. When found, walk forward to find all consecutive keepNext paragraphs
 * 3. Record the chain with its anchor (the first non-keepNext paragraph after the chain)
 * 4. Chains break at section/page/column breaks or non-paragraph blocks
 *
 * Time complexity: O(n) where n is the number of blocks
 * Space complexity: O(k) where k is the number of chains
 *
 * @param blocks - All flow blocks in the document
 * @returns Map where keys are chain start indices and values are KeepNextChain objects.
 *          Only paragraphs that START a chain are included as keys.
 *
 * @example
 * // Given blocks: [P1(keepNext), P2(keepNext), P3, P4(keepNext), P5]
 * // Returns Map with:
 * //   0 -> { startIndex: 0, endIndex: 1, memberIndices: [0, 1], anchorIndex: 2 }
 * //   3 -> { startIndex: 3, endIndex: 3, memberIndices: [3], anchorIndex: 4 }
 */
function computeKeepNextChains(blocks: FlowBlock[]): Map<number, KeepNextChain> {
  const chains = new Map<number, KeepNextChain>();
  // Track indices we've already included in a chain to avoid re-processing
  const processedIndices = new Set<number>();

  for (let i = 0; i < blocks.length; i++) {
    // Skip blocks already claimed by a previous chain (they're mid-chain, not starters)
    if (processedIndices.has(i)) continue;

    const block = blocks[i];
    // Only paragraph blocks can have the keepNext property in OOXML
    if (block.kind !== 'paragraph') continue;

    const paraBlock = block as ParagraphBlock;
    // Skip paragraphs without keepNext - they can't start a chain
    if (paraBlock.attrs?.keepNext !== true) continue;

    // Found a keepNext paragraph - this is a potential chain starter.
    // Walk forward to find all consecutive keepNext paragraphs.
    const memberIndices: number[] = [i];
    let endIndex = i;

    for (let j = i + 1; j < blocks.length; j++) {
      const nextBlock = blocks[j];

      // Explicit breaks terminate the chain - keepNext doesn't span across them
      if (nextBlock.kind === 'sectionBreak' || nextBlock.kind === 'pageBreak' || nextBlock.kind === 'columnBreak') {
        break;
      }

      // Non-paragraph blocks (tables, images) also terminate the chain
      // Note: This could be extended in the future to support tables in chains
      if (nextBlock.kind !== 'paragraph') {
        break;
      }

      const nextPara = nextBlock as ParagraphBlock;
      if (nextPara.attrs?.keepNext === true) {
        // This paragraph continues the chain - add it and mark as processed
        memberIndices.push(j);
        endIndex = j;
        processedIndices.add(j);
      } else {
        // Found a paragraph without keepNext - this becomes the anchor
        // The chain must stay on the same page as this paragraph's first line
        break;
      }
    }

    // Determine the anchor: the first paragraph after the chain that we must "keep with"
    // A single keepNext paragraph still needs chain logic to evaluate with its anchor
    const anchorIndex = endIndex + 1 < blocks.length ? endIndex + 1 : -1;

    // Validate that the anchor is not an explicit break (those don't count as anchors)
    if (anchorIndex !== -1) {
      const anchorBlock = blocks[anchorIndex];
      if (
        anchorBlock.kind === 'sectionBreak' ||
        anchorBlock.kind === 'pageBreak' ||
        anchorBlock.kind === 'columnBreak'
      ) {
        // No valid anchor due to break. Only record the chain if it has multiple
        // members (multi-member chains without anchors still need to stay together)
        if (memberIndices.length > 1) {
          chains.set(i, {
            startIndex: i,
            endIndex,
            memberIndices,
            anchorIndex: -1,
          });
        }
        continue;
      }
    }

    // Record this chain - it will be used during pagination to make group decisions
    chains.set(i, {
      startIndex: i,
      endIndex,
      memberIndices,
      anchorIndex,
    });
  }

  return chains;
}

/**
 * Calculates the total height needed to keep a keepNext chain together on the same page.
 *
 * This function computes the combined height of all paragraphs in a keepNext chain,
 * plus the first line of the anchor paragraph. This height is used to determine
 * whether the entire chain can fit on the current page or needs to move to the next.
 *
 * The calculation accounts for:
 * - Heights of all chain member paragraphs (from their measures)
 * - Inter-paragraph spacing with OOXML spacing collapse rules (max of after/before)
 * - Contextual spacing suppression when adjacent paragraphs share the same style
 * - Effective spacing before the first chain member (considering page state)
 * - First line height of the anchor paragraph (optimization per SD-1282)
 *
 * Spacing rules per OOXML spec:
 * - Adjacent paragraph spacing collapses to max(paragraph1.after, paragraph2.before)
 * - contextualSpacing suppresses a paragraph's spacing when adjacent to same-style paragraph
 *
 * @param chain - The keepNext chain to calculate height for
 * @param blocks - All flow blocks in the document
 * @param measures - Pre-computed measures for all blocks (must be parallel array with blocks)
 * @param state - Current page state, used for trailing spacing and last paragraph style
 * @returns Total height in pixels needed to keep the chain together. Returns 0 if chain is empty.
 *
 * @example
 * // For a chain of [Heading(30px), Body(50px)] with anchor Paragraph(20px first line):
 * // Height = 0 (spacing before heading on fresh page)
 * //        + 30 (heading height)
 * //        + 12 (inter-paragraph spacing)
 * //        + 50 (body height)
 * //        + 10 (spacing to anchor)
 * //        + 20 (anchor first line)
 * //        = 122px
 */
function calculateChainHeight(
  chain: KeepNextChain,
  blocks: FlowBlock[],
  measures: Measure[],
  state: PageState,
): number {
  let totalHeight = 0;

  // Track state from previous paragraph for spacing calculations
  let prevStyleId: string | undefined;
  let prevSpacingAfter = 0;
  let prevContextualSpacing = false;
  let isFirstMember = true;

  // Phase 1: Sum heights of all chain member paragraphs with inter-paragraph spacing
  for (const memberIndex of chain.memberIndices) {
    const block = blocks[memberIndex] as ParagraphBlock;
    const measure = measures[memberIndex];
    if (!measure) continue;

    // Extract spacing and style properties for this paragraph
    const spacingBefore = getParagraphSpacingBefore(block);
    const spacingAfter = getParagraphSpacingAfter(block);
    const styleId = typeof block.attrs?.styleId === 'string' ? block.attrs?.styleId : undefined;
    const contextualSpacing = block.attrs?.contextualSpacing === true;

    if (isFirstMember) {
      // First chain member: calculate spacing relative to the paragraph before the chain
      // (which is tracked in PageState from the previous layout operation)
      const prevTrailing =
        Number.isFinite(state.trailingSpacing) && state.trailingSpacing > 0 ? state.trailingSpacing : 0;
      const sameAsLastOnPage = styleId && state.lastParagraphStyleId === styleId;

      // Apply contextual spacing suppression if this paragraph has it AND matches previous style
      const effectiveSpacingBefore =
        contextualSpacing && sameAsLastOnPage ? 0 : Math.max(spacingBefore - prevTrailing, 0);
      totalHeight += effectiveSpacingBefore;
      isFirstMember = false;
    } else {
      // Subsequent chain members: calculate inter-paragraph spacing within the chain
      const sameStyle = styleId && prevStyleId && styleId === prevStyleId;

      // OOXML spacing rules:
      // 1. If previous paragraph has contextualSpacing AND styles match → suppress its spacingAfter
      // 2. If current paragraph has contextualSpacing AND styles match → suppress its spacingBefore
      // 3. Resulting gap = max(effective spacingAfter, effective spacingBefore)
      const effectiveSpacingAfterPrev = prevContextualSpacing && sameStyle ? 0 : prevSpacingAfter;
      const effectiveSpacingBefore = contextualSpacing && sameStyle ? 0 : spacingBefore;
      const interParagraphSpacing = Math.max(effectiveSpacingAfterPrev, effectiveSpacingBefore);
      totalHeight += interParagraphSpacing;
    }

    // Add this paragraph's content height
    totalHeight += getMeasureHeight(block, measure);

    // Store state for next iteration's spacing calculation
    prevStyleId = styleId;
    prevSpacingAfter = spacingAfter;
    prevContextualSpacing = contextualSpacing;
  }

  // Phase 2: Add the anchor paragraph's contribution (first line height only)
  // The "anchor" is the paragraph after the chain that we must keep with.
  // We only need space for its first line to start - not its full height.
  if (chain.anchorIndex !== -1) {
    const anchorBlock = blocks[chain.anchorIndex];
    const anchorMeasure = measures[chain.anchorIndex];

    if (anchorBlock && anchorMeasure) {
      if (anchorBlock.kind === 'paragraph' && anchorMeasure.kind === 'paragraph') {
        // Paragraph anchor: apply same spacing rules as chain members
        const anchorSpacingBefore = getParagraphSpacingBefore(anchorBlock as ParagraphBlock);
        const anchorStyleId =
          typeof (anchorBlock as ParagraphBlock).attrs?.styleId === 'string'
            ? (anchorBlock as ParagraphBlock).attrs?.styleId
            : undefined;
        const anchorContextualSpacing = (anchorBlock as ParagraphBlock).attrs?.contextualSpacing === true;

        const sameStyle = anchorStyleId && prevStyleId && anchorStyleId === prevStyleId;
        const effectiveSpacingAfterPrev = prevContextualSpacing && sameStyle ? 0 : prevSpacingAfter;
        const effectiveAnchorSpacingBefore = anchorContextualSpacing && sameStyle ? 0 : anchorSpacingBefore;
        const interParagraphSpacing = Math.max(effectiveSpacingAfterPrev, effectiveAnchorSpacingBefore);

        // Optimization (SD-1282): Only require space for anchor's first line, not full height.
        // This prevents excessive page breaks while still honoring the keepNext contract.
        const firstLineHeight = anchorMeasure.lines[0]?.lineHeight;
        const anchorHeight =
          typeof firstLineHeight === 'number' && Number.isFinite(firstLineHeight) && firstLineHeight > 0
            ? firstLineHeight
            : getMeasureHeight(anchorBlock, anchorMeasure);

        totalHeight += interParagraphSpacing + anchorHeight;
      } else {
        // Non-paragraph anchor (table, image, etc.): use full height
        // No contextual spacing applies to non-paragraph blocks
        // Skip anchored tables - they're positioned out of flow and don't consume flow height
        // (consistent with shouldSkipAnchoredTable guard in legacy keepNext path)
        const isAnchoredTable = anchorBlock.kind === 'table' && (anchorBlock as TableBlock).anchor?.isAnchored === true;
        if (!isAnchoredTable) {
          totalHeight += prevSpacingAfter + getMeasureHeight(anchorBlock, anchorMeasure);
        }
      }
    }
  }

  return totalHeight;
}

export type LayoutOptions = {
  pageSize?: PageSize;
  margins?: Margins;
  columns?: ColumnLayout;
  remeasureParagraph?: (block: ParagraphBlock, maxWidth: number, firstLineIndent?: number) => ParagraphMeasure;
  sectionMetadata?: SectionMetadata[];
  /**
   * Extra bottom margin per page index (0-based) reserved for non-body content
   * rendered at the bottom of the page (e.g., footnotes).
   *
   * When provided, the paginator will shrink the body content area on that page by
   * increasing the effective bottom margin for that page only.
   */
  footnoteReservedByPageIndex?: number[];
  /**
   * Optional footnote metadata consumed by higher-level orchestration (e.g. layout-bridge).
   * The core layout engine does not interpret this field directly.
   */
  footnotes?: unknown;
  /**
   * Actual measured header content heights per variant type.
   * When provided, the layout engine will ensure body content starts below
   * the header content, preventing overlap when headers exceed their allocated margin space.
   *
   * Keys correspond to header variant types: 'default', 'first', 'even', 'odd'
   * Values are the actual content heights in pixels.
   */
  headerContentHeights?: Partial<Record<'default' | 'first' | 'even' | 'odd', number>>;
  /**
   * Actual measured footer content heights per variant type.
   * When provided, the layout engine will ensure body content ends above
   * the footer content, preventing overlap when footers exceed their allocated margin space.
   *
   * Keys correspond to footer variant types: 'default', 'first', 'even', 'odd'
   * Values are the actual content heights in pixels.
   */
  footerContentHeights?: Partial<Record<'default' | 'first' | 'even' | 'odd', number>>;
  /**
   * Actual measured header content heights per relationship ID.
   * Used for multi-section documents where each section may have unique
   * headers/footers referenced by their relationship IDs.
   *
   * Keys are relationship IDs (e.g., 'rId6', 'rId7')
   * Values are the actual content heights in pixels.
   */
  headerContentHeightsByRId?: Map<string, number>;
  /**
   * Actual measured footer content heights per relationship ID.
   * Used for multi-section documents where each section may have unique
   * footers referenced by their relationship IDs.
   *
   * Keys are relationship IDs (e.g., 'rId8', 'rId9')
   * Values are the actual content heights in pixels.
   */
  footerContentHeightsByRId?: Map<string, number>;
};

export type HeaderFooterConstraints = {
  width: number;
  height: number;
  /** Actual page width for page-relative anchor positioning */
  pageWidth?: number;
  /** Page margins for page-relative anchor positioning */
  margins?: { left: number; right: number };
  /**
   * Optional base height used to bound behindDoc overflow handling.
   * When provided, decorative assets far outside the header/footer band
   * won't inflate layout height.
   */
  overflowBaseHeight?: number;
};

const DEFAULT_PAGE_SIZE: PageSize = { w: 612, h: 792 }; // Letter portrait in px (8.5in × 11in @ 72dpi)
const DEFAULT_MARGINS: Margins = { top: 72, right: 72, bottom: 72, left: 72 };

const COLUMN_EPSILON = 0.0001;

/**
 * Safely converts OOXML boolean-like values to actual booleans.
 * OOXML can encode booleans as true, 1, '1', 'true', or 'on'.
 */
const asBoolean = (value: unknown): boolean => {
  if (value === true || value === 1) return true;
  if (typeof value === 'string') {
    const normalized = value.toLowerCase();
    return normalized === 'true' || normalized === '1' || normalized === 'on';
  }
  return false;
};

// List constants sourced from shared/common

// Context types moved to modular layouters

const layoutDebugEnabled =
  typeof process !== 'undefined' && typeof process.env !== 'undefined' && Boolean(process.env.SD_DEBUG_LAYOUT);

const layoutLog = (...args: unknown[]): void => {
  if (!layoutDebugEnabled) return;

  console.log(...args);
};

/**
 * Layout FlowBlocks into paginated fragments using measured line data.
 *
 * The function is intentionally deterministic: it walks the provided
 * FlowBlocks in order, consumes their Measure objects (same index),
 * and greedily stacks fragments inside the content box of each page/column.
 */
export function layoutDocument(blocks: FlowBlock[], measures: Measure[], options: LayoutOptions = {}): Layout {
  if (blocks.length !== measures.length) {
    throw new Error(
      `layoutDocument expected measures for every block (blocks=${blocks.length}, measures=${measures.length})`,
    );
  }

  const pageSize = options.pageSize ?? DEFAULT_PAGE_SIZE;
  const margins = {
    top: options.margins?.top ?? DEFAULT_MARGINS.top,
    right: options.margins?.right ?? DEFAULT_MARGINS.right,
    bottom: options.margins?.bottom ?? DEFAULT_MARGINS.bottom,
    left: options.margins?.left ?? DEFAULT_MARGINS.left,
    header: options.margins?.header ?? options.margins?.top ?? DEFAULT_MARGINS.top,
    footer: options.margins?.footer ?? options.margins?.bottom ?? DEFAULT_MARGINS.bottom,
  };

  const baseContentWidth = pageSize.w - (margins.left + margins.right);
  if (baseContentWidth <= 0) {
    throw new Error('layoutDocument: pageSize and margins yield non-positive content area');
  }

  /**
   * Validates and normalizes a header or footer content height value to ensure it is a non-negative finite number.
   * Used to validate both header and footer heights before using them in layout calculations.
   *
   * @param height - The content height value to validate (may be undefined)
   * @returns A valid non-negative number, or 0 if the input is invalid
   */
  const validateContentHeight = (height: number | undefined): number => {
    if (height === undefined) return 0;
    if (!Number.isFinite(height) || height < 0) return 0;
    return height;
  };

  // Store content heights for per-page margin calculation
  const headerContentHeights = options.headerContentHeights;
  const footerContentHeights = options.footerContentHeights;
  const headerContentHeightsByRId = options.headerContentHeightsByRId;
  const footerContentHeightsByRId = options.footerContentHeightsByRId;

  /**
   * Determines the header/footer variant type for a given page based on section settings.
   *
   * @param sectionPageNumber - The page number within the current section (1-indexed)
   * @param titlePgEnabled - Whether the section has "different first page" enabled
   * @param alternateHeaders - Whether the section has odd/even differentiation enabled
   * @returns The variant type: 'first', 'even', 'odd', or 'default'
   */
  const getVariantTypeForPage = (
    sectionPageNumber: number,
    titlePgEnabled: boolean,
    alternateHeaders: boolean,
  ): 'default' | 'first' | 'even' | 'odd' => {
    // First page of section with titlePg enabled uses 'first' variant
    if (sectionPageNumber === 1 && titlePgEnabled) {
      return 'first';
    }
    // Alternate headers (even/odd differentiation)
    if (alternateHeaders) {
      return sectionPageNumber % 2 === 0 ? 'even' : 'odd';
    }
    return 'default';
  };

  /**
   * Gets the header content height for a specific page, considering:
   * 1. Per-rId heights (highest priority for multi-section documents)
   * 2. Per-variant heights (fallback)
   *
   * @param variantType - The variant type ('first', 'default', 'even', 'odd')
   * @param headerRef - Optional relationship ID from section's headerRefs
   * @returns The appropriate header content height, or 0 if not found
   */
  const getHeaderHeightForPage = (variantType: 'default' | 'first' | 'even' | 'odd', headerRef?: string): number => {
    // Priority 1: Check per-rId heights if we have a specific rId
    if (headerRef && headerContentHeightsByRId?.has(headerRef)) {
      return validateContentHeight(headerContentHeightsByRId.get(headerRef));
    }
    // Priority 2: Fall back to per-variant heights
    if (headerContentHeights) {
      return validateContentHeight(headerContentHeights[variantType]);
    }
    return 0;
  };

  /**
   * Gets the footer content height for a specific page, considering:
   * 1. Per-rId heights (highest priority for multi-section documents)
   * 2. Per-variant heights (fallback)
   *
   * @param variantType - The variant type ('first', 'default', 'even', 'odd')
   * @param footerRef - Optional relationship ID from section's footerRefs
   * @returns The appropriate footer content height, or 0 if not found
   */
  const getFooterHeightForPage = (variantType: 'default' | 'first' | 'even' | 'odd', footerRef?: string): number => {
    // Priority 1: Check per-rId heights if we have a specific rId
    if (footerRef && footerContentHeightsByRId?.has(footerRef)) {
      return validateContentHeight(footerContentHeightsByRId.get(footerRef));
    }
    // Priority 2: Fall back to per-variant heights
    if (footerContentHeights) {
      return validateContentHeight(footerContentHeights[variantType]);
    }
    return 0;
  };

  /**
   * Calculates the effective top margin for a page based on its header content height.
   *
   * @param headerContentHeight - The actual header content height for this page
   * @param currentHeaderDistance - The header distance from page top
   * @param baseTopMargin - The base top margin from section/document settings
   * @returns The effective top margin that prevents body/header overlap
   */
  const calculateEffectiveTopMargin = (
    headerContentHeight: number,
    currentHeaderDistance: number,
    baseTopMargin: number,
  ): number => {
    if (headerContentHeight > 0) {
      return Math.max(baseTopMargin, currentHeaderDistance + headerContentHeight);
    }
    return baseTopMargin;
  };

  /**
   * Calculates the effective bottom margin for a page based on its footer content height.
   *
   * @param footerContentHeight - The actual footer content height for this page
   * @param currentFooterDistance - The footer distance from page bottom
   * @param baseBottomMargin - The base bottom margin from section/document settings
   * @returns The effective bottom margin that prevents body/footer overlap
   */
  const calculateEffectiveBottomMargin = (
    footerContentHeight: number,
    currentFooterDistance: number,
    baseBottomMargin: number,
  ): number => {
    if (footerContentHeight > 0) {
      return Math.max(baseBottomMargin, currentFooterDistance + footerContentHeight);
    }
    return baseBottomMargin;
  };

  // Calculate the maximum header/footer content heights (used for fallback and section breaks)
  // These are still needed for cases where we don't have per-page information
  const maxHeaderContentHeight = headerContentHeights
    ? Math.max(
        0,
        validateContentHeight(headerContentHeights.default),
        validateContentHeight(headerContentHeights.first),
        validateContentHeight(headerContentHeights.even),
        validateContentHeight(headerContentHeights.odd),
      )
    : 0;
  const maxFooterContentHeight = footerContentHeights
    ? Math.max(
        0,
        validateContentHeight(footerContentHeights.default),
        validateContentHeight(footerContentHeights.first),
        validateContentHeight(footerContentHeights.even),
        validateContentHeight(footerContentHeights.odd),
      )
    : 0;

  // Initial effective margins use default variant (will be adjusted per-page)
  const headerDistance = margins.header ?? margins.top;
  const footerDistance = margins.footer ?? margins.bottom;
  const defaultHeaderHeight = getHeaderHeightForPage('default', undefined);
  const defaultFooterHeight = getFooterHeightForPage('default', undefined);
  const effectiveTopMargin = calculateEffectiveTopMargin(defaultHeaderHeight, headerDistance, margins.top);
  const effectiveBottomMargin = calculateEffectiveBottomMargin(defaultFooterHeight, footerDistance, margins.bottom);

  let activeTopMargin = effectiveTopMargin;
  let activeBottomMargin = effectiveBottomMargin;
  let activeLeftMargin = margins.left;
  let activeRightMargin = margins.right;
  let pendingTopMargin: number | null = null;
  let pendingBottomMargin: number | null = null;
  let pendingLeftMargin: number | null = null;
  let pendingRightMargin: number | null = null;
  // Track section base margins (before header/footer inflation) for per-page adjustment.
  // These represent the section's configured margins, not the effective margins after
  // accounting for header/footer content height.
  let activeSectionBaseTopMargin = margins.top;
  let activeSectionBaseBottomMargin = margins.bottom;
  let pendingSectionBaseTopMargin: number | null = null;
  let pendingSectionBaseBottomMargin: number | null = null;
  let activeHeaderDistance = margins.header ?? margins.top;
  let pendingHeaderDistance: number | null = null;
  let activeFooterDistance = margins.footer ?? margins.bottom;
  let pendingFooterDistance: number | null = null;

  // Track active and pending page size
  let activePageSize = { w: pageSize.w, h: pageSize.h };
  let pendingPageSize: { w: number; h: number } | null = null;

  // Track active and pending columns
  let activeColumns = options.columns ?? { count: 1, gap: 0 };
  let pendingColumns: { count: number; gap: number } | null = null;

  // Track active and pending orientation
  let activeOrientation: 'portrait' | 'landscape' | null = null;
  let pendingOrientation: 'portrait' | 'landscape' | null = null;

  // Track active and pending vertical alignment for sections.
  // - activeVAlign: current alignment for pages being created (null = default 'top')
  // - pendingVAlign: scheduled alignment for next page boundary
  //   - undefined = no pending change (keep activeVAlign as-is)
  //   - null = reset to default 'top'
  //   - 'center'/'bottom'/'both' = change to that alignment
  let activeVAlign: SectionVerticalAlign | null = null;
  let pendingVAlign: SectionVerticalAlign | null | undefined = undefined;

  // Create floating-object manager for anchored image tracking
  const paginatorMargins = { left: activeLeftMargin, right: activeRightMargin };
  const floatManager = createFloatingObjectManager(
    normalizeColumns(activeColumns, activePageSize.w - (activeLeftMargin + activeRightMargin)),
    { left: activeLeftMargin, right: activeRightMargin },
    activePageSize.w,
  );

  // Will be aliased to paginator.pages/states after paginator is created

  // Pre-scan sectionBreak blocks to map each boundary to the NEXT section's properties.
  // DOCX uses end-tagged sectPr: the properties that should apply to the section starting
  // AFTER a boundary live on the NEXT section's sectPr (or the body sectPr for the final range).
  // By looking ahead here, we can ensure the page that starts after a break uses the upcoming
  // section's pageSize/margins/columns instead of the section that just ended.
  const nextSectionPropsAtBreak = computeNextSectionPropsAtBreak(blocks);

  // Compatibility wrapper in case module resolution for section-breaks fails in certain runners
  const scheduleSectionBreakCompat = (
    block: SectionBreakBlock,
    state: SectionState,
    baseMargins: { top: number; bottom: number; left: number; right: number },
  ): {
    decision: { forcePageBreak: boolean; forceMidPageRegion: boolean; requiredParity?: 'even' | 'odd' };
    state: SectionState;
  } => {
    if (typeof scheduleSectionBreakExport === 'function') {
      return scheduleSectionBreakExport(block, state, baseMargins, maxHeaderContentHeight, maxFooterContentHeight);
    }
    // Fallback inline logic (mirrors section-breaks.ts)
    const next = { ...state };
    if (block.attrs?.isFirstSection && !next.hasAnyPages) {
      if (block.pageSize) {
        next.activePageSize = { w: block.pageSize.w, h: block.pageSize.h };
        next.pendingPageSize = null;
      }
      if (block.orientation) {
        next.activeOrientation = block.orientation;
        next.pendingOrientation = null;
      }
      const headerDistance =
        typeof block.margins?.header === 'number' ? Math.max(0, block.margins.header) : next.activeHeaderDistance;
      const footerDistance =
        typeof block.margins?.footer === 'number' ? Math.max(0, block.margins.footer) : next.activeFooterDistance;
      const sectionTop = typeof block.margins?.top === 'number' ? Math.max(0, block.margins.top) : baseMargins.top;
      const sectionBottom =
        typeof block.margins?.bottom === 'number' ? Math.max(0, block.margins.bottom) : baseMargins.bottom;
      if (block.margins?.header !== undefined) {
        next.activeHeaderDistance = headerDistance;
        next.pendingHeaderDistance = headerDistance;
      }
      if (block.margins?.footer !== undefined) {
        next.activeFooterDistance = footerDistance;
        next.pendingFooterDistance = footerDistance;
      }
      if (block.margins?.top !== undefined || block.margins?.header !== undefined) {
        // Word always positions header at headerDistance from page top.
        // Body must start at headerDistance + headerContentHeight (where header content ends).
        const requiredTop = maxHeaderContentHeight > 0 ? headerDistance + maxHeaderContentHeight : 0;
        next.activeTopMargin = Math.max(sectionTop, requiredTop);
        next.pendingTopMargin = next.activeTopMargin;
      }
      if (block.margins?.bottom !== undefined || block.margins?.footer !== undefined) {
        // Word always positions footer at footerDistance from page bottom.
        // Body must end at footerDistance + footerContentHeight from page bottom.
        const requiredBottom = maxFooterContentHeight > 0 ? footerDistance + maxFooterContentHeight : 0;
        next.activeBottomMargin = Math.max(sectionBottom, requiredBottom);
        next.pendingBottomMargin = next.activeBottomMargin;
      }
      if (block.margins?.left !== undefined) {
        const leftMargin = Math.max(0, block.margins.left);
        next.activeLeftMargin = leftMargin;
        next.pendingLeftMargin = leftMargin;
      }
      if (block.margins?.right !== undefined) {
        const rightMargin = Math.max(0, block.margins.right);
        next.activeRightMargin = rightMargin;
        next.pendingRightMargin = rightMargin;
      }
      // Update columns - if section has columns, use them; if undefined, reset to single column.
      // In OOXML, absence of <w:cols> means single column (default).
      if (block.columns) {
        next.activeColumns = { count: block.columns.count, gap: block.columns.gap };
        next.pendingColumns = null;
      } else {
        // No columns specified = reset to single column (OOXML default)
        next.activeColumns = { count: 1, gap: 0 };
        next.pendingColumns = null;
      }
      // Schedule section refs for first section (will be applied on first page creation)
      if (block.headerRefs || block.footerRefs) {
        const baseSectionRefs = pendingSectionRefs ?? activeSectionRefs;
        const nextSectionRefs = {
          ...(block.headerRefs && { headerRefs: block.headerRefs }),
          ...(block.footerRefs && { footerRefs: block.footerRefs }),
        };
        pendingSectionRefs = mergeSectionRefs(baseSectionRefs, nextSectionRefs);
        layoutLog(`[Layout] First section: Scheduled pendingSectionRefs:`, pendingSectionRefs);
      }
      // Set section index for first section
      const firstSectionIndexRaw = block.attrs?.sectionIndex;
      const firstMetadataIndex =
        typeof firstSectionIndexRaw === 'number' ? firstSectionIndexRaw : Number(firstSectionIndexRaw ?? NaN);
      if (Number.isFinite(firstMetadataIndex)) {
        activeSectionIndex = firstMetadataIndex;
      }
      // Set numbering for first section from metadata
      const firstSectionMetadata = Number.isFinite(firstMetadataIndex)
        ? sectionMetadataList[firstMetadataIndex]
        : undefined;
      if (firstSectionMetadata?.numbering) {
        if (firstSectionMetadata.numbering.format) activeNumberFormat = firstSectionMetadata.numbering.format;
        if (typeof firstSectionMetadata.numbering.start === 'number') {
          activePageCounter = firstSectionMetadata.numbering.start;
        }
      }
      return { decision: { forcePageBreak: false, forceMidPageRegion: false }, state: next };
    }
    const headerPx = block.margins?.header;
    const footerPx = block.margins?.footer;
    const topPx = block.margins?.top;
    const bottomPx = block.margins?.bottom;
    const leftPx = block.margins?.left;
    const rightPx = block.margins?.right;
    const nextTop = next.pendingTopMargin ?? next.activeTopMargin;
    const nextBottom = next.pendingBottomMargin ?? next.activeBottomMargin;
    const nextLeft = next.pendingLeftMargin ?? next.activeLeftMargin;
    const nextRight = next.pendingRightMargin ?? next.activeRightMargin;
    const nextHeader = next.pendingHeaderDistance ?? next.activeHeaderDistance;
    const nextFooter = next.pendingFooterDistance ?? next.activeFooterDistance;

    // Update header/footer distances first
    next.pendingHeaderDistance = typeof headerPx === 'number' ? Math.max(0, headerPx) : nextHeader;
    next.pendingFooterDistance = typeof footerPx === 'number' ? Math.max(0, footerPx) : nextFooter;

    // Account for actual header content height when calculating top margin
    // Recalculate if either top or header margin changes
    if (typeof headerPx === 'number' || typeof topPx === 'number') {
      const sectionTop = typeof topPx === 'number' ? Math.max(0, topPx) : baseMargins.top;
      const sectionHeader = next.pendingHeaderDistance;
      const requiredTop = maxHeaderContentHeight > 0 ? sectionHeader + maxHeaderContentHeight : sectionHeader;
      next.pendingTopMargin = Math.max(sectionTop, requiredTop);
    } else {
      next.pendingTopMargin = nextTop;
    }

    // Account for actual footer content height when calculating bottom margin
    if (typeof footerPx === 'number' || typeof bottomPx === 'number') {
      const sectionFooter = next.pendingFooterDistance;
      const sectionBottom = typeof bottomPx === 'number' ? Math.max(0, bottomPx) : baseMargins.bottom;
      const requiredBottom = maxFooterContentHeight > 0 ? sectionFooter + maxFooterContentHeight : sectionFooter;
      next.pendingBottomMargin = Math.max(sectionBottom, requiredBottom);
    } else {
      next.pendingBottomMargin = nextBottom;
    }
    next.pendingLeftMargin = typeof leftPx === 'number' ? Math.max(0, leftPx) : nextLeft;
    next.pendingRightMargin = typeof rightPx === 'number' ? Math.max(0, rightPx) : nextRight;
    if (block.pageSize) next.pendingPageSize = { w: block.pageSize.w, h: block.pageSize.h };
    if (block.orientation) next.pendingOrientation = block.orientation;
    const sectionType = block.type ?? 'continuous';
    // Check if columns are changing: either explicitly to a different config,
    // or implicitly resetting to single column (undefined = single column in OOXML)
    const isColumnsChanging =
      (block.columns &&
        (block.columns.count !== next.activeColumns.count || block.columns.gap !== next.activeColumns.gap)) ||
      (!block.columns && next.activeColumns.count > 1);
    // Schedule section index change for next page (enables section-aware page numbering)
    const sectionIndexRaw = block.attrs?.sectionIndex;
    const metadataIndex = typeof sectionIndexRaw === 'number' ? sectionIndexRaw : Number(sectionIndexRaw ?? NaN);
    if (Number.isFinite(metadataIndex)) {
      pendingSectionIndex = metadataIndex;
    }
    // Get section metadata for numbering if available
    const sectionMetadata = Number.isFinite(metadataIndex) ? sectionMetadataList[metadataIndex] : undefined;
    // Schedule numbering change for next page - prefer metadata over block
    if (sectionMetadata?.numbering) {
      pendingNumbering = { ...sectionMetadata.numbering };
    } else if (block.numbering) {
      pendingNumbering = { ...block.numbering };
    }
    // Schedule section refs changes (apply at next page boundary)
    if (block.headerRefs || block.footerRefs) {
      const baseSectionRefs = pendingSectionRefs ?? activeSectionRefs;
      const nextSectionRefs = {
        ...(block.headerRefs && { headerRefs: block.headerRefs }),
        ...(block.footerRefs && { footerRefs: block.footerRefs }),
      };
      pendingSectionRefs = mergeSectionRefs(baseSectionRefs, nextSectionRefs);
      layoutLog(`[Layout] Compat fallback: Scheduled pendingSectionRefs:`, pendingSectionRefs);
    }
    // Helper to get column config: use block.columns if defined, otherwise reset to single column (OOXML default)
    const getColumnConfig = () =>
      block.columns ? { count: block.columns.count, gap: block.columns.gap } : { count: 1, gap: 0 };

    if (block.attrs?.requirePageBoundary) {
      next.pendingColumns = getColumnConfig();
      return { decision: { forcePageBreak: true, forceMidPageRegion: false }, state: next };
    }
    if (sectionType === 'nextPage') {
      next.pendingColumns = getColumnConfig();
      return { decision: { forcePageBreak: true, forceMidPageRegion: false }, state: next };
    }
    if (sectionType === 'evenPage') {
      next.pendingColumns = getColumnConfig();
      return { decision: { forcePageBreak: true, forceMidPageRegion: false, requiredParity: 'even' }, state: next };
    }
    if (sectionType === 'oddPage') {
      next.pendingColumns = getColumnConfig();
      return { decision: { forcePageBreak: true, forceMidPageRegion: false, requiredParity: 'odd' }, state: next };
    }
    if (isColumnsChanging) {
      next.pendingColumns = getColumnConfig();
      return { decision: { forcePageBreak: false, forceMidPageRegion: true }, state: next };
    }
    // For continuous section breaks, schedule column change for next page boundary
    next.pendingColumns = getColumnConfig();
    return { decision: { forcePageBreak: false, forceMidPageRegion: false }, state: next };
  };

  const createPage = (number: number, pageMargins: PageMargins, pageSizeOverride?: { w: number; h: number }): Page => {
    const page: Page = {
      number,
      fragments: [],
      margins: pageMargins,
    };
    if (pageSizeOverride) {
      page.size = pageSizeOverride;
    }
    // Set orientation from active section state
    if (activeOrientation) {
      page.orientation = activeOrientation;
    }
    // Set vertical alignment from active section state
    if (activeVAlign && activeVAlign !== 'top') {
      page.vAlign = activeVAlign;
      // Store base margins for vAlign centering (Word centers within base margins,
      // not inflated margins that account for header/footer height)
      page.baseMargins = {
        top: activeSectionBaseTopMargin,
        bottom: activeSectionBaseBottomMargin,
      };
    }
    return page;
  };

  // Pending-to-active application moved to section-breaks.applyPendingToActive

  // Paginator encapsulation for page/column helpers
  let pageCount = 0;
  // Page numbering state
  let activeNumberFormat: 'decimal' | 'lowerLetter' | 'upperLetter' | 'lowerRoman' | 'upperRoman' | 'numberInDash' =
    'decimal';
  let activePageCounter = 1;
  let pendingNumbering: SectionNumbering | null = null;
  // Section header/footer ref tracking state
  type SectionRefs = {
    headerRefs?: Partial<Record<'default' | 'first' | 'even' | 'odd', string>>;
    footerRefs?: Partial<Record<'default' | 'first' | 'even' | 'odd', string>>;
  };
  const normalizeRefs = (
    refs?: Partial<Record<'default' | 'first' | 'even' | 'odd', string>>,
  ): Partial<Record<'default' | 'first' | 'even' | 'odd', string>> | undefined =>
    refs && Object.keys(refs).length > 0 ? refs : undefined;
  const mergeSectionRefs = (base: SectionRefs | null, next: SectionRefs | null): SectionRefs | null => {
    if (!base && !next) return null;
    const headerRefs = normalizeRefs(next?.headerRefs) ?? normalizeRefs(base?.headerRefs);
    const footerRefs = normalizeRefs(next?.footerRefs) ?? normalizeRefs(base?.footerRefs);
    if (!headerRefs && !footerRefs) return null;
    return {
      ...(headerRefs && { headerRefs }),
      ...(footerRefs && { footerRefs }),
    };
  };
  const sectionMetadataList = options.sectionMetadata ?? [];
  const initialSectionMetadata = sectionMetadataList[0];
  if (initialSectionMetadata?.numbering?.format) {
    activeNumberFormat = initialSectionMetadata.numbering.format;
  }
  if (typeof initialSectionMetadata?.numbering?.start === 'number') {
    activePageCounter = initialSectionMetadata.numbering.start;
  }
  let activeSectionRefs: SectionRefs | null = null;
  let pendingSectionRefs: SectionRefs | null = null;
  if (initialSectionMetadata?.headerRefs || initialSectionMetadata?.footerRefs) {
    activeSectionRefs = {
      ...(initialSectionMetadata.headerRefs && { headerRefs: initialSectionMetadata.headerRefs }),
      ...(initialSectionMetadata.footerRefs && { footerRefs: initialSectionMetadata.footerRefs }),
    };
  }
  // Initialize vertical alignment from first section metadata (for page 1)
  if (initialSectionMetadata?.vAlign) {
    activeVAlign = initialSectionMetadata.vAlign;
  }
  // Section index tracking for multi-section page numbering and header/footer selection
  let activeSectionIndex: number = initialSectionMetadata?.sectionIndex ?? 0;
  let pendingSectionIndex: number | null = null;

  // Track the first page number for each section (for determining 'first' variant)
  // Map<sectionIndex, firstPageNumber>
  const sectionFirstPageNumbers = new Map<number, number>();

  const paginator = createPaginator({
    margins: paginatorMargins,
    getActiveTopMargin: () => activeTopMargin,
    getActiveBottomMargin: () => {
      const reserves = options.footnoteReservedByPageIndex;
      const pageIndex = Math.max(0, pageCount - 1);
      const reserve = Array.isArray(reserves) ? reserves[pageIndex] : 0;
      const reservePx = typeof reserve === 'number' && Number.isFinite(reserve) && reserve > 0 ? reserve : 0;
      return activeBottomMargin + reservePx;
    },
    getActiveHeaderDistance: () => activeHeaderDistance,
    getActiveFooterDistance: () => activeFooterDistance,
    getActivePageSize: () => activePageSize,
    getDefaultPageSize: () => pageSize,
    getActiveColumns: () => activeColumns,
    getCurrentColumns: () => getCurrentColumns(),
    createPage,
    onNewPage: (state?: PageState) => {
      // apply pending->active and invalidate columns cache (first callback)
      if (!state) {
        // Track if we're entering a new section (pendingSectionIndex was just set)
        const isEnteringNewSection = pendingSectionIndex !== null;

        const applied = applyPendingToActive({
          activeTopMargin,
          activeBottomMargin,
          activeLeftMargin,
          activeRightMargin,
          pendingTopMargin,
          pendingBottomMargin,
          pendingLeftMargin,
          pendingRightMargin,
          activeHeaderDistance,
          activeFooterDistance,
          pendingHeaderDistance,
          pendingFooterDistance,
          activePageSize,
          pendingPageSize,
          activeColumns,
          pendingColumns,
          activeOrientation,
          pendingOrientation,
          hasAnyPages: pageCount > 0,
        });
        activeTopMargin = applied.activeTopMargin;
        activeBottomMargin = applied.activeBottomMargin;
        activeLeftMargin = applied.activeLeftMargin;
        activeRightMargin = applied.activeRightMargin;
        pendingTopMargin = applied.pendingTopMargin;
        pendingBottomMargin = applied.pendingBottomMargin;
        pendingLeftMargin = applied.pendingLeftMargin;
        pendingRightMargin = applied.pendingRightMargin;
        activeHeaderDistance = applied.activeHeaderDistance;
        activeFooterDistance = applied.activeFooterDistance;
        pendingHeaderDistance = applied.pendingHeaderDistance;
        pendingFooterDistance = applied.pendingFooterDistance;
        activePageSize = applied.activePageSize;
        pendingPageSize = applied.pendingPageSize;
        activeColumns = applied.activeColumns;
        pendingColumns = applied.pendingColumns;
        activeOrientation = applied.activeOrientation;
        pendingOrientation = applied.pendingOrientation;
        cachedColumnsState.state = null;
        paginatorMargins.left = activeLeftMargin;
        paginatorMargins.right = activeRightMargin;
        const contentWidth = activePageSize.w - (activeLeftMargin + activeRightMargin);
        floatManager.setLayoutContext(
          normalizeColumns(activeColumns, contentWidth),
          { left: activeLeftMargin, right: activeRightMargin },
          activePageSize.w,
        );
        // Apply pending numbering
        if (pendingNumbering) {
          if (pendingNumbering.format) activeNumberFormat = pendingNumbering.format;
          if (typeof pendingNumbering.start === 'number' && Number.isFinite(pendingNumbering.start)) {
            activePageCounter = pendingNumbering.start as number;
          }
          pendingNumbering = null;
        }
        // Apply pending section refs
        if (pendingSectionRefs) {
          activeSectionRefs = mergeSectionRefs(activeSectionRefs, pendingSectionRefs);
          pendingSectionRefs = null;
        }
        // Apply pending section index
        if (pendingSectionIndex !== null) {
          activeSectionIndex = pendingSectionIndex;
          pendingSectionIndex = null;
        }
        // Apply pending vertical alignment (undefined = no change, null = reset to default)
        if (pendingVAlign !== undefined) {
          activeVAlign = pendingVAlign;
          pendingVAlign = undefined;
        }
        // Apply pending section base margins
        if (pendingSectionBaseTopMargin !== null) {
          activeSectionBaseTopMargin = pendingSectionBaseTopMargin;
          pendingSectionBaseTopMargin = null;
        }
        if (pendingSectionBaseBottomMargin !== null) {
          activeSectionBaseBottomMargin = pendingSectionBaseBottomMargin;
          pendingSectionBaseBottomMargin = null;
        }
        pageCount += 1;

        // Calculate the page number for this new page
        const newPageNumber = pageCount;

        // Track first page of section if this is a new section or the first page ever
        if (isEnteringNewSection || !sectionFirstPageNumbers.has(activeSectionIndex)) {
          sectionFirstPageNumbers.set(activeSectionIndex, newPageNumber);
        }

        // Calculate section-relative page number
        const firstPageInSection = sectionFirstPageNumbers.get(activeSectionIndex) ?? newPageNumber;
        const sectionPageNumber = newPageNumber - firstPageInSection + 1;

        // Get section metadata for titlePg setting
        const sectionMetadata = sectionMetadataList[activeSectionIndex];
        const titlePgEnabled = sectionMetadata?.titlePg ?? false;
        // TODO: Support alternateHeaders (odd/even) when needed
        const alternateHeaders = false;

        // Determine which header/footer variant applies to this page
        const variantType = getVariantTypeForPage(sectionPageNumber, titlePgEnabled, alternateHeaders);

        // Resolve header/footer refs for margin calculation using OOXML inheritance model.
        // This must match the rendering logic in PresentationEditor to ensure margins
        // are calculated based on the same header/footer content that will be rendered.
        //
        // Resolution order:
        //   1. Current section's variant ref (e.g., 'first' for first page with titlePg)
        //   2. Previous section's same variant ref (inheritance)
        //   3. Current section's 'default' ref (final fallback)
        let headerRef = activeSectionRefs?.headerRefs?.[variantType];
        let footerRef = activeSectionRefs?.footerRefs?.[variantType];
        let effectiveVariantType = variantType;

        // Step 2: Inherit from previous section if variant not found
        if (!headerRef && variantType !== 'default' && activeSectionIndex > 0) {
          const prevSectionMetadata = sectionMetadataList[activeSectionIndex - 1];
          if (prevSectionMetadata?.headerRefs?.[variantType]) {
            headerRef = prevSectionMetadata.headerRefs[variantType];
            layoutLog(
              `[Layout] Page ${newPageNumber}: Inheriting header '${variantType}' from section ${activeSectionIndex - 1}: ${headerRef}`,
            );
          }
        }
        if (!footerRef && variantType !== 'default' && activeSectionIndex > 0) {
          const prevSectionMetadata = sectionMetadataList[activeSectionIndex - 1];
          if (prevSectionMetadata?.footerRefs?.[variantType]) {
            footerRef = prevSectionMetadata.footerRefs[variantType];
            layoutLog(
              `[Layout] Page ${newPageNumber}: Inheriting footer '${variantType}' from section ${activeSectionIndex - 1}: ${footerRef}`,
            );
          }
        }

        // Step 3: Fall back to current section's 'default'
        if (!headerRef && variantType !== 'default' && activeSectionRefs?.headerRefs?.default) {
          headerRef = activeSectionRefs.headerRefs.default;
          effectiveVariantType = 'default';
        }
        if (!footerRef && variantType !== 'default' && activeSectionRefs?.footerRefs?.default) {
          footerRef = activeSectionRefs.footerRefs.default;
        }

        // Calculate the actual header/footer heights for this page's variant
        // Use effectiveVariantType for header height lookup to match the fallback
        const headerHeight = getHeaderHeightForPage(effectiveVariantType, headerRef);
        const footerHeight = getFooterHeightForPage(
          variantType !== 'default' && !activeSectionRefs?.footerRefs?.[variantType] ? 'default' : variantType,
          footerRef,
        );

        // Adjust margins based on the actual header/footer for this page.
        // Always recalculate to ensure pages without headers reset to base margin
        // (not the inflated margin from a previous page with a header).
        // Use section base margins, not document defaults, for correct per-section behavior.
        activeTopMargin = calculateEffectiveTopMargin(headerHeight, activeHeaderDistance, activeSectionBaseTopMargin);
        activeBottomMargin = calculateEffectiveBottomMargin(
          footerHeight,
          activeFooterDistance,
          activeSectionBaseBottomMargin,
        );

        layoutLog(
          `[Layout] Page ${newPageNumber}: Using variant '${variantType}' - headerHeight: ${headerHeight}, footerHeight: ${footerHeight}`,
        );
        layoutLog(
          `[Layout] Page ${newPageNumber}: Adjusted margins - top: ${activeTopMargin}, bottom: ${activeBottomMargin} (base: ${activeSectionBaseTopMargin}, ${activeSectionBaseBottomMargin})`,
        );

        return;
      }

      // second callback: after page creation -> stamp display number, section refs, section index, and advance counter
      if (state?.page) {
        state.page.numberText = formatPageNumber(activePageCounter, activeNumberFormat);
        // Stamp section index on the page for section-aware page numbering and header/footer selection
        state.page.sectionIndex = activeSectionIndex;
        layoutLog(`[Layout] Page ${state.page.number}: Stamped sectionIndex:`, activeSectionIndex);
        // Stamp section refs on the page for per-section header/footer selection
        if (activeSectionRefs) {
          state.page.sectionRefs = {
            ...(activeSectionRefs.headerRefs && { headerRefs: activeSectionRefs.headerRefs }),
            ...(activeSectionRefs.footerRefs && { footerRefs: activeSectionRefs.footerRefs }),
          };
          layoutLog(`[Layout] Page ${state.page.number}: Stamped sectionRefs:`, state.page.sectionRefs);
        } else {
          layoutLog(`[Layout] Page ${state.page.number}: No activeSectionRefs to stamp`);
        }
        activePageCounter += 1;
      }
    },
  });
  // Alias local references to paginator-managed arrays
  const pages = paginator.pages;
  const states = paginator.states;

  // Helper to get current column configuration (respects constraint boundaries)
  const getActiveColumnsForState = paginator.getActiveColumnsForState;

  // Helper to get normalized columns for current page size
  let cachedColumnsState: {
    state: PageState | null;
    constraintIndex: number;
    contentWidth: number;
    colsConfig: { count: number; gap: number } | null;
    normalized: NormalizedColumns | null;
  } = { state: null, constraintIndex: -2, contentWidth: -1, colsConfig: null, normalized: null };

  const getCurrentColumns = (): NormalizedColumns => {
    const currentContentWidth = activePageSize.w - (activeLeftMargin + activeRightMargin);
    const state = states[states.length - 1] ?? null;
    const colsConfig = state ? getActiveColumnsForState(state) : activeColumns;
    const constraintIndex = state ? state.activeConstraintIndex : -1;

    if (
      cachedColumnsState.state === state &&
      cachedColumnsState.constraintIndex === constraintIndex &&
      cachedColumnsState.contentWidth === currentContentWidth &&
      cachedColumnsState.colsConfig?.count === colsConfig.count &&
      cachedColumnsState.colsConfig?.gap === colsConfig.gap &&
      cachedColumnsState.normalized
    ) {
      return cachedColumnsState.normalized;
    }

    const normalized = normalizeColumns(colsConfig, currentContentWidth);
    cachedColumnsState = {
      state,
      constraintIndex,
      contentWidth: currentContentWidth,
      colsConfig: { count: colsConfig.count, gap: colsConfig.gap },
      normalized,
    };
    return normalized;
  };

  // Helper to get column X position
  const columnX = paginator.columnX;

  const advanceColumn = paginator.advanceColumn;

  // Start a new mid-page region with different column configuration
  const startMidPageRegion = (state: PageState, newColumns: { count: number; gap: number }): void => {
    // Record the boundary at current Y position
    const boundary: ConstraintBoundary = {
      y: state.cursorY,
      columns: newColumns,
    };
    state.constraintBoundaries.push(boundary);
    state.activeConstraintIndex = state.constraintBoundaries.length - 1;

    // Reset to first column with new configuration
    state.columnIndex = 0;

    layoutLog(`[Layout] *** COLUMNS CHANGED MID-PAGE ***`);
    layoutLog(`  OLD activeColumns: ${JSON.stringify(activeColumns)}`);
    layoutLog(`  NEW activeColumns: ${JSON.stringify(newColumns)}`);
    layoutLog(`  Current page: ${state.page.number}, cursorY: ${state.cursorY}`);

    // Update activeColumns so subsequent pages use this column configuration
    activeColumns = newColumns;

    // Invalidate columns cache to ensure recalculation with new region
    cachedColumnsState.state = null;

    const contentWidth = activePageSize.w - (activeLeftMargin + activeRightMargin);
    floatManager.setLayoutContext(
      normalizeColumns(activeColumns, contentWidth),
      { left: activeLeftMargin, right: activeRightMargin },
      activePageSize.w,
    );

    // Note: We do NOT reset cursorY - content continues from current position
    // This creates the mid-page region effect
  };

  // Collect anchored drawings mapped to their anchor paragraphs
  const anchoredByParagraph = collectAnchoredDrawings(blocks, measures);
  // PASS 1C: collect anchored/floating tables mapped to their anchor paragraphs
  const anchoredTablesByParagraph = collectAnchoredTables(blocks, measures);
  const placedAnchoredIds = new Set<string>();
  const placedAnchoredTableIds = new Set<string>();

  // Pre-register page/margin-relative anchored images before the layout loop.
  // These images position themselves relative to the page, not a paragraph, so they
  // must be registered first so all paragraphs can wrap around them.
  const preRegisteredAnchors = collectPreRegisteredAnchors(blocks, measures);

  // Map to store pre-computed positions for page-relative anchors (for fragment creation later)
  const preRegisteredPositions = new Map<string, { anchorX: number; anchorY: number; pageNumber: number }>();

  for (const entry of preRegisteredAnchors) {
    // Ensure first page exists
    const state = paginator.ensurePage();

    // Calculate anchor Y position based on vRelativeFrom and alignV
    const vRelativeFrom = entry.block.anchor?.vRelativeFrom ?? 'paragraph';
    const alignV = entry.block.anchor?.alignV ?? 'top';
    const offsetV = entry.block.anchor?.offsetV ?? 0;
    const imageHeight = entry.measure.height ?? 0;

    // Calculate the content area boundaries
    const contentTop = state.topMargin;
    const contentBottom = state.contentBottom;
    const contentHeight = Math.max(0, contentBottom - contentTop);

    let anchorY: number;

    if (vRelativeFrom === 'margin') {
      // Position relative to the content area (margin box)
      if (alignV === 'top') {
        anchorY = contentTop + offsetV;
      } else if (alignV === 'bottom') {
        anchorY = contentBottom - imageHeight + offsetV;
      } else if (alignV === 'center') {
        anchorY = contentTop + (contentHeight - imageHeight) / 2 + offsetV;
      } else {
        anchorY = contentTop + offsetV;
      }
    } else if (vRelativeFrom === 'page') {
      // Position relative to the physical page (0 = top edge)
      if (alignV === 'top') {
        anchorY = offsetV;
      } else if (alignV === 'bottom') {
        const pageHeight = contentBottom + (state.page.margins?.bottom ?? activeBottomMargin);
        anchorY = pageHeight - imageHeight + offsetV;
      } else if (alignV === 'center') {
        const pageHeight = contentBottom + (state.page.margins?.bottom ?? activeBottomMargin);
        anchorY = (pageHeight - imageHeight) / 2 + offsetV;
      } else {
        anchorY = offsetV;
      }
    } else {
      // Shouldn't happen for pre-registered anchors, but fallback
      anchorY = contentTop + offsetV;
    }

    // Compute anchor X position
    const anchorX = entry.block.anchor
      ? computeAnchorX(
          entry.block.anchor,
          state.columnIndex,
          normalizeColumns(activeColumns, activePageSize.w - (activeLeftMargin + activeRightMargin)),
          entry.measure.width,
          { left: activeLeftMargin, right: activeRightMargin },
          activePageSize.w,
        )
      : activeLeftMargin;

    // Register with float manager so all paragraphs see this exclusion
    // NOTE: We only register exclusion zones here, NOT fragments.
    // Fragments will be created when the image block is encountered in the layout loop.
    // This prevents the section break logic from seeing "content" on the page and creating a new page.
    floatManager.registerDrawing(entry.block, entry.measure, anchorY, state.columnIndex, state.page.number);

    // Store pre-computed position for later use when creating the fragment
    preRegisteredPositions.set(entry.block.id, { anchorX, anchorY, pageNumber: state.page.number });
  }

  // Pre-compute keepNext chains for correct pagination grouping.
  // Word treats consecutive paragraphs with keepNext=true as indivisible units.
  const keepNextChains = computeKeepNextChains(blocks);

  // Build set of mid-chain indices (not chain starters) to skip redundant checks
  const midChainIndices = new Set<number>();
  for (const chain of keepNextChains.values()) {
    // All members except the first are mid-chain
    for (let i = 1; i < chain.memberIndices.length; i++) {
      midChainIndices.add(chain.memberIndices[i]);
    }
  }

  // PASS 2: Layout all blocks, consulting float manager for affected paragraphs
  for (let index = 0; index < blocks.length; index += 1) {
    const block = blocks[index];
    const measure = measures[index];
    if (!measure) {
      throw new Error(`layoutDocument: missing measure for block ${block.id}`);
    }

    layoutLog(`[Layout] Block ${index} (${block.kind}) - ID: ${block.id}`);
    layoutLog(`  activeColumns: ${JSON.stringify(activeColumns)}`);
    layoutLog(`  pendingColumns: ${JSON.stringify(pendingColumns)}`);
    if (block.kind === 'sectionBreak') {
      const sectionBlock = block as SectionBreakBlock;
      layoutLog(`  sectionBreak.columns: ${JSON.stringify(sectionBlock.columns)}`);
      layoutLog(`  sectionBreak.type: ${sectionBlock.type}`);
    }

    if (block.kind === 'sectionBreak') {
      if (measure.kind !== 'sectionBreak') {
        throw new Error(`layoutDocument: expected sectionBreak measure for block ${block.id}`);
      }
      // Use next-section properties at this boundary when available, so the page started
      // after this break uses the upcoming section's layout (page size, margins, columns).
      let effectiveBlock: SectionBreakBlock = block as SectionBreakBlock;
      const ahead = nextSectionPropsAtBreak.get(index);
      const hasSectionIndex = typeof effectiveBlock.attrs?.sectionIndex === 'number';
      // Only adjust properties for breaks originating from DOCX sectPr (end-tagged semantics).
      // Skip the lookahead for PM-adapter blocks that already embed upcoming section metadata
      // via sectionIndex; those blocks have pre-resolved properties and don't need the map.
      if (ahead && effectiveBlock.attrs?.source === 'sectPr' && !hasSectionIndex && ahead) {
        effectiveBlock = {
          ...effectiveBlock,
          margins: ahead.margins
            ? { ...(effectiveBlock.margins ?? {}), ...ahead.margins }
            : (effectiveBlock.margins ?? {}),
          pageSize: ahead.pageSize ?? effectiveBlock.pageSize,
          columns: ahead.columns ?? effectiveBlock.columns,
          orientation: ahead.orientation ?? effectiveBlock.orientation,
          vAlign: ahead.vAlign ?? effectiveBlock.vAlign,
        };
      }

      const sectionState: SectionState = {
        activeTopMargin,
        activeBottomMargin,
        activeLeftMargin,
        activeRightMargin,
        pendingTopMargin,
        pendingBottomMargin,
        pendingLeftMargin,
        pendingRightMargin,
        activeHeaderDistance,
        activeFooterDistance,
        pendingHeaderDistance,
        pendingFooterDistance,
        activePageSize,
        pendingPageSize,
        activeColumns,
        pendingColumns,
        activeOrientation,
        pendingOrientation,
        hasAnyPages: states.length > 0,
      };
      const _sched = scheduleSectionBreakCompat(effectiveBlock, sectionState, {
        top: margins.top,
        bottom: margins.bottom,
        left: margins.left,
        right: margins.right,
      });
      const breakInfo = _sched.decision;
      const updatedState = _sched.state ?? sectionState;

      layoutLog(`[Layout] ========== SECTION BREAK SCHEDULED ==========`);
      layoutLog(`  Block index: ${index}`);
      layoutLog(`  effectiveBlock.columns: ${JSON.stringify(effectiveBlock.columns)}`);
      layoutLog(`  effectiveBlock.type: ${effectiveBlock.type}`);
      layoutLog(`  breakInfo.forcePageBreak: ${breakInfo.forcePageBreak}`);
      layoutLog(`  breakInfo.forceMidPageRegion: ${breakInfo.forceMidPageRegion}`);
      layoutLog(
        `  BEFORE: activeColumns = ${JSON.stringify(sectionState.activeColumns)}, pendingColumns = ${JSON.stringify(sectionState.pendingColumns)}`,
      );
      layoutLog(
        `  AFTER: activeColumns = ${JSON.stringify(updatedState.activeColumns)}, pendingColumns = ${JSON.stringify(updatedState.pendingColumns)}`,
      );
      layoutLog(`[Layout] ========== END SECTION BREAK ==========`);

      // Sync updated section state
      activeTopMargin = updatedState.activeTopMargin;
      activeBottomMargin = updatedState.activeBottomMargin;
      activeLeftMargin = updatedState.activeLeftMargin;
      activeRightMargin = updatedState.activeRightMargin;
      pendingTopMargin = updatedState.pendingTopMargin;
      pendingBottomMargin = updatedState.pendingBottomMargin;
      pendingLeftMargin = updatedState.pendingLeftMargin;
      pendingRightMargin = updatedState.pendingRightMargin;
      activeHeaderDistance = updatedState.activeHeaderDistance;
      activeFooterDistance = updatedState.activeFooterDistance;
      pendingHeaderDistance = updatedState.pendingHeaderDistance;
      pendingFooterDistance = updatedState.pendingFooterDistance;
      activePageSize = updatedState.activePageSize;
      pendingPageSize = updatedState.pendingPageSize;
      activeColumns = updatedState.activeColumns;
      pendingColumns = updatedState.pendingColumns;
      activeOrientation = updatedState.activeOrientation;
      pendingOrientation = updatedState.pendingOrientation;

      // Track section base margins (not part of SectionState, handled separately).
      // These represent the section's configured margins before header/footer inflation.
      const isFirstSection = effectiveBlock.attrs?.isFirstSection && states.length === 0;
      const blockTopMargin = effectiveBlock.margins?.top;
      const blockBottomMargin = effectiveBlock.margins?.bottom;
      if (isFirstSection) {
        // First section: apply immediately to active
        activeSectionBaseTopMargin = typeof blockTopMargin === 'number' ? blockTopMargin : margins.top;
        activeSectionBaseBottomMargin = typeof blockBottomMargin === 'number' ? blockBottomMargin : margins.bottom;
      } else if (blockTopMargin !== undefined || blockBottomMargin !== undefined) {
        // Non-first section with margin changes: schedule for next page
        if (blockTopMargin !== undefined) {
          pendingSectionBaseTopMargin = typeof blockTopMargin === 'number' ? blockTopMargin : margins.top;
        }
        if (blockBottomMargin !== undefined) {
          pendingSectionBaseBottomMargin = typeof blockBottomMargin === 'number' ? blockBottomMargin : margins.bottom;
        }
      }

      // Handle vAlign from section break (not part of SectionState, handled separately).
      // vAlign is a per-section property that does NOT inherit between sections.
      // When not specified, OOXML defaults to 'top' (represented as null here).
      // We must always process this for every section break to prevent stale values.
      const sectionVAlign = effectiveBlock.vAlign ?? null;
      const isFirstSectionForVAlign = effectiveBlock.attrs?.isFirstSection && states.length === 0;
      if (isFirstSectionForVAlign) {
        // First section: apply immediately
        activeVAlign = sectionVAlign;
        pendingVAlign = undefined; // Clear any pending (undefined = no pending change)
      } else {
        // Non-first section: schedule for next page
        pendingVAlign = sectionVAlign;
      }

      // Schedule section refs (handled outside of SectionState since they're module-level vars)
      if (effectiveBlock.headerRefs || effectiveBlock.footerRefs) {
        const baseSectionRefs = pendingSectionRefs ?? activeSectionRefs;
        const nextSectionRefs = {
          ...(effectiveBlock.headerRefs && { headerRefs: effectiveBlock.headerRefs }),
          ...(effectiveBlock.footerRefs && { footerRefs: effectiveBlock.footerRefs }),
        };
        pendingSectionRefs = mergeSectionRefs(baseSectionRefs, nextSectionRefs);
        layoutLog(`[Layout] After scheduleSectionBreakCompat: Scheduled pendingSectionRefs:`, pendingSectionRefs);
      }

      // Schedule section index and numbering (handled outside of SectionState since they're module-level vars)
      const sectionIndexRaw = effectiveBlock.attrs?.sectionIndex;
      const metadataIndex = typeof sectionIndexRaw === 'number' ? sectionIndexRaw : Number(sectionIndexRaw ?? NaN);
      // Note: isFirstSection is already declared above for base margin tracking
      if (Number.isFinite(metadataIndex)) {
        if (isFirstSection) {
          // First section: apply immediately
          activeSectionIndex = metadataIndex;
        } else {
          // Non-first section: schedule for next page
          pendingSectionIndex = metadataIndex;
        }
      }
      // Get section metadata for numbering if available
      const sectionMetadata = Number.isFinite(metadataIndex) ? sectionMetadataList[metadataIndex] : undefined;
      if (sectionMetadata?.numbering) {
        if (isFirstSection) {
          // First section: apply immediately
          if (sectionMetadata.numbering.format) activeNumberFormat = sectionMetadata.numbering.format;
          if (typeof sectionMetadata.numbering.start === 'number') {
            activePageCounter = sectionMetadata.numbering.start;
          }
        } else {
          // Non-first section: schedule for next page
          pendingNumbering = { ...sectionMetadata.numbering };
        }
      } else if (effectiveBlock.numbering) {
        if (isFirstSection) {
          if (effectiveBlock.numbering.format) activeNumberFormat = effectiveBlock.numbering.format;
          if (typeof effectiveBlock.numbering.start === 'number') {
            activePageCounter = effectiveBlock.numbering.start;
          }
        } else {
          pendingNumbering = { ...effectiveBlock.numbering };
        }
      }

      // Handle mid-page region changes (column layout changes within a page)
      // Uses pendingColumns from scheduleSectionBreak which handles both:
      // - Explicit column changes (block.columns defined with different config)
      // - Implicit reset to single column (block.columns undefined per OOXML spec)
      if (breakInfo.forceMidPageRegion && updatedState.pendingColumns) {
        let state = paginator.ensurePage();
        const columnIndexBefore = state.columnIndex;
        const newColumns = updatedState.pendingColumns;

        // If reducing column count and currently in a column that won't exist
        // in the new layout, start a fresh page to avoid overwriting earlier columns
        if (columnIndexBefore >= newColumns.count) {
          state = paginator.startNewPage();
        }

        startMidPageRegion(state, newColumns);
      }

      // Handle forced page breaks
      if (breakInfo.forcePageBreak) {
        let state = paginator.ensurePage();

        // If current page has content, start a new page
        if (state.page.fragments.length > 0) {
          layoutLog(`[Layout] Starting new page due to section break (forcePageBreak=true)`);
          layoutLog(
            `  Before: activeColumns = ${JSON.stringify(activeColumns)}, pendingColumns = ${JSON.stringify(pendingColumns)}`,
          );
          state = paginator.startNewPage();
          layoutLog(
            `  After page ${state.page.number} created: activeColumns = ${JSON.stringify(activeColumns)}, pendingColumns = ${JSON.stringify(pendingColumns)}`,
          );
        }

        // Handle parity requirements (evenPage/oddPage)
        if (breakInfo.requiredParity) {
          const currentPageNumber = state.page.number;
          const isCurrentEven = currentPageNumber % 2 === 0;
          const needsEven = breakInfo.requiredParity === 'even';

          // If parity doesn't match, insert a blank page
          if ((needsEven && !isCurrentEven) || (!needsEven && isCurrentEven)) {
            // Start another page to satisfy parity requirement
            layoutLog(`[Layout] Inserting blank page for parity (need ${breakInfo.requiredParity})`);
            state = paginator.startNewPage();
          }
        }
      }

      continue;
    }

    if (block.kind === 'paragraph') {
      if (measure.kind !== 'paragraph') {
        throw new Error(`layoutDocument: expected paragraph measure for block ${block.id}`);
      }

      // Skip empty paragraphs that appear between a pageBreak and a sectionBreak
      // (Word sectPr marker paragraphs should not create visible content)
      const paraBlock = block as ParagraphBlock;
      const isEmpty =
        !paraBlock.runs ||
        paraBlock.runs.length === 0 ||
        (paraBlock.runs.length === 1 &&
          (!paraBlock.runs[0].kind || paraBlock.runs[0].kind === 'text') &&
          (!(paraBlock.runs[0] as { text?: string }).text || (paraBlock.runs[0] as { text?: string }).text === ''));

      if (isEmpty) {
        const isSectPrMarker = paraBlock.attrs?.sectPrMarker === true;
        // Check if previous block was pageBreak and next block is sectionBreak
        const prevBlock = index > 0 ? blocks[index - 1] : null;
        const nextBlock = index < blocks.length - 1 ? blocks[index + 1] : null;

        const nextSectionBreak = nextBlock?.kind === 'sectionBreak' ? (nextBlock as SectionBreakBlock) : null;
        const nextBreakType =
          nextSectionBreak?.type ?? (nextSectionBreak?.attrs?.source === 'sectPr' ? 'nextPage' : undefined);
        const nextBreakForcesPage =
          nextSectionBreak &&
          (nextBreakType === 'nextPage' ||
            nextBreakType === 'evenPage' ||
            nextBreakType === 'oddPage' ||
            nextSectionBreak.attrs?.requirePageBoundary === true);

        if (isSectPrMarker && nextBreakForcesPage) {
          continue;
        }

        if (prevBlock?.kind === 'pageBreak' && nextBlock?.kind === 'sectionBreak') {
          continue;
        }
      }

      const anchorsForPara = anchoredByParagraph.get(index);
      const tablesForPara = anchoredTablesByParagraph.get(index);

      /**
       * keepNext Chain-Aware Page Break Logic
       *
       * Word treats consecutive paragraphs with keepNext=true as an indivisible unit.
       * If the entire chain (plus the first line of the anchor paragraph) doesn't fit
       * on the current page, the whole chain moves to the next page.
       *
       * Three cases:
       * 1. Mid-chain paragraph: Skip keepNext check (chain-start already decided)
       * 2. Chain starter: Calculate total chain height and decide for entire chain
       * 3. Orphan keepNext (no chain, e.g., next is a break): Use single-paragraph logic
       */
      const chain = keepNextChains.get(index);

      if (midChainIndices.has(index)) {
        // Case 1: Mid-chain paragraph - chain starter already made the page break decision
        // No action needed, just proceed to layout
      } else if (chain) {
        // Case 2: Chain starter - evaluate entire chain height
        let state = paginator.ensurePage();
        const availableHeight = state.contentBottom - state.cursorY;

        // Check if first chain member has contextualSpacing that would reclaim trailing space.
        // When contextualSpacing applies, the previous paragraph's trailing spacing is not
        // rendered as a gap, so we have more available space than cursorY suggests.
        const firstMemberBlock = blocks[chain.startIndex] as ParagraphBlock;
        const firstMemberStyleId =
          typeof firstMemberBlock.attrs?.styleId === 'string' ? firstMemberBlock.attrs?.styleId : undefined;
        const firstMemberContextualSpacing = firstMemberBlock.attrs?.contextualSpacing === true;
        const contextualSpacingApplies =
          firstMemberContextualSpacing && firstMemberStyleId && state.lastParagraphStyleId === firstMemberStyleId;
        const prevTrailing =
          Number.isFinite(state.trailingSpacing) && state.trailingSpacing > 0 ? state.trailingSpacing : 0;
        const effectiveAvailableHeight = contextualSpacingApplies ? availableHeight + prevTrailing : availableHeight;

        const chainHeight = calculateChainHeight(chain, blocks, measures, state);

        // Calculate page content height to check if chain fits on a blank page
        const pageContentHeight = state.contentBottom - state.topMargin;
        const chainFitsOnBlankPage = chainHeight <= pageContentHeight;

        // Only advance if chain fits on blank page but not current page
        // (prevents infinite loop for chains taller than page)
        if (chainFitsOnBlankPage && chainHeight > effectiveAvailableHeight && state.page.fragments.length > 0) {
          state = paginator.advanceColumn(state);
        }
      } else if (paraBlock.attrs?.keepNext === true) {
        // Case 3: Orphan keepNext (next block is a break type or end of document)
        // This shouldn't normally happen since computeKeepNextChains handles most cases,
        // but we keep it for safety (e.g., keepNext at end of document with no anchor)
        const nextBlock = blocks[index + 1];
        const nextMeasure = measures[index + 1];
        if (
          nextBlock &&
          nextMeasure &&
          nextBlock.kind !== 'sectionBreak' &&
          nextBlock.kind !== 'pageBreak' &&
          nextBlock.kind !== 'columnBreak'
        ) {
          const shouldSkipAnchoredTable = nextBlock.kind === 'table' && nextBlock.anchor?.isAnchored === true;
          if (!shouldSkipAnchoredTable) {
            let state = paginator.ensurePage();
            const availableHeight = state.contentBottom - state.cursorY;

            const spacingBefore = getParagraphSpacingBefore(paraBlock);
            const spacingAfter = getParagraphSpacingAfter(paraBlock);
            const prevTrailing =
              Number.isFinite(state.trailingSpacing) && state.trailingSpacing > 0 ? state.trailingSpacing : 0;
            const currentStyleId = typeof paraBlock.attrs?.styleId === 'string' ? paraBlock.attrs?.styleId : undefined;
            const currentContextualSpacing = asBoolean(paraBlock.attrs?.contextualSpacing);
            const contextualSpacingApplies =
              currentContextualSpacing && currentStyleId && state.lastParagraphStyleId === currentStyleId;
            const effectiveSpacingBefore = contextualSpacingApplies ? 0 : Math.max(spacingBefore - prevTrailing, 0);
            const currentHeight = getMeasureHeight(paraBlock, measure);
            const nextHeight = getMeasureHeight(nextBlock, nextMeasure);

            const nextIsParagraph = nextBlock.kind === 'paragraph' && nextMeasure.kind === 'paragraph';
            const nextSpacingBefore = nextIsParagraph ? getParagraphSpacingBefore(nextBlock) : 0;
            const nextStyleId =
              nextIsParagraph && typeof nextBlock.attrs?.styleId === 'string' ? nextBlock.attrs?.styleId : undefined;
            const nextContextualSpacing = nextIsParagraph && asBoolean(nextBlock.attrs?.contextualSpacing);

            const sameStyleAsNext = currentStyleId && nextStyleId && nextStyleId === currentStyleId;
            const effectiveSpacingAfter = currentContextualSpacing && sameStyleAsNext ? 0 : spacingAfter;
            const effectiveNextSpacingBefore = nextContextualSpacing && sameStyleAsNext ? 0 : nextSpacingBefore;
            const interParagraphSpacing = nextIsParagraph
              ? Math.max(effectiveSpacingAfter, effectiveNextSpacingBefore)
              : effectiveSpacingAfter;

            const nextFirstLineHeight = (() => {
              if (!nextIsParagraph) {
                return nextHeight;
              }
              const firstLineHeight = nextMeasure.lines[0]?.lineHeight;
              if (typeof firstLineHeight === 'number' && Number.isFinite(firstLineHeight) && firstLineHeight > 0) {
                return firstLineHeight;
              }
              return nextHeight;
            })();

            const combinedHeight = nextIsParagraph
              ? effectiveSpacingBefore + currentHeight + interParagraphSpacing + nextFirstLineHeight
              : effectiveSpacingBefore + currentHeight + spacingAfter + nextHeight;

            const effectiveAvailableHeight = contextualSpacingApplies
              ? availableHeight + prevTrailing
              : availableHeight;
            if (combinedHeight > effectiveAvailableHeight && state.page.fragments.length > 0) {
              state = paginator.advanceColumn(state);
            }
          }
        }
      }

      /**
       * Contextual spacing suppression for spacingAfter.
       * Per OOXML spec: when current paragraph has contextualSpacing=true and
       * the next paragraph has the same styleId, suppress current's spacingAfter.
       */
      let overrideSpacingAfter: number | undefined;
      const curStyleId = typeof paraBlock.attrs?.styleId === 'string' ? paraBlock.attrs.styleId : undefined;
      const curContextualSpacing = asBoolean(paraBlock.attrs?.contextualSpacing);
      if (curContextualSpacing && curStyleId) {
        const nextBlock = index < blocks.length - 1 ? blocks[index + 1] : null;
        if (nextBlock?.kind === 'paragraph') {
          const nextStyleId =
            typeof (nextBlock as ParagraphBlock).attrs?.styleId === 'string'
              ? (nextBlock as ParagraphBlock).attrs?.styleId
              : undefined;
          if (nextStyleId === curStyleId) {
            overrideSpacingAfter = 0;
          }
        }
      }

      // Paragraph start Y (OOXML: anchor for vertAnchor="text"). Captured before layout so
      // paragraph-anchored tables use it as base; offsetV (tblpY) positions below start to avoid overlap.
      const paragraphStartY = paginator.ensurePage().cursorY;

      layoutParagraphBlock(
        {
          block,
          measure,
          columnWidth: getCurrentColumns().width,
          ensurePage: paginator.ensurePage,
          advanceColumn: paginator.advanceColumn,
          columnX,
          floatManager,
          remeasureParagraph: options.remeasureParagraph,
          overrideSpacingAfter,
        },
        anchorsForPara
          ? {
              anchoredDrawings: anchorsForPara,
              pageWidth: activePageSize.w,
              pageMargins: {
                top: activeTopMargin,
                bottom: activeBottomMargin,
                left: activeLeftMargin,
                right: activeRightMargin,
              },
              columns: getCurrentColumns(),
              placedAnchoredIds,
            }
          : undefined,
      );

      // Register and place anchored tables after the paragraph. Anchor base is paragraph start (OOXML-style).
      // Full-width floating tables are treated as inline and laid out when we hit the table block.
      // Only vRelativeFrom=paragraph is supported. Position = max(paragraphStartY + offsetV, paragraphBottom) so the table never overlaps the paragraph.
      if (tablesForPara) {
        const state = paginator.ensurePage();
        const columnWidthForTable = getCurrentColumns().width;
        let tableBottomY = state.cursorY;
        for (const { block: tableBlock, measure: tableMeasure } of tablesForPara) {
          if (placedAnchoredTableIds.has(tableBlock.id)) continue;
          const totalWidth = tableMeasure.totalWidth ?? 0;
          if (columnWidthForTable > 0 && totalWidth >= columnWidthForTable * ANCHORED_TABLE_FULL_WIDTH_RATIO) continue;

          // OOXML: position = paragraph start + tblpY (offsetV). Clamp so table top is never above paragraph
          // bottom, ensuring no overlap when offsetV is 0 or small.
          const offsetV = tableBlock.anchor?.offsetV ?? 0;
          const anchorY = Math.max(paragraphStartY + offsetV, state.cursorY);
          floatManager.registerTable(tableBlock, tableMeasure, anchorY, state.columnIndex, state.page.number);

          const anchorX = tableBlock.anchor?.offsetH ?? columnX(state.columnIndex);

          const tableFragment = createAnchoredTableFragment(tableBlock, tableMeasure, anchorX, anchorY);
          state.page.fragments.push(tableFragment);
          placedAnchoredTableIds.add(tableBlock.id);

          // Only advance cursor for tables that affect flow (wrap type other than 'None').
          // wrap.type === 'None' is absolute overlay with no exclusion zone; pushing cursor would add unwanted whitespace.
          const wrapType = tableBlock.wrap?.type ?? 'None';
          if (wrapType !== 'None') {
            const bottom = anchorY + (tableMeasure.totalHeight ?? 0);
            if (bottom > tableBottomY) tableBottomY = bottom;
          }
        }
        state.cursorY = tableBottomY;
      }
      continue;
    }
    if (block.kind === 'image') {
      if (measure.kind !== 'image') {
        throw new Error(`layoutDocument: expected image measure for block ${block.id}`);
      }

      // Check if this is a pre-registered page-relative anchor
      const preRegPos = preRegisteredPositions.get(block.id);
      if (
        preRegPos &&
        Number.isFinite(preRegPos.anchorX) &&
        Number.isFinite(preRegPos.anchorY) &&
        Number.isFinite(preRegPos.pageNumber)
      ) {
        // Use pre-computed position for page-relative anchors
        const state = paginator.ensurePage();
        const imgBlock = block as ImageBlock;
        const imgMeasure = measure as ImageMeasure;

        const pageContentHeight = Math.max(0, state.contentBottom - state.topMargin);
        const relativeFrom = imgBlock.anchor?.hRelativeFrom ?? 'column';
        const cols = getCurrentColumns();
        let maxWidth: number;
        if (relativeFrom === 'page') {
          maxWidth = cols.count === 1 ? activePageSize.w - (activeLeftMargin + activeRightMargin) : activePageSize.w;
        } else if (relativeFrom === 'margin') {
          maxWidth = activePageSize.w - (activeLeftMargin + activeRightMargin);
        } else {
          maxWidth = cols.width;
        }

        const aspectRatio = imgMeasure.width > 0 && imgMeasure.height > 0 ? imgMeasure.width / imgMeasure.height : 1.0;
        const minWidth = 20;
        const minHeight = minWidth / aspectRatio;

        const metadata: ImageFragmentMetadata = {
          originalWidth: imgMeasure.width,
          originalHeight: imgMeasure.height,
          maxWidth,
          maxHeight: pageContentHeight,
          aspectRatio,
          minWidth,
          minHeight,
        };

        const fragment: ImageFragment = {
          kind: 'image',
          blockId: imgBlock.id,
          x: preRegPos.anchorX,
          y: preRegPos.anchorY,
          width: imgMeasure.width,
          height: imgMeasure.height,
          isAnchored: true,
          behindDoc: imgBlock.anchor?.behindDoc === true,
          zIndex: getFragmentZIndex(imgBlock),
          metadata,
        };

        const attrs = imgBlock.attrs as Record<string, unknown> | undefined;
        if (attrs?.pmStart != null) fragment.pmStart = attrs.pmStart as number;
        if (attrs?.pmEnd != null) fragment.pmEnd = attrs.pmEnd as number;

        state.page.fragments.push(fragment);
        placedAnchoredIds.add(imgBlock.id);
        continue;
      }

      layoutImageBlock({
        block: block as ImageBlock,
        measure: measure as ImageMeasure,
        columns: getCurrentColumns(),
        ensurePage: paginator.ensurePage,
        advanceColumn: paginator.advanceColumn,
        columnX,
      });
      continue;
    }
    if (block.kind === 'drawing') {
      if (measure.kind !== 'drawing') {
        throw new Error(`layoutDocument: expected drawing measure for block ${block.id}`);
      }
      layoutDrawingBlock({
        block: block as DrawingBlock,
        measure: measure as DrawingMeasure,
        columns: getCurrentColumns(),
        ensurePage: paginator.ensurePage,
        advanceColumn: paginator.advanceColumn,
        columnX,
      });
      continue;
    }
    if (block.kind === 'table') {
      if (measure.kind !== 'table') {
        throw new Error(`layoutDocument: expected table measure for block ${block.id}`);
      }
      layoutTableBlock({
        block: block as TableBlock,
        measure: measure as TableMeasure,
        columnWidth: getCurrentColumns().width,
        ensurePage: paginator.ensurePage,
        advanceColumn: paginator.advanceColumn,
        columnX,
      });
      continue;
    }

    // (handled earlier) list and image

    // Page break: force start of new page
    // Corresponds to DOCX <w:br w:type="page"/> or manual page breaks
    if (block.kind === 'pageBreak') {
      if (measure.kind !== 'pageBreak') {
        throw new Error(`layoutDocument: expected pageBreak measure for block ${block.id}`);
      }
      paginator.startNewPage();
      continue;
    }

    // Column break: advance to next column or start new page if in last column
    // Corresponds to DOCX <w:br w:type="column"/>
    if (block.kind === 'columnBreak') {
      if (measure.kind !== 'columnBreak') {
        throw new Error(`layoutDocument: expected columnBreak measure for block ${block.id}`);
      }
      const state = paginator.ensurePage();
      const activeCols = getActiveColumnsForState(state);

      if (state.columnIndex < activeCols.count - 1) {
        // Not in last column: advance to next column
        advanceColumn(state);
      } else {
        // In last column: start new page
        paginator.startNewPage();
      }
      continue;
    }

    throw new Error(`layoutDocument: unsupported block kind for ${(block as FlowBlock).id}`);
  }

  // Prune trailing empty page(s) that can be created by page-boundary rules
  // (e.g., parity requirements) when no content follows. Word does not render
  // a final blank page for continuous final sections.
  while (pages.length > 0 && pages[pages.length - 1].fragments.length === 0) {
    pages.pop();
  }

  // Post-process pages with vertical alignment (center, bottom, both)
  // For each page, calculate content bounds and apply Y offset to all fragments
  for (const page of pages) {
    if (!page.vAlign || page.vAlign === 'top') {
      continue;
    }
    if (page.fragments.length === 0) {
      continue;
    }

    // Get page dimensions. For vAlign centering, use BASE margins (not inflated margins)
    // to match Word's behavior where headers/footers don't affect vertical alignment.
    const pageSizeForPage = page.size ?? pageSize;
    const baseTop = page.baseMargins?.top ?? page.margins?.top ?? margins.top;
    const baseBottom = page.baseMargins?.bottom ?? page.margins?.bottom ?? margins.bottom;
    const contentTop = baseTop;
    const contentBottom = pageSizeForPage.h - baseBottom;
    const contentHeight = contentBottom - contentTop;

    // Calculate the actual content bounds (min and max Y of all fragments)
    let minY = Infinity;
    let maxY = -Infinity;

    for (const fragment of page.fragments) {
      if (fragment.y < minY) minY = fragment.y;

      // Calculate fragment bottom based on type
      // Image, Drawing, and Table fragments have a height property
      // Para and ListItem fragments do not have height in their contract
      let fragmentBottom = fragment.y;
      if (hasHeight(fragment)) {
        // Type guard ensures fragment.height exists
        fragmentBottom += fragment.height;
      } else {
        // Para and list-item fragments don't have a height property
        // Calculate height based on number of lines spanned by the fragment
        const lineCount = fragment.toLine - fragment.fromLine;
        fragmentBottom += lineCount * DEFAULT_PARAGRAPH_LINE_HEIGHT_PX;
      }

      if (fragmentBottom > maxY) maxY = fragmentBottom;
    }

    // Content takes space from minY to maxY
    const actualContentHeight = maxY - minY;
    const availableSpace = contentHeight - actualContentHeight;

    if (availableSpace <= 0) {
      continue; // Content fills or exceeds page, no adjustment needed
    }

    // Calculate Y offset based on vAlign
    let yOffset = 0;
    if (page.vAlign === 'center') {
      yOffset = availableSpace / 2;
    } else if (page.vAlign === 'bottom') {
      yOffset = availableSpace;
    } else if (page.vAlign === 'both') {
      // LIMITATION: 'both' (vertical justification) is currently treated as 'center'
      //
      // The 'both' value in OOXML means content should be vertically justified:
      // space should be distributed evenly between paragraphs/blocks throughout
      // the page (similar to text-align: justify but in the vertical direction).
      //
      // Full implementation would require:
      // 1. Identifying gaps between content blocks (paragraphs, tables, images)
      // 2. Calculating total inter-block spacing
      // 3. Distributing available space proportionally across all gaps
      // 4. Adjusting Y positions of each fragment based on cumulative spacing
      //
      // This would need significant refactoring of the layout flow to track
      // block boundaries and inter-block relationships during pagination.
      // For now, center alignment provides a reasonable approximation.
      yOffset = availableSpace / 2;
    }

    // Apply Y offset to all fragments on this page
    if (yOffset > 0) {
      for (const fragment of page.fragments) {
        fragment.y += yOffset;
      }
    }
  }

  // Apply column balancing to pages with multi-column layout.
  // This redistributes fragments to achieve balanced column heights, matching Word's behavior.
  if (activeColumns.count > 1) {
    const contentWidth = pageSize.w - (activeLeftMargin + activeRightMargin);
    const normalizedCols = normalizeColumns(activeColumns, contentWidth);

    // Build measure map for fragment height calculation during balancing
    const measureMap = new Map<string, { kind: string; lines?: Array<{ lineHeight: number }>; height?: number }>();
    // Build blockId -> sectionIndex map to filter fragments by section
    const blockSectionMap = new Map<string, number>();
    blocks.forEach((block, idx) => {
      const measure = measures[idx];
      if (measure) {
        measureMap.set(block.id, measure as { kind: string; lines?: Array<{ lineHeight: number }>; height?: number });
      }
      // Track section index for each block (for filtering during balancing)
      // Not all block types have attrs, so access it safely
      const blockWithAttrs = block as { attrs?: { sectionIndex?: number } };
      const sectionIdx = blockWithAttrs.attrs?.sectionIndex;
      if (typeof sectionIdx === 'number') {
        blockSectionMap.set(block.id, sectionIdx);
      }
    });

    for (const page of pages) {
      // Balance the last page (section ends at document end).
      // TODO: Track section boundaries and balance at each continuous section break.
      if (page === pages[pages.length - 1] && page.fragments.length > 0) {
        // Skip balancing if fragments are already in multiple columns (e.g., explicit column breaks).
        // Balancing should only apply when all content flows naturally in column 0.
        const uniqueXPositions = new Set(page.fragments.map((f) => Math.round(f.x)));
        const hasExplicitColumnStructure = uniqueXPositions.size > 1;

        if (hasExplicitColumnStructure) {
          continue;
        }

        // Skip balancing if fragments have different widths (indicating different column configs
        // from multiple sections). Balancing would incorrectly apply the final section's width to all.
        const uniqueWidths = new Set(page.fragments.map((f) => Math.round(f.width)));
        const hasMixedColumnWidths = uniqueWidths.size > 1;

        if (hasMixedColumnWidths) {
          continue;
        }

        // Check if page has content from multiple sections.
        // If so, only balance fragments from the final multi-column section.
        const fragmentSections = new Set<number>();
        for (const f of page.fragments) {
          const section = blockSectionMap.get(f.blockId);
          if (section !== undefined) {
            fragmentSections.add(section);
          }
        }

        // Only balance fragments from the final section when there are mixed sections
        const hasMixedSections = fragmentSections.size > 1;
        const fragmentsToBalance = hasMixedSections
          ? page.fragments.filter((f) => {
              const fragSection = blockSectionMap.get(f.blockId);
              return fragSection === activeSectionIndex;
            })
          : page.fragments;

        if (fragmentsToBalance.length > 0) {
          balancePageColumns(
            fragmentsToBalance as {
              x: number;
              y: number;
              width: number;
              kind: string;
              blockId: string;
              fromLine?: number;
              toLine?: number;
              height?: number;
            }[],
            normalizedCols,
            { left: activeLeftMargin },
            activeTopMargin,
            measureMap,
          );
        }
      }
    }
  }

  return {
    pageSize,
    pages,
    // Note: columns here reflects the effective default for subsequent pages
    // after processing sections. Page/region-specific column changes are encoded
    // implicitly via fragment positions. Consumers should not assume this is
    // a static document-wide value.
    columns: activeColumns.count > 1 ? { count: activeColumns.count, gap: activeColumns.gap } : undefined,
  };
}

/**
 * Lays out header or footer content within specified dimensional constraints.
 *
 * This function positions blocks (paragraphs, images, drawings) within a header or footer region,
 * handling page-relative anchor transformations and computing the actual height required by
 * visible content. Headers and footers are rendered within the content box but may contain
 * page-relative anchored objects that need coordinate transformation.
 *
 * @param blocks - The flow blocks to layout (paragraphs, images, drawings, etc.)
 * @param measures - Corresponding measurements for each block (must match blocks.length)
 * @param constraints - Dimensional constraints including width, height, and optional margins
 *
 * @returns A HeaderFooterLayout containing:
 *   - pages: Array of laid-out pages with positioned fragments
 *   - height: The actual height consumed by visible content
 *
 * @throws {Error} If blocks and measures arrays have different lengths
 * @throws {Error} If width or height constraints are not positive finite numbers
 *
 * Special handling for behindDoc anchored fragments:
 * - Anchored images/drawings with behindDoc=true are decorative background elements
 * - Per OOXML spec, behindDoc is purely a z-ordering directive that should NOT affect layout
 * - These fragments are ALWAYS excluded from height calculations, regardless of position
 * - This matches Word behavior where behindDoc images never inflate header/footer margins
 * - All behindDoc fragments are still rendered in the layout; they're only excluded from height
 */
export function layoutHeaderFooter(
  blocks: FlowBlock[],
  measures: Measure[],
  constraints: HeaderFooterConstraints,
): HeaderFooterLayout {
  if (blocks.length !== measures.length) {
    throw new Error(
      `layoutHeaderFooter expected measures for every block (blocks=${blocks.length}, measures=${measures.length})`,
    );
  }
  const width = Number(constraints?.width);
  const height = Number(constraints?.height);
  if (!Number.isFinite(width) || width <= 0) {
    throw new Error('layoutHeaderFooter: width must be positive');
  }
  // If height is zero or negative (e.g., edge-to-edge layouts with no margin space),
  // return an empty layout instead of crashing. This handles documents with zero margins
  // or unusual margin configurations gracefully.
  if (!Number.isFinite(height) || height <= 0) {
    return { pages: [], height: 0 };
  }

  // Transform page-relative anchor offsets to content-relative for correct positioning
  // Headers/footers are rendered within the content box, but page-relative anchors
  // specify offsets from the physical page edge. We need to adjust by subtracting
  // the left margin so the image appears at the correct position within the header/footer.
  const marginLeft = constraints.margins?.left ?? 0;
  const transformedBlocks =
    marginLeft > 0
      ? blocks.map((block) => {
          // Handle both image blocks and drawing blocks (vectorShape, shapeGroup)
          const hasPageRelativeAnchor =
            (block.kind === 'image' || block.kind === 'drawing') &&
            block.anchor?.hRelativeFrom === 'page' &&
            block.anchor.offsetH != null;
          if (hasPageRelativeAnchor) {
            return {
              ...block,
              anchor: {
                ...block.anchor,
                offsetH: block.anchor!.offsetH! - marginLeft,
              },
            };
          }
          return block;
        })
      : blocks;

  const layout = layoutDocument(transformedBlocks, measures, {
    pageSize: { w: width, h: height },
    margins: { top: 0, right: 0, bottom: 0, left: 0 },
  });

  // Compute bounds using an index map to avoid building multiple Maps
  const idToIndex = new Map<string, number>();
  for (let i = 0; i < blocks.length; i += 1) {
    idToIndex.set(blocks[i].id, i);
  }

  let minY = 0;
  let maxY = 0;

  for (const page of layout.pages) {
    for (const fragment of page.fragments) {
      const idx = idToIndex.get(fragment.blockId);
      if (idx == null) continue;
      const block = blocks[idx];
      const measure = measures[idx];

      // Exclude ALL behindDoc anchored fragments from height calculations.
      // Per OOXML spec, behindDoc is purely a z-ordering directive that should NOT affect layout.
      // These decorative background images/drawings render behind text but never inflate margins.
      // Fragments are still rendered in the layout; we only skip them when computing total height.
      const isAnchoredFragment =
        (fragment.kind === 'image' || fragment.kind === 'drawing') && fragment.isAnchored === true;
      if (isAnchoredFragment) {
        // Runtime validation: ensure block.kind matches fragment.kind before type assertion
        if (block.kind !== 'image' && block.kind !== 'drawing') {
          throw new Error(
            `Type mismatch: fragment kind is ${fragment.kind} but block kind is ${block.kind} for block ${block.id}`,
          );
        }
        const anchoredBlock = block as ImageBlock | DrawingBlock;
        // behindDoc images never affect layout - skip entirely from height calculation
        if (anchoredBlock.anchor?.behindDoc) {
          continue;
        }
      }

      if (fragment.y < minY) minY = fragment.y;
      let bottom = fragment.y;

      if (fragment.kind === 'para' && measure?.kind === 'paragraph') {
        let sum = 0;
        for (let li = fragment.fromLine; li < fragment.toLine; li += 1) {
          sum += measure.lines[li]?.lineHeight ?? 0;
        }
        bottom += sum;
        const spacingAfter = (block as ParagraphBlock)?.attrs?.spacing?.after;
        if (spacingAfter && fragment.toLine === measure.lines.length) {
          bottom += Math.max(0, Number(spacingAfter));
        }
      } else if (fragment.kind === 'image') {
        const h =
          typeof fragment.height === 'number' ? fragment.height : ((measure as ImageMeasure | undefined)?.height ?? 0);
        bottom += h;
      } else if (fragment.kind === 'drawing') {
        const drawingHeight =
          typeof fragment.height === 'number'
            ? fragment.height
            : ((measure as DrawingMeasure | undefined)?.height ?? 0);
        bottom += drawingHeight;
      } else if (fragment.kind === 'list-item') {
        const listMeasure = measure as ListMeasure | undefined;
        if (listMeasure) {
          const item = listMeasure.items.find((it) => it.itemId === fragment.itemId);
          if (item?.paragraph) {
            let sum = 0;
            for (let li = fragment.fromLine; li < fragment.toLine; li += 1) {
              sum += item.paragraph.lines[li]?.lineHeight ?? 0;
            }
            bottom += sum;
          }
        }
      }

      if (bottom > maxY) maxY = bottom;
    }
  }

  return {
    height: maxY - minY,
    minY,
    maxY,
    pages: layout.pages.map((page) => ({ number: page.number, fragments: page.fragments })),
  };
}

// moved layouters and PM helpers to dedicated modules

/**
 * Normalize and validate column layout configuration, computing individual column widths.
 *
 * Takes raw column layout parameters and the available content width, then calculates
 * the actual width each column should have after accounting for gaps. Handles edge cases
 * like invalid column counts, excessive gaps, and degenerate layouts.
 *
 * Algorithm:
 * 1. Validate and normalize column count (floor to integer, ensure >= 1)
 * 2. Validate and normalize gap width (ensure >= 0)
 * 3. Calculate total gap space: gap * (count - 1)
 * 4. Calculate per-column width: (contentWidth - totalGap) / count
 * 5. If resulting width is too small (≤ epsilon), fallback to single-column layout
 *
 * Edge cases handled:
 * - Undefined or missing input: Defaults to single column, no gap
 * - Invalid count (NaN, negative, zero): Defaults to 1
 * - Negative gap: Clamps to 0
 * - Column width too small (gaps consume all space): Falls back to single column
 * - Non-integer count: Floors to nearest integer
 *
 * @param input - The column layout configuration (count and gap) or undefined
 * @param contentWidth - The total available width for content in pixels (must be positive)
 * @returns Normalized column configuration with computed width per column
 * @example
 * // Two columns with 48px gap in 612px content area
 * normalizeColumns({ count: 2, gap: 48 }, 612)
 * // Returns { count: 2, gap: 48, width: 282 }
 *
 * @example
 * // Excessive gap causes fallback to single column
 * normalizeColumns({ count: 3, gap: 500 }, 600)
 * // Returns { count: 1, gap: 0, width: 600 }
 */
function normalizeColumns(input: ColumnLayout | undefined, contentWidth: number): NormalizedColumns {
  const rawCount = Number.isFinite(input?.count) ? Math.floor(input!.count) : 1;
  const count = Math.max(1, rawCount || 1);
  const gap = Math.max(0, input?.gap ?? 0);
  const totalGap = gap * (count - 1);
  const width = (contentWidth - totalGap) / count;

  if (width <= COLUMN_EPSILON) {
    return {
      count: 1,
      gap: 0,
      width: contentWidth,
    };
  }

  return {
    count,
    gap,
    width,
  };
}

const _buildMeasureMap = (blocks: FlowBlock[], measures: Measure[]): Map<string, Measure> => {
  const map = new Map<string, Measure>();
  blocks.forEach((block, index) => {
    const measure = measures[index];
    if (measure) {
      map.set(block.id, measure);
    }
  });
  return map;
};

/**
 * Compute the full bounding box of content across all pages.
 * Returns minY, maxY, and the total height including negative Y offsets.
 * This properly handles anchored images with negative Y positions.
 */
const _computeContentBounds = (
  pages: Page[],
  blocks: FlowBlock[],
  measureMap: Map<string, Measure>,
): { minY: number; maxY: number; height: number } => {
  let minY = 0;
  let maxY = 0;

  // Build a block map for O(1) lookup
  const blockMap = new Map<string, FlowBlock>();
  blocks.forEach((block) => {
    blockMap.set(block.id, block);
  });

  pages.forEach((page) => {
    page.fragments.forEach((fragment) => {
      const block = blockMap.get(fragment.blockId);
      const measure = measureMap.get(fragment.blockId);

      // Track minimum Y (for anchored images with negative offsets)
      if (fragment.y < minY) {
        minY = fragment.y;
      }

      // Compute fragment height and bottom position
      let fragmentBottom = fragment.y;

      if (fragment.kind === 'para') {
        const paraBlock = block as ParagraphBlock | undefined;
        const paraMeasure = measure as ParagraphMeasure | undefined;

        if (paraMeasure) {
          // Add line heights
          const linesHeight = sumLineHeights(paraMeasure, fragment.fromLine, fragment.toLine);
          fragmentBottom += linesHeight;

          // Add paragraph spacing if this is the last fragment of the paragraph
          if (paraBlock?.attrs?.spacing && fragment.toLine === paraMeasure.lines.length) {
            const spacingAfter = Math.max(0, Number(paraBlock.attrs.spacing.after ?? 0));
            fragmentBottom += spacingAfter;
          }
        }
      } else if (fragment.kind === 'image') {
        const imgHeight =
          typeof fragment.height === 'number' ? fragment.height : ((measure as ImageMeasure | undefined)?.height ?? 0);
        fragmentBottom += imgHeight;
      } else if (fragment.kind === 'drawing') {
        const drawingHeight =
          typeof fragment.height === 'number'
            ? fragment.height
            : ((measure as DrawingMeasure | undefined)?.height ?? 0);
        fragmentBottom += drawingHeight;
      } else if (fragment.kind === 'list-item') {
        const listMeasure = measure as ListMeasure | undefined;
        if (listMeasure) {
          const item = listMeasure.items.find((it) => it.itemId === fragment.itemId);
          if (item?.paragraph) {
            fragmentBottom += sumLineHeights(item.paragraph, fragment.fromLine, fragment.toLine);
          }
        }
      }

      if (fragmentBottom > maxY) {
        maxY = fragmentBottom;
      }
    });
  });

  return {
    minY,
    maxY,
    height: maxY - minY,
  };
};

const _computeUsedHeight = (pages: Page[], measureMap: Map<string, Measure>): number => {
  let maxHeight = 0;
  pages.forEach((page) => {
    page.fragments.forEach((fragment) => {
      const height = fragmentHeight(fragment, measureMap);
      const bottom = fragment.y + height;
      if (bottom > maxHeight) {
        maxHeight = bottom;
      }
    });
  });
  return maxHeight;
};

const fragmentHeight = (fragment: Fragment, measureMap: Map<string, Measure>): number => {
  if (fragment.kind === 'para') {
    const measure = measureMap.get(fragment.blockId);
    if (!measure || measure.kind !== 'paragraph') {
      return 0;
    }
    return sumLineHeights(measure, fragment.fromLine, fragment.toLine);
  }
  if (fragment.kind === 'image') {
    if (typeof fragment.height === 'number') {
      return fragment.height;
    }
    const measure = measureMap.get(fragment.blockId);
    if (measure && measure.kind === 'image') {
      return measure.height;
    }
    return 0;
  }
  if (fragment.kind === 'drawing') {
    if (typeof fragment.height === 'number') {
      return fragment.height;
    }
    const measure = measureMap.get(fragment.blockId);
    if (measure && measure.kind === 'drawing') {
      return measure.height;
    }
    return 0;
  }
  return 0;
};

const sumLineHeights = (measure: ParagraphMeasure, fromLine: number, toLine: number): number => {
  let sum = 0;
  for (let index = fromLine; index < toLine; index += 1) {
    sum += measure.lines[index]?.lineHeight ?? 0;
  }
  return sum;
};

// Export page reference resolution utilities
export { buildAnchorMap, resolvePageRefTokens, getTocBlocksForRemeasurement } from './resolvePageRefs.js';

// Export page numbering utilities
export { formatPageNumber, computeDisplayPageNumber } from './pageNumbering.js';
export type { PageNumberFormat, DisplayPageInfo } from './pageNumbering.js';

// Export page token resolution utilities
export { resolvePageNumberTokens } from './resolvePageTokens.js';
export type { NumberingContext, ResolvePageTokensResult } from './resolvePageTokens.js';
