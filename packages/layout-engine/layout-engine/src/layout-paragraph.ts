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
} from '@superdoc/contracts';
import {
  computeFragmentPmRange,
  normalizeLines,
  sliceLines,
  extractBlockPmRange,
  isEmptyTextParagraph,
} from './layout-utils.js';
import { computeAnchorX } from './floating-objects.js';

const spacingDebugEnabled = false;

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
  columnX: (columnIndex: number) => number;
  floatManager: FloatingObjectManager;
  remeasureParagraph?: (block: ParagraphBlock, maxWidth: number, firstLineIndent?: number) => ParagraphMeasure;
  /**
   * Override the paragraph's spacing-after value. Used when contextual spacing
   * should suppress spacing between this paragraph and the next (same-style) paragraph.
   * When undefined, uses the value from block.attrs.spacing.after.
   */
  overrideSpacingAfter?: number;
};

export type AnchoredDrawingEntry = {
  block: ImageBlock | DrawingBlock;
  measure: ImageMeasure | DrawingMeasure;
};

export type ParagraphAnchorsContext = {
  anchoredDrawings?: AnchoredDrawingEntry[];
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

  if (anchors?.anchoredDrawings?.length) {
    for (const entry of anchors.anchoredDrawings) {
      if (anchors.placedAnchoredIds.has(entry.block.id)) continue;
      const state = ensurePage();

      // Calculate anchor Y position based on vRelativeFrom and alignV
      const vRelativeFrom = entry.block.anchor?.vRelativeFrom;
      const alignV = entry.block.anchor?.alignV;
      const offsetV = entry.block.anchor?.offsetV ?? 0;
      const imageHeight = entry.measure.height;

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
          // No alignV specified, use offset from content top
          anchorY = contentTop + offsetV;
        }
      } else if (vRelativeFrom === 'page') {
        // Position relative to the physical page (0 = top edge)
        if (alignV === 'top') {
          anchorY = offsetV;
        } else if (alignV === 'bottom') {
          // Would need page height here, approximate with contentBottom + bottom margin
          const pageHeight = contentBottom + (anchors.pageMargins.bottom ?? 0);
          anchorY = pageHeight - imageHeight + offsetV;
        } else if (alignV === 'center') {
          const pageHeight = contentBottom + (anchors.pageMargins.bottom ?? 0);
          anchorY = (pageHeight - imageHeight) / 2 + offsetV;
        } else {
          anchorY = offsetV;
        }
      } else if (vRelativeFrom === 'paragraph') {
        // vRelativeFrom === 'paragraph' - position relative to anchor paragraph
        const baseAnchorY = state.cursorY;
        const firstLineHeight = measure.lines?.[0]?.lineHeight ?? 0;
        if (alignV === 'top') {
          anchorY = baseAnchorY + offsetV;
        } else if (alignV === 'bottom') {
          anchorY = baseAnchorY + firstLineHeight - imageHeight + offsetV;
        } else if (alignV === 'center') {
          anchorY = baseAnchorY + (firstLineHeight - imageHeight) / 2 + offsetV;
        } else {
          anchorY = baseAnchorY + offsetV;
        }
      } else {
        // vRelativeFrom is undefined/null - use simple offset from current cursor (legacy behavior)
        const baseAnchorY = state.cursorY;
        anchorY = baseAnchorY + offsetV;
      }

      floatManager.registerDrawing(entry.block, entry.measure, anchorY, state.columnIndex, state.page.number);

      const anchorX = entry.block.anchor
        ? computeAnchorX(
            entry.block.anchor,
            state.columnIndex,
            anchors.columns,
            entry.measure.width,
            { left: anchors.pageMargins.left, right: anchors.pageMargins.right },
            anchors.pageWidth,
          )
        : columnX(state.columnIndex);

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
          zIndex: entry.block.anchor?.behindDoc ? 0 : 1,
          metadata,
        };
        if (pmRange.pmStart != null) fragment.pmStart = pmRange.pmStart;
        if (pmRange.pmEnd != null) fragment.pmEnd = pmRange.pmEnd;
        state.page.fragments.push(fragment);
      } else if (entry.block.kind === 'drawing' && entry.measure.kind === 'drawing') {
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
          zIndex: entry.block.anchor?.behindDoc ? 0 : 1,
          drawingContentId: entry.block.drawingContentId,
        };
        if (pmRange.pmStart != null) fragment.pmStart = pmRange.pmStart;
        if (pmRange.pmEnd != null) fragment.pmEnd = pmRange.pmEnd;
        state.page.fragments.push(fragment);
      }

      anchors.placedAnchoredIds.add(entry.block.id);
    }
  }

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
  const hasNegativeIndent = indentLeft < 0 || indentRight < 0;
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

  const isPositionedFrame = frame?.wrap === 'none';
  if (isPositionedFrame) {
    let state = ensurePage();
    if (state.cursorY >= state.contentBottom) {
      state = advanceColumn(state);
    }

    const maxLineWidth = lines.reduce((max, line) => Math.max(max, line.width ?? 0), 0);
    const fragmentWidth = maxLineWidth || columnWidth;

    let x = columnX(state.columnIndex);
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
    return;
  }

  // PHASE 1: Scan all lines to find narrowest available width before remeasuring
  // This ensures text wraps correctly between left and right anchored images
  let narrowestWidth = columnWidth;
  let narrowestOffsetX = 0;
  let didRemeasureForFloats = false;

  if (typeof remeasureParagraph === 'function') {
    const tempState = ensurePage();
    let tempY = tempState.cursorY;

    // Apply spacing before to get accurate starting Y position for scanning
    if (!appliedSpacingBefore && spacingBefore > 0) {
      const prevTrailing = tempState.trailingSpacing ?? 0;
      const neededSpacingBefore = Math.max(spacingBefore - prevTrailing, 0);
      tempY += neededSpacingBefore;
    }

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
    const narrowestRemeasureWidth = Math.max(1, narrowestWidth - indentLeft - indentRight);
    if (narrowestRemeasureWidth < remeasureWidth) {
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

    /**
     * Contextual Spacing Logic (OOXML w:contextualSpacing)
     *
     * When contextualSpacing is enabled on a paragraph, spacing before and after is
     * suppressed when the paragraph is adjacent to another paragraph with the same style.
     *
     * This implements Microsoft Word's contextual spacing behavior:
     * 1. Check if contextualSpacing is enabled on the current paragraph
     * 2. Check if both paragraphs have style IDs (required for comparison)
     * 3. Check if the style IDs match (same style = suppress spacing)
     *
     * When all conditions are met:
     * - spacingBefore is zeroed (prevents adding space before this paragraph)
     * - Previous paragraph's spacingAfter (trailingSpacing) is undone by subtracting
     *   it from cursorY, effectively removing the space already added
     *
     * Input Validation:
     * - trailingSpacing is validated to be a finite, non-negative number
     * - Invalid values (NaN, Infinity, negative, null, undefined) are treated as 0
     * - This prevents layout corruption from malformed input data
     */
    if (contextualSpacing && state.lastParagraphStyleId && styleId && state.lastParagraphStyleId === styleId) {
      spacingBefore = 0;
      const prevTrailing = asSafeNumber(state.trailingSpacing);
      if (prevTrailing > 0) {
        state.cursorY -= prevTrailing;
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
      const prevTrailing = state.trailingSpacing ?? 0;
      const neededSpacingBefore = Math.max(spacingBefore - prevTrailing, 0);
      const pageContentHeight = state.contentBottom - state.topMargin;
      const fullHeight = lines.reduce((sum, line) => sum + (line.lineHeight || 0), 0);
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
        const neededSpacingBefore = Math.max(spacingBefore - prevTrailing, 0);
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
    if (state.cursorY >= state.contentBottom) {
      state = advanceColumn(state);
    }

    const availableHeight = state.contentBottom - state.cursorY;
    if (availableHeight <= 0) {
      state = advanceColumn(state);
    }

    const nextLineHeight = lines[fromLine].lineHeight || 0;
    const remainingHeight = state.contentBottom - state.cursorY;
    if (state.page.fragments.length > 0 && remainingHeight < nextLineHeight) {
      state = advanceColumn(state);
    }

    // Use the narrowest width and offset if we remeasured
    let effectiveColumnWidth = columnWidth;
    let offsetX = 0;
    if (didRemeasureForFloats) {
      effectiveColumnWidth = narrowestWidth;
      offsetX = narrowestOffsetX;
    }

    const slice = sliceLines(lines, fromLine, state.contentBottom - state.cursorY);
    const fragmentHeight = slice.height;

    // Apply negative indent adjustment to fragment position and width (similar to table indent handling).
    // Negative left indent shifts content left into page margin; negative right indent extends into right margin.
    // This matches Word's behavior where paragraphs with negative indents extend beyond the content area.
    // Adjust x position: negative indent shifts left (e.g., -48px moves fragment 48px left)
    const adjustedX = columnX(state.columnIndex) + offsetX + negativeLeftIndent;
    // Expand width: negative indents on both sides expand the fragment width
    // (e.g., -48px left + -72px right = 120px wider)
    const adjustedWidth = effectiveColumnWidth - negativeLeftIndent - negativeRightIndent;

    const fragment: ParaFragment = {
      kind: 'para',
      blockId: block.id,
      fromLine,
      toLine: slice.toLine,
      x: adjustedX,
      y: state.cursorY,
      width: adjustedWidth,
      ...computeFragmentPmRange(block, lines, fromLine, slice.toLine),
    };

    // Store remeasured lines in fragment so renderer can use them.
    // This is needed because the original measure has different line breaks.
    if (didRemeasureForColumnWidth) {
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
        fragment.x = columnX(state.columnIndex) + offsetX + (effectiveColumnWidth - maxLineWidth);
      } else if (floatAlignment === 'center') {
        fragment.x = columnX(state.columnIndex) + offsetX + (effectiveColumnWidth - maxLineWidth) / 2;
      }
    }

    state.page.fragments.push(fragment);
    state.cursorY += fragmentHeight;
    lastState = state;
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
  }
}
