import type {
  ColumnLayout,
  ColumnRegion,
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
  PageBreakBlock,
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
  FlowMode,
  NormalizedColumnLayout,
  ColumnGeometry,
  DocumentBackground,
  HeaderFooterResolutionSection,
  PageNumberFormat,
} from '@superdoc/contracts';
import {
  buildLayoutSourceIdentityForFragment,
  normalizeColumnLayout,
  getFragmentZIndex,
  getColumnGeometry,
  getColumnWidth,
  getColumnX,
  columnRenderLayoutsEqual,
  resolveColumnCount,
  resolveColumnLayout,
  resolveAnchoredGraphicY,
  resolveEffectiveHeaderFooterRef,
  selectHeaderFooterVariantForPage,
} from '@superdoc/contracts';
import { createFloatingObjectManager, computeAnchorX } from './floating-objects.js';
import { computeNextSectionPropsAtBreak } from './section-props';
import {
  scheduleSectionBreak as scheduleSectionBreakExport,
  type SectionState,
  applyPendingToActive,
  SINGLE_COLUMN_DEFAULT,
} from './section-breaks.js';
import { layoutParagraphBlock, type FootnoteAnchorRef } from './layout-paragraph.js';
import { layoutImageBlock } from './layout-image.js';
import { layoutDrawingBlock } from './layout-drawing.js';
import { layoutTextboxContent } from './layout-textbox.js';
import { layoutTableBlock, createAnchoredTableFragment, isAnchoredTableFullWidth } from './layout-table.js';
import {
  collectAnchoredDrawings,
  collectAnchoredTables,
  collectPreRegisteredAnchors,
  isPageRelativeAnchor,
} from './anchors.js';
import { normalizeFragmentsForRegion } from './normalize-header-footer-fragments.js';
import { createPaginator, type PageState, type ConstraintBoundary } from './paginator.js';
import { formatPageNumber } from './pageNumbering.js';
import { shouldSuppressSpacingForEmpty, shouldSuppressOwnSpacing } from './layout-utils.js';
import {
  balanceSectionOnPage,
  type BalancingFragment,
  type MeasureData,
  type SectionColumnLayout,
} from './column-balancing.js';
import { cloneColumnLayout } from './column-utils.js';

type PageSize = { w: number; h: number };
type Margins = {
  top: number;
  right: number;
  bottom: number;
  left: number;
  header?: number;
  footer?: number;
};

type NormalizedColumns = NormalizedColumnLayout;

const getColumnWidthAt = (columns: NormalizedColumns, columnIndex: number): number => {
  if (Array.isArray(columns.widths) && columns.widths.length > 0) {
    return columns.widths[Math.max(0, Math.min(columnIndex, columns.widths.length - 1))] ?? columns.width;
  }
  return columns.width;
};

/**
 * Default paragraph line height in pixels used for vertical alignment calculations
 * when actual height is not available in the measure data.
 * This is a fallback estimate for paragraph and list-item fragments.
 */
const DEFAULT_PARAGRAPH_LINE_HEIGHT_PX = 20;

/**
 * Synthetic page height used in semantic flow mode to avoid pagination-driven clipping
 * during measurement. A large finite value preserves stable measurement constraints.
 */
export const SEMANTIC_PAGE_HEIGHT_PX = 1_000_000;

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

function buildSectionAwareReferenceKey(refId: string, sectionIndex: number): string {
  return `${refId}::s${sectionIndex}`;
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
      // Per-paragraph contextual spacing: each side independently suppresses its own spacing
      const prevSuppressAfter = shouldSuppressOwnSpacing(
        state.lastParagraphStyleId,
        state.lastParagraphContextualSpacing,
        styleId,
      );
      const currSuppressBefore = shouldSuppressOwnSpacing(styleId, contextualSpacing, state.lastParagraphStyleId);
      let effectiveSpacingBefore: number;
      if (prevSuppressAfter && currSuppressBefore) {
        effectiveSpacingBefore = 0;
      } else if (prevSuppressAfter) {
        effectiveSpacingBefore = spacingBefore;
      } else if (currSuppressBefore) {
        effectiveSpacingBefore = 0;
      } else {
        effectiveSpacingBefore = Math.max(spacingBefore - prevTrailing, 0);
      }
      totalHeight += effectiveSpacingBefore;
      isFirstMember = false;
    } else {
      // Subsequent chain members: per-paragraph contextual spacing
      const prevSuppressAfter = shouldSuppressOwnSpacing(prevStyleId, prevContextualSpacing, styleId);
      const currSuppressBefore = shouldSuppressOwnSpacing(styleId, contextualSpacing, prevStyleId);
      const effectiveSpacingAfterPrev = prevSuppressAfter ? 0 : prevSpacingAfter;
      const effectiveSpacingBefore = currSuppressBefore ? 0 : spacingBefore;
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

        const prevSuppressAfter = shouldSuppressOwnSpacing(prevStyleId, prevContextualSpacing, anchorStyleId);
        const anchorSuppressBefore = shouldSuppressOwnSpacing(anchorStyleId, anchorContextualSpacing, prevStyleId);
        const effectiveSpacingAfterPrev = prevSuppressAfter ? 0 : prevSpacingAfter;
        const effectiveAnchorSpacingBefore = anchorSuppressBefore ? 0 : anchorSpacingBefore;
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
        // Non-paragraph anchor (table, image, etc.).
        // No contextual spacing applies to non-paragraph blocks.
        // Skip anchored tables - they're positioned out of flow and don't consume flow height
        // (consistent with shouldSkipAnchoredTable guard in legacy keepNext path)
        const isAnchoredTable = anchorBlock.kind === 'table' && (anchorBlock as TableBlock).anchor?.isAnchored === true;
        if (!isAnchoredTable) {
          // For a table anchor, only require the FIRST ROW to stay with the chain, not
          // the full table. The keepNext contract keeps the heading with the table's
          // start; the table itself splits across pages (SD-3345). Reserving the full
          // height pushed a heading + tall splittable table wholly to the next page,
          // leaving a large gap, where Word starts the table here and splits it. This
          // mirrors the paragraph anchor's first-line optimization (SD-1282). A table
          // whose first row cannot split is still handled by the table-start preflight.
          let anchorHeight = getMeasureHeight(anchorBlock, anchorMeasure);
          if (anchorBlock.kind === 'table' && anchorMeasure.kind === 'table' && anchorMeasure.rows.length > 0) {
            const firstRowHeight = anchorMeasure.rows[0]?.height;
            if (typeof firstRowHeight === 'number' && Number.isFinite(firstRowHeight) && firstRowHeight > 0) {
              anchorHeight = firstRowHeight;
            }
          }
          totalHeight += prevSpacingAfter + anchorHeight;
        }
      }
    }
  }

  return totalHeight;
}

export type LayoutOptions = {
  pageSize?: PageSize;
  margins?: Margins;
  documentBackground?: DocumentBackground;
  columns?: ColumnLayout;
  flowMode?: FlowMode;
  semantic?: {
    contentWidth?: number;
    marginLeft?: number;
    marginRight?: number;
    marginTop?: number;
    marginBottom?: number;
  };
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
   * Footnote metadata. The core layout engine consumes only the fields below
   * (SD-3049: ref positions + per-footnote body heights for block-aware breaks).
   * Higher-level orchestration (layout-bridge) attaches additional fields
   * (`blocksById`, separator dimensions, etc.) which the engine ignores.
   */
  footnotes?: {
    refs?: Array<{ id: string; pos: number }>;
    /**
     * SD-3049: total measured body height per footnote id (sum of measured
     * paragraph heights + per-paragraph spacingAfter + inter-footnote gap +
     * separator overhead). Used by the body paginator to consult footnote
     * demand at fragment-commit time so body packs tight to the demand.
     */
    bodyHeightById?: Map<string, number>;
    /**
     * SD-2656: per-footnote first valid line/run height. The ordered-cluster
     * rule (Word-style) requires only the LAST anchor on a page to fit its
     * first line; all earlier anchors must fit fully (bodyHeightById). When
     * present, the body slicer uses this value for the last anchor in the
     * candidate cluster, otherwise falls back to bodyHeightById.
     */
    firstLineHeightById?: Map<string, number>;
    [key: string]: unknown;
  };
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
   * Actual measured header content heights per section-specific reference.
   *
   * Keys combine the relationship ID and section index using the form
   * `${rId}::s${sectionIndex}` so the reserve path can distinguish documents
   * that reuse the same header part across sections with different geometry.
   */
  headerContentHeightsBySectionRef?: Map<string, number>;
  /**
   * Actual measured footer content heights per relationship ID.
   * Used for multi-section documents where each section may have unique
   * footers referenced by their relationship IDs.
   *
   * Keys are relationship IDs (e.g., 'rId8', 'rId9')
   * Values are the actual content heights in pixels.
   */
  footerContentHeightsByRId?: Map<string, number>;
  /**
   * Actual measured footer content heights per section-specific reference.
   *
   * Keys combine the relationship ID and section index using the form
   * `${rId}::s${sectionIndex}` so the reserve path can distinguish documents
   * that reuse the same footer part across sections with different geometry.
   */
  footerContentHeightsBySectionRef?: Map<string, number>;
  /**
   * Allow body layout to synthesize page 1 for anchored tables when a document has
   * no anchor paragraphs and would otherwise render zero pages.
   *
   * Header/footer layout keeps this disabled to avoid changing long-standing
   * overlay behavior in paragraph-free header/footer regions.
   */
  allowParagraphlessAnchoredTableFallback?: boolean;
  allowParagraphlessAnchoredDrawingFallback?: boolean;
  /**
   * Allow body layout to synthesize page 1 when section metadata exists but no
   * renderable body blocks survive conversion.
   *
   * Header/footer layout keeps this disabled to preserve existing empty-region
   * behavior for paragraph-free overlays.
   */
  allowSectionBreakOnlyPageFallback?: boolean;
  /**
   * Whether the document has odd/even header/footer differentiation enabled.
   * Corresponds to the w:evenAndOddHeaders element in OOXML settings.xml.
   * When true, odd pages use the 'odd' variant and even pages use the 'even' variant.
   * When false or omitted, all pages use the 'default' variant.
   *
   * Must stay in sync with `getHeaderFooterTypeForSection` in
   * `layout-bridge/src/headerFooterUtils.ts` — both sides read this value
   * and must agree on variant selection.
   */
  alternateHeaders?: boolean;
};

