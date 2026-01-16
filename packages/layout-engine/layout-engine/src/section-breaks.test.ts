import type { SectionBreakBlock } from '@superdoc/contracts';
import { describe, expect, it } from 'vitest';

import { scheduleSectionBreak, applyPendingToActive, type SectionState } from './section-breaks';

/**
 * Creates a minimal SectionState for testing with sensible defaults.
 */
function createSectionState(overrides: Partial<SectionState> = {}): SectionState {
  return {
    activeTopMargin: 72,
    activeBottomMargin: 72,
    activeLeftMargin: 72,
    activeRightMargin: 72,
    pendingTopMargin: null,
    pendingBottomMargin: null,
    pendingLeftMargin: null,
    pendingRightMargin: null,
    activeHeaderDistance: 36,
    activeFooterDistance: 36,
    pendingHeaderDistance: null,
    pendingFooterDistance: null,
    activePageSize: { w: 816, h: 1056 },
    pendingPageSize: null,
    activeColumns: { count: 1, gap: 0 },
    pendingColumns: null,
    activeOrientation: null,
    pendingOrientation: null,
    hasAnyPages: true,
    ...overrides,
  };
}

/**
 * Creates a SectionBreakBlock for testing.
 */
function createSectionBreak(overrides: Partial<SectionBreakBlock> = {}): SectionBreakBlock {
  return {
    kind: 'sectionBreak',
    id: 'test-section-break',
    ...overrides,
  } as SectionBreakBlock;
}

const BASE_MARGINS = { top: 72, bottom: 72, left: 72, right: 72 };

