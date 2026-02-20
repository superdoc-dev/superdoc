/**
 * Floating-object manager for text wrapping around anchored images and tables.
 *
 * This module handles:
 * - Registration of anchored images/drawings/tables as exclusion zones
 * - Computing available line width based on floating object positions
 * - Managing exclusion zones per page/column
 *
 * Architecture:
 * - Pass 1: Register anchored objects before laying out paragraphs
 * - Pass 2: Query exclusions during paragraph layout to reduce line widths
 * - Supports rectangular wrapping (Square/TopAndBottom); polygon wrapping (Tight/Through) is pending
 */

import type {
  ImageBlock,
  ImageMeasure,
  ExclusionZone,
  DrawingBlock,
  DrawingMeasure,
  TableBlock,
  TableMeasure,
  TableAnchor,
  TableWrap,
} from '@superdoc/contracts';

type FloatBlock = ImageBlock | DrawingBlock;
type FloatMeasure = ImageMeasure | DrawingMeasure;

export type FloatingObjectManager = {
  /**
   * Register an anchored drawing as an exclusion zone.
   * Should be called before laying out paragraphs.
   */
  registerDrawing(
    drawingBlock: FloatBlock,
    measure: FloatMeasure,
    anchorParagraphY: number,
    columnIndex: number,
    pageNumber: number,
  ): void;

  /**
   * Register an anchored/floating table as an exclusion zone.
   * Should be called during Layout Pass 1 before laying out paragraphs.
   */
  registerTable(
    tableBlock: TableBlock,
    measure: TableMeasure,
    anchorParagraphY: number,
    columnIndex: number,
    pageNumber: number,
  ): void;

  /**
   * Get all exclusion zones that vertically overlap the given line.
   * Used during paragraph layout to detect affected lines.
   */
  getExclusionsForLine(lineY: number, lineHeight: number, columnIndex: number, pageNumber: number): ExclusionZone[];

  /**
   * Compute available width for a line considering exclusion zones.
   * Returns reduced width and horizontal offset if exclusions present.
   */
  computeAvailableWidth(
    lineY: number,
    lineHeight: number,
    baseWidth: number,
    columnIndex: number,
    pageNumber: number,
  ): { width: number; offsetX: number };

  /**
   * Get all floating images for a page (for debugging/painting).
   */
  getAllFloatsForPage(pageNumber: number): ExclusionZone[];

  /**
   * Clear all registered exclusion zones.
   */
  clear(): void;

  /**
   * Update layout context used for positioning and wrapping (columns, margins, page width).
   */
  setLayoutContext(columns: ColumnLayout, margins?: { left?: number; right?: number }, pageWidth?: number): void;
};

type ColumnLayout = {
  width: number;
  gap: number;
  count: number;
};

