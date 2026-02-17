import type { SectionBreakBlock } from '@superdoc/contracts';

export type SectionState = {
  activeTopMargin: number;
  activeBottomMargin: number;
  activeLeftMargin: number;
  activeRightMargin: number;
  pendingTopMargin: number | null;
  pendingBottomMargin: number | null;
  pendingLeftMargin: number | null;
  pendingRightMargin: number | null;
  activeHeaderDistance: number;
  activeFooterDistance: number;
  pendingHeaderDistance: number | null;
  pendingFooterDistance: number | null;
  activePageSize: { w: number; h: number };
  pendingPageSize: { w: number; h: number } | null;
  activeColumns: { count: number; gap: number; withSeparator?: boolean };
  pendingColumns: { count: number; gap: number; withSeparator?: boolean } | null;
  activeOrientation: 'portrait' | 'landscape' | null;
  pendingOrientation: 'portrait' | 'landscape' | null;
  hasAnyPages: boolean;
};

export type BreakDecision = {
  forcePageBreak: boolean;
  forceMidPageRegion: boolean;
  requiredParity?: 'even' | 'odd';
};

/** Default single-column configuration per OOXML spec (absence of w:cols element) */
const SINGLE_COLUMN_DEFAULT: Readonly<{ count: number; gap: number; withSeparator?: boolean }> = {
  count: 1,
  gap: 0,
};

/**
 * Get the column configuration for a section break.
 * Returns the explicit column config if defined, otherwise returns single-column default.
 * Per OOXML spec, absence of <w:cols> element means single column layout.
 *
 * @param blockColumns - The columns property from the section break block (may be undefined)
 * @returns Column configuration with count, gap, and separator presence
 */
function getColumnConfig(blockColumns: { count: number; gap: number; withSeparator?: boolean } | undefined): {
  count: number;
  gap: number;
  withSeparator?: boolean;
} {
  return blockColumns
    ? { count: blockColumns.count, gap: blockColumns.gap, withSeparator: blockColumns.withSeparator }
    : { ...SINGLE_COLUMN_DEFAULT };
}

/**
 * Detect if columns are changing between the current active state and a new section.
 * Returns true if:
 * - Section explicitly defines different columns than current, OR
 * - Section has no columns defined (reset to single column) and current has multi-column
 *
 * @param blockColumns - The columns property from the section break block (may be undefined)
 * @param activeColumns - The current active column configuration
 * @returns True if column layout is changing
 */
function isColumnConfigChanging(
  blockColumns: { count: number; gap: number } | undefined,
  activeColumns: { count: number; gap: number },
): boolean {
  if (blockColumns) {
    // Explicit column change
    return blockColumns.count !== activeColumns.count || blockColumns.gap !== activeColumns.gap;
  }
  // No columns specified = reset to single column (OOXML default)
  // This is a change only if currently in multi-column layout
  return activeColumns.count > 1;
}

/**
 * Schedule section break effects by updating pending/active state and returning a break decision.
 *
 * This function analyzes a section break block to determine what layout changes should occur
 * (e.g., page break, column changes) and schedules the new section properties (margins, page size,
 * columns) to be applied at the appropriate boundary. It is pure with respect to inputs/outputs
 * and does not mutate external variables.
 *
 * The function handles special cases like the first section (applied immediately to active state)
 * and accounts for header content height to prevent header/body overlap.
 *
 * Column handling follows OOXML spec: absence of <w:cols> element means single column layout.
 * When a section break has no columns defined, it resets to single column (not inherited from previous).
 *
 * @param block - The section break block with margin/page/column settings
 * @param state - Current section state containing active and pending layout properties
 * @param baseMargins - Base document margins in pixels (top, bottom, left, right)
 * @param maxHeaderContentHeight - Maximum header content height in pixels across all header variants.
 *        When provided (> 0), ensures body content starts below header content by adjusting top margin
 *        to be at least headerDistance + maxHeaderContentHeight. Defaults to 0 (no header overlap prevention).
 * @param maxFooterContentHeight - Maximum footer content height in pixels across all footer variants.
 *        When provided (> 0), ensures body content ends above footer content by adjusting bottom margin
 *        to be at least footerDistance + maxFooterContentHeight. Defaults to 0 (no footer overlap prevention).
 * @returns Object containing:
 *   - decision: Break decision with flags for page breaks, mid-page regions, and parity requirements
 *   - state: Updated section state with scheduled pending properties
 * @example
 * ```typescript
 * // Schedule a next-page section break with new margins
 * const { decision, state: newState } = scheduleSectionBreak(
 *   {
 *     kind: 'sectionBreak',
 *     type: 'nextPage',
 *     margins: { top: 72, bottom: 72, header: 36, footer: 36 },
 *     columns: { count: 2, gap: 24 }
 *   },
 *   currentState,
 *   { top: 72, bottom: 72, left: 72, right: 72 },
 *   48 // header content height
 * );
 * // decision.forcePageBreak === true
 * // newState.pendingTopMargin === Math.max(72, 36 + 48) = 84
 * ```
 */
