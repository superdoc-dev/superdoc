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
  TableWrap,
  ColumnLayoutForAnchor,
  ResolveAnchoredGraphicXContext,
} from '@superdoc/contracts';
import { resolveAnchoredGraphicX, getColumnGeometry, getColumnX } from '@superdoc/contracts';

type FloatBlock = ImageBlock | DrawingBlock;
type FloatMeasure = ImageMeasure | DrawingMeasure;

export type FloatingObjectManager = {
  /**
   * Register an anchored drawing as an exclusion zone.
   * Should be called before laying out paragraphs.
   *
   * @param resolvedAnchorY — Fully resolved paint Y from {@link resolveAnchoredGraphicY}
   *   (already includes `offsetV`). Must not add vertical offset again.
   */
  registerDrawing(
    drawingBlock: FloatBlock,
    measure: FloatMeasure,
    resolvedAnchorY: number,
    columnIndex: number,
    pageNumber: number,
  ): void;

  /**
   * Register an anchored/floating table as an exclusion zone.
   * Should be called during Layout Pass 1 before laying out paragraphs.
   */
  /**
   * @param resolvedAnchorY — Fully resolved paint Y (already includes `offsetV`).
   */
  registerTable(
    tableBlock: TableBlock,
    measure: TableMeasure,
    resolvedAnchorY: number,
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
   * Compute every contiguous horizontal region available to a line.
   * Unlike computeAvailableWidth, this preserves both sides of a centered
   * `wrapText="bothSides"` object instead of collapsing them to one side.
   */
  computeAvailableRegions(
    lineY: number,
    lineHeight: number,
    baseWidth: number,
    columnIndex: number,
    pageNumber: number,
  ): Array<{ offsetX: number; width: number }>;

  /**
   * Return the first Y coordinate below every overlapping TopAndBottom float.
   */
  computeVerticalClearance(lineY: number, lineHeight: number, columnIndex: number, pageNumber: number): number | null;

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

type ColumnLayout = ColumnLayoutForAnchor;

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
    registerDrawing(drawingBlock, measure, resolvedAnchorY, columnIndex, pageNumber) {
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

      const x = computeAnchorX(anchor, columnIndex, currentColumns, objectWidth, currentMargins, currentPageWidth, {
        pageNumber,
      });

      const zone: ExclusionZone = {
        imageBlockId: drawingBlock.id,
        pageNumber,
        columnIndex,
        bounds: {
          x,
          y: resolvedAnchorY,
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

    registerTable(tableBlock, measure, resolvedAnchorY, columnIndex, pageNumber) {
      if (!tableBlock.anchor?.isAnchored) {
        return; // Not anchored, no exclusion
      }

      // Re-registration follows an anchor paragraph that moved during pagination.
      for (let index = zones.length - 1; index >= 0; index -= 1) {
        if (zones[index].imageBlockId === tableBlock.id) zones.splice(index, 1);
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
      const x = resolveAnchoredGraphicX(
        anchor,
        columnIndex,
        currentColumns,
        tableWidth,
        currentMargins,
        currentPageWidth,
        { pageNumber },
      );

      const zone: ExclusionZone = {
        imageBlockId: tableBlock.id, // Reusing imageBlockId field for table id
        pageNumber,
        columnIndex,
        bounds: {
          x,
          y: resolvedAnchorY,
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

      // Use absolute coordinates for comparison - columnOrigin is the left edge of content.
      // Resolved geometry honors per-column widths/gaps (SD-2629); equal columns match the old stride.
      const columnOrigin = getColumnX(getColumnGeometry(currentColumns), columnIndex, marginLeft);
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
      // distRight is the gap between the image's right edge and text wrapping on its right.
      let leftBoundary = 0;
      for (const zone of leftFloats) {
        const boundary = zone.bounds.x + zone.bounds.width + zone.distances.right;
        leftBoundary = Math.max(leftBoundary, boundary);
      }

      const columnRightEdge = columnOrigin + baseWidth;

      // Find the leftmost boundary from right floats (most intrusive on right)
      // distLeft is the gap between the image's left edge and text wrapping on its left.
      let rightBoundary = columnRightEdge;
      for (const zone of rightFloats) {
        const boundary = zone.bounds.x - zone.distances.left;
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

    computeAvailableRegions(lineY, lineHeight, baseWidth, columnIndex, pageNumber) {
      const exclusions = this.getExclusionsForLine(lineY, lineHeight, columnIndex, pageNumber).filter(
        (zone) => zone.wrapMode !== 'none' && zone.wrapMode !== 'topBottom',
      );
      if (exclusions.length === 0) return [{ offsetX: 0, width: baseWidth }];

      const columnOrigin = getColumnX(getColumnGeometry(currentColumns), columnIndex, marginLeft);
      const columnRight = columnOrigin + baseWidth;
      let regions = [{ left: columnOrigin, right: columnRight }];

      const subtractInterval = (left: number, right: number) => {
        if (right <= left) return;
        regions = regions.flatMap((region) => {
          if (right <= region.left || left >= region.right) return [region];
          const next: Array<{ left: number; right: number }> = [];
          if (left > region.left) next.push({ left: region.left, right: Math.min(left, region.right) });
          if (right < region.right) next.push({ left: Math.max(right, region.left), right: region.right });
          return next;
        });
      };

      for (const zone of exclusions) {
        const occupiedLeft = Math.max(columnOrigin, zone.bounds.x - zone.distances.left);
        const occupiedRight = Math.min(columnRight, zone.bounds.x + zone.bounds.width + zone.distances.right);

        if (zone.wrapMode === 'left') {
          subtractInterval(columnOrigin, occupiedRight);
        } else if (zone.wrapMode === 'right') {
          subtractInterval(occupiedLeft, columnRight);
        } else if (zone.wrapMode === 'largest') {
          const leftWidth = Math.max(0, occupiedLeft - columnOrigin);
          const rightWidth = Math.max(0, columnRight - occupiedRight);
          if (leftWidth >= rightWidth) subtractInterval(occupiedLeft, columnRight);
          else subtractInterval(columnOrigin, occupiedRight);
        } else {
          subtractInterval(occupiedLeft, occupiedRight);
        }
      }

      const availableRegions = regions
        .map((region) => ({ offsetX: region.left - columnOrigin, width: region.right - region.left }))
        .filter((region) => region.width > 0);

      // Keep the remeasure path constrained when a float consumes the entire
      // column. An empty result means "no constraint" to legacy callers and
      // would incorrectly restore full-width text through the exclusion.
      return availableRegions.length > 0 ? availableRegions : [{ offsetX: 0, width: 1 }];
    },

    computeVerticalClearance(lineY, lineHeight, columnIndex, pageNumber) {
      const exclusions = this.getExclusionsForLine(lineY, lineHeight, columnIndex, pageNumber);
      const blockers = exclusions.filter((zone) => zone.wrapMode === 'topBottom');
      const horizontalWrapExclusions = exclusions.filter(
        (zone) => zone.wrapMode !== 'none' && zone.wrapMode !== 'topBottom',
      );

      if (horizontalWrapExclusions.length > 0) {
        const availableRegions = this.computeAvailableRegions(
          lineY,
          lineHeight,
          currentColumns.width,
          columnIndex,
          pageNumber,
        );
        const hasUsableSideRegion = availableRegions.some((region) => region.width > 1);
        if (!hasUsableSideRegion) blockers.push(...horizontalWrapExclusions);
      }

      if (blockers.length === 0) return null;
      return Math.max(...blockers.map((zone) => zone.bounds.y + zone.bounds.height + zone.distances.bottom));
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

/** @deprecated Use {@link resolveAnchoredGraphicX} from `@superdoc/contracts`. */
export function computeAnchorX(
  anchor: NonNullable<ImageBlock['anchor']>,
  columnIndex: number,
  columns: ColumnLayout,
  imageWidth: number,
  margins?: { left?: number; right?: number },
  pageWidth?: number,
  context?: ResolveAnchoredGraphicXContext,
): number {
  return resolveAnchoredGraphicX(anchor, columnIndex, columns, imageWidth, margins, pageWidth, context);
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
    return 'topBottom';
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
