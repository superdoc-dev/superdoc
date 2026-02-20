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
  activePageSize: {
    w: number;
    h: number;
  };
  pendingPageSize: {
    w: number;
    h: number;
  } | null;
  activeColumns: {
    count: number;
    gap: number;
  };
  pendingColumns: {
    count: number;
    gap: number;
  } | null;
  activeOrientation: 'portrait' | 'landscape' | null;
  pendingOrientation: 'portrait' | 'landscape' | null;
  hasAnyPages: boolean;
};
export type BreakDecision = {
  forcePageBreak: boolean;
  forceMidPageRegion: boolean;
  requiredParity?: 'even' | 'odd';
};
/**
 * Schedule section break effects by updating pending/active state and returning a break decision.
 * This function is pure with respect to inputs/outputs and does not mutate external variables.
 */
export declare function scheduleSectionBreak(
  block: SectionBreakBlock,
  state: SectionState,
  baseMargins: {
    top: number;
    bottom: number;
    left: number;
    right: number;
  },
  maxHeaderContentHeight?: number,
  maxFooterContentHeight?: number,
): {
  decision: BreakDecision;
  state: SectionState;
};
/**
 * Apply pending margins/pageSize/columns/orientation to active values at a page boundary and clear pending.
 */
export declare function applyPendingToActive(state: SectionState): SectionState;