export function scheduleSectionBreak(
  block: SectionBreakBlock,
  state: SectionState,
  baseMargins: { top: number; bottom: number; left: number; right: number },
  maxHeaderContentHeight: number = 0,
  maxFooterContentHeight: number = 0,
): { decision: BreakDecision; state: SectionState } {
  const next = { ...state };

  // Helper to calculate required top margin that accounts for header content height
  const calcRequiredTopMargin = (headerDistance: number, baseTop: number): number => {
    if (maxHeaderContentHeight > 0) {
      // Word always positions header at headerDistance from page top.
      // Body must start at headerDistance + headerContentHeight (where header content ends).
      // This matches Word behavior regardless of baseTop (even for zero-margin docs).
      return Math.max(baseTop, headerDistance + maxHeaderContentHeight);
    }
    // Without header content, body starts at baseTop (no headerDistance consideration)
    return baseTop;
  };

  // Helper to calculate required bottom margin that accounts for footer content height
  const calcRequiredBottomMargin = (footerDistance: number, baseBottom: number): number => {
    if (maxFooterContentHeight > 0) {
      // Word always positions footer at footerDistance from page bottom.
      // Body must end at footerDistance + footerContentHeight from page bottom.
      return Math.max(baseBottom, footerDistance + maxFooterContentHeight);
    }
    // Without footer content, body ends at baseBottom (no footerDistance consideration)
    return baseBottom;
  };

  // Special handling for first section break (appears before any content)
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
      next.activeTopMargin = calcRequiredTopMargin(headerDistance, sectionTop);
      next.pendingTopMargin = next.activeTopMargin;
    }
    if (block.margins?.bottom !== undefined || block.margins?.footer !== undefined) {
      next.activeBottomMargin = calcRequiredBottomMargin(footerDistance, sectionBottom);
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
    // Set columns for first section: use explicit config or default to single column (OOXML default)
    next.activeColumns = getColumnConfig(block.columns);
    next.pendingColumns = null;
    return { decision: { forcePageBreak: false, forceMidPageRegion: false }, state: next };
  }

  // Update pending margins (take max to ensure header/footer space)
  const headerPx = block.margins?.header;
  const footerPx = block.margins?.footer;
  const topPx = block.margins?.top;
  const bottomPx = block.margins?.bottom;
  const nextTop = next.pendingTopMargin ?? next.activeTopMargin;
  const nextBottom = next.pendingBottomMargin ?? next.activeBottomMargin;
  const nextLeft = next.pendingLeftMargin ?? next.activeLeftMargin;
  const nextRight = next.pendingRightMargin ?? next.activeRightMargin;
  const nextHeader = next.pendingHeaderDistance ?? next.activeHeaderDistance;
  const nextFooter = next.pendingFooterDistance ?? next.activeFooterDistance;

  // When header margin changes, recalculate top margin accounting for header content height
  if (typeof headerPx === 'number' || typeof topPx === 'number') {
    const newHeaderDist = typeof headerPx === 'number' ? Math.max(0, headerPx) : nextHeader;
    const sectionTop = typeof topPx === 'number' ? Math.max(0, topPx) : baseMargins.top;
    next.pendingHeaderDistance = newHeaderDist;
    next.pendingTopMargin = calcRequiredTopMargin(newHeaderDist, sectionTop);
  } else {
    next.pendingTopMargin = nextTop;
    next.pendingHeaderDistance = nextHeader;
  }

  // When footer margin changes, recalculate bottom margin accounting for footer content height
  if (typeof footerPx === 'number' || typeof bottomPx === 'number') {
    const newFooterDist = typeof footerPx === 'number' ? Math.max(0, footerPx) : nextFooter;
    const sectionBottom = typeof bottomPx === 'number' ? Math.max(0, bottomPx) : baseMargins.bottom;
    next.pendingFooterDistance = newFooterDist;
    next.pendingBottomMargin = calcRequiredBottomMargin(newFooterDist, sectionBottom);
  } else {
    next.pendingBottomMargin = nextBottom;
    next.pendingFooterDistance = nextFooter;
  }

  // Update pending left/right margins
  if (typeof block.margins?.left === 'number') {
    next.pendingLeftMargin = Math.max(0, block.margins.left);
  } else {
    next.pendingLeftMargin = nextLeft;
  }
  if (typeof block.margins?.right === 'number') {
    next.pendingRightMargin = Math.max(0, block.margins.right);
  } else {
    next.pendingRightMargin = nextRight;
  }

  // Schedule page size change if present
  if (block.pageSize) {
    next.pendingPageSize = { w: block.pageSize.w, h: block.pageSize.h };
  }

  // Schedule orientation change if present
  if (block.orientation) {
    next.pendingOrientation = block.orientation;
  }

  // Determine section type
  const sectionType = block.type ?? 'continuous';

  // Detect column changes (explicit or implicit reset to single column)
  const isColumnsChanging = isColumnConfigChanging(block.columns, next.activeColumns);

  // Word behavior parity override: require page boundary mid-page when necessary
  if (block.attrs?.requirePageBoundary) {
    next.pendingColumns = getColumnConfig(block.columns);
    return { decision: { forcePageBreak: true, forceMidPageRegion: false }, state: next };
  }

  switch (sectionType) {
    case 'nextPage': {
      next.pendingColumns = getColumnConfig(block.columns);
      return { decision: { forcePageBreak: true, forceMidPageRegion: false }, state: next };
    }
    case 'evenPage': {
      next.pendingColumns = getColumnConfig(block.columns);
      return {
        decision: { forcePageBreak: true, forceMidPageRegion: false, requiredParity: 'even' },
        state: next,
      };
    }
    case 'oddPage': {
      next.pendingColumns = getColumnConfig(block.columns);
      return {
        decision: { forcePageBreak: true, forceMidPageRegion: false, requiredParity: 'odd' },
        state: next,
      };
    }
    case 'continuous':
    default: {
      if (isColumnsChanging) {
        // Mid-page column change: set pendingColumns and signal forceMidPageRegion
        next.pendingColumns = getColumnConfig(block.columns);
        return { decision: { forcePageBreak: false, forceMidPageRegion: true }, state: next };
      }
      // No column change, but still schedule column config for next page boundary
      next.pendingColumns = getColumnConfig(block.columns);
      return { decision: { forcePageBreak: false, forceMidPageRegion: false }, state: next };
    }
  }
}