export function createFloatingObjectManager(
  columns: ColumnLayout,
  margins?: { left?: number; right?: number },
  pageWidth?: number,
): FloatingObjectManager {
  const zones: ExclusionZone[] = [];
  let currentColumns = columns;
  let currentMargins = margins;
  let currentPageWidth = pageWidth;
  let marginLeft = Math.max(0, currentMargins?.left ?? 0);

  return {
    registerDrawing(drawingBlock, measure, anchorY, columnIndex, pageNumber) {
      if (!drawingBlock.anchor?.isAnchored) {
        return; // Not anchored, no exclusion
      }

      const { wrap, anchor } = drawingBlock;
      const wrapType = wrap?.type ?? 'Inline';

      if (wrapType === 'Inline' || wrapType === 'None') {
        // Inline: no exclusion (flows normally)
        // None: absolutely positioned, no text flow impact
        return;
      }

      // Compute image X position based on anchor alignment, respecting margins
      const objectWidth = measure.width ?? 0;
      const objectHeight = measure.height ?? 0;

      const x = computeAnchorX(anchor, columnIndex, currentColumns, objectWidth, currentMargins, currentPageWidth);

      // Compute image Y position (anchor Y + vertical offset)
      const y = anchorY + (anchor.offsetV ?? 0);

      const zone: ExclusionZone = {
        imageBlockId: drawingBlock.id,
        pageNumber,
        columnIndex,
        bounds: {
          x,
          y,
          width: objectWidth,
          height: objectHeight,
        },
        distances: {
          top: wrap?.distTop ?? 0,
          bottom: wrap?.distBottom ?? 0,
          left: wrap?.distLeft ?? 0,
          right: wrap?.distRight ?? 0,
        },
        wrapMode: computeWrapMode(wrap, anchor),
        polygon: wrap?.polygon,
      };

      zones.push(zone);
    },

    registerTable(tableBlock, measure, anchorY, columnIndex, pageNumber) {
      if (!tableBlock.anchor?.isAnchored) {
        return; // Not anchored, no exclusion
      }

      const { wrap, anchor } = tableBlock;
      const wrapType = wrap?.type ?? 'None';

      if (wrapType === 'None') {
        // Tables with wrap type 'None' don't create exclusion zones
        // They are absolutely positioned without text wrapping
        return;
      }

      // Compute table dimensions from measure
      const tableWidth = measure.totalWidth ?? 0;
      const tableHeight = measure.totalHeight ?? 0;

      // Compute table X position based on anchor alignment
      const x = computeTableAnchorX(anchor, columnIndex, currentColumns, tableWidth, currentMargins, currentPageWidth);

      // Compute table Y position (anchor Y + vertical offset)
      const y = anchorY + (anchor.offsetV ?? 0);

      const zone: ExclusionZone = {
        imageBlockId: tableBlock.id, // Reusing imageBlockId field for table id
        pageNumber,
        columnIndex,
        bounds: {
          x,
          y,
          width: tableWidth,
          height: tableHeight,
        },
        distances: {
          top: wrap?.distTop ?? 0,
          bottom: wrap?.distBottom ?? 0,
          left: wrap?.distLeft ?? 0,
          right: wrap?.distRight ?? 0,
        },
        wrapMode: computeTableWrapMode(wrap),
      };

      zones.push(zone);
    },

    getExclusionsForLine(lineY, lineHeight, columnIndex, pageNumber) {
      const result = zones.filter((zone) => {
        // Filter by page and column
        if (zone.pageNumber !== pageNumber || zone.columnIndex !== columnIndex) {
          return false;
        }

        // Check vertical overlap
        const lineTop = lineY;
        const lineBottom = lineY + lineHeight;
        const zoneTop = zone.bounds.y - zone.distances.top;
        const zoneBottom = zone.bounds.y + zone.bounds.height + zone.distances.bottom;

        const overlaps = lineBottom > zoneTop && lineTop < zoneBottom;

        return overlaps;
      });

      return result;
    },

    computeAvailableWidth(lineY, lineHeight, baseWidth, columnIndex, pageNumber) {
      const exclusions = this.getExclusionsForLine(lineY, lineHeight, columnIndex, pageNumber);

      if (exclusions.length === 0) {
        return { width: baseWidth, offsetX: 0 };
      }

      // Filter out zones that don't affect horizontal wrapping
      const wrappingZones = exclusions.filter((zone) => zone.wrapMode !== 'none');

      if (wrappingZones.length === 0) {
        return { width: baseWidth, offsetX: 0 };
      }

      // Handle multiple overlapping floats by computing boundaries from both sides
      // Group floats by side (left vs right) based on their actual position
      const leftFloats: ExclusionZone[] = [];
      const rightFloats: ExclusionZone[] = [];

      // Use absolute coordinates for comparison - columnOrigin is the left edge of content
      const columnOrigin = marginLeft + columnIndex * (currentColumns.width + currentColumns.gap);
      const columnCenter = columnOrigin + baseWidth / 2;

      for (const zone of wrappingZones) {
        // Determine which side the float is on based on wrapMode and position
        if (zone.wrapMode === 'left') {
          // wrapMode 'left' means the image is on the left side
          leftFloats.push(zone);
        } else if (zone.wrapMode === 'right') {
          // wrapMode 'right' means the image is on the right side
          rightFloats.push(zone);
        } else if (zone.wrapMode === 'both' || zone.wrapMode === 'largest') {
          // For 'both' and 'largest', determine side by the zone's center position
          // Use absolute coordinates for comparison
          const zoneCenter = zone.bounds.x + zone.bounds.width / 2;
          if (zoneCenter < columnCenter) {
            leftFloats.push(zone);
          } else {
            rightFloats.push(zone);
          }
        }
      }

      // Find the rightmost boundary from left floats (most intrusive on left)
      // The total exclusion width includes all wrap distances: distLeft + width + distRight
      // For left floats, text should start after this exclusion zone
      let leftBoundary = 0;
      for (const zone of leftFloats) {
        // Text starts after: image position + width + all distances
        const boundary = zone.bounds.x + zone.bounds.width + zone.distances.left + zone.distances.right;
        leftBoundary = Math.max(leftBoundary, boundary);
      }

      const columnRightEdge = columnOrigin + baseWidth;

      // Find the leftmost boundary from right floats (most intrusive on right)
      // For right floats, text should end before the full exclusion zone
      let rightBoundary = columnRightEdge;
      for (const zone of rightFloats) {
        // Text ends before: image position - all distances
        // This maintains symmetry with left floats (full exclusion width)
        const boundary = zone.bounds.x - zone.distances.left - zone.distances.right;
        rightBoundary = Math.min(rightBoundary, boundary);
      }

      // Compute available width and offset
      const availableWidth = rightBoundary - leftBoundary;

      // Convert absolute leftBoundary to column-relative offset
      const offsetX = Math.max(0, leftBoundary - columnOrigin);

      // Validate width is positive - if floats completely overlap, return minimal width
      if (availableWidth <= 0) {
        // Floats completely overlap - no room for text
        // Return minimal width to avoid division by zero in measuring
        return { width: 1, offsetX: 0 };
      }

      return { width: availableWidth, offsetX };
    },

    getAllFloatsForPage(pageNumber) {
      return zones.filter((z) => z.pageNumber === pageNumber);
    },

    clear() {
      zones.length = 0;
    },
    /**
     * Update layout context used for positioning and wrapping (columns, margins, page width).
     * This method should be called when the layout configuration changes (e.g., section breaks,
     * column changes, page size changes) to ensure floating objects are positioned and wrapped
     * correctly relative to the new layout boundaries.
     *
     * @param nextColumns - Column layout configuration (width, gap, count)
     * @param nextMargins - Optional page margins (left, right) in pixels
     * @param nextPageWidth - Optional total page width in pixels
     */
    setLayoutContext(nextColumns, nextMargins, nextPageWidth) {
      currentColumns = nextColumns;
      currentMargins = nextMargins;
      currentPageWidth = nextPageWidth;
      marginLeft = Math.max(0, currentMargins?.left ?? 0);
    },
  };
}