describe('scheduleSectionBreak', () => {
  describe('column configuration handling', () => {
    describe('when block.columns is undefined (OOXML default = single column)', () => {
      it('sets pendingColumns to single column for continuous section break', () => {
        const state = createSectionState({ activeColumns: { count: 1, gap: 0 } });
        const block = createSectionBreak({ type: 'continuous' });

        const result = scheduleSectionBreak(block, state, BASE_MARGINS);

        expect(result.state.pendingColumns).toEqual({ count: 1, gap: 0 });
        expect(result.decision.forceMidPageRegion).toBe(false);
      });

      it('sets pendingColumns to single column for nextPage section break', () => {
        const state = createSectionState({ activeColumns: { count: 2, gap: 48 } });
        const block = createSectionBreak({ type: 'nextPage' });

        const result = scheduleSectionBreak(block, state, BASE_MARGINS);

        expect(result.state.pendingColumns).toEqual({ count: 1, gap: 0 });
        expect(result.decision.forcePageBreak).toBe(true);
      });

      it('detects column change when resetting from multi-column to single column', () => {
        const state = createSectionState({ activeColumns: { count: 2, gap: 48 } });
        const block = createSectionBreak({ type: 'continuous' });

        const result = scheduleSectionBreak(block, state, BASE_MARGINS);

        expect(result.decision.forceMidPageRegion).toBe(true);
        expect(result.state.pendingColumns).toEqual({ count: 1, gap: 0 });
      });

      it('does not trigger mid-page region change when already single column', () => {
        const state = createSectionState({ activeColumns: { count: 1, gap: 0 } });
        const block = createSectionBreak({ type: 'continuous' });

        const result = scheduleSectionBreak(block, state, BASE_MARGINS);

        expect(result.decision.forceMidPageRegion).toBe(false);
        expect(result.state.pendingColumns).toEqual({ count: 1, gap: 0 });
      });
    });

    describe('when block.columns is explicitly defined', () => {
      it('uses explicit column configuration', () => {
        const state = createSectionState({ activeColumns: { count: 1, gap: 0 } });
        const block = createSectionBreak({
          type: 'continuous',
          columns: { count: 2, gap: 48 },
        });

        const result = scheduleSectionBreak(block, state, BASE_MARGINS);

        expect(result.state.pendingColumns).toEqual({ count: 2, gap: 48 });
        expect(result.decision.forceMidPageRegion).toBe(true);
      });

      it('detects column change when count differs', () => {
        const state = createSectionState({ activeColumns: { count: 2, gap: 48 } });
        const block = createSectionBreak({
          type: 'continuous',
          columns: { count: 3, gap: 48 },
        });

        const result = scheduleSectionBreak(block, state, BASE_MARGINS);

        expect(result.decision.forceMidPageRegion).toBe(true);
        expect(result.state.pendingColumns).toEqual({ count: 3, gap: 48 });
      });

      it('detects column change when gap differs', () => {
        const state = createSectionState({ activeColumns: { count: 2, gap: 48 } });
        const block = createSectionBreak({
          type: 'continuous',
          columns: { count: 2, gap: 24 },
        });

        const result = scheduleSectionBreak(block, state, BASE_MARGINS);

        expect(result.decision.forceMidPageRegion).toBe(true);
        expect(result.state.pendingColumns).toEqual({ count: 2, gap: 24 });
      });

      it('does not trigger mid-page region change when columns unchanged', () => {
        const state = createSectionState({ activeColumns: { count: 2, gap: 48 } });
        const block = createSectionBreak({
          type: 'continuous',
          columns: { count: 2, gap: 48 },
        });

        const result = scheduleSectionBreak(block, state, BASE_MARGINS);

        expect(result.decision.forceMidPageRegion).toBe(false);
        expect(result.state.pendingColumns).toEqual({ count: 2, gap: 48 });
      });
    });

    describe('first section handling', () => {
      it('sets activeColumns to single column when block.columns is undefined', () => {
        const state = createSectionState({ hasAnyPages: false });
        const block = createSectionBreak({
          attrs: { isFirstSection: true },
        });

        const result = scheduleSectionBreak(block, state, BASE_MARGINS);

        expect(result.state.activeColumns).toEqual({ count: 1, gap: 0 });
        expect(result.state.pendingColumns).toBeNull();
      });

      it('sets activeColumns to explicit config when block.columns is defined', () => {
        const state = createSectionState({ hasAnyPages: false });
        const block = createSectionBreak({
          attrs: { isFirstSection: true },
          columns: { count: 2, gap: 48 },
        });

        const result = scheduleSectionBreak(block, state, BASE_MARGINS);

        expect(result.state.activeColumns).toEqual({ count: 2, gap: 48 });
        expect(result.state.pendingColumns).toBeNull();
      });
    });

    describe('section break types with column reset', () => {
      it('evenPage section break resets columns to single when undefined', () => {
        const state = createSectionState({ activeColumns: { count: 2, gap: 48 } });
        const block = createSectionBreak({ type: 'evenPage' });

        const result = scheduleSectionBreak(block, state, BASE_MARGINS);

        expect(result.decision.forcePageBreak).toBe(true);
        expect(result.decision.requiredParity).toBe('even');
        expect(result.state.pendingColumns).toEqual({ count: 1, gap: 0 });
      });

      it('oddPage section break resets columns to single when undefined', () => {
        const state = createSectionState({ activeColumns: { count: 2, gap: 48 } });
        const block = createSectionBreak({ type: 'oddPage' });

        const result = scheduleSectionBreak(block, state, BASE_MARGINS);

        expect(result.decision.forcePageBreak).toBe(true);
        expect(result.decision.requiredParity).toBe('odd');
        expect(result.state.pendingColumns).toEqual({ count: 1, gap: 0 });
      });

      it('requirePageBoundary attr resets columns to single when undefined', () => {
        const state = createSectionState({ activeColumns: { count: 2, gap: 48 } });
        const block = createSectionBreak({
          type: 'continuous',
          attrs: { requirePageBoundary: true },
        });

        const result = scheduleSectionBreak(block, state, BASE_MARGINS);

        expect(result.decision.forcePageBreak).toBe(true);
        expect(result.state.pendingColumns).toEqual({ count: 1, gap: 0 });
      });
    });
  });

  describe('real-world scenario: mixed-column document', () => {
    it('handles transition from single -> 2-column -> single column sections', () => {
      // Section 0: Single column (first section, no columns defined)
      let state = createSectionState({ hasAnyPages: false });
      let block = createSectionBreak({ attrs: { isFirstSection: true, sectionIndex: 0 } });
      let result = scheduleSectionBreak(block, state, BASE_MARGINS);

      expect(result.state.activeColumns).toEqual({ count: 1, gap: 0 });

      // Section 1: Change to 2 columns (continuous)
      state = createSectionState({
        ...result.state,
        hasAnyPages: true,
      });
      block = createSectionBreak({
        type: 'continuous',
        columns: { count: 2, gap: 48 },
        attrs: { sectionIndex: 1 },
      });
      result = scheduleSectionBreak(block, state, BASE_MARGINS);

      expect(result.decision.forceMidPageRegion).toBe(true);
      expect(result.state.pendingColumns).toEqual({ count: 2, gap: 48 });

      // Apply pending to simulate page boundary
      state = applyPendingToActive(result.state);
      expect(state.activeColumns).toEqual({ count: 2, gap: 48 });

      // Section 2: Stay at 2 columns (continuous, same config)
      block = createSectionBreak({
        type: 'continuous',
        columns: { count: 2, gap: 48 },
        attrs: { sectionIndex: 2 },
      });
      result = scheduleSectionBreak(block, state, BASE_MARGINS);

      expect(result.decision.forceMidPageRegion).toBe(false);
      expect(result.state.pendingColumns).toEqual({ count: 2, gap: 48 });

      // Section 3: Reset to single column (continuous, columns undefined)
      // This is the key fix - absence of columns means reset to single column
      block = createSectionBreak({
        type: 'continuous',
        attrs: { sectionIndex: 3 },
        // Note: no columns property = reset to single column per OOXML spec
      });
      result = scheduleSectionBreak(block, state, BASE_MARGINS);

      expect(result.decision.forceMidPageRegion).toBe(true);
      expect(result.state.pendingColumns).toEqual({ count: 1, gap: 0 });
    });
  });
});