/**
 * Apply pending section state to active state at a page boundary.
 * Transfers all pending values (margins, page size, columns, orientation) to their
 * active counterparts and clears the pending values.
 *
 * @param state - Current section state with pending values to apply
 * @returns New section state with pending values applied to active and pending cleared
 */
export function applyPendingToActive(state: SectionState): SectionState {
  const next: SectionState = { ...state };

  if (next.pendingTopMargin != null) {
    next.activeTopMargin = next.pendingTopMargin;
  }
  if (next.pendingBottomMargin != null) {
    next.activeBottomMargin = next.pendingBottomMargin;
  }
  if (next.pendingLeftMargin != null) {
    next.activeLeftMargin = next.pendingLeftMargin;
  }
  if (next.pendingRightMargin != null) {
    next.activeRightMargin = next.pendingRightMargin;
  }
  if (next.pendingHeaderDistance != null) {
    next.activeHeaderDistance = next.pendingHeaderDistance;
  }
  if (next.pendingFooterDistance != null) {
    next.activeFooterDistance = next.pendingFooterDistance;
  }
  if (next.pendingPageSize != null) {
    next.activePageSize = next.pendingPageSize;
  }
  if (next.pendingColumns != null) {
    next.activeColumns = next.pendingColumns;
  }
  if (next.pendingOrientation != null) {
    next.activeOrientation = next.pendingOrientation;
  }
  next.pendingTopMargin = null;
  next.pendingBottomMargin = null;
  next.pendingLeftMargin = null;
  next.pendingRightMargin = null;
  next.pendingHeaderDistance = null;
  next.pendingFooterDistance = null;
  next.pendingPageSize = null;
  next.pendingColumns = null;
  next.pendingOrientation = null;
  return next;
}
