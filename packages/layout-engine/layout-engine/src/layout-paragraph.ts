import type { FloatingObjectManager } from './floating-objects';
import type { PageState } from './paginator';
import type {
  PageMargins,
  ParagraphBlock,
  ParagraphMeasure,
  ParaFragment,
  ImageBlock,
  ImageMeasure,
  ImageFragment,
  ImageFragmentMetadata,
  DrawingBlock,
  DrawingMeasure,
  DrawingFragment,
  ParagraphBorders,
  TableAnchor,
  TableWrap,
} from '@superdoc/contracts';
import {
  computeFragmentPmRange,
  normalizeLines,
  extractBlockPmRange,
  isEmptyTextParagraph,
  shouldSuppressOwnSpacing,
  collapseSpacingBefore,
  rewindPreviousParagraphTrailing,
  computeParagraphLayoutStartY,
} from './layout-utils.js';
import { layoutTextboxContent } from './layout-textbox.js';
import { resolveAnchoredGraphicY, resolveAnchoredGraphicX, getFragmentZIndex } from '@superdoc/contracts';
import { createAnchoredTableFragment, isAnchoredTableFullWidth } from './layout-table.js';
import type { AnchoredTable } from './anchors.js';

/** Points → CSS pixels (96 dpi / 72 pt-per-inch). */
const PX_PER_PT = 96 / 72;

const spacingDebugEnabled = false;

/** Line-scoped tblpY (form field beside label on the same line). */
function isLineScopedTblpY(firstLineHeight: number, offsetV: number): boolean {
  if (firstLineHeight <= 0) return offsetV <= 1;
  return offsetV <= firstLineHeight * 1.5;
}

/** Vertically center a tall single-line form field with its anchor line (Word line-scoped tblpY). */
function anchorForLineScopedFormField(
  anchor: TableAnchor | undefined,
  tableHeight: number,
  firstLineHeight: number,
  layoutOffsetV?: number,
  lineScopedOnAnchor = false,
  wrapType: TableWrap['type'] | undefined = 'None',
): TableAnchor | undefined {
  if (!anchor) return anchor;
  if ((anchor.vRelativeFrom ?? 'paragraph') !== 'paragraph') return anchor;
  if (wrapType !== 'None') return anchor;
  if (!lineScopedOnAnchor) return anchor;
  const offsetV = layoutOffsetV ?? anchor.offsetV ?? 0;
  if (anchor.alignV || firstLineHeight <= 0 || tableHeight <= firstLineHeight) return anchor;
  if (!isLineScopedTblpY(firstLineHeight, offsetV)) return anchor;
  return { ...anchor, vRelativeFrom: 'paragraph', alignV: 'center', offsetV: 0 };
}

type GraphicPlacementAnchorY = Parameters<typeof resolveAnchoredGraphicY>[0]['anchor'];

function graphicAnchorY(anchor: TableAnchor | undefined): GraphicPlacementAnchorY {
  if (!anchor) return undefined;
  const alignV = anchor.alignV;
  const mappedAlignV = alignV === 'top' || alignV === 'center' || alignV === 'bottom' ? alignV : undefined;
  return { vRelativeFrom: anchor.vRelativeFrom, alignV: mappedAlignV, offsetV: anchor.offsetV };
}

function graphicAnchorH(anchor: TableAnchor): Parameters<typeof resolveAnchoredGraphicX>[0] {
  const alignH = anchor.alignH;
  const mappedAlignH = alignH === 'left' || alignH === 'center' || alignH === 'right' ? alignH : undefined;
  return {
    hRelativeFrom: anchor.hRelativeFrom,
    alignH: mappedAlignH,
    offsetH: anchor.offsetH,
  };
}

/**
 * SD-2656: ordered footnote anchor entry. The body slicer reads the candidate
 * anchors for a given PM range and pushes them onto `PageState.footnoteAnchorsThisPage`
 * after committing the slice; the demand formula consumes the resulting list.
 */
export type FootnoteAnchorRef = {
  pmPos: number;
  refId: string;
  fullHeight: number;
  firstLineHeight: number;
};

/**
 * Type definition for Word layout attributes attached to paragraph blocks.
 * This is a subset of the WordParagraphLayoutOutput from @superdoc/word-layout.
 */
type WordLayoutAttrs = {
  /** List marker layout information */
  marker?: {
    /** Width of the marker box in pixels */
    markerBoxWidthPx?: number;
  };
  /**
   * True when list uses firstLine indent pattern (marker at left+firstLine)
   * instead of standard hanging pattern (marker at left-hanging).
   */
  firstLineIndentMode?: boolean;
  /** Horizontal position where paragraph text begins in pixels */
  textStartPx?: number;
};

/**
 * Type definition for paragraph spacing attributes.
 * Represents spacing values in pixels for paragraph layout.
 */
type ParagraphSpacingAttrs = {
  /** Spacing before the paragraph in pixels */
  before?: number;
  /** Spacing after the paragraph in pixels */
  after?: number;
  /** Legacy property for spacing before */
  lineSpaceBefore?: number;
  /** Legacy property for spacing after */
  lineSpaceAfter?: number;
};

/**
 * Type definition for paragraph block attributes accessed during layout.
 * Provides type-safe access to common paragraph properties.
 */
type ParagraphBlockAttrs = {
  /** Spacing configuration for the paragraph */
  spacing?: ParagraphSpacingAttrs;
  /** Tracks which spacing properties were explicitly set on the paragraph */
  spacingExplicit?: {
    before?: boolean;
    after?: boolean;
    line?: boolean;
  };
  /** Style identifier for the paragraph */
  styleId?: string;
  /** Whether to suppress spacing between same-style paragraphs */
  contextualSpacing?: boolean | string | number;
  /** Word layout output for list paragraphs */
  wordLayout?: WordLayoutAttrs;
  /** Frame positioning attributes */
  frame?: {
    wrap?: string;
    x?: number;
    y?: number;
    xAlign?: 'left' | 'right' | 'center';
  };
  /** Float alignment (left, right, center) */
  floatAlignment?: unknown;
  /** Keep all lines of the paragraph on the same page */
  keepLines?: boolean;
  /** Border attributes for the paragraph */
  borders?: ParagraphBorders;
};

const spacingDebugLog = (..._args: unknown[]): void => {
  if (!spacingDebugEnabled) return;
};

/**
 * Type guard to safely access paragraph block attributes.
 * Validates that the attrs property exists and returns it with proper typing.
 *
 * @param block - The paragraph block to extract attributes from
 * @returns Typed paragraph attributes or undefined if attrs is missing
 */
const getParagraphAttrs = (block: ParagraphBlock): ParagraphBlockAttrs | undefined => {
  if (!block.attrs || typeof block.attrs !== 'object') {
    return undefined;
  }
  return block.attrs as ParagraphBlockAttrs;
};

/**
 * Safely extracts a string value from an unknown type.
 * Used for extracting styleId and similar string properties.
 *
 * @param value - The value to extract
 * @returns The value as a string, or undefined if not a string
 */
const asString = (value: unknown): string | undefined => {
  return typeof value === 'string' ? value : undefined;
};