describe('applyPendingToActive', () => {
  it('applies pendingColumns to activeColumns', () => {
    const state = createSectionState({
      activeColumns: { count: 1, gap: 0 },
      pendingColumns: { count: 2, gap: 48 },
    });

    const result = applyPendingToActive(state);

    expect(result.activeColumns).toEqual({ count: 2, gap: 48 });
    expect(result.pendingColumns).toBeNull();
  });

  it('preserves activeColumns when pendingColumns is null', () => {
    const state = createSectionState({
      activeColumns: { count: 2, gap: 48 },
      pendingColumns: null,
    });

    const result = applyPendingToActive(state);

    expect(result.activeColumns).toEqual({ count: 2, gap: 48 });
    expect(result.pendingColumns).toBeNull();
  });

  it('clears all pending values after applying', () => {
    const state = createSectionState({
      pendingTopMargin: 100,
      pendingBottomMargin: 100,
      pendingLeftMargin: 50,
      pendingRightMargin: 50,
      pendingHeaderDistance: 20,
      pendingFooterDistance: 20,
      pendingPageSize: { w: 600, h: 800 },
      pendingColumns: { count: 3, gap: 24 },
      pendingOrientation: 'landscape',
    });

    const result = applyPendingToActive(state);

    expect(result.pendingTopMargin).toBeNull();
    expect(result.pendingBottomMargin).toBeNull();
    expect(result.pendingLeftMargin).toBeNull();
    expect(result.pendingRightMargin).toBeNull();
    expect(result.pendingHeaderDistance).toBeNull();
    expect(result.pendingFooterDistance).toBeNull();
    expect(result.pendingPageSize).toBeNull();
    expect(result.pendingColumns).toBeNull();
    expect(result.pendingOrientation).toBeNull();
  });
});