/**
 * Compute horizontal position of anchored image based on alignment and offsets.
 */
export function computeAnchorX(
  anchor: NonNullable<ImageBlock['anchor']>,
  columnIndex: number,
  columns: ColumnLayout,
  imageWidth: number,
  margins?: { left?: number; right?: number },
  pageWidth?: number,
): number {
  const alignH = anchor.alignH ?? 'left';
  const offsetH = anchor.offsetH ?? 0;

  const marginLeft = Math.max(0, margins?.left ?? 0);
  const marginRight = Math.max(0, margins?.right ?? 0);
  const contentWidth = pageWidth != null ? Math.max(1, pageWidth - (marginLeft + marginRight)) : columns.width;

  // Column origin is the content box in Word semantics. In single-column docs,
  // this equals the left margin. For multi-column, each column starts at
  // content-left + columnIndex * (columnWidth + gap).
  const contentLeft = marginLeft;
  const columnLeft = contentLeft + columnIndex * (columns.width + columns.gap);

  const relativeFrom = anchor.hRelativeFrom ?? 'column';

  // Base origin and available width based on relativeFrom
  let baseX: number;
  let availableWidth: number;
  if (relativeFrom === 'page') {
    // Word's page-relative origin is always the physical page edge (x=0).
    // Even for single-column layouts we honor the true page coordinate so
    // anchors can extend into the margins (e.g., full-bleed covers).
    baseX = 0;
    availableWidth = pageWidth != null ? pageWidth : contentWidth + marginLeft + marginRight;
  } else if (relativeFrom === 'margin') {
    baseX = contentLeft;
    availableWidth = contentWidth;
  } else {
    // 'column' (default)
    baseX = columnLeft;
    availableWidth = columns.width;
  }

  const result =
    alignH === 'left'
      ? baseX + offsetH
      : alignH === 'right'
        ? baseX + availableWidth - imageWidth - offsetH
        : alignH === 'center'
          ? baseX + (availableWidth - imageWidth) / 2 + offsetH
          : baseX;

  return result;
}