export type HeaderFooterConstraints = {
  width: number;
  /** Body content height used as the measurement canvas (pagination boundary). */
  height: number;
  /** Actual page width for page-relative anchor positioning. */
  pageWidth?: number;
  /** Physical page height for vertical page-relative anchor conversion. */
  pageHeight?: number;
  /**
   * Page margins for anchor positioning.
   * `left`/`right`: horizontal page-relative conversion.
   * `top`/`bottom`: vertical margin-relative conversion and fallback footer band origin.
   * `header`: header distance from page top edge (header band origin).
   * `footer`: footer distance from page bottom edge (footer band origin).
   */
  margins?: {
    left: number;
    right: number;
    top?: number;
    bottom?: number;
    header?: number;
    footer?: number;
  };
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
const PAGE_START_EPSILON = 0.0001;

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

/**
 * A DOCX pageBreakBefore paragraph only requires that the paragraph start on a
 * new page. If pagination has already advanced to the top of a fresh page
 * because of a preceding section break, applying the break again would create
 * an extra blank page that Word does not render.
 */
const shouldSkipRedundantPageBreakBefore = (block: PageBreakBlock, state: PageState | undefined): boolean => {
  if (block.attrs?.source !== 'pageBreakBefore') {
    return false;
  }

  if (!state) {
    return true;
  }

  const isAtTopOfFreshPage =
    state.page.fragments.length === 0 &&
    state.columnIndex === 0 &&
    Math.abs(state.cursorY - state.topMargin) <= PAGE_START_EPSILON;

  return isAtTopOfFreshPage;
};

const hasOnlySectionBreakBlocks = (blocks: readonly FlowBlock[]): boolean => {
  return blocks.length > 0 && blocks.every((block) => block.kind === 'sectionBreak');
};

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
  const headerContentHeightsBySectionRef = options.headerContentHeightsBySectionRef;
  const footerContentHeightsByRId = options.footerContentHeightsByRId;
  const footerContentHeightsBySectionRef = options.footerContentHeightsBySectionRef;

  /**
   * Gets the header content height for a specific page, considering:
   * 1. Per-rId heights (highest priority for multi-section documents)
   * 2. Per-variant heights (fallback)
   *
   * @param variantType - The variant type ('first', 'default', 'even', 'odd')
   * @param headerRef - Optional relationship ID from section's headerRefs
   * @returns The appropriate header content height, or 0 if not found
   */
  const getHeaderHeightForPage = (
    variantType: 'default' | 'first' | 'even' | 'odd',
    headerRef?: string,
    sectionIndex?: number,
  ): number => {
    // Priority 1: Check section-aware heights when the same part is reused across sections.
    if (headerRef && sectionIndex != null) {
      const sectionKey = buildSectionAwareReferenceKey(headerRef, sectionIndex);
      if (headerContentHeightsBySectionRef?.has(sectionKey)) {
        return validateContentHeight(headerContentHeightsBySectionRef.get(sectionKey));
      }
    }
    // Priority 2: Check per-rId heights if we have a specific rId
    if (headerRef && headerContentHeightsByRId?.has(headerRef)) {
      return validateContentHeight(headerContentHeightsByRId.get(headerRef));
    }
    // Priority 3: Fall back to per-variant heights
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
  const getFooterHeightForPage = (
    variantType: 'default' | 'first' | 'even' | 'odd',
    footerRef?: string,
    sectionIndex?: number,
  ): number => {
    // Priority 1: Check section-aware heights when the same part is reused across sections.
    if (footerRef && sectionIndex != null) {
      const sectionKey = buildSectionAwareReferenceKey(footerRef, sectionIndex);
      if (footerContentHeightsBySectionRef?.has(sectionKey)) {
        return validateContentHeight(footerContentHeightsBySectionRef.get(sectionKey));
      }
    }
    // Priority 2: Check per-rId heights if we have a specific rId
    if (footerRef && footerContentHeightsByRId?.has(footerRef)) {
      return validateContentHeight(footerContentHeightsByRId.get(footerRef));
    }
    // Priority 3: Fall back to per-variant heights
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

  const MIN_BODY_CONTENT_HEIGHT = 1;
  const clampHeaderFooterInflatedMargins = (
    topMargin: number,
    bottomMargin: number,
    baseTopMargin: number,
    baseBottomMargin: number,
    currentPageHeight: number,
  ): { top: number; bottom: number } => {
    const maxMarginTotal = currentPageHeight - MIN_BODY_CONTENT_HEIGHT;
    if (topMargin + bottomMargin <= maxMarginTotal) return { top: topMargin, bottom: bottomMargin };

    const baseMarginTotal = baseTopMargin + baseBottomMargin;
    if (baseMarginTotal >= maxMarginTotal) return { top: topMargin, bottom: bottomMargin };

    const topInflation = Math.max(0, topMargin - baseTopMargin);
    const bottomInflation = Math.max(0, bottomMargin - baseBottomMargin);
    const totalInflation = topInflation + bottomInflation;
    if (totalInflation <= 0) return { top: topMargin, bottom: bottomMargin };

    const availableInflation = maxMarginTotal - baseMarginTotal;
    return {
      top: baseTopMargin + availableInflation * (topInflation / totalInflation),
      bottom: baseBottomMargin + availableInflation * (bottomInflation / totalInflation),
    };
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
  const initialHeaderHeight = 0;
  const initialFooterHeight = 0;
  const effectiveMargins = clampHeaderFooterInflatedMargins(
    calculateEffectiveTopMargin(initialHeaderHeight, headerDistance, margins.top),
    calculateEffectiveBottomMargin(initialFooterHeight, footerDistance, margins.bottom),
    margins.top,
    margins.bottom,
    pageSize.h,
  );

  let activeTopMargin = effectiveMargins.top;
  let activeBottomMargin = effectiveMargins.bottom;
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
  let activeColumns = cloneColumnLayout(options.columns);
  let pendingColumns: ColumnLayout | null = null;
  const allowParagraphlessAnchoredTableFallback = options.allowParagraphlessAnchoredTableFallback !== false;
  const allowParagraphlessAnchoredDrawingFallback = options.allowParagraphlessAnchoredDrawingFallback !== false;
  const allowSectionBreakOnlyPageFallback = options.allowSectionBreakOnlyPageFallback !== false;

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
        next.activeColumns = cloneColumnLayout(block.columns);
        next.pendingColumns = null;
      } else {
        // No columns specified = reset to single column (OOXML default)
        next.activeColumns = cloneColumnLayout(undefined);
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
        ? getSectionMetadata(firstMetadataIndex)
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
    // Columns change when the block's resolved RENDER layout differs from the active one (render
    // equality ignores raw equalWidth / surplus count that resolution discards), or when columns
    // reset to single (undefined). withSeparator is part of render equality: a sep-only toggle still
    // needs a new region so the renderer can start or stop the separator from the toggle point.
    const isColumnsChanging =
      (block.columns && !columnRenderLayoutsEqual(block.columns, next.activeColumns)) ||
      (!block.columns && (resolveColumnCount(next.activeColumns) > 1 || Boolean(next.activeColumns.withSeparator)));
    // Schedule section index change for next page (enables section-aware page numbering)
    const sectionIndexRaw = block.attrs?.sectionIndex;
    const metadataIndex = typeof sectionIndexRaw === 'number' ? sectionIndexRaw : Number(sectionIndexRaw ?? NaN);
    if (Number.isFinite(metadataIndex)) {
      pendingSectionIndex = metadataIndex;
    }
    // Get section metadata for numbering if available
    const sectionMetadata = Number.isFinite(metadataIndex) ? getSectionMetadata(metadataIndex) : undefined;
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
    const getColumnConfig = () => cloneColumnLayout(block.columns);

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

    if (resolveColumnCount(activeColumns) > 1) {
      // Render-facing metadata: resolve so it never advertises more columns than render (SD-2629).
      page.columns = resolveColumnLayout(activeColumns);
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

  /**
   * SD-3049: per-block footnote demand lookup. Resolves each footnote ref's pos
   * to the body block whose pm range contains it; sums those refs' measured
   * body heights into a `Map<blockId, demandPx>`. The body paragraph layout
   * consults this map at fragment-commit time to keep body packing tight to
   * footnote demand instead of relying on the post-hoc page-level reserve.
   *
   * Builds once per layoutDocument call. Empty-map fallback when there are
   * no footnotes — the consumer's lookup is a no-op in that case.
   *
   * Recurses into table cells so refs inside table-cell paragraphs are
   * charged to the *containing table block* (the unit `layoutTableBlock` lays
   * out and breaks at). This is a conservative approximation: demand from a
   * cell ref is charged to the whole table even if the table spans pages, so
   * the table may break one row earlier than strictly necessary. The existing
   * `footnoteBandOverflow.test.ts` is the safety net guaranteeing the band
   * never overflows the page bottom margin.
   */
  // SD-2656: per-block footnote anchor entries. Stored as a sorted list of
  // {pmPos, height} so the slicer can ask range-aware questions ("how much
  // footnote demand is anchored in lines [pmStart, pmEnd) of this block?").
  // Word's body break respects per-line anchor positions; charging the whole
  // block's demand at block entry (the old behavior) over-defers paragraphs
  // that have multiple anchors but where the first line only contains one of
  // them.
  // SD-2656: each anchor carries both full body height and first-line height.
  // The body slicer applies the ordered-cluster rule at break time:
  //   demand = sum(fullHeight of cluster[0..N-1]) + firstLineHeight(cluster[N-1])
  // i.e. all anchors except the last must fit fully; only the last may split.
  // Aliased to the public FootnoteAnchorRef so callers across packages share
  // one type.
  type FootnoteAnchorEntry = FootnoteAnchorRef;
  const footnoteAnchorsByBlockId: Map<string, FootnoteAnchorEntry[]> = (() => {
    const out = new Map<string, FootnoteAnchorEntry[]>();
    const refs = options.footnotes?.refs;
    const bodyHeights = options.footnotes?.bodyHeightById;
    const firstLineHeights = options.footnotes?.firstLineHeightById;
    if (!Array.isArray(refs) || refs.length === 0 || !bodyHeights) return out;

    /**
     * Resolve `(pmStart, pmEnd)` for a block. Falls back to scanning paragraph
     * runs when `attrs.pmStart` is absent — the converter sometimes attaches
     * positions only to runs rather than to block.attrs.
     */
    const resolveBlockPmRange = (block: FlowBlock): { pmStart: number; pmEnd: number } | null => {
      const attrsRange = (block as { attrs?: { pmStart?: number; pmEnd?: number } }).attrs;
      let pmStart = typeof attrsRange?.pmStart === 'number' ? attrsRange.pmStart : undefined;
      let pmEnd = typeof attrsRange?.pmEnd === 'number' ? attrsRange.pmEnd : undefined;
      if (pmStart == null && block.kind === 'paragraph') {
        const runs = block.runs;
        if (Array.isArray(runs)) {
          for (const run of runs) {
            const rs = (run as { pmStart?: number }).pmStart;
            const re = (run as { pmEnd?: number }).pmEnd;
            if (typeof rs === 'number') pmStart = pmStart == null ? rs : Math.min(pmStart, rs);
            if (typeof re === 'number') pmEnd = pmEnd == null ? re : Math.max(pmEnd, re);
          }
        }
      }
      if (pmStart == null) return null;
      return { pmStart, pmEnd: pmEnd ?? pmStart + 1 };
    };

    /**
     * For each ref, walk the block tree to find the top-level FlowBlock whose
     * pm range contains the ref. Tables: walks rows → cells → cell.blocks /
     * cell.paragraph; demand is attributed to the *table* block, not the cell,
     * because the table is the unit the body paginator places on a page.
     */
    // Dedupe refs by footnote id: the rendered footnote band only carries each id
    // once per page, so charging body demand once is the matching accounting.
    // Keeping the first ref position is sufficient — block-aware breaks only care
    // that the demand lands on *some* containing block.
    const refByPos = new Map<number, string>();
    const seenIds = new Set<string>();
    for (const ref of refs) {
      if (seenIds.has(ref.id)) continue;
      seenIds.add(ref.id);
      refByPos.set(ref.pos, ref.id);
    }

    const recordIfHit = (range: { pmStart: number; pmEnd: number }, topLevelId: string): void => {
      for (const [pos, refId] of refByPos.entries()) {
        if (pos < range.pmStart || pos > range.pmEnd) continue;
        const fullHeight = bodyHeights.get(refId);
        if (typeof fullHeight !== 'number' || !Number.isFinite(fullHeight) || fullHeight <= 0) continue;
        const firstLineRaw = firstLineHeights?.get(refId);
        // SD-2656: firstLine defaults to fullHeight when not provided — i.e.
        // legacy callers / atomic footnotes (image, drawing) get the safe
        // upper bound. Real paragraph footnotes provide a smaller value.
        const firstLineHeight =
          typeof firstLineRaw === 'number' && Number.isFinite(firstLineRaw) && firstLineRaw > 0
            ? Math.min(firstLineRaw, fullHeight)
            : fullHeight;
        const list = out.get(topLevelId) ?? [];
        list.push({ pmPos: pos, refId, fullHeight, firstLineHeight });
        out.set(topLevelId, list);
        refByPos.delete(pos);
      }
    };

    for (const block of blocks) {
      if (refByPos.size === 0) break;
      const range = resolveBlockPmRange(block);
      if (range) recordIfHit(range, block.id);

      if (block.kind === 'table') {
        for (const row of block.rows ?? []) {
          for (const cell of row.cells ?? []) {
            const cellChildren: FlowBlock[] = cell.blocks
              ? (cell.blocks as FlowBlock[])
              : cell.paragraph
                ? [cell.paragraph as FlowBlock]
                : [];
            for (const child of cellChildren) {
              const childRange = resolveBlockPmRange(child);
              if (childRange) recordIfHit(childRange, block.id);
            }
          }
        }
      }
    }

    // Keep each block's anchors sorted by pmPos so range queries are linear.
    for (const list of out.values()) list.sort((a, b) => a.pmPos - b.pmPos);
    return out;
  })();

  /**
   * SD-2656: return the ordered list of footnote anchor entries in
   * `[pmStart, pmEnd]` of the given block (or the whole block if no range).
   * Each entry carries `fullHeight` and `firstLineHeight`. The body slicer
   * combines this candidate list with PageState's committed anchors and
   * applies the ordered-cluster rule.
   */
  const getFootnoteAnchorsForBlockId = (blockId: string, pmStart?: number, pmEnd?: number): FootnoteAnchorEntry[] => {
    const entries = footnoteAnchorsByBlockId.get(blockId);
    if (!entries || entries.length === 0) return [];
    if (pmStart == null || pmEnd == null) return entries;
    const out: FootnoteAnchorEntry[] = [];
    for (const e of entries) {
      if (e.pmPos >= pmStart && e.pmPos <= pmEnd) out.push(e);
    }
    return out;
  };

  /**
   * Range-aware demand lookup under the ordered-cluster rule:
   *
   *   demand = sum(fullHeight of cluster[0..N-1]) + firstLineHeight(cluster[N-1])
   *
   * where `cluster` = committed anchors on the current page followed by the
   * candidate anchors in this block range. With no committed list provided,
   * treats the in-range entries as the full cluster.
   */
  const getFootnoteDemandForBlockId = (
    blockId: string,
    pmStart?: number,
    pmEnd?: number,
    committed?: ReadonlyArray<FootnoteAnchorEntry>,
  ): number => {
    const candidate = getFootnoteAnchorsForBlockId(blockId, pmStart, pmEnd);
    if (candidate.length === 0 && (!committed || committed.length === 0)) return 0;
    const cluster = committed && committed.length > 0 ? [...committed, ...candidate] : candidate;
    if (cluster.length === 0) return 0;
    let total = 0;
    for (let i = 0; i < cluster.length - 1; i += 1) total += cluster[i].fullHeight;
    total += cluster[cluster.length - 1].firstLineHeight;
    return total;
  };

  /**
   * Range-aware ref count. Used by the slicer to compute band overhead
   * (separator + per-extra-ref gap + safety margin) for the candidate slice.
   */
  const getFootnoteRefCountForBlockId = (blockId: string, pmStart?: number, pmEnd?: number): number => {
    const entries = footnoteAnchorsByBlockId.get(blockId);
    if (!entries || entries.length === 0) return 0;
    if (pmStart == null || pmEnd == null) return entries.length;
    let count = 0;
    for (const e of entries) {
      if (e.pmPos >= pmStart && e.pmPos <= pmEnd) count += 1;
    }
    return count;
  };

  /**
   * SD-2656: per-page footnote-band overhead in pixels. Matches the planner's
   * data-driven formula (incrementalLayout.ts:1488 — `separatorBefore +
   * separatorHeight + topPadding + (refs-1)*gap`). The slicer consults this
   * via ctx so its body-fit budget matches the planner's band-size budget
   * exactly. The defaults below mirror the planner's defaults so legacy /
   * test callers that don't populate overhead fields still get correct math.
   */
  const getFootnoteBandOverhead = (() => {
    const fn = options.footnotes as
      | {
          topPadding?: number;
          dividerHeight?: number;
          separatorSpacingBefore?: number;
          gap?: number;
        }
      | undefined;
    const safeNum = (v: number | undefined, fallback: number): number =>
      typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : fallback;
    // Defaults match incrementalLayout.ts:1330-1342 (gap=2, topPadding=6,
    // dividerHeight=6) and DEFAULT_FOOTNOTE_SEPARATOR_SPACING_BEFORE=12.
    // The planner threads its measured `separatorSpacingBefore` (typically
    // the first-fn lineHeight) through `options.footnotes` so subsequent
    // passes converge with this slicer.
    const topPadding = safeNum(fn?.topPadding, 6);
    const dividerHeight = safeNum(fn?.dividerHeight, 6);
    const separatorSpacingBefore = safeNum(fn?.separatorSpacingBefore, 12);
    const gap = safeNum(fn?.gap, 2);
    return (refsTotal: number): number => {
      if (refsTotal <= 0) return 0;
      return topPadding + dividerHeight + separatorSpacingBefore + Math.max(0, refsTotal - 1) * gap;
    };
  })();

  // Paginator encapsulation for page/column helpers
  let pageCount = 0;
  // Page numbering state
  let activeNumberFormat: PageNumberFormat = 'decimal';
  let activePageCounter = 1;
  let activeSectionPageCounterStart = activePageCounter;
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
  const getSectionMetadata = (sectionIndex: number) =>
    sectionMetadataList.find((section, fallbackIndex) => (section.sectionIndex ?? fallbackIndex) === sectionIndex);
  const runtimeSectionRefsByIndex = new Map<number, SectionRefs>();
  const buildHeaderFooterResolutionSections = (): HeaderFooterResolutionSection[] => {
    const sectionIndexes = new Set<number>();
    sectionMetadataList.forEach((section, fallbackIndex) => sectionIndexes.add(section.sectionIndex ?? fallbackIndex));
    runtimeSectionRefsByIndex.forEach((_refs, sectionIndex) => sectionIndexes.add(sectionIndex));
    if (sectionIndexes.size === 0) sectionIndexes.add(0);

    return Array.from(sectionIndexes)
      .sort((a, b) => a - b)
      .map((sectionIndex) => {
        const metadata = getSectionMetadata(sectionIndex);
        const runtimeRefs = runtimeSectionRefsByIndex.get(sectionIndex);
        return {
          sectionIndex,
          titlePg: metadata?.titlePg === true,
          headerRefs: runtimeRefs?.headerRefs ?? metadata?.headerRefs,
          footerRefs: runtimeRefs?.footerRefs ?? metadata?.footerRefs,
        };
      });
  };
  const hasAnyHeaderFooterRefs = (sections: HeaderFooterResolutionSection[], kind: 'header' | 'footer'): boolean => {
    const refKey = kind === 'header' ? 'headerRefs' : 'footerRefs';
    return sections.some((section) => Object.values(section[refKey] ?? {}).some(Boolean));
  };
  const initialSectionMetadata = sectionMetadataList[0];
  if (initialSectionMetadata?.numbering?.format) {
    activeNumberFormat = initialSectionMetadata.numbering.format;
  }
  if (typeof initialSectionMetadata?.numbering?.start === 'number') {
    activePageCounter = initialSectionMetadata.numbering.start;
    activeSectionPageCounterStart = activePageCounter;
  }
  let activeSectionRefs: SectionRefs | null = null;
  let pendingSectionRefs: SectionRefs | null = null;
  if (initialSectionMetadata?.headerRefs || initialSectionMetadata?.footerRefs) {
    activeSectionRefs = {
      ...(initialSectionMetadata.headerRefs && { headerRefs: initialSectionMetadata.headerRefs }),
      ...(initialSectionMetadata.footerRefs && { footerRefs: initialSectionMetadata.footerRefs }),
    };
    runtimeSectionRefsByIndex.set(initialSectionMetadata.sectionIndex ?? 0, activeSectionRefs);
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

  // SD-3049: read the page-level reserve via a single helper so the same
  // value flows into both `getActiveBottomMargin` (existing behavior) and
  // `getFootnoteReserveForPage` (new — for the block-aware break decision).
  const readFootnoteReserveForPageIndex = (pageIndex: number): number => {
    const reserves = options.footnoteReservedByPageIndex;
    const reserve = Array.isArray(reserves) ? reserves[pageIndex] : 0;
    return typeof reserve === 'number' && Number.isFinite(reserve) && reserve > 0 ? reserve : 0;
  };

  const paginator = createPaginator({
    margins: paginatorMargins,
    getActiveTopMargin: () => activeTopMargin,
    getActiveBottomMargin: () => {
      const pageIndex = Math.max(0, pageCount - 1);
      return activeBottomMargin + readFootnoteReserveForPageIndex(pageIndex);
    },
    getFootnoteReserveForPage: (pageIndex: number) => readFootnoteReserveForPageIndex(pageIndex),
    getActiveHeaderDistance: () => activeHeaderDistance,
    getActiveFooterDistance: () => activeFooterDistance,
    getActivePageSize: () => activePageSize,
    getDefaultPageSize: () => pageSize,
    getActiveColumns: () => activeColumns,
    createPage,
    onNewPage: (state?: PageState) => {
      // apply pending->active and invalidate columns cache (first callback)
      if (!state) {
        // Track if we're entering a new section (pendingSectionIndex was just set)
        const isEnteringNewSection = pendingSectionIndex !== null;
        const isApplyingPendingSection =
          pendingTopMargin !== null ||
          pendingBottomMargin !== null ||
          pendingLeftMargin !== null ||
          pendingRightMargin !== null ||
          pendingHeaderDistance !== null ||
          pendingFooterDistance !== null ||
          pendingPageSize !== null ||
          pendingColumns !== null ||
          pendingOrientation !== null ||
          pendingNumbering !== null ||
          pendingSectionRefs !== null ||
          pendingSectionIndex !== null ||
          pendingVAlign !== undefined ||
          pendingSectionBaseTopMargin !== null ||
          pendingSectionBaseBottomMargin !== null;

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
        if (activeSectionRefs) {
          runtimeSectionRefsByIndex.set(activeSectionIndex, activeSectionRefs);
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
        if (isApplyingPendingSection) {
          activeSectionPageCounterStart = activePageCounter;
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
        const sectionMetadata = getSectionMetadata(activeSectionIndex);
        const titlePgEnabled = sectionMetadata?.titlePg ?? false;
        const alternateHeaders = options.alternateHeaders ?? false;

        // Determine which header/footer variant applies to this page.
        const variantType = selectHeaderFooterVariantForPage({
          sectionPageNumber,
          documentPageNumber: activePageCounter,
          titlePg: titlePgEnabled,
          alternateHeaders,
        });

        const resolutionSections = buildHeaderFooterResolutionSections();
        const headerResolved =
          variantType &&
          resolveEffectiveHeaderFooterRef({
            sections: resolutionSections,
            sectionIndex: activeSectionIndex,
            kind: 'header',
            variant: variantType,
          });
        const footerResolved =
          variantType &&
          resolveEffectiveHeaderFooterRef({
            sections: resolutionSections,
            sectionIndex: activeSectionIndex,
            kind: 'footer',
            variant: variantType,
          });

        const hasHeaderRefs = hasAnyHeaderFooterRefs(resolutionSections, 'header');
        const hasFooterRefs = hasAnyHeaderFooterRefs(resolutionSections, 'footer');
        const headerHeight = headerResolved
          ? getHeaderHeightForPage(headerResolved.matchedVariant, headerResolved.refId, activeSectionIndex)
          : variantType && !hasHeaderRefs
            ? getHeaderHeightForPage(variantType, undefined, activeSectionIndex)
            : 0;
        const footerHeight = footerResolved
          ? getFooterHeightForPage(footerResolved.matchedVariant, footerResolved.refId, activeSectionIndex)
          : variantType && !hasFooterRefs
            ? getFooterHeightForPage(variantType, undefined, activeSectionIndex)
            : 0;

        // Adjust margins based on the actual header/footer for this page.
        // Always recalculate to ensure pages without headers reset to base margin
        // (not the inflated margin from a previous page with a header).
        // Use section base margins, not document defaults, for correct per-section behavior.
        const adjustedMargins = clampHeaderFooterInflatedMargins(
          calculateEffectiveTopMargin(headerHeight, activeHeaderDistance, activeSectionBaseTopMargin),
          calculateEffectiveBottomMargin(footerHeight, activeFooterDistance, activeSectionBaseBottomMargin),
          activeSectionBaseTopMargin,
          activeSectionBaseBottomMargin,
          activePageSize.h,
        );
        activeTopMargin = adjustedMargins.top;
        activeBottomMargin = adjustedMargins.bottom;

        layoutLog(
          `[Layout] Page ${newPageNumber}: Using variant '${variantType ?? 'none'}' - headerHeight: ${headerHeight}, footerHeight: ${footerHeight}`,
        );
        layoutLog(
          `[Layout] Page ${newPageNumber}: Adjusted margins - top: ${activeTopMargin}, bottom: ${activeBottomMargin} (base: ${activeSectionBaseTopMargin}, ${activeSectionBaseBottomMargin})`,
        );

        return;
      }

      // second callback: after page creation -> stamp display number, section refs, section index, and advance counter
      if (state?.page) {
        state.page.displayNumber = activePageCounter;
        state.page.numberText = formatPageNumber(activePageCounter, activeNumberFormat);
        state.page.effectivePageNumber = activePageCounter;
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
    colsConfig: ColumnLayout | null;
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
      columnRenderLayoutsEqual(cachedColumnsState.colsConfig ?? undefined, colsConfig) &&
      cachedColumnsState.normalized
    ) {
      return cachedColumnsState.normalized;
    }

    const normalized = normalizeColumns(colsConfig, currentContentWidth);
    cachedColumnsState = {
      state,
      constraintIndex,
      contentWidth: currentContentWidth,
      colsConfig: cloneColumnLayout(colsConfig),
      normalized,
    };
    return normalized;
  };

  // SD-2629: state-aware resolved geometry. Derives from the SAME state's columns + page size +
  // margins (NOT the global latest-section values), so positioning an older page uses that page's
  // own geometry. Behavior-identical to getCurrentColumns for the latest state and constant margins,
  // and more correct for older pages once section margins/size vary.
  const getColumnGeometryForState = (state: PageState): ColumnGeometry[] => {
    // Columns for THIS page: the active mid-page region's config if one applies, else the page's own
    // creation-time snapshot (page.columns, the resolved metadata set in createPage). NOT
    // getActiveColumnsForState, which falls back to the global latest-section columns and would
    // mis-position an older page once columns vary across sections. (SD-2629)
    const cols =
      state.activeConstraintIndex >= 0 && state.constraintBoundaries[state.activeConstraintIndex]
        ? state.constraintBoundaries[state.activeConstraintIndex].columns
        : (state.page.columns ?? { count: 1, gap: 0 });
    const pageWidth = state.page.size?.w ?? pageSize.w;
    // page.margins is always set by createPage but optional in the type; fall back to the current
    // active margins (the guard never fires at runtime).
    const left = state.page.margins?.left ?? activeLeftMargin;
    const right = state.page.margins?.right ?? activeRightMargin;
    return getColumnGeometry(normalizeColumns(cols, pageWidth - (left + right)));
  };

  const columnWidthForState = (state: PageState, columnIndex: number = state.columnIndex): number =>
    getColumnWidth(getColumnGeometryForState(state), columnIndex);

  const columnXForState = (state: PageState, columnIndex: number = state.columnIndex): number =>
    getColumnX(getColumnGeometryForState(state), columnIndex, state.page.margins?.left ?? activeLeftMargin);

  const getCurrentColumnWidth = (): number => {
    const state = states[states.length - 1] ?? null;
    return state ? columnWidthForState(state) : getColumnWidthAt(getCurrentColumns(), 0);
  };

  // Helper to get column X position (state-aware; positions the passed page state, SD-2629).
  const columnX = columnXForState;

  const advanceColumn = paginator.advanceColumn;

  // Start a new mid-page region with different column configuration
  const startMidPageRegion = (state: PageState, newColumns: ColumnLayout): void => {
    // Use the maximum Y reached across all columns so the new region starts
    // below ALL column content, not just the current column's cursor position.
    // This prevents overlap when a multi-column section's columns have unequal heights.
    const regionStartY = Math.max(state.cursorY, state.maxCursorY);
    state.cursorY = regionStartY;
    state.maxCursorY = regionStartY;

    // Record the boundary at the resolved Y position
    const boundary: ConstraintBoundary = {
      y: regionStartY,
      columns: newColumns,
    };
    state.constraintBoundaries.push(boundary);
    state.activeConstraintIndex = state.constraintBoundaries.length - 1;

    // Reset to first column with new configuration
    state.columnIndex = 0;

    layoutLog(`[Layout] *** COLUMNS CHANGED MID-PAGE ***`);
    layoutLog(`  OLD activeColumns: ${JSON.stringify(activeColumns)}`);
    layoutLog(`  NEW activeColumns: ${JSON.stringify(newColumns)}`);
    layoutLog(`  Current page: ${state.page.number}, cursorY: ${state.cursorY}, maxCursorY: ${state.maxCursorY}`);

    // Update activeColumns so subsequent pages use this column configuration
    activeColumns = cloneColumnLayout(newColumns);

    // Invalidate columns cache to ensure recalculation with new region
    cachedColumnsState.state = null;

    const contentWidth = activePageSize.w - (activeLeftMargin + activeRightMargin);
    floatManager.setLayoutContext(
      normalizeColumns(activeColumns, contentWidth),
      { left: activeLeftMargin, right: activeRightMargin },
      activePageSize.w,
    );
  };

  // Build shared maps for column balancing. These are consumed both mid-layout
  // (at continuous section-break boundaries) and post-layout (per-section final
  // page), so we construct them once here rather than rebuilding in each pass.
  const balancingMeasureMap = new Map<string, MeasureData>();
  const blockSectionMap = new Map<string, number>();
  const sectionColumnsMap = new Map<number, ColumnLayout>();
  const sectionHasExplicitColumnBreak = new Set<number>();
  // sectionIndex -> the section's own sectPr `w:type` (ECMA-376 §17.6.22):
  // how the section BEGINS relative to its predecessor — i.e. the type of the
  // break that closes the PREVIOUS section. The break that ENDS section N is
  // therefore `get(N + 1)`. Per ECMA-376 §17.18.77 only a `continuous` break
  // balances the section BEFORE it — `nextPage`, `evenPage`, `oddPage` do
  // not. (The earlier comment here claimed end-break semantics, which led the
  // post-layout gate to key off the wrong section — SD-3359.)
  const sectionEndBreakType = new Map<number, string>();
  // sectionIndex -> whether `<w:type>` was EXPLICIT in the source sectPr.
  // Body sectPrs default to `continuous` when w:type is omitted; Word does
  // NOT balance those single-page docs (sd-1655). Body sectPrs with explicit
  // `<w:type w:val="continuous"/>` DO balance (sd-1480), even single-page.
  // The flag carries the distinction across pm-adapter -> layout-engine.
  const sectionTypeIsExplicit = new Map<number, boolean>();
  // sectionIndex of the LAST section in the document. The body sectPr is
  // always the final section break and represents the end of the document,
  // not an actual mid-document break. Even when its type defaults to
  // `continuous` (DEFAULT_BODY_SECTION_TYPE), there is no break AFTER the
  // last section's content to trigger balancing. Excluding the last section
  // matches Word: a 3-column doc with only a body sectPr (e.g.
  // `sd-1655-col-sep-3-equal-columns`) is NOT balanced — content fills
  // top-to-bottom by column. Without this guard the previous post-layout
  // pass over-balanced single-section docs and split heading/body across
  // columns when Word kept them together.
  let lastSectionIdx: number | null = null;
  // Block IDs of empty paragraphs that exist only to carry sectPr properties.
  // These are invisible in Word's output and must contribute zero height to
  // balanced columns (ECMA-376 §17.18.77). Threading explicit metadata avoids
  // the older `line.width === 0` heuristic, which incorrectly collapsed normal
  // blank paragraphs and caused overlap on the next paragraph.
  const sectPrMarkerBlockIds = new Set<string>();
  // Block IDs of paragraphs with `w:keepLines` (ECMA-376 §17.3.1.14): the
  // author asked Word not to split these, so column balancing must keep them
  // atomic instead of breaking them at a line boundary. (SD-3359)
  const keepLinesBlockIds = new Set<string>();
  // True if any block in the document is a column break. Used as a guard for
  // the document-wide balancing fallback (Nick comment 2): when callers use
  // LayoutOptions.columns without section metadata, we still want Word's
  // balanced-final-page behavior unless the author placed an explicit column
  // break, in which case we preserve their intent.
  let documentHasExplicitColumnBreak = false;
  // True if any block in the document is a sectionBreak. The document-wide
  // fallback only fires when there are NO sectionBreak blocks — otherwise the
  // section-scoped path is the source of truth (even if pm-adapter or a
  // synthetic caller didn't stamp `attrs.sectionIndex`, treating it as a
  // single fallback section would clobber regions that the mid-page handler
  // already balanced).
  let documentHasAnySectionBreak = false;
  // Tracks sections already balanced mid-page — the post-layout pass skips these
  // to avoid double-balancing, which would overlap fragments at the same x/y.
  const alreadyBalancedSections = new Set<number>();
  // Walk blocks in document order. sectionBreak blocks carry attrs.sectionIndex and
  // are emitted BEFORE the first paragraph of their section (see pm-adapter). Every
  // subsequent content block belongs to that section until the next sectionBreak,
  // so we track currentSectionIdx and stamp it on each block. This is required because
  // pm-adapter only sets attrs.sectionIndex on sectionBreak blocks, not paragraphs.
  let currentSectionIdx: number | null = null;
  blocks.forEach((block, idx) => {
    const measure = measures[idx];
    if (measure) {
      balancingMeasureMap.set(block.id, measure as MeasureData);
    }
    const blockWithAttrs = block as { attrs?: { sectionIndex?: number; typeIsExplicit?: boolean } };
    const attrSectionIdx = blockWithAttrs.attrs?.sectionIndex;
    if (block.kind === 'sectionBreak') {
      documentHasAnySectionBreak = true;
      if (typeof attrSectionIdx === 'number') {
        currentSectionIdx = attrSectionIdx;
        lastSectionIdx = attrSectionIdx;
        if (block.columns) {
          sectionColumnsMap.set(attrSectionIdx, cloneColumnLayout(block.columns));
        }
        if (typeof block.type === 'string') {
          sectionEndBreakType.set(attrSectionIdx, block.type);
        }
        if (typeof blockWithAttrs.attrs?.typeIsExplicit === 'boolean') {
          sectionTypeIsExplicit.set(attrSectionIdx, blockWithAttrs.attrs.typeIsExplicit);
        }
      }
    }
    if (currentSectionIdx !== null) {
      blockSectionMap.set(block.id, currentSectionIdx);
      if (block.kind === 'columnBreak') {
        sectionHasExplicitColumnBreak.add(currentSectionIdx);
        documentHasExplicitColumnBreak = true;
      }
    } else if (block.kind === 'columnBreak') {
      documentHasExplicitColumnBreak = true;
    }
    // Block paragraphs that exist only to carry sectPr metadata (pm-adapter
    // sets this attr on otherwise-empty section-property paragraphs). These
    // are invisible in Word's renderer and must not contribute height when
    // balancing columns.
    if (
      block.kind === 'paragraph' &&
      (blockWithAttrs as { attrs?: { sectPrMarker?: boolean } }).attrs?.sectPrMarker === true
    ) {
      sectPrMarkerBlockIds.add(block.id);
    }
    if (
      block.kind === 'paragraph' &&
      (blockWithAttrs as { attrs?: { keepLines?: boolean } }).attrs?.keepLines === true
    ) {
      keepLinesBlockIds.add(block.id);
    }
  });

  // Collect anchored drawings mapped to their anchor paragraphs
  const anchoredDrawings = collectAnchoredDrawings(blocks, measures);
  const anchoredByParagraph = anchoredDrawings.byParagraph;
  const paragraphlessAnchoredDrawings = anchoredDrawings.withoutParagraph;
  // PASS 1C: collect anchored/floating tables mapped to their anchor paragraphs.
  // Tables without any anchor paragraph need explicit fallback placement so
  // floating-only documents still produce a page and render their content.
  const anchoredTables = collectAnchoredTables(blocks, measures);
  const anchoredTablesByParagraph = anchoredTables.byParagraph;
  const paragraphlessAnchoredTables = anchoredTables.withoutParagraph;
  const placedAnchoredIds = new Set<string>();

  // Pre-register page/margin-relative anchored images before the layout loop.
  // These images position themselves relative to the page, not a paragraph, so they
  // must be registered first so all paragraphs can wrap around them.
  const preRegisteredAnchors = collectPreRegisteredAnchors(blocks, measures);

  // Map to store pre-computed positions for page-relative anchors (for fragment creation later).
  // Page placement is resolved at encounter time so anchors follow pagination (e.g., after page breaks).
  const preRegisteredPositions = new Map<string, { anchorX: number; anchorY: number }>();

  const resolveParagraphlessAnchoredTableY = (block: TableBlock, measure: TableMeasure, state: PageState): number => {
    const contentTop = state.topMargin;
    const contentBottom = state.contentBottom;
    const tableHeight = measure.totalHeight ?? 0;

    return resolveAnchoredGraphicY({
      anchor: block.anchor as Parameters<typeof resolveAnchoredGraphicY>[0]['anchor'],
      objectHeight: tableHeight,
      contentTop,
      contentBottom,
      pageBottomMargin: state.page.margins?.bottom ?? activeBottomMargin,
      preRegisteredFallbackToContentTop: true,
    });
  };

  const resolveParagraphlessAnchoredDrawingY = (
    block: ImageBlock | DrawingBlock,
    measure: ImageMeasure | DrawingMeasure,
    state: PageState,
  ): number =>
    resolveAnchoredGraphicY({
      anchor: block.anchor,
      objectHeight: measure.height ?? 0,
      contentTop: state.topMargin,
      contentBottom: state.contentBottom,
      pageBottomMargin: state.page.margins?.bottom ?? activeBottomMargin,
      preRegisteredFallbackToContentTop: true,
    });

  const resolveParagraphlessAnchoredDrawingX = (
    block: ImageBlock | DrawingBlock,
    measure: ImageMeasure | DrawingMeasure,
    state: PageState,
  ): number =>
    block.anchor
      ? computeAnchorX(
          block.anchor,
          state.columnIndex,
          normalizeColumns(activeColumns, activePageSize.w - (activeLeftMargin + activeRightMargin)),
          measure.width,
          { left: activeLeftMargin, right: activeRightMargin },
          activePageSize.w,
        )
      : columnX(state);

  for (const entry of preRegisteredAnchors) {
    // Ensure first page exists
    const state = paginator.ensurePage();

    const contentTop = state.topMargin;
    const contentBottom = state.contentBottom;
    const anchorY = resolveAnchoredGraphicY({
      anchor: entry.block.anchor,
      objectHeight: entry.measure.height ?? 0,
      contentTop,
      contentBottom,
      pageBottomMargin: state.page.margins?.bottom ?? activeBottomMargin,
      preRegisteredFallbackToContentTop: true,
    });

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

    // Store pre-computed position for later use when creating the fragment.
    preRegisteredPositions.set(entry.block.id, { anchorX, anchorY });
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
      const sectionMetadata = Number.isFinite(metadataIndex) ? getSectionMetadata(metadataIndex) : undefined;
      if (sectionMetadata?.numbering) {
        if (isFirstSection) {
          // First section: apply immediately
          if (sectionMetadata.numbering.format) activeNumberFormat = sectionMetadata.numbering.format;
          if (typeof sectionMetadata.numbering.start === 'number') {
            activePageCounter = sectionMetadata.numbering.start;
            activeSectionPageCounterStart = activePageCounter;
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
            activeSectionPageCounterStart = activePageCounter;
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

        // Identify the ending section from the current page's fragments.
        // `activeSectionIndex` only updates at page boundaries, so for continuous
        // mid-page section breaks it's stale. Walk back through page fragments
        // to find the most recent section index that isn't the new one — that's
        // the section that's ending.
        let endingSectionIndex: number | null = null;
        for (let i = state.page.fragments.length - 1; i >= 0; i--) {
          const mapped = blockSectionMap.get(state.page.fragments[i].blockId);
          if (typeof mapped === 'number' && mapped !== metadataIndex) {
            endingSectionIndex = mapped;
            break;
          }
        }
        const endingSectionColumns =
          endingSectionIndex !== null ? sectionColumnsMap.get(endingSectionIndex) : undefined;
        const willBalance =
          endingSectionIndex !== null &&
          !!endingSectionColumns &&
          resolveColumnCount(endingSectionColumns) > 1 &&
          !sectionHasExplicitColumnBreak.has(endingSectionIndex);

        // Balance BEFORE any forced page break. After balancing, all of the
        // ending section's fragments are repositioned within the section's own
        // vertical region — there's no risk of the new 1-col region overwriting
        // prior column content, because the cursor moves to maxY below them.
        //
        // `willBalance` is a coarse approval: balanceSectionOnPage has its own
        // late skip conditions (unequal column widths, zero remaining height,
        // section content too small for shouldSkipBalancing's thresholds) that
        // can return null even when willBalance was true. The page-break
        // fallback below must consider the actual balance outcome, not just
        // willBalance, otherwise we leave the new region starting on the same
        // page from a stale column index and overwriting the previous
        // section's column content.
        let balanceResult: { maxY: number } | null = null;
        if (willBalance) {
          // The current region starts at the last constraint boundary's Y, or at
          // the page's top margin if no mid-page region change has happened yet.
          const lastBoundary = state.constraintBoundaries[state.constraintBoundaries.length - 1];
          const activeRegionTop = lastBoundary?.y ?? activeTopMargin;
          const availableHeight = activePageSize.h - activeBottomMargin - activeRegionTop;
          const contentWidth = activePageSize.w - (activeLeftMargin + activeRightMargin);
          const normalized = normalizeColumns(endingSectionColumns!, contentWidth);
          balanceResult = balanceSectionOnPage({
            fragments: state.page.fragments as BalancingFragment[],
            sectionIndex: endingSectionIndex!,
            sectionColumns: toBalancingColumns(normalized),
            sectionHasExplicitColumnBreak: false,
            blockSectionMap,
            margins: { left: activeLeftMargin },
            topMargin: activeRegionTop,
            columnWidth: normalized.width,
            availableHeight,
            measureMap: balancingMeasureMap,
            sectPrMarkerBlockIds,
            keepLinesBlockIds,
          });
          if (balanceResult) {
            // Collapse both cursors to the balanced section bottom so the new
            // region starts there, not below an unbalanced tallest column.
            state.cursorY = balanceResult.maxY;
            state.maxCursorY = balanceResult.maxY;
            alreadyBalancedSections.add(endingSectionIndex!);
          }
        }
        if (balanceResult === null && columnIndexBefore >= resolveColumnCount(newColumns)) {
          // No balancing applied (either willBalance was false, or
          // balanceSectionOnPage skipped late). Reducing column count without
          // balancing means starting the new region at col 0 could overwrite
          // earlier column content. Force a fresh page to avoid that.
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
        // Reclaim depends on whether the previous paragraph suppresses its own after-spacing
        const prevSuppressAfter = shouldSuppressOwnSpacing(
          state.lastParagraphStyleId,
          state.lastParagraphContextualSpacing,
          firstMemberStyleId,
        );
        const prevTrailing =
          Number.isFinite(state.trailingSpacing) && state.trailingSpacing > 0 ? state.trailingSpacing : 0;
        const effectiveAvailableHeight = prevSuppressAfter ? availableHeight + prevTrailing : availableHeight;

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
            // Per-paragraph: each side independently suppresses its own spacing
            const prevSuppressAfter = shouldSuppressOwnSpacing(
              state.lastParagraphStyleId,
              state.lastParagraphContextualSpacing,
              currentStyleId,
            );
            const currSuppressBefore = shouldSuppressOwnSpacing(
              currentStyleId,
              currentContextualSpacing,
              state.lastParagraphStyleId,
            );
            let effectiveSpacingBefore: number;
            if (prevSuppressAfter && currSuppressBefore) {
              effectiveSpacingBefore = 0;
            } else if (prevSuppressAfter) {
              effectiveSpacingBefore = spacingBefore;
            } else if (currSuppressBefore) {
              effectiveSpacingBefore = 0;
            } else {
              effectiveSpacingBefore = Math.max(spacingBefore - prevTrailing, 0);
            }
            const currentHeight = getMeasureHeight(paraBlock, measure);
            const nextHeight = getMeasureHeight(nextBlock, nextMeasure);

            const nextIsParagraph = nextBlock.kind === 'paragraph' && nextMeasure.kind === 'paragraph';
            const nextSpacingBefore = nextIsParagraph ? getParagraphSpacingBefore(nextBlock) : 0;
            const nextStyleId =
              nextIsParagraph && typeof nextBlock.attrs?.styleId === 'string' ? nextBlock.attrs?.styleId : undefined;
            const nextContextualSpacing = nextIsParagraph && asBoolean(nextBlock.attrs?.contextualSpacing);

            const currSuppressAfter = shouldSuppressOwnSpacing(currentStyleId, currentContextualSpacing, nextStyleId);
            const nextSuppressBefore =
              nextIsParagraph && shouldSuppressOwnSpacing(nextStyleId, nextContextualSpacing, currentStyleId);
            const effectiveSpacingAfter = currSuppressAfter ? 0 : spacingAfter;
            const effectiveNextSpacingBefore = nextSuppressBefore ? 0 : nextSpacingBefore;
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

            const effectiveAvailableHeight = prevSuppressAfter ? availableHeight + prevTrailing : availableHeight;
            if (combinedHeight > effectiveAvailableHeight && state.page.fragments.length > 0) {
              state = paginator.advanceColumn(state);
            }
          }
        }
      }

      /**
       * Contextual spacing suppression for spacingAfter.
       * Per-paragraph: current paragraph suppresses its own after-spacing when
       * it has contextualSpacing and the next paragraph shares the same styleId.
       */
      let overrideSpacingAfter: number | undefined;
      const curStyleId = typeof paraBlock.attrs?.styleId === 'string' ? paraBlock.attrs.styleId : undefined;
      const curContextualSpacing = asBoolean(paraBlock.attrs?.contextualSpacing);
      if (curContextualSpacing && curStyleId) {
        const nextBlock = index < blocks.length - 1 ? blocks[index + 1] : null;
        if (nextBlock?.kind === 'paragraph') {
          const nextPara = nextBlock as ParagraphBlock;
          const nextStyleId = typeof nextPara.attrs?.styleId === 'string' ? nextPara.attrs?.styleId : undefined;
          if (shouldSuppressOwnSpacing(curStyleId, curContextualSpacing, nextStyleId)) {
            overrideSpacingAfter = 0;
          }
        }
      }

      layoutParagraphBlock(
        {
          block,
          measure,
          columnWidth: getCurrentColumnWidth(),
          ensurePage: paginator.ensurePage,
          advanceColumn: paginator.advanceColumn,
          columnX,
          floatManager,
          remeasureParagraph: options.remeasureParagraph,
          overrideSpacingAfter,
          getFootnoteDemandForBlockId,
          getFootnoteRefCountForBlockId,
          getFootnoteBandOverhead,
          getFootnoteAnchorsForBlockId,
        },
        anchorsForPara || tablesForPara
          ? {
              anchoredDrawings: anchorsForPara,
              anchoredTables: tablesForPara,
              columnWidth: getCurrentColumnWidth(),
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

      // Advance body cursor below wrapping anchored tables (placed before paragraph layout).
      if (tablesForPara) {
        const state = paginator.ensurePage();
        let tableBottomY = state.cursorY;
        for (const { block: tableBlock, measure: tableMeasure } of tablesForPara) {
          if (!placedAnchoredIds.has(tableBlock.id)) continue;
          const wrapType = tableBlock.wrap?.type ?? 'None';
          if (wrapType === 'None') continue;
          const tableFragment = state.page.fragments.find(
            (fragment) => fragment.kind === 'table' && fragment.blockId === tableBlock.id,
          );
          if (!tableFragment || tableFragment.kind !== 'table') continue;
          const bottom = tableFragment.y + (tableMeasure.totalHeight ?? 0);
          const distBottom = tableBlock.wrap?.distBottom ?? 0;
          if (bottom + distBottom > tableBottomY) tableBottomY = bottom + distBottom;
        }
        state.cursorY = tableBottomY;
        state.maxCursorY = Math.max(state.maxCursorY, state.cursorY);
      }
      continue;
    }
    if (block.kind === 'image') {
      if (measure.kind !== 'image') {
        throw new Error(`layoutDocument: expected image measure for block ${block.id}`);
      }

      // Check if this is a pre-registered page-relative anchor
      const preRegPos = preRegisteredPositions.get(block.id);
      if (preRegPos && Number.isFinite(preRegPos.anchorX) && Number.isFinite(preRegPos.anchorY)) {
        // Use pre-computed coordinates, but place on the current pagination page where this block is encountered.
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
          maxWidth = columnWidthForState(state);
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
          sourceAnchor: imgBlock.sourceAnchor,
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

      // Check if this is a pre-registered page-relative anchor
      const preRegPos = preRegisteredPositions.get(block.id);
      if (preRegPos && Number.isFinite(preRegPos.anchorX) && Number.isFinite(preRegPos.anchorY)) {
        // Use pre-computed coordinates, but place on the current pagination page where this block is encountered.
        const state = paginator.ensurePage();
        const drawBlock = block as DrawingBlock;
        const drawMeasure = measure as DrawingMeasure;
        const contentMeasures =
          drawBlock.drawingKind === 'textboxShape' && typeof options.remeasureParagraph === 'function'
            ? layoutTextboxContent(drawBlock, options.remeasureParagraph)
            : undefined;

        const fragment: DrawingFragment = {
          kind: 'drawing',
          blockId: drawBlock.id,
          drawingKind: drawBlock.drawingKind,
          x: preRegPos.anchorX,
          y: preRegPos.anchorY,
          width: drawMeasure.width,
          height: drawMeasure.height,
          geometry: drawMeasure.geometry,
          scale: drawMeasure.scale,
          isAnchored: true,
          behindDoc: drawBlock.anchor?.behindDoc === true,
          zIndex: getFragmentZIndex(drawBlock),
          drawingContentId: drawBlock.drawingContentId,
          sourceAnchor: drawBlock.sourceAnchor,
        };

        if (contentMeasures) {
          fragment.contentMeasures = contentMeasures;
        }

        const attrs = drawBlock.attrs as Record<string, unknown> | undefined;
        if (attrs?.pmStart != null) fragment.pmStart = attrs.pmStart as number;
        if (attrs?.pmEnd != null) fragment.pmEnd = attrs.pmEnd as number;

        state.page.fragments.push(fragment);
        placedAnchoredIds.add(drawBlock.id);
        continue;
      }

      layoutDrawingBlock({
        block: block as DrawingBlock,
        measure: measure as DrawingMeasure,
        columns: getCurrentColumns(),
        ensurePage: paginator.ensurePage,
        advanceColumn: paginator.advanceColumn,
        columnX,
        textboxContentMeasures:
          block.drawingKind === 'textboxShape' && typeof options.remeasureParagraph === 'function'
            ? layoutTextboxContent(block, options.remeasureParagraph)
            : undefined,
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
        columnWidth: getCurrentColumnWidth(),
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
      const currentState = states[states.length - 1];
      if (shouldSkipRedundantPageBreakBefore(block as PageBreakBlock, currentState)) {
        continue;
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

      if (state.columnIndex < resolveColumnCount(activeCols) - 1) {
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
  paginator.pruneTrailingEmptyPages();

  const resetPaginationStateForBlankPageFallback = (): void => {
    pageCount = 0;
    activePageCounter = activeSectionPageCounterStart;
    sectionFirstPageNumbers.clear();
  };

  const shouldUseBlankPageFallback = pages.length === 0;

  if (
    shouldUseBlankPageFallback &&
    ((allowParagraphlessAnchoredTableFallback && paragraphlessAnchoredTables.length > 0) ||
      (allowParagraphlessAnchoredDrawingFallback && paragraphlessAnchoredDrawings.length > 0) ||
      (allowSectionBreakOnlyPageFallback && hasOnlySectionBreakBlocks(blocks)))
  ) {
    resetPaginationStateForBlankPageFallback();
  }

  if (
    allowParagraphlessAnchoredDrawingFallback &&
    shouldUseBlankPageFallback &&
    paragraphlessAnchoredDrawings.length > 0
  ) {
    const state = paginator.ensurePage();

    for (const { block, measure } of paragraphlessAnchoredDrawings) {
      if (placedAnchoredIds.has(block.id)) continue;

      const anchorX = resolveParagraphlessAnchoredDrawingX(block, measure, state);
      const anchorY = resolveParagraphlessAnchoredDrawingY(block, measure, state);

      if (block.kind === 'image' && measure.kind === 'image') {
        const pageContentHeight = Math.max(0, state.contentBottom - state.topMargin);
        const aspectRatio = measure.width > 0 && measure.height > 0 ? measure.width / measure.height : 1.0;
        const minWidth = 20;
        const minHeight = minWidth / aspectRatio;
        const fragment: ImageFragment = {
          kind: 'image',
          blockId: block.id,
          x: anchorX,
          y: anchorY,
          width: measure.width,
          height: measure.height,
          isAnchored: true,
          behindDoc: block.anchor?.behindDoc === true,
          zIndex: getFragmentZIndex(block),
          metadata: {
            originalWidth: measure.width,
            originalHeight: measure.height,
            maxWidth: activePageSize.w - (activeLeftMargin + activeRightMargin),
            maxHeight: pageContentHeight,
            aspectRatio,
            minWidth,
            minHeight,
          },
          sourceAnchor: block.sourceAnchor,
        };
        const attrs = block.attrs as Record<string, unknown> | undefined;
        if (attrs?.pmStart != null) fragment.pmStart = attrs.pmStart as number;
        if (attrs?.pmEnd != null) fragment.pmEnd = attrs.pmEnd as number;
        state.page.fragments.push(fragment);
        placedAnchoredIds.add(block.id);
        continue;
      }

      if (block.kind === 'drawing' && measure.kind === 'drawing') {
        const contentMeasures =
          block.drawingKind === 'textboxShape' && typeof options.remeasureParagraph === 'function'
            ? layoutTextboxContent(block, options.remeasureParagraph)
            : undefined;
        const fragment: DrawingFragment = {
          kind: 'drawing',
          blockId: block.id,
          drawingKind: block.drawingKind,
          x: anchorX,
          y: anchorY,
          width: measure.width,
          height: measure.height,
          geometry: measure.geometry,
          scale: measure.scale,
          isAnchored: true,
          behindDoc: block.anchor?.behindDoc === true,
          zIndex: getFragmentZIndex(block),
          drawingContentId: block.drawingContentId,
          sourceAnchor: block.sourceAnchor,
        };
        if (contentMeasures) {
          fragment.contentMeasures = contentMeasures;
        }
        const attrs = block.attrs as Record<string, unknown> | undefined;
        if (attrs?.pmStart != null) fragment.pmStart = attrs.pmStart as number;
        if (attrs?.pmEnd != null) fragment.pmEnd = attrs.pmEnd as number;
        state.page.fragments.push(fragment);
        placedAnchoredIds.add(block.id);
      }
    }
  }

  if (allowParagraphlessAnchoredTableFallback && shouldUseBlankPageFallback && paragraphlessAnchoredTables.length > 0) {
    const state = paginator.ensurePage();

    for (const { block: tableBlock, measure: tableMeasure } of paragraphlessAnchoredTables) {
      const columnWidthForTable = getCurrentColumnWidth();
      const totalWidth = tableMeasure.totalWidth ?? 0;
      const shouldFlowInline = isAnchoredTableFullWidth(tableBlock, tableMeasure, columnWidthForTable);

      if (shouldFlowInline) {
        continue;
      }

      const anchorY = resolveParagraphlessAnchoredTableY(tableBlock, tableMeasure, state);
      const anchorX = tableBlock.anchor?.offsetH ?? columnX(state);

      floatManager.registerTable(tableBlock, tableMeasure, anchorY, state.columnIndex, state.page.number);
      state.page.fragments.push(createAnchoredTableFragment(tableBlock, tableMeasure, anchorX, anchorY));
    }
  }

  if (allowSectionBreakOnlyPageFallback && shouldUseBlankPageFallback && hasOnlySectionBreakBlocks(blocks)) {
    paginator.ensurePage();
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

  // Apply column balancing per section. For each section with a multi-column layout,
  // find the final page that carries any of its fragments and balance those fragments.
  // Earlier pages of a multi-page section are always fully filled (content overflowed
  // to reach them), so balancing is a no-op there. This replaces the previous
  // "last page of document" heuristic with proper per-section balancing — required
  // to match Word's behavior when a document has multiple multi-column sections
  // separated by continuous or next-page breaks.
  //
  // Mid-page continuous breaks are handled in the layout loop itself (see the
  // forceMidPageRegion branch above). This post-layout pass handles sections that
  // end at a page boundary or at document end.
  //
  // Document-wide fallback: when callers pass `LayoutOptions.columns` directly
  // without sectionBreak metadata, pm-adapter never stamps sectionIndex on any
  // block and `sectionColumnsMap` stays empty. Synthesize a single virtual
  // section that spans the whole document so multi-column callers still get
  // their final page balanced (preserves the pre-SD-2452 behavior). Skip when
  // the document carries an explicit column break — author intent wins.
  const FALLBACK_SECTION_IDX = -1;
  if (
    sectionColumnsMap.size === 0 &&
    !documentHasAnySectionBreak &&
    resolveColumnCount(activeColumns) > 1 &&
    !documentHasExplicitColumnBreak
  ) {
    sectionColumnsMap.set(FALLBACK_SECTION_IDX, cloneColumnLayout(activeColumns));
    for (const block of blocks) {
      blockSectionMap.set(block.id, FALLBACK_SECTION_IDX);
    }
  }

  for (const [sectionIdx, sectionCols] of sectionColumnsMap) {
    if (resolveColumnCount(sectionCols) <= 1) continue;
    if (sectionHasExplicitColumnBreak.has(sectionIdx)) continue;
    if (alreadyBalancedSections.has(sectionIdx)) continue;

    // Gate balancing per ECMA-376 §17.18.77 + empirical Word behavior. The
    // section type defaults to `nextPage` for any sectPr without `<w:type>`,
    // so we lean on `typeIsExplicit` to know what was actually authored:
    //
    //   - Explicit `<w:type w:val="continuous"/>` ending the section (or
    //     anywhere in the doc) signals continuous flow. Word balances the
    //     adjacent multi-column sections.
    //   - A multi-page multi-column section is balanced on its last page
    //     regardless of explicitness — this is the long-standing
    //     two_column_two_page-arial p17 behavior driven by SD-2646.
    //
    // Skip-when-not-allowed is the default. The three allowed scenarios:
    //
    //   1. Mid-doc explicit continuous: section's own end-break is
    //      `continuous` AND it is not the last section. Covers spec-test-1..5
    //      and sd-2326 (explicit continuous mid-doc).
    //
    //   2. Doc-wide explicit continuous + non-explicitly-non-continuous
    //      section: the doc has at least one EXPLICIT continuous break
    //      somewhere AND this section's type was NOT explicitly set to a
    //      page-forcing type. Covers sd-1480-two-col-tab-positions: section 0
    //      ends with default `nextPage` but the body sectPr has explicit
    //      `continuous` — Word balances 6 entries 3+3 on a single page.
    //
    //   3. Multi-page section: any section whose content spans more than one
    //      page. Covers `two_column_two_page-arial 2` p17 (body default,
    //      single section, 17 pages → balanced 3+2 on the final page).
    //
    // Skip path covers `sd-1655-col-sep-3-equal-columns` (single section,
    // body without `<w:type>`, single page, 3-col): no scenario fires →
    // Word fills column-by-column without balancing.
    //
    // FALLBACK_SECTION_IDX (-1) bypasses the gate — synthesized only when
    // pm-adapter emitted no section metadata at all.
    if (sectionIdx !== FALLBACK_SECTION_IDX) {
      const endBreakType = sectionEndBreakType.get(sectionIdx);
      const typeIsExplicit = sectionTypeIsExplicit.get(sectionIdx) === true;
      const isLast = lastSectionIdx !== null && sectionIdx === lastSectionIdx;

      // Per ECMA-376 §17.18.77, a continuous break balances the section it
      // ENDS — i.e., the section BEFORE the break, not the section that
      // contains or follows it. When the body sectPr authors an explicit
      // continuous break, the affected section is the one IMMEDIATELY
      // preceding the body. Compare:
      //
      //   sd-1480: 2 sections; body (section 1) is explicit-continuous,
      //            section 0 has the 2-col content. Word balances section 0
      //            (3+3) — exactly bodyExplicitContinuousIdx - 1.
      //   mixed-columns-tabs-tnr: body explicit-continuous, body has the
      //            2-col Test list, section 0 is 1-col descriptions. Word
      //            does NOT balance section 1 (14+5 column-flow); the
      //            body-as-trigger applies to section 0 (single-col, no-op).
      //
      // Earlier this rule used a doc-wide `docHasExplicitContinuous` flag,
      // which over-fired for any multi-col section in the document whenever
      // some other section was explicit-continuous — including a single-page
      // body section with omitted `<w:type>` that should match sd-1655's
      // skip rule. Tying it to bodyExplicitContinuousIdx − 1 (the section
      // the break actually ends) restores ECMA-correct scope.
      const bodyExplicitContinuousIdx =
        lastSectionIdx !== null &&
        sectionTypeIsExplicit.get(lastSectionIdx) === true &&
        sectionEndBreakType.get(lastSectionIdx) === 'continuous'
          ? lastSectionIdx
          : null;

      const isExplicitNonContinuous =
        typeIsExplicit && (endBreakType === 'nextPage' || endBreakType === 'evenPage' || endBreakType === 'oddPage');

      // Page-count probe used by both the multi-page allow rule (3) and the
      // mid-doc multi-page skip below. Computed once and short-circuits at >1.
      let sectionPagesCount = 0;
      for (const p of pages) {
        if (p.fragments.some((f) => blockSectionMap.get(f.blockId) === sectionIdx)) {
          sectionPagesCount += 1;
          if (sectionPagesCount > 1) break;
        }
      }
      const isMultiPage = sectionPagesCount > 1;

      // Mid-doc multi-page multi-column sections: Word does NOT balance the
      // last page. ECMA's "minimum section height" balancing makes sense for
      // single-page sections (rebalancing visibly shrinks the section) but
      // not for multi-page sections whose height is already pinned by the
      // page boundary — last-page rebalancing would just reshuffle a
      // handful of overflow fragments. Verified against:
      //   layout/ivosass-sub p3   (section 1, mid-doc, 2-page, 4 overflow
      //                            fragments → Word leaves them in col 0).
      //   lists/saas_original p4  (similar — overflow content stays single).
      // Multi-page LAST sections still balance via rule 3 below
      // (two_column_two_page-arial 2 p17 keeps its 3+2 split).
      if (isMultiPage && !isLast) continue;

      // The per-section type is the type of the break that BEGINS the section
      // (its own sectPr `w:type`, §17.6.22) — i.e. the break that closes the
      // PREVIOUS section. The break that ends section N is therefore section
      // N+1's begin type. Keying rule 1 off the section's OWN type balanced a
      // 2-col section that merely STARTED continuous even when it ended at a
      // nextPage break — Word only balances when the break AFTER the section
      // is continuous (§17.18.77 note, SD-3359 V6 repro). The next-is-body
      // case is excluded here: a body sectPr defaults to `continuous` when
      // `<w:type>` is omitted and Word does NOT balance then (sd-1655) —
      // rule 2 below owns that boundary and demands explicitness.
      const nextSectionBeginType = sectionEndBreakType.get(sectionIdx + 1);
      const nextIsBody = lastSectionIdx !== null && sectionIdx + 1 === lastSectionIdx;
      const allowedByMidDocContinuous = !isLast && !nextIsBody && nextSectionBeginType === 'continuous';
      // Body-explicit-continuous balances the section IT ENDS, which is the
      // section immediately preceding the body. No doc-wide flag.
      const allowedByBodyExplicitContinuous =
        bodyExplicitContinuousIdx !== null && sectionIdx === bodyExplicitContinuousIdx - 1 && !isExplicitNonContinuous;
      const allowedByMultiPage = isMultiPage;

      if (!allowedByMidDocContinuous && !allowedByBodyExplicitContinuous && !allowedByMultiPage) continue;
    }

    // Find the last page carrying any fragments from this section.
    let lastPageForSection: (typeof pages)[number] | null = null;
    for (const p of pages) {
      if (p.fragments.some((f) => blockSectionMap.get(f.blockId) === sectionIdx)) {
        lastPageForSection = p;
      }
    }
    if (!lastPageForSection) continue;

    // Section-local page geometry. Each page snapshots its own margins and size
    // at startNewPage time (paginator.ts), so different sections with different
    // page setups (margins, paper size, orientation) carry their own values on
    // their pages. Earlier code derived the content box from the FINAL active*
    // state, which silently rewrote earlier sections' fragments using the last
    // section's content width and left margin. Use the target page's metrics.
    const sectionPageSize = lastPageForSection.size ?? pageSize;
    const sectionPageMargins = lastPageForSection.margins;
    const sectionLeftMargin = sectionPageMargins?.left ?? activeLeftMargin;
    const sectionRightMargin = sectionPageMargins?.right ?? activeRightMargin;
    const sectionTopMarginPx = sectionPageMargins?.top ?? activeTopMargin;
    const sectionBottomMargin = sectionPageMargins?.bottom ?? activeBottomMargin;
    const sectionContentWidth = sectionPageSize.w - (sectionLeftMargin + sectionRightMargin);
    const sectionAvailableHeight = sectionPageSize.h - sectionBottomMargin - sectionTopMarginPx;

    const normalized = normalizeColumns(sectionCols, sectionContentWidth);

    balanceSectionOnPage({
      fragments: lastPageForSection.fragments as BalancingFragment[],
      sectionIndex: sectionIdx,
      sectionColumns: toBalancingColumns(normalized),
      sectionHasExplicitColumnBreak: false, // already filtered above
      blockSectionMap,
      margins: { left: sectionLeftMargin },
      topMargin: sectionTopMarginPx,
      columnWidth: normalized.width,
      availableHeight: sectionAvailableHeight,
      measureMap: balancingMeasureMap,
      sectPrMarkerBlockIds,
      keepLinesBlockIds,
    });
  }

  // Serialize constraint boundaries into page.columnRegions so DomPainter can
  // draw per-region overlays (e.g. column separator lines) bounded by the
  // correct Y span. Continuous section breaks with a changed column config
  // push boundaries into PageState.constraintBoundaries during layout; without
  // this step the renderer only sees the page-start column config and would
  // draw a single full-page separator across regions it no longer applies to.
  for (const state of states) {
    const boundaries = state.constraintBoundaries;
    if (boundaries.length === 0) continue;

    const regions: ColumnRegion[] = [];
    // First region spans from the top of the content area to the first boundary.
    // Its columns come from page.columns (set at page creation before any
    // mid-page region change) or fall back to a single-column default so the
    // contract stays self-describing even when the page starts single-column.
    const firstRegionColumns: ColumnLayout = state.page.columns ?? { count: 1, gap: 0 };
    regions.push({
      yStart: state.topMargin,
      yEnd: boundaries[0].y,
      columns: firstRegionColumns,
    });
    for (let i = 0; i < boundaries.length; i++) {
      const start = boundaries[i];
      const end = boundaries[i + 1];
      regions.push({
        yStart: start.y,
        yEnd: end ? end.y : state.contentBottom,
        // Render-facing region metadata: resolve so a count>widths region does not advertise
        // phantom columns to the separator renderer, which reads these configs raw (SD-2629).
        columns: resolveColumnLayout(start.columns),
      });
    }
    state.page.columnRegions = regions;
  }

  // SD-2656: stash each page's actual body-bottom on the Page so the band
  // painter can render the separator immediately under the last body
  // fragment instead of at the legacy reserve-derived position. Trailing
  // paragraph spacing is subtracted because it's "below the last line" and
  // shouldn't push the separator down by that much — but only when the
  // current column's cursorY is the one that set maxCursorY. In a multi-
  // column page, `advanceColumn` preserves maxCursorY across columns while
  // resetting trailingSpacing to 0; the trailingSpacing observed at the
  // page tail belongs to the last column's last fragment, not to whichever
  // fragment set maxCursorY. Subtracting it unconditionally would clip the
  // band up into the body of an earlier, taller column.
  for (let i = 0; i < pages.length && i < paginator.states.length; i++) {
    const s = paginator.states[i];
    const maxY = s.maxCursorY ?? 0;
    const cursorY = s.cursorY ?? 0;
    const trailing = s.trailingSpacing ?? 0;
    const raw = Math.max(maxY, cursorY);
    const trailingAttachedToMax = cursorY >= maxY;
    const adjusted = raw - (trailingAttachedToMax ? trailing : 0);
    (pages[i] as { bodyMaxY?: number }).bodyMaxY = Math.max(s.topMargin ?? 0, adjusted);
  }

  return {
    pageSize,
    pages,
    ...(options.documentBackground ? { documentBackground: options.documentBackground } : {}),
    // Note: columns here reflects the effective default for subsequent pages
    // after processing sections. Page/region-specific column changes are encoded
    // implicitly via fragment positions. Consumers should not assume this is
    // a static document-wide value.
    columns: resolveColumnCount(activeColumns) > 1 ? resolveColumnLayout(activeColumns) : undefined,
  };
}

/**
 * Compute the bottom edge (y + height) of a fragment for bounds tracking.
 */
function computeFragmentBottom(fragment: Fragment, block: FlowBlock, measure: Measure): number {
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
    bottom +=
      typeof fragment.height === 'number' ? fragment.height : ((measure as ImageMeasure | undefined)?.height ?? 0);
  } else if (fragment.kind === 'drawing') {
    bottom +=
      typeof fragment.height === 'number' ? fragment.height : ((measure as DrawingMeasure | undefined)?.height ?? 0);
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

  return bottom;
}

type VerticalBand = {
  start: number;
  end: number;
};

function rangesIntersect(startA: number, endA: number, startB: number, endB: number): boolean {
  return endA > startB && startA < endB;
}

function getPageRelativeMeasurementBand(
  kind: 'header' | 'footer' | undefined,
  constraints: HeaderFooterConstraints,
): VerticalBand | null {
  if (!kind || !constraints.margins) {
    return null;
  }

  const bandSize = kind === 'header' ? constraints.margins.top : constraints.margins.bottom;
  if (!Number.isFinite(bandSize) || bandSize == null || bandSize <= 0) {
    return null;
  }

  return {
    start: 0,
    end: bandSize,
  };
}

/**
 * Determine whether a fragment should be excluded from measurement (pagination) bounds.
 *
 * Excluded fragments:
 * 1. behindDoc anchored fragments — purely decorative z-order, per OOXML spec.
 * 2. Page-relative anchored fragments whose local Y range [y, y+h] does not
 *    intersect [0, canvasHeight] — they are out-of-band and should not inflate
 *    the measurement used by body pagination.
 * 3. Page-relative header/footer overlays that do not intersect the region's
 *    reserved margin band — they should still render, but must not reserve
 *    body space like true header/footer content.
 * 4. Header/footer anchored overlays with wrap=None that cover the full
 *    measurement canvas — `wrap=None` is OOXML's "absolute overlay, no flow
 *    exclusion zone", so by definition such fragments must not reserve body
 *    space. Combined with full-canvas bounds this catches page-covering
 *    background shapes regardless of vRelativeFrom/hRelativeFrom (which the
 *    authoring tool is free to set to column/paragraph for cover pages).
 */
function shouldExcludeFromMeasurement(
  fragment: Fragment,
  block: FlowBlock,
  fragmentBottom: number,
  canvasHeight: number,
  kind: 'header' | 'footer' | undefined,
  constraints: HeaderFooterConstraints,
): boolean {
  const isAnchoredFragment =
    (fragment.kind === 'image' || fragment.kind === 'drawing') &&
    (fragment as { isAnchored?: boolean }).isAnchored === true;

  if (!isAnchoredFragment) return false;

  if (block.kind !== 'image' && block.kind !== 'drawing') {
    throw new Error(
      `Type mismatch: fragment kind is ${fragment.kind} but block kind is ${block.kind} for block ${block.id}`,
    );
  }

  const anchoredBlock = block as ImageBlock | DrawingBlock;

  // behindDoc fragments never affect measurement
  if (anchoredBlock.anchor?.behindDoc) return true;

  // Page-relative anchored fragments that sit entirely outside the measurement band
  // should not inflate pagination height.
  if (isPageRelativeAnchor(anchoredBlock)) {
    const fragmentTop = fragment.y;
    // Exclude if the fragment range [top, bottom] does not intersect [0, canvasHeight]
    if (fragmentBottom <= 0 || fragmentTop >= canvasHeight) {
      return true;
    }
  }

  if (anchoredBlock.anchor?.vRelativeFrom === 'page') {
    const measurementBand = getPageRelativeMeasurementBand(kind, constraints);
    if (measurementBand && !rangesIntersect(fragment.y, fragmentBottom, measurementBand.start, measurementBand.end)) {
      return true;
    }
  }

  // Only treat anchored content as a non-measurement overlay when it is
  // unambiguously a page-covering decoration: wrap=None (no exclusion zone,
  // so by definition the shape never reserves body space) AND fragment size
  // covers the measurement canvas in both dimensions. Real anchored
  // header/footer content uses wrap modes that affect flow (Square / Tight /
  // TopAndBottom / Through), so it continues to reserve space.
  const fragmentHeight = typeof fragment.height === 'number' ? fragment.height : fragmentBottom - fragment.y;
  const fragmentWidth = typeof fragment.width === 'number' ? fragment.width : 0;
  const heightCoversCanvas = Number.isFinite(fragmentHeight) && fragmentHeight >= canvasHeight;
  const widthCoversCanvas =
    Number.isFinite(constraints.width) && constraints.width > 0 && fragmentWidth >= constraints.width;
  const wrapType = anchoredBlock.wrap?.type;
  const isOverlayWrap = wrapType === 'None';

  if (kind && heightCoversCanvas && widthCoversCanvas && isOverlayWrap) {
    return true;
  }

  return false;
}

/**
 * Lays out header or footer content within specified dimensional constraints.
 *
 * Positions blocks within a header/footer region, handling page-relative anchor
 * transformations and computing the actual height required by visible content.
 *
 * When `kind` and `constraints.pageHeight` are provided, page-relative and
 * margin-relative anchored drawings are post-normalized from the synthetic
 * measurement canvas to header/footer-local coordinates.
 *
 * Returns separate measurement bounds (for pagination) and render bounds
 * (for overlay shift). See the Coordinate Contract in the fix plan for details.
 */
export function layoutHeaderFooter(
  blocks: FlowBlock[],
  measures: Measure[],
  constraints: HeaderFooterConstraints,
  kind?: 'header' | 'footer',
  remeasureParagraph?: (block: ParagraphBlock, maxWidth: number, firstLineIndent?: number) => ParagraphMeasure,
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

  const layout = layoutDocument(blocks, measures, {
    pageSize: { w: width, h: height },
    margins: { top: 0, right: 0, bottom: 0, left: 0 },
    allowParagraphlessAnchoredTableFallback: false,
    allowSectionBreakOnlyPageFallback: false,
    remeasureParagraph,
  });

  // Post-normalize page-relative anchored fragment Y positions for footers.
  //
  // The inner layoutDocument() uses the body content height as its page height,
  // but page-relative anchors need the REAL physical page height to resolve
  // bottom/center alignment correctly. This post-correction rewrites their Y
  // to footer-band-local coordinates using the real page geometry.
  //
  // Headers don't need this: the inner layout's page-relative Y is already
  // correct relative to the header container, and the painter handles the
  // container-to-page offset via effectiveOffset subtraction.
  if (kind === 'footer' && constraints.pageHeight != null) {
    normalizeFragmentsForRegion(layout.pages, blocks, measures, kind, constraints);
  }

  const story = kind ? { kind } : undefined;
  if (story) {
    for (const page of layout.pages) {
      page.fragments = page.fragments.map((fragment) => ({
        ...fragment,
        layoutSourceIdentity: buildLayoutSourceIdentityForFragment(fragment, story),
      }));
    }
  }

  // Compute bounds using an index map to avoid building multiple Maps
  const idToIndex = new Map<string, number>();
  for (let i = 0; i < blocks.length; i += 1) {
    idToIndex.set(blocks[i].id, i);
  }

  // Track separate bounds for measurement (pagination) and rendering (overlay shift).
  // Measurement bounds exclude behindDoc and out-of-band page-relative anchored fragments.
  // Render bounds include all visible fragments.
  let measureMinY = 0;
  let measureMaxY = 0;
  let renderMinY = 0;
  let renderMaxY = 0;

  for (const page of layout.pages) {
    for (const fragment of page.fragments) {
      const idx = idToIndex.get(fragment.blockId);
      if (idx == null) continue;
      const block = blocks[idx];
      const measure = measures[idx];

      const bottom = computeFragmentBottom(fragment, block, measure);

      // Track render bounds for all fragments (used by overlay shift in SessionManager)
      if (fragment.y < renderMinY) renderMinY = fragment.y;
      if (bottom > renderMaxY) renderMaxY = bottom;

      // Determine whether this fragment should be excluded from measurement (pagination) bounds
      if (shouldExcludeFromMeasurement(fragment, block, bottom, height, kind, constraints)) continue;

      if (fragment.y < measureMinY) measureMinY = fragment.y;
      if (bottom > measureMaxY) measureMaxY = bottom;
    }
  }

  return {
    height: measureMaxY - measureMinY,
    minY: renderMinY,
    maxY: renderMaxY,
    renderHeight: renderMaxY - renderMinY,
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
  return normalizeColumnLayout(input, contentWidth, COLUMN_EPSILON);
}

// Build balanceSectionOnPage's column input from the RESOLVED (normalized) layout. Both balancing
// call sites must source widths/gaps from `normalized` (sliced to the resolved count), never the raw
// config: raw widths can be longer than the count, which makes the equal-width balancing guard read
// surplus entries (vetoing balancing of columns that render equal) and builds phantom geometry
// columns. Single builder so the two call sites cannot drift apart. (SD-2629)
function toBalancingColumns(normalized: NormalizedColumns): SectionColumnLayout {
  return {
    count: normalized.count,
    gap: normalized.gap,
    width: normalized.width,
    ...(Array.isArray(normalized.widths) ? { widths: normalized.widths } : {}),
    ...(Array.isArray(normalized.gaps) ? { gaps: normalized.gaps } : {}),
    ...(normalized.equalWidth !== undefined ? { equalWidth: normalized.equalWidth } : {}),
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
export {
  buildChapterContextByPage,
  computeDisplayPageNumber,
  formatPageNumber,
  formatPageNumberFieldValue,
  formatSectionPageNumberText,
  normalizeChapterMarkerText,
} from './pageNumbering.js';
export type { ChapterPageInfo, DisplayPageInfo, PageNumberFormat } from './pageNumbering.js';

// Export page token resolution utilities
export { resolvePageNumberTokens } from './resolvePageTokens.js';
export type { NumberingContext, ResolvePageTokensResult } from './resolvePageTokens.js';

// Table utilities consumed by layout-bridge and cross-package sync tests
export { getCellLines, getEmbeddedRowLines, resolveTableFrame, resolveRenderedTableWidth } from './layout-table.js';
export { describeCellRenderBlocks, computeCellSliceContentHeight } from './table-cell-slice.js';
export { layoutTextboxContent } from './layout-textbox.js';

export { SINGLE_COLUMN_DEFAULT } from './section-breaks.js';