/**
 * Safely extracts a boolean value from OOXML boolean representations.
 * Handles true, 1, '1', 'true', 'on' as truthy values.
 *
 * @param value - The value to convert to boolean
 * @returns Boolean value, or false if value is falsy or invalid
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
 * Safely extracts a finite numeric value, returning 0 for invalid values.
 * Validates that the number is finite (not NaN, Infinity, or -Infinity) and non-negative.
 *
 * @param value - The value to extract and validate
 * @returns A finite non-negative number, or 0 if value is invalid
 *
 * @example
 * ```typescript
 * asSafeNumber(15)        // 15
 * asSafeNumber(NaN)       // 0
 * asSafeNumber(Infinity)  // 0
 * asSafeNumber(-10)       // 0
 * asSafeNumber(null)      // 0
 * ```
 */
const asSafeNumber = (value: unknown): number => {
  if (typeof value !== 'number') {
    return 0;
  }
  if (!Number.isFinite(value) || value < 0) {
    return 0;
  }
  return value;
};

/**
 * Simple hash of paragraph borders for between-border group detection.
 * Two paragraphs form a group when their border hashes match (ECMA-376 §17.3.1.5).
 */
const hashBorders = (borders?: ParagraphBorders): string | undefined => {
  if (!borders) return undefined;
  const side = (b?: { style?: string; width?: number; color?: string; space?: number }) =>
    b ? `${b.style ?? ''},${b.width ?? 0},${b.color ?? ''},${b.space ?? 0}` : '';
  return `${side(borders.top)}|${side(borders.right)}|${side(borders.bottom)}|${side(borders.left)}|${side(borders.between)}`;
};

/**
 * Computes the vertical border expansion for a paragraph fragment.
 * The border's `space` attribute (in points) plus the border width extends
 * the visual box beyond the content area. This ensures cursorY accounts
 * for the full visual height when paragraphs have borders with space.
 */
const computeBorderVerticalExpansion = (borders?: ParagraphBorders): { top: number; bottom: number } => {
  if (!borders) return { top: 0, bottom: 0 };

  // Top border: space (pts) + width (px)
  const topSpace = (borders.top?.space ?? 0) * PX_PER_PT;
  const topWidth = borders.top?.width ?? 0;
  const top = topSpace + topWidth;

  // Bottom border: space (pts) + width (px)
  const bottomSpace = (borders.bottom?.space ?? 0) * PX_PER_PT;
  const bottomWidth = borders.bottom?.width ?? 0;
  const bottom = bottomSpace + bottomWidth;

  return { top, bottom };
};

/**
 * Calculates the first line indent for list markers when remeasuring paragraphs.
 *
 * In Word layout, there are two distinct list marker layout patterns:
 *
 * 1. **firstLineIndentMode** (marker inline with text):
 *    - The marker is positioned at `left + firstLine` and consumes horizontal space on the first line
 *    - Text begins after the marker (at `textStartPx`)
 *    - The first line's available width must account for the marker's width
 *    - This pattern is indicated by `firstLineIndentMode === true`
 *
 * 2. **Standard hanging indent** (marker in hanging area):
 *    - The marker is positioned absolutely in the hanging region at `left - hanging`
 *    - The marker does NOT consume horizontal space from the text flow
 *    - Text begins at `left` on ALL lines (first and subsequent)
 *    - The first line's available width is the same as subsequent lines
 *    - This is the default pattern when `firstLineIndentMode` is not set
 *
 * This function determines which pattern is in use and calculates the appropriate
 * first line indent for the remeasurement operation.
 *
 * @param block - The paragraph block being remeasured
 * @param measure - The current paragraph measurement (may contain marker measurements)
 * @returns The first line indent in pixels. Returns 0 for standard hanging indent,
 *   or the marker width + gutter width for firstLineIndentMode.
 *
 * @example
 * ```typescript
 * // Standard hanging indent - marker doesn't consume first line space
 * const block1 = {
 *   attrs: {
 *     wordLayout: {
 *       marker: { markerBoxWidthPx: 20 },
 *       // firstLineIndentMode is NOT set
 *     }
 *   }
 * };
 * const indent1 = calculateFirstLineIndent(block1, measure);
 * // Returns: 0 (marker is in hanging area)
 *
 * // firstLineIndentMode - marker consumes first line space
 * const block2 = {
 *   attrs: {
 *     wordLayout: {
 *       marker: { markerBoxWidthPx: 20 },
 *       firstLineIndentMode: true
 *     }
 *   }
 * };
 * const indent2 = calculateFirstLineIndent(block2, measure);
 * // Returns: markerWidth + gutterWidth (marker is inline)
 * ```
 */
function calculateFirstLineIndent(block: ParagraphBlock, measure: ParagraphMeasure): number {
  const wordLayout = block.attrs?.wordLayout as WordLayoutAttrs | undefined;

  // Only apply first line indent in firstLineIndentMode
  if (!wordLayout?.firstLineIndentMode) {
    return 0;
  }

  // Ensure marker exists in both wordLayout and measure
  if (!wordLayout.marker || !measure.marker) {
    return 0;
  }

  // Extract marker width with fallback chain and validation
  const markerWidthRaw = measure.marker.markerWidth ?? wordLayout.marker.markerBoxWidthPx ?? 0;
  const markerWidth = Number.isFinite(markerWidthRaw) && markerWidthRaw >= 0 ? markerWidthRaw : 0;

  // Extract gutter width with validation
  const gutterWidthRaw = measure.marker.gutterWidth ?? 0;
  const gutterWidth = Number.isFinite(gutterWidthRaw) && gutterWidthRaw >= 0 ? gutterWidthRaw : 0;

  return markerWidth + gutterWidth;
}

export type ParagraphLayoutContext = {
  block: ParagraphBlock;
  measure: ParagraphMeasure;
  columnWidth: number;
  ensurePage: () => PageState;
  advanceColumn: (state: PageState) => PageState;
  columnX: (state: PageState, columnIndex?: number) => number;
  floatManager: FloatingObjectManager;
  remeasureParagraph?: (block: ParagraphBlock, maxWidth: number, firstLineIndent?: number) => ParagraphMeasure;
  /**
   * Override the paragraph's spacing-after value. Used when contextual spacing
   * should suppress spacing between this paragraph and the next (same-style) paragraph.
   * When undefined, uses the value from block.attrs.spacing.after.
   */
  overrideSpacingAfter?: number;
  /**
   * SD-3049 / SD-2656: footnote demand under the ordered-cluster rule.
   *
   *   demand = sum(fullHeight of cluster[0..N-1]) + firstLineHeight(cluster[N-1])
   *
   * where `cluster` is the ordered list of footnote anchors on the page. The
   * caller passes the already-committed anchors (from PageState) plus the
   * candidate range; this returns the demand assuming the candidate range is
   * appended to the page's cluster.
   *
   * With no committed list, the in-range anchors are treated as the full
   * cluster. With no range, returns the whole-block demand.
   */
  getFootnoteDemandForBlockId?: (
    blockId: string,
    pmStart?: number,
    pmEnd?: number,
    committed?: ReadonlyArray<FootnoteAnchorRef>,
  ) => number;

  /**
   * SD-2656: returns the ordered anchor entries in `[pmStart, pmEnd]` so the
   * slicer can push them onto PageState after accepting a candidate line.
   */
  getFootnoteAnchorsForBlockId?: (
    blockId: string,
    pmStart?: number,
    pmEnd?: number,
  ) => ReadonlyArray<FootnoteAnchorRef>;

  /**
   * SD-2656: companion to getFootnoteDemandForBlockId — returns the number
   * of footnote refs anchored in a given PM range of this block. Used to
   * compute band overhead (separator + per-extra-ref gap + safety margin)
   * for the candidate slice.
   */
  getFootnoteRefCountForBlockId?: (blockId: string, pmStart?: number, pmEnd?: number) => number;

  /**
   * SD-2656: per-page footnote-band overhead in pixels for a given number of
   * anchored refs. The slicer's `effectiveBottom` budget must match the
   * planner's, otherwise body packs onto a page whose band cannot fit the
   * refs. Source of truth lives in the planner (incrementalLayout.ts) and
   * derives from `topPadding + dividerHeight + separatorSpacingBefore +
   * (refs-1)*gap`. When not provided, the slicer falls back to a default
   * formula that matches the planner's default values.
   */
  getFootnoteBandOverhead?: (refsTotal: number) => number;
};