/**
 * Map ImageWrap.wrapText to ExclusionZone.wrapMode.
 * Determines which side of the image text should wrap.
 */
function computeWrapMode(wrap: ImageBlock['wrap'], _anchor: ImageBlock['anchor']): ExclusionZone['wrapMode'] {
  if (!wrap) return 'none';

  const wrapText = wrap.wrapText ?? 'bothSides';

  // TopAndBottom wrap: no horizontal wrapping
  if (wrap.type === 'TopAndBottom') {
    return 'none';
  }

  // Map wrapText direction to exclusion side
  // Note: wrapText='left' means "text wraps to the left" → image is on right
  if (wrapText === 'left') return 'right';
  if (wrapText === 'right') return 'left';
  if (wrapText === 'largest') return 'largest';

  // Default: both sides
  return 'both';
}

/**
 * Compute horizontal position of anchored table based on alignment and offsets.
 * Similar to computeAnchorX but uses TableAnchor type.
 */
function computeTableAnchorX(
  anchor: TableAnchor,
  columnIndex: number,
  columns: ColumnLayout,
  tableWidth: number,
  margins?: { left?: number; right?: number },
  pageWidth?: number,
): number {
  const alignH = anchor.alignH ?? 'left';
  const offsetH = anchor.offsetH ?? 0;

  const marginLeft = Math.max(0, margins?.left ?? 0);
  const marginRight = Math.max(0, margins?.right ?? 0);
  const contentWidth = pageWidth != null ? Math.max(1, pageWidth - (marginLeft + marginRight)) : columns.width;

  const contentLeft = marginLeft;
  const columnLeft = contentLeft + columnIndex * (columns.width + columns.gap);

  const relativeFrom = anchor.hRelativeFrom ?? 'column';

  // Base origin and available width based on relativeFrom
  let baseX: number;
  let availableWidth: number;
  if (relativeFrom === 'page') {
    if (columns.count === 1) {
      baseX = contentLeft;
      availableWidth = contentWidth;
    } else {
      baseX = 0;
      availableWidth = pageWidth != null ? pageWidth : contentWidth;
    }
  } else if (relativeFrom === 'margin') {
    baseX = contentLeft;
    availableWidth = contentWidth;
  } else {
    // 'column' (default)
    baseX = columnLeft;
    availableWidth = columns.width;
  }

  // Handle table-specific alignment values (inside/outside map to left/right for now)
  let effectiveAlignH = alignH;
  if (alignH === 'inside') effectiveAlignH = 'left';
  if (alignH === 'outside') effectiveAlignH = 'right';

  const result =
    effectiveAlignH === 'left'
      ? baseX + offsetH
      : effectiveAlignH === 'right'
        ? baseX + availableWidth - tableWidth - offsetH
        : effectiveAlignH === 'center'
          ? baseX + (availableWidth - tableWidth) / 2 + offsetH
          : baseX;

  return result;
}

/**
 * Map TableWrap.wrapText to ExclusionZone.wrapMode.
 * Determines which side of the table text should wrap.
 */
function computeTableWrapMode(wrap: TableWrap | undefined): ExclusionZone['wrapMode'] {
  if (!wrap) return 'none';

  // Tables only support Square or None wrap types
  if (wrap.type === 'None') {
    return 'none';
  }

  const wrapText = wrap.wrapText ?? 'bothSides';

  // Map wrapText direction to exclusion side
  // Note: wrapText='left' means "text wraps to the left" → table is on right
  if (wrapText === 'left') return 'right';
  if (wrapText === 'right') return 'left';
  if (wrapText === 'largest') return 'largest';

  // Default: both sides
  return 'both';
}
