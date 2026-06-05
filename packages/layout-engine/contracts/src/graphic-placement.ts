type AnchorVRelative = 'paragraph' | 'page' | 'margin';
type AnchorHRelative = 'column' | 'page' | 'margin';
type AnchorAlignH = 'left' | 'center' | 'right';
type AnchorAlignV = 'top' | 'center' | 'bottom';

export type ColumnLayoutForAnchor = {
  width: number;
  gap: number;
  count: number;
};

/**
 * Inputs for resolving the paint Y of an anchored image, drawing, or floating table.
 * `offsetV` is applied inside this function; callers must pass the resolved value to
 * text-wrap registration without adding `offsetV` again.
 */
export type ResolveAnchoredGraphicYInput = {
  anchor?: {
    vRelativeFrom?: AnchorVRelative;
    alignV?: AnchorAlignV;
    offsetV?: number;
  };
  objectHeight: number;
  contentTop: number;
  contentBottom: number;
  /** Bottom page margin in px (used when vRelativeFrom is `page`). */
  pageBottomMargin?: number;
  /**
   * Anchor paragraph top Y (body cursor when laying out the anchor paragraph).
   * Used for `paragraph` and legacy (undefined vRelativeFrom) positioning.
   */
  anchorParagraphY?: number;
  /** First line height of the anchor paragraph (paragraph-relative alignV). */
  firstLineHeight?: number;
  /**
   * When true, anchor has no host paragraph (pre-registered / paragraphless layout).
   * For `vRelativeFrom: 'paragraph'`, use `contentTop + offsetV` instead of alignV on a
   * synthetic paragraph (defaults would wrongly center/bottom against contentTop).
   */
  preRegisteredFallbackToContentTop?: boolean;
};

/**
 * Resolve the vertical paint position for an anchored graphic (image, drawing, or table).
 */
export function resolveAnchoredGraphicY(input: ResolveAnchoredGraphicYInput): number {
  const {
    anchor,
    objectHeight,
    contentTop,
    contentBottom,
    pageBottomMargin = 0,
    anchorParagraphY = contentTop,
    firstLineHeight = 0,
    preRegisteredFallbackToContentTop = false,
  } = input;

  const offsetV = anchor?.offsetV ?? 0;
  const vRelativeFrom = anchor?.vRelativeFrom;
  const alignV = anchor?.alignV;
  const contentHeight = Math.max(0, contentBottom - contentTop);

  if (vRelativeFrom === 'margin') {
    if (alignV === 'bottom') {
      return contentBottom - objectHeight + offsetV;
    }
    if (alignV === 'center') {
      return contentTop + (contentHeight - objectHeight) / 2 + offsetV;
    }
    return contentTop + offsetV;
  }

  if (vRelativeFrom === 'page') {
    const pageHeight = contentBottom + pageBottomMargin;
    if (alignV === 'bottom') {
      return pageHeight - objectHeight + offsetV;
    }
    if (alignV === 'center') {
      return (pageHeight - objectHeight) / 2 + offsetV;
    }
    return offsetV;
  }

  if (vRelativeFrom === 'paragraph') {
    if (preRegisteredFallbackToContentTop) {
      return contentTop + offsetV;
    }
    const baseAnchorY = anchorParagraphY;
    if (alignV === 'bottom') {
      return baseAnchorY + firstLineHeight - objectHeight + offsetV;
    }
    if (alignV === 'center') {
      return baseAnchorY + (firstLineHeight - objectHeight) / 2 + offsetV;
    }
    return baseAnchorY + offsetV;
  }

  if (preRegisteredFallbackToContentTop) {
    return contentTop + offsetV;
  }

  return anchorParagraphY + offsetV;
}

/**
 * Resolve horizontal paint position for an anchored graphic.
 */
export function resolveAnchoredGraphicX(
  anchor: {
    hRelativeFrom?: AnchorHRelative;
    alignH?: AnchorAlignH;
    offsetH?: number;
  },
  columnIndex: number,
  columns: ColumnLayoutForAnchor,
  objectWidth: number,
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

  let baseX: number;
  let availableWidth: number;
  if (relativeFrom === 'page') {
    baseX = 0;
    availableWidth = pageWidth != null ? pageWidth : contentWidth + marginLeft + marginRight;
  } else if (relativeFrom === 'margin') {
    baseX = contentLeft;
    availableWidth = contentWidth;
  } else {
    baseX = columnLeft;
    availableWidth = columns.width;
  }

  if (alignH === 'left') {
    return baseX + offsetH;
  }
  if (alignH === 'right') {
    return baseX + availableWidth - objectWidth - offsetH;
  }
  if (alignH === 'center') {
    return baseX + (availableWidth - objectWidth) / 2 + offsetH;
  }
  return baseX;
}