export type AnchoredDrawingEntry = {
  block: ImageBlock | DrawingBlock;
  measure: ImageMeasure | DrawingMeasure;
};

export type ParagraphAnchorsContext = {
  anchoredDrawings?: AnchoredDrawingEntry[];
  anchoredTables?: AnchoredTable[];
  columnWidth: number;
  pageWidth: number;
  pageMargins: PageMargins;
  columns: { width: number; gap: number; count: number };
  placedAnchoredIds: Set<string>;
};

export function layoutParagraphBlock(ctx: ParagraphLayoutContext, anchors?: ParagraphAnchorsContext): void {
  const { block, measure, columnWidth, ensurePage, advanceColumn, columnX, floatManager } = ctx;
  const remeasureParagraph = ctx.remeasureParagraph;

  const blockAttrs = getParagraphAttrs(block);
  const frame = blockAttrs?.frame;

  let lines = normalizeLines(measure);

  // Check if paragraph was measured at a wider width than the current column.
  // This happens when a document has sections with different column counts -
  // text measured for a single-column section may need remeasurement when
  // placed in a multi-column section with narrower columns.
  const measurementWidth = lines[0]?.maxWidth;
  const paraIndent = (block.attrs as { indent?: { left?: number; right?: number } } | undefined)?.indent;
  const indentLeft = typeof paraIndent?.left === 'number' && Number.isFinite(paraIndent.left) ? paraIndent.left : 0;
  const indentRight = typeof paraIndent?.right === 'number' && Number.isFinite(paraIndent.right) ? paraIndent.right : 0;
  const negativeLeftIndent = indentLeft < 0 ? indentLeft : 0;
  const negativeRightIndent = indentRight < 0 ? indentRight : 0;
  // Paragraph content width should honor paragraph indents (including negative values).
  const remeasureWidth = Math.max(1, columnWidth - indentLeft - indentRight);
  let didRemeasureForColumnWidth = false;
  // Track remeasured marker info to ensure fragment gets accurate marker text width
  let remeasuredMarkerInfo: ParagraphMeasure['marker'] | undefined;
  if (
    typeof remeasureParagraph === 'function' &&
    typeof measurementWidth === 'number' &&
    measurementWidth > remeasureWidth
  ) {
    // Use the proper helper to calculate firstLineIndent based on list marker mode.
    // This ensures correct handling of firstLineIndentMode vs standard hanging indent.
    const firstLineIndent = calculateFirstLineIndent(block, measure);
    // Pass columnWidth (not remeasureWidth) because the measurer handles indent subtraction internally.
    // Using remeasureWidth would cause double-subtraction, making line.maxWidth too small for justify calculations.
    const newMeasure = remeasureParagraph(block, columnWidth, firstLineIndent);
    const newLines = normalizeLines(newMeasure);
    lines = newLines;
    didRemeasureForColumnWidth = true;
    // Capture marker info from remeasure (may have updated markerTextWidth)
    if (newMeasure.marker) {
      remeasuredMarkerInfo = newMeasure.marker;
    }
  }

  let fromLine = 0;
  const attrs = getParagraphAttrs(block);
  const spacing = attrs?.spacing ?? {};
  const spacingExplicit = attrs?.spacingExplicit;
  const styleId = asString(attrs?.styleId);
  const contextualSpacing = asBoolean(attrs?.contextualSpacing);
  let spacingBefore = Math.max(0, Number(spacing.before ?? spacing.lineSpaceBefore ?? 0));
  let spacingAfter = ctx.overrideSpacingAfter ?? Math.max(0, Number(spacing.after ?? spacing.lineSpaceAfter ?? 0));
  const emptyTextParagraph = isEmptyTextParagraph(block);
  if (emptyTextParagraph && spacingExplicit) {
    if (!spacingExplicit.before) spacingBefore = 0;
    if (!spacingExplicit.after) spacingAfter = 0;
  }
  /** Original spacing before value, preserved for blank page calculations where no trailing collapse occurs. */
  const baseSpacingBefore = spacingBefore;
  let appliedSpacingBefore = spacingBefore === 0;
  let lastState: PageState | null = null;
  if (spacingDebugEnabled) {
    spacingDebugLog('paragraph spacing attrs', {
      blockId: block.id,
      spacingAttrs: spacing,
      spacingBefore,
      spacingAfter,
    });
  }

  const previewState = ensurePage();

  // Border expansion must be included in anchor Y and float-scan line Y so they match
  // fragment placement (`state.cursorY + borderExpansion.top` in PHASE 2).
  const rawBorderExpansion = computeBorderVerticalExpansion(attrs?.borders);
  const currentBorderHash = hashBorders(attrs?.borders);
  const inBorderGroup = currentBorderHash != null && currentBorderHash === previewState.lastParagraphBorderHash;
  const borderExpansion = {
    top: inBorderGroup ? 0 : rawBorderExpansion.top,
    bottom: rawBorderExpansion.bottom,
  };

  const floatScanParagraphStartY = computeParagraphLayoutStartY({
    cursorY: previewState.cursorY,
    spacingBefore,
    trailingSpacing: previewState.trailingSpacing,
    suppressSpacingBefore: shouldSuppressOwnSpacing(styleId, contextualSpacing, previewState.lastParagraphStyleId),
    rewindTrailingFromPrevious: shouldSuppressOwnSpacing(
      previewState.lastParagraphStyleId,
      previewState.lastParagraphContextualSpacing,
      styleId,
    ),
  });
  const paragraphAnchorBaseY =
    floatScanParagraphStartY + borderExpansion.top - (inBorderGroup ? rawBorderExpansion.bottom : 0);
  let paragraphContentEndY = paragraphAnchorBaseY;

  const registerAnchoredDrawingsAt = (paragraphContentStartY: number) => {
    if (!anchors?.anchoredDrawings?.length) return;
    for (const entry of anchors.anchoredDrawings) {
      if (anchors.placedAnchoredIds.has(entry.block.id)) continue;
      const state = ensurePage();

      const contentTop = state.topMargin;
      const contentBottom = state.contentBottom;
      const anchorY = resolveAnchoredGraphicY({
        anchor: entry.block.anchor,
        objectHeight: entry.measure.height,
        contentTop,
        contentBottom,
        pageBottomMargin: anchors.pageMargins.bottom ?? 0,
        anchorParagraphY: paragraphContentStartY,
        firstLineHeight: measure.lines?.[0]?.lineHeight ?? 0,
      });

      floatManager.registerDrawing(entry.block, entry.measure, anchorY, state.columnIndex, state.page.number);

      const anchorX = entry.block.anchor
        ? resolveAnchoredGraphicX(
            entry.block.anchor,
            state.columnIndex,
            anchors.columns,
            entry.measure.width,
            { left: anchors.pageMargins.left, right: anchors.pageMargins.right },
            anchors.pageWidth,
          )
        : columnX(state);

      const pmRange = extractBlockPmRange(entry.block);
      if (entry.block.kind === 'image' && entry.measure.kind === 'image') {
        const pageContentHeight = Math.max(0, state.contentBottom - state.topMargin);
        const relativeFrom = entry.block.anchor?.hRelativeFrom ?? 'column';
        const marginLeft = anchors.pageMargins.left ?? 0;
        const marginRight = anchors.pageMargins.right ?? 0;
        let maxWidth: number;
        if (relativeFrom === 'page') {
          maxWidth = anchors.columns.count === 1 ? anchors.pageWidth - marginLeft - marginRight : anchors.pageWidth;
        } else if (relativeFrom === 'margin') {
          maxWidth = anchors.pageWidth - marginLeft - marginRight;
        } else {
          maxWidth = anchors.columns.width;
        }

        const aspectRatio =
          entry.measure.width > 0 && entry.measure.height > 0 ? entry.measure.width / entry.measure.height : 1.0;
        const minWidth = 20;
        const minHeight = minWidth / aspectRatio;

        const metadata: ImageFragmentMetadata = {
          originalWidth: entry.measure.width,
          originalHeight: entry.measure.height,
          maxWidth,
          maxHeight: pageContentHeight,
          aspectRatio,
          minWidth,
          minHeight,
        };

        const fragment: ImageFragment = {
          kind: 'image',
          blockId: entry.block.id,
          x: anchorX,
          y: anchorY,
          width: entry.measure.width,
          height: entry.measure.height,
          isAnchored: true,
          behindDoc: entry.block.anchor?.behindDoc === true,
          zIndex: getFragmentZIndex(entry.block),
          metadata,
          sourceAnchor: entry.block.sourceAnchor,
        };
        if (pmRange.pmStart != null) fragment.pmStart = pmRange.pmStart;
        if (pmRange.pmEnd != null) fragment.pmEnd = pmRange.pmEnd;
        state.page.fragments.push(fragment);
      } else if (entry.block.kind === 'drawing' && entry.measure.kind === 'drawing') {
        const contentMeasures =
          entry.block.drawingKind === 'textboxShape' && typeof remeasureParagraph === 'function'
            ? layoutTextboxContent(entry.block, remeasureParagraph)
            : undefined;
        const fragment: DrawingFragment = {
          kind: 'drawing',
          blockId: entry.block.id,
          drawingKind: entry.block.drawingKind,
          x: anchorX,
          y: anchorY,
          width: entry.measure.width,
          height: entry.measure.height,
          geometry: entry.measure.geometry,
          scale: entry.measure.scale,
          isAnchored: true,
          behindDoc: entry.block.anchor?.behindDoc === true,
          zIndex: getFragmentZIndex(entry.block),
          drawingContentId: entry.block.drawingContentId,
          sourceAnchor: entry.block.sourceAnchor,
        };
        if (contentMeasures) {
          (fragment as DrawingFragment & { contentMeasures?: ParagraphMeasure[] }).contentMeasures = contentMeasures;
        }
        if (pmRange.pmStart != null) fragment.pmStart = pmRange.pmStart;
        if (pmRange.pmEnd != null) fragment.pmEnd = pmRange.pmEnd;
        state.page.fragments.push(fragment);
      }

      anchors.placedAnchoredIds.add(entry.block.id);
    }
  };

  registerAnchoredDrawingsAt(paragraphAnchorBaseY);

  const registerAnchoredTablesAt = (paragraphContentStartY: number, entries: AnchoredTable[]) => {
    if (!entries.length) return;
    const columnWidthForTable = anchors!.columnWidth;
    let nextStackY = paragraphContentStartY;
    for (const entry of entries) {
      if (anchors!.placedAnchoredIds.has(entry.block.id)) continue;
      const totalWidth = entry.measure.totalWidth ?? 0;
      if (isAnchoredTableFullWidth(entry.block, entry.measure, columnWidthForTable)) {
        continue;
      }

      const state = ensurePage();
      const contentTop = state.topMargin;
      const contentBottom = state.contentBottom;
      const layoutOffsetV = entry.layoutOffsetV;
      const firstLineHeight = measure.lines?.[0]?.lineHeight ?? 0;
      const wrapType = entry.block.wrap?.type ?? 'None';
      const anchorForY = anchorForLineScopedFormField(
        layoutOffsetV != null && entry.block.anchor
          ? { ...entry.block.anchor, offsetV: layoutOffsetV }
          : entry.block.anchor,
        entry.measure.totalHeight ?? 0,
        firstLineHeight,
        layoutOffsetV,
        entry.lineScopedOnAnchor === true,
        wrapType,
      );
      const anchorY = resolveAnchoredGraphicY({
        anchor: graphicAnchorY(anchorForY),
        objectHeight: entry.measure.totalHeight ?? 0,
        contentTop,
        contentBottom,
        pageBottomMargin: anchors!.pageMargins.bottom ?? 0,
        anchorParagraphY: nextStackY,
        firstLineHeight: measure.lines?.[0]?.lineHeight ?? 0,
      });

      floatManager.registerTable(entry.block, entry.measure, anchorY, state.columnIndex, state.page.number);

      const anchorX = entry.block.anchor
        ? resolveAnchoredGraphicX(
            graphicAnchorH(entry.block.anchor),
            state.columnIndex,
            anchors!.columns,
            totalWidth,
            { left: anchors!.pageMargins.left, right: anchors!.pageMargins.right },
            anchors!.pageWidth,
          )
        : columnX(state);

      state.page.fragments.push(createAnchoredTableFragment(entry.block, entry.measure, anchorX, anchorY));
      anchors!.placedAnchoredIds.add(entry.block.id);

      if (wrapType !== 'None') {
        const bottom = anchorY + (entry.measure.totalHeight ?? 0);
        const distBottom = entry.block.wrap?.distBottom ?? 0;
        nextStackY = Math.max(nextStackY, bottom + distBottom);
      }
    }
  };

  const anchoredTablesForPara = anchors?.anchoredTables ?? [];
  const totalLineHeight = lines.reduce((sum, line) => sum + (line.lineHeight ?? 0), 0);
  const remainingHeightOnStartPage = previewState.contentBottom - paragraphAnchorBaseY;
  const paragraphWillSpanPages = lines.length > 1 && totalLineHeight > remainingHeightOnStartPage;
  const shouldPreLayoutSquareTable = (entry: AnchoredTable) =>
    entry.lineScopedOnAnchor === true && !paragraphWillSpanPages;

  const preLayoutAnchoredTables = anchoredTablesForPara.filter((entry) => {
    const wrapType = entry.block.wrap?.type ?? 'None';
    if (wrapType === 'None') return true;
    return shouldPreLayoutSquareTable(entry);
  });
  registerAnchoredTablesAt(paragraphAnchorBaseY, preLayoutAnchoredTables);

  const isPositionedFrame = frame?.wrap === 'none';
  if (isPositionedFrame) {
    let state = ensurePage();
    if (state.cursorY >= state.contentBottom) {
      state = advanceColumn(state);
    }

    const maxLineWidth = lines.reduce((max, line) => Math.max(max, line.width ?? 0), 0);
    const fragmentWidth = maxLineWidth || columnWidth;

    let x = columnX(state);
    if (frame.xAlign === 'right') {
      x += columnWidth - fragmentWidth;
    } else if (frame.xAlign === 'center') {
      x += (columnWidth - fragmentWidth) / 2;
    }
    if (typeof frame.x === 'number' && Number.isFinite(frame.x)) {
      x += frame.x;
    }

    const yOffset = typeof frame.y === 'number' && Number.isFinite(frame.y) ? frame.y : 0;
    const fragment: ParaFragment = {
      kind: 'para',
      blockId: block.id,
      fromLine: 0,
      toLine: lines.length,
      x,
      y: state.cursorY + yOffset,
      width: fragmentWidth,
      sourceAnchor: block.sourceAnchor,
      ...computeFragmentPmRange(block, lines, 0, lines.length),
    };

    if (measure.marker || remeasuredMarkerInfo) {
      // Prefer remeasured marker info when available (has more accurate markerTextWidth)
      const effectiveMarkerInfo = remeasuredMarkerInfo ?? measure.marker;
      fragment.markerWidth = effectiveMarkerInfo?.markerWidth ?? measure.marker?.markerWidth ?? 0;
      const markerTextWidth = remeasuredMarkerInfo?.markerTextWidth ?? measure.marker?.markerTextWidth;
      if (markerTextWidth != null) {
        fragment.markerTextWidth = markerTextWidth;
      }
    }

    state.page.fragments.push(fragment);
    state.trailingSpacing = 0;
    state.lastParagraphStyleId = styleId;
    state.lastParagraphContextualSpacing = contextualSpacing;
    return;
  }

  // PHASE 1: Scan all lines to find narrowest available width before remeasuring
  // This ensures text wraps correctly between left and right anchored images
  let narrowestWidth = columnWidth;
  let narrowestOffsetX = 0;
  let didRemeasureForFloats = false;

  if (typeof remeasureParagraph === 'function') {
    const tempState = ensurePage();
    let tempY = paragraphAnchorBaseY;

    // Scan through all lines to find the narrowest width
    for (let i = 0; i < lines.length; i++) {
      const lineY = tempY;
      const lineHeight = lines[i]?.lineHeight || 0;

      const { width: availableWidth, offsetX: computedOffset } = floatManager.computeAvailableWidth(
        lineY,
        lineHeight,
        columnWidth,
        tempState.columnIndex,
        tempState.page.number,
      );

      if (availableWidth < narrowestWidth) {
        narrowestWidth = availableWidth;
        narrowestOffsetX = computedOffset;
      }

      tempY += lineHeight;
    }

    // If we found a narrower width, remeasure the entire paragraph once with that width
    const floatConstrained = narrowestWidth < columnWidth || narrowestOffsetX > 0;
    const narrowestRemeasureWidth = floatConstrained
      ? Math.max(1, narrowestWidth - Math.max(indentLeft, 0) - Math.max(indentRight, 0))
      : Math.max(1, narrowestWidth - indentLeft - indentRight);
    if (narrowestRemeasureWidth < remeasureWidth || narrowestOffsetX > 0) {
      // Use the proper helper to calculate firstLineIndent based on list marker mode.
      const firstLineIndent = calculateFirstLineIndent(block, measure);

      const newMeasure = remeasureParagraph(block, narrowestRemeasureWidth, firstLineIndent);
      const newLines = normalizeLines(newMeasure);
      lines = newLines;
      didRemeasureForFloats = true;
      // Capture marker info from remeasure (may have updated markerTextWidth)
      if (newMeasure.marker) {
        remeasuredMarkerInfo = newMeasure.marker;
      }
    }
  }

  // PHASE 2: Layout the paragraph with the remeasured lines
  while (fromLine < lines.length) {
    let state = ensurePage();
    if (state.trailingSpacing == null) state.trailingSpacing = 0;

    // Reclaim the previous paragraph's bottom border expansion when joining a group.
    // The previous paragraph already reserved space for its bottom border, but in a
    // group that border is suppressed — so we move cursorY back to close the gap.
    if (inBorderGroup && fromLine === 0) {
      state.cursorY -= rawBorderExpansion.bottom;
    }

    /**
     * Contextual Spacing Logic (OOXML w:contextualSpacing)
     *
     * Each paragraph independently decides whether to suppress its own spacing.
     * A paragraph suppresses its before/after spacing when it has contextualSpacing
     * enabled and the adjacent paragraph shares the same style. The adjacent
     * paragraph's contextualSpacing flag is NOT consulted.
     *
     * Two independent checks:
     * 1. Current paragraph suppresses its own before-spacing (based on current's flag)
     * 2. Previous paragraph suppresses its own after-spacing (based on previous's flag,
     *    carried in state.lastParagraphContextualSpacing)
     *
     * Input Validation:
     * - trailingSpacing is validated to be a finite, non-negative number
     * - Invalid values (NaN, Infinity, negative, null, undefined) are treated as 0
     */
    // Current paragraph suppresses its own before-spacing
    if (shouldSuppressOwnSpacing(styleId, contextualSpacing, state.lastParagraphStyleId)) {
      spacingBefore = 0;
    }
    // Previous paragraph suppresses its own after-spacing (rewind trailing)
    if (shouldSuppressOwnSpacing(state.lastParagraphStyleId, state.lastParagraphContextualSpacing, styleId)) {
      const prevTrailing = asSafeNumber(state.trailingSpacing);
      if (prevTrailing > 0) {
        state.cursorY = rewindPreviousParagraphTrailing(state.cursorY, prevTrailing);
        state.trailingSpacing = 0;
      }
    }

    /**
     * Keep Lines Together (OOXML w:keepLines)
     *
     * When keepLines is enabled, all lines of the paragraph should stay on the same page.
     * If the paragraph doesn't fit in the remaining space but WOULD fit on a blank page,
     * advance to the next page/column before laying out any lines.
     *
     * This check only runs when starting from line 0 (not when continuing after a page break).
     * We use baseSpacingBefore for the blank page check because on a new page there's no
     * previous trailing spacing to collapse with.
     */

    const keepLines = attrs?.keepLines === true;
    if (keepLines && fromLine === 0) {
      const neededSpacingBefore = collapseSpacingBefore(spacingBefore, state.trailingSpacing);
      const pageContentHeight = state.contentBottom - state.topMargin;
      const linesHeight = lines.reduce((sum, line) => sum + (line.lineHeight || 0), 0);
      const fullHeight = linesHeight + borderExpansion.top + borderExpansion.bottom;
      const fitsOnBlankPage = fullHeight + baseSpacingBefore <= pageContentHeight;
      const remainingHeightAfterSpacing = state.contentBottom - (state.cursorY + neededSpacingBefore);
      if (fitsOnBlankPage && state.page.fragments.length > 0 && fullHeight > remainingHeightAfterSpacing) {
        state = advanceColumn(state);
        spacingBefore = baseSpacingBefore;
        appliedSpacingBefore = spacingBefore === 0;
        continue;
      }
    }

    if (!appliedSpacingBefore && spacingBefore > 0) {
      while (!appliedSpacingBefore) {
        const prevTrailing = state.trailingSpacing ?? 0;
        const neededSpacingBefore = collapseSpacingBefore(spacingBefore, state.trailingSpacing);
        if (spacingDebugEnabled) {
          spacingDebugLog('spacingBefore pending', {
            blockId: block.id,
            cursorY: state.cursorY,
            contentBottom: state.contentBottom,
            spacingBefore,
            prevTrailing,
            neededSpacingBefore,
            column: state.columnIndex,
            page: state.page.number,
          });
        }
        if (state.cursorY + neededSpacingBefore > state.contentBottom) {
          /**
           * Infinite Loop Guard: Prevents layout hang when spacingBefore exceeds content area.
           *
           * When spacingBefore is larger than the entire available content area, the layout engine
           * would otherwise enter an infinite loop: attempting to advance to a new page/column,
           * finding the cursor at the top, attempting to apply spacing, finding it doesn't fit,
           * advancing again, and repeating indefinitely.
           *
           * Condition checked: cursor is at or above the top margin (start of page/column).
           * This indicates we've already advanced to a fresh page/column and the spacing
           * still won't fit, meaning it exceeds the total content area height.
           *
           * Resolution: Skip the spacing entirely and proceed with content placement at the
           * current cursor position (topMargin). This ensures layout completes successfully
           * even with pathological spacing values.
           *
           * Common scenarios:
           * - Header/footer layout with minimal height constraints
           * - Documents with very large spacingBefore values on small pages
           * - Edge cases where content area is smaller than spacing requirements
           *
           * Note on floating point precision: Epsilon comparison is not needed here because
           * both cursorY and topMargin are derived from integer pixel margins and direct
           * assignments (cursorY = topMargin) that occur during page/column advances.
           * No complex floating point arithmetic is involved between assignment and comparison.
           */
          if (state.cursorY <= state.topMargin) {
            if (spacingDebugEnabled) {
              spacingDebugLog('spacingBefore exceeds page capacity, skipping', {
                blockId: block.id,
                requestedSpacing: neededSpacingBefore,
                pageContentHeight: state.contentBottom - state.topMargin,
                column: state.columnIndex,
                page: state.page.number,
              });
            }
            state.trailingSpacing = 0;
            appliedSpacingBefore = true;
            break;
          }
          if (spacingDebugEnabled) {
            spacingDebugLog('spacingBefore triggers column advance', {
              blockId: block.id,
              cursorY: state.cursorY,
              spacingBefore,
              neededSpacingBefore,
              prevTrailing,
              column: state.columnIndex,
              page: state.page.number,
            });
          }
          state = advanceColumn(state);
          if (state.trailingSpacing == null) state.trailingSpacing = 0;
          continue;
        }

        if (neededSpacingBefore > 0) {
          state.cursorY += neededSpacingBefore;
          state.maxCursorY = Math.max(state.maxCursorY, state.cursorY);
          if (spacingDebugEnabled) {
            spacingDebugLog('spacingBefore applied', {
              blockId: block.id,
              added: neededSpacingBefore,
              prevTrailing,
              newCursorY: state.cursorY,
              column: state.columnIndex,
              page: state.page.number,
            });
          }
        } else if (spacingDebugEnabled && prevTrailing > 0) {
          spacingDebugLog('spacingBefore collapsed by trailing spacing', {
            blockId: block.id,
            prevTrailing,
            spacingBefore,
            column: state.columnIndex,
            page: state.page.number,
          });
        }
        state.trailingSpacing = 0;
        appliedSpacingBefore = true;
      }
    } else {
      state.trailingSpacing = 0;
    }

    // SD-2656: footnote band overhead. Source of truth is the planner
    // (incrementalLayout.ts), which derives overhead from data-driven
    // separator dimensions (`topPadding`, `dividerHeight`,
    // `separatorSpacingBefore`, inter-ref `gap`). The planner threads its
    // formula through `ctx.getFootnoteBandOverhead` so the slicer's
    // `effectiveBottom` budget matches the planner's exactly — otherwise
    // body packs onto a page whose band can't actually fit the refs.
    //
    // The fallback formula below matches the planner's *default* values
    // (topPadding=6, dividerHeight=6, separatorSpacingBefore≈14, gap=2)
    // and is only used when ctx doesn't supply the overhead function (e.g.
    // tests that don't exercise footnotes).
    const FN_SAFETY_MARGIN_PX = 1;
    const fallbackBandOverhead = (refsTotal: number): number =>
      refsTotal > 0 ? 22 + Math.max(0, refsTotal - 1) * 2 : 0;
    const bandOverhead = (refsTotal: number): number => {
      if (refsTotal <= 0) return 0;
      const fromCtx = ctx.getFootnoteBandOverhead?.(refsTotal);
      const base =
        typeof fromCtx === 'number' && Number.isFinite(fromCtx) && fromCtx >= 0
          ? fromCtx
          : fallbackBandOverhead(refsTotal);
      return base + FN_SAFETY_MARGIN_PX;
    };

    /**
     * SD-2656: effective bottom for a candidate slice.
     *
     * Critical: we ignore `state.pageFootnoteReserve` here and use the
     * page's raw content area (contentBottom + reserve). With range-aware
     * demand, the slicer knows exactly which fns are anchored on this
     * page — the planner's pre-allocated reserve is no longer needed and
     * actively harmful when it over-allocates. Body shrinkage is driven
     * entirely by what THIS page's slices have charged so far + what the
     * candidate slice would charge.
     *
     * `extraDemand` IS the total ordered-cluster demand for the page after
     * the candidate slice is committed (i.e., the demand function already
     * received state.footnoteAnchorsThisPage as `committed` and returned the
     * full cluster demand). Do NOT add state.footnoteDemandThisPage — that
     * would double-count the already-committed anchors (e.g. fn4 contributes
     * `firstLine(fn4)` to state.footnoteDemandThisPage when first committed,
     * then `full(fn4)` to extraDemand when fn5 arrives and upgrades fn4 from
     * "last" to "non-last"). Trust extraDemand as the total.
     */
    const rawContentBottom = state.contentBottom + state.pageFootnoteReserve;
    const computeEffectiveBottom = (extraDemand: number, extraRefs: number): number => {
      const totalDemand = extraDemand;
      const totalRefs = state.footnoteRefsThisPage + extraRefs;
      const demandWithOverhead = totalDemand > 0 ? totalDemand + bandOverhead(totalRefs) : 0;
      // SD-2656: respect the planner's per-page reserve as a floor. The
      // convergence loop sets `state.pageFootnoteReserve` to communicate
      // continuation demand from prior pages (fn body content that was
      // deferred because it didn't fit on its anchor page). Range-aware
      // demand alone misses this — the slicer only knows about fns anchored
      // in THIS page's body, not about fn bodies migrating in from previous
      // pages. Taking the max of (continuation-reserve, anchored-demand+
      // overhead) ensures body leaves room for whichever is larger.
      const reservedSpace = Math.max(state.pageFootnoteReserve, demandWithOverhead);
      const minBodyLineHeight = lines[fromLine]?.lineHeight ?? 0;
      const maxAdditional = Math.max(0, rawContentBottom - state.topMargin - minBodyLineHeight);
      return rawContentBottom - Math.min(reservedSpace, maxAdditional);
    };

    // SD-2656: pre-slicer advance check must preview the FIRST candidate
    // line's footnote demand. Without this preview, the in-slicer force-
    // commit-first-line rule would unconditionally place line 0 even when
    // its fn anchors push the band off the page. This was the band-overflow
    // bug seen on the reference fixture's p19 (two fns ended up in the band
    // on top of a prior fn, pushing the band ~140 px past pageH).
    //
    // The pre-slicer check is allowed to defer the entire block to next
    // page only when the page already has body content (otherwise we'd
    // deadlock on oversized fns). On an empty page, the slicer's force-
    // commit-first-line rule keeps making progress and the band may end
    // up clipped — but that case is handled by the planner's continuation
    // split (separate fix path).
    // Reserve the full footnote cluster height up front, so the body slicer
    // backs off enough lines that every anchored footnote fits whole on its
    // own page. This matches Word's pagination, which knows each footnote's
    // full demand at every line decision rather than reserving a minimum
    // and patching later. Cost: bodies that previously packed to the brink
    // grow ≤ 1–4 pages per fixture; gain: footnote splits drop to ~0 on
    // fixtures we measured (Carlsbad, IRA, SPA, IT-923 COI, MRL).
    const computeFootnoteClusterDemand = (pmStart: number, pmEnd: number): number => {
      const candidate = ctx.getFootnoteAnchorsForBlockId
        ? ctx.getFootnoteAnchorsForBlockId(block.id, pmStart, pmEnd)
        : [];
      const committed = state.footnoteAnchorsThisPage ?? [];
      if (candidate.length === 0 && committed.length === 0) return 0;
      let demand = 0;
      for (const anchor of committed) demand += anchor.fullHeight;
      for (const anchor of candidate) demand += anchor.fullHeight;
      return demand;
    };

    const previewRange = computeFragmentPmRange(block, lines, fromLine, fromLine + 1);
    const previewRefs = ctx.getFootnoteRefCountForBlockId
      ? ctx.getFootnoteRefCountForBlockId(block.id, previewRange.pmStart, previewRange.pmEnd)
      : 0;
    // Re-evaluates against current state after advanceColumn (footnoteAnchorsThisPage
    // resets on a fresh page, so demand can shrink).
    const computePreviewBottom = () => {
      const demand = computeFootnoteClusterDemand(previewRange.pmStart ?? 0, previewRange.pmEnd ?? 0);
      return computeEffectiveBottom(demand, previewRefs);
    };
    let effectiveBottom = computePreviewBottom();

    if (state.cursorY >= effectiveBottom) {
      state = advanceColumn(state);
      effectiveBottom = computePreviewBottom();
    }

    const availableHeight = effectiveBottom - state.cursorY;
    if (availableHeight <= 0) {
      state = advanceColumn(state);
      effectiveBottom = computePreviewBottom();
    }

    const nextLineHeight = lines[fromLine].lineHeight || 0;
    const remainingHeight = effectiveBottom - state.cursorY;
    if (state.page.fragments.length > 0 && remainingHeight < nextLineHeight) {
      state = advanceColumn(state);
      effectiveBottom = computePreviewBottom();
    }

    // Use the narrowest width and offset if we remeasured
    let effectiveColumnWidth = columnWidth;
    let offsetX = 0;
    if (didRemeasureForFloats) {
      effectiveColumnWidth = narrowestWidth;
      offsetX = narrowestOffsetX;
    }

    // Reserve border expansion from available height so the slicer doesn't accept
    // lines that would overflow the page once border space is added.
    // SD-3049: use `effectiveBottom` (which already accounts for any
    // additional footnote demand above the page-level reserve) so we don't
    // greedily add a line that would push body content into the footnote area.
    const borderVertical = borderExpansion.top + borderExpansion.bottom;
    // SD-2656: range-aware slicer. Commit lines one at a time, charging the
    // fn refs each line anchors. The first line always commits (otherwise
    // a paragraph with oversized fns could deadlock); subsequent lines must
    // pass the fit check (cursor + cumulative height + border + cumulative
    // demand + band overhead ≤ contentBottom). When the next line would
    // overflow, stop — the rest spills to the next page.
    let toLine = fromLine;
    let height = 0;
    let sliceDemand = 0;
    let sliceRefs = 0;
    while (toLine < lines.length) {
      const lineHeight = lines[toLine].lineHeight || 0;
      const range = computeFragmentPmRange(block, lines, fromLine, toLine + 1);
      // SD-2656 Phase 1: ordered-minimum acceptance. The body accepts a
      // line if ordered demand (full of non-last + firstLine of last)
      // still fits. The planner uses any leftover capacity opportunistically
      // (continuations, extending the last anchor).
      const orderedDemand = computeFootnoteClusterDemand(range.pmStart ?? 0, range.pmEnd ?? 0);
      const nextRefs = ctx.getFootnoteRefCountForBlockId
        ? ctx.getFootnoteRefCountForBlockId(block.id, range.pmStart, range.pmEnd)
        : 0;

      if (toLine === fromLine) {
        // First line: commit unconditionally. The pre-slicer checks above
        // already advanced the column if even a single line couldn't fit.
        height = lineHeight;
        sliceDemand = orderedDemand;
        sliceRefs = nextRefs;
        toLine = fromLine + 1;
        continue;
      }

      const candidateBottom = state.cursorY + height + lineHeight + borderVertical;
      const effBot = computeEffectiveBottom(orderedDemand, nextRefs);
      if (candidateBottom > effBot) break;
      height += lineHeight;
      sliceDemand = orderedDemand;
      sliceRefs = nextRefs;
      toLine += 1;
    }

    const slice = { toLine, height };
    const fragmentHeight = slice.height;

    // Commit demand from this slice into page state. sliceDemand is the
    // ordered-cluster TOTAL for the page (it already accounts for committed
    // anchors), so the page-level tracker is replaced, not accumulated. The
    // ref count is additive (each slice's refs are new).
    if (sliceDemand > 0 || sliceRefs > 0) {
      state.footnoteDemandThisPage = sliceDemand;
      state.footnoteRefsThisPage = (state.footnoteRefsThisPage ?? 0) + sliceRefs;
    }
    // SD-2656: push the anchors actually introduced by this slice onto the
    // page's ordered cluster. The demand for the NEXT slice/block will then
    // see them as committed (so the current cluster's last anchor upgrades
    // from firstLine to fullHeight when a new anchor is added later).
    if (ctx.getFootnoteAnchorsForBlockId) {
      const committedRange = computeFragmentPmRange(block, lines, fromLine, toLine);
      const newAnchors = ctx.getFootnoteAnchorsForBlockId(block.id, committedRange.pmStart, committedRange.pmEnd);
      if (newAnchors.length > 0) {
        if (!state.footnoteAnchorsThisPage) state.footnoteAnchorsThisPage = [];
        const seen = new Set(state.footnoteAnchorsThisPage.map((a) => a.refId));
        for (const a of newAnchors) {
          if (!seen.has(a.refId)) state.footnoteAnchorsThisPage.push(a);
        }
      }
    }
    void effectiveBottom;

    // Apply negative indent adjustment to fragment position and width (similar to table indent handling).
    // Negative left indent shifts content left into page margin; negative right indent extends into right margin.
    // This matches Word's behavior where paragraphs with negative indents extend beyond the content area.
    // Adjust x position: negative indent shifts left (e.g., -48px moves fragment 48px left).
    // When text was remeasured around floats, do not pull lines back into exclusion zones.
    const floatAdjustedX = columnX(state) + offsetX;
    const adjustedX = didRemeasureForFloats
      ? floatAdjustedX + Math.max(negativeLeftIndent, 0)
      : floatAdjustedX + negativeLeftIndent;
    const columnRight = columnX(state) + columnWidth;
    let adjustedWidth = didRemeasureForFloats
      ? effectiveColumnWidth
      : effectiveColumnWidth - negativeLeftIndent - negativeRightIndent;
    if (didRemeasureForFloats) {
      adjustedWidth = Math.min(adjustedWidth, Math.max(1, columnRight - adjustedX));
    }
    const fragment: ParaFragment = {
      kind: 'para',
      blockId: block.id,
      fromLine,
      toLine: slice.toLine,
      x: adjustedX,
      y: state.cursorY + borderExpansion.top,
      width: adjustedWidth,
      sourceAnchor: block.sourceAnchor,
      ...computeFragmentPmRange(block, lines, fromLine, slice.toLine),
    };

    // Store remeasured lines in fragment so renderer can use them.
    // This is needed because the original measure has different line breaks.
    if (didRemeasureForColumnWidth || didRemeasureForFloats) {
      fragment.lines = lines.slice(fromLine, slice.toLine);
    }

    if ((measure.marker || remeasuredMarkerInfo) && fromLine === 0) {
      // Prefer remeasured marker info when available (has more accurate markerTextWidth from canvas measurement)
      const effectiveMarkerInfo = remeasuredMarkerInfo ?? measure.marker;
      fragment.markerWidth = effectiveMarkerInfo?.markerWidth ?? measure.marker?.markerWidth ?? 0;
      // Preserve actual marker text width for accurate tab calculation in renderer
      // Prefer remeasured value which is measured via canvas (more accurate than original measure)
      const markerTextWidth = remeasuredMarkerInfo?.markerTextWidth ?? measure.marker?.markerTextWidth;
      if (markerTextWidth != null) {
        fragment.markerTextWidth = markerTextWidth;
      }
      // Preserve gutter info for word-layout lists (used by renderer for tab sizing)
      const gutterWidth = remeasuredMarkerInfo?.gutterWidth ?? measure.marker?.gutterWidth;
      if (gutterWidth != null) {
        fragment.markerGutter = gutterWidth;
      }
    }

    if (fromLine > 0) fragment.continuesFromPrev = true;
    if (slice.toLine < lines.length) fragment.continuesOnNext = true;

    const floatAlignment = block.attrs?.floatAlignment;
    if (floatAlignment && (floatAlignment === 'right' || floatAlignment === 'center')) {
      let maxLineWidth = 0;
      for (let i = fromLine; i < slice.toLine; i++) {
        if (lines[i].width > maxLineWidth) {
          maxLineWidth = lines[i].width;
        }
      }

      if (floatAlignment === 'right') {
        fragment.x = columnX(state) + offsetX + (effectiveColumnWidth - maxLineWidth);
      } else if (floatAlignment === 'center') {
        fragment.x = columnX(state) + offsetX + (effectiveColumnWidth - maxLineWidth) / 2;
      }
    }
    state.page.fragments.push(fragment);

    state.cursorY += borderExpansion.top + fragmentHeight + borderExpansion.bottom;
    state.maxCursorY = Math.max(state.maxCursorY, state.cursorY);
    lastState = state;
    paragraphContentEndY = state.cursorY;
    fromLine = slice.toLine;
  }

  if (lastState) {
    if (spacingAfter > 0) {
      let targetState = lastState;
      let appliedSpacingAfter = spacingAfter;
      if (targetState.cursorY + spacingAfter > targetState.contentBottom) {
        if (spacingDebugEnabled) {
          spacingDebugLog('spacingAfter triggers column advance', {
            blockId: block.id,
            cursorY: targetState.cursorY,
            spacingAfter,
            column: targetState.columnIndex,
            page: targetState.page.number,
          });
        }
        targetState = advanceColumn(targetState);
        appliedSpacingAfter = 0;
      } else {
        targetState.cursorY += spacingAfter;
        targetState.maxCursorY = Math.max(targetState.maxCursorY, targetState.cursorY);
      }
      targetState.trailingSpacing = appliedSpacingAfter;
      if (spacingDebugEnabled) {
        spacingDebugLog('spacingAfter applied', {
          blockId: block.id,
          appliedSpacingAfter,
          newCursorY: targetState.cursorY,
          column: targetState.columnIndex,
          page: targetState.page.number,
        });
      }
    } else {
      lastState.trailingSpacing = 0;
    }
    lastState.lastParagraphStyleId = styleId;
    lastState.lastParagraphContextualSpacing = contextualSpacing;
    lastState.lastParagraphBorderHash = currentBorderHash;
  }

  const postLayoutAnchoredTables = anchoredTablesForPara.filter((entry) => {
    const wrapType = entry.block.wrap?.type ?? 'None';
    return wrapType !== 'None' && !shouldPreLayoutSquareTable(entry);
  });
  if (postLayoutAnchoredTables.length > 0) {
    const usesLineTopOnEmptyParagraph =
      emptyTextParagraph &&
      !paragraphWillSpanPages &&
      postLayoutAnchoredTables.some((entry) => {
        const offsetV = entry.layoutOffsetV ?? entry.block.anchor?.offsetV ?? 0;
        return entry.lineScopedOnAnchor === false && offsetV > 0;
      });
    const postLayoutAnchorY = usesLineTopOnEmptyParagraph ? paragraphAnchorBaseY : paragraphContentEndY;
    registerAnchoredTablesAt(postLayoutAnchorY, postLayoutAnchoredTables);
  }
}
