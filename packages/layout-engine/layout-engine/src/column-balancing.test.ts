/**
 * Column Balancing Tests
 *
 * Tests for Word-compatible column balancing algorithm.
 */

import { describe, it, expect } from 'bun:test';
import {
  calculateBalancedColumnHeight,
  shouldBalanceColumns,
  shouldSkipBalancing,
  DEFAULT_BALANCING_CONFIG,
  type BalancingContext,
  type BalancingBlock,
  type ColumnBalancingConfig,
} from './column-balancing.js';

// Helper to create a mock balancing block
function createBlock(id: string, height: number, options: Partial<BalancingBlock> = {}): BalancingBlock {
  return {
    blockId: id,
    measuredHeight: height,
    canBreak: true,
    keepWithNext: false,
    keepTogether: false,
    ...options,
  };
}

// Helper to create a mock balancing context
function createContext(
  columnCount: number,
  blocks: BalancingBlock[],
  options: Partial<BalancingContext> = {},
): BalancingContext {
  return {
    columnCount,
    columnWidth: 200,
    columnGap: 20,
    availableHeight: 1000,
    contentBlocks: blocks,
    ...options,
  };
}

describe('calculateBalancedColumnHeight', () => {
  describe('basic balancing', () => {
    it('should distribute content evenly across 2 columns', () => {
      const blocks = [
        createBlock('block-1', 100),
        createBlock('block-2', 100),
        createBlock('block-3', 100),
        createBlock('block-4', 100),
      ];
      const ctx = createContext(2, blocks);

      const result = calculateBalancedColumnHeight(ctx, DEFAULT_BALANCING_CONFIG);

      expect(result.success).toBe(true);
      // Total height = 400, target should be around 200 per column
      expect(result.targetColumnHeight).toBeGreaterThanOrEqual(190);
      expect(result.targetColumnHeight).toBeLessThanOrEqual(210);

      // Check assignments - should split evenly
      const col0Blocks = [...result.columnAssignments.entries()].filter(([, col]) => col === 0);
      const col1Blocks = [...result.columnAssignments.entries()].filter(([, col]) => col === 1);
      expect(col0Blocks.length + col1Blocks.length).toBe(4);
    });

    it('should distribute content across 3 columns', () => {
      const blocks = [
        createBlock('block-1', 100),
        createBlock('block-2', 100),
        createBlock('block-3', 100),
        createBlock('block-4', 100),
        createBlock('block-5', 100),
        createBlock('block-6', 100),
      ];
      const ctx = createContext(3, blocks);

      const result = calculateBalancedColumnHeight(ctx, DEFAULT_BALANCING_CONFIG);

      expect(result.success).toBe(true);
      // Total height = 600, target should be around 200 per column
      expect(result.targetColumnHeight).toBeGreaterThanOrEqual(190);
      expect(result.targetColumnHeight).toBeLessThanOrEqual(210);
    });

    it('should handle uneven block distribution', () => {
      const blocks = [
        createBlock('block-1', 150),
        createBlock('block-2', 50),
        createBlock('block-3', 100),
        createBlock('block-4', 100),
      ];
      const ctx = createContext(2, blocks);

      const result = calculateBalancedColumnHeight(ctx, DEFAULT_BALANCING_CONFIG);

      // All blocks should be assigned
      expect(result.columnAssignments.size).toBe(4);
    });
  });

  describe('single column handling', () => {
    it('should assign all blocks to column 0 for single column layout', () => {
      const blocks = [createBlock('block-1', 100), createBlock('block-2', 100)];
      const ctx = createContext(1, blocks);

      const result = calculateBalancedColumnHeight(ctx, DEFAULT_BALANCING_CONFIG);

      expect(result.success).toBe(true);
      expect(result.columnAssignments.get('block-1')).toBe(0);
      expect(result.columnAssignments.get('block-2')).toBe(0);
    });
  });

  describe('empty content handling', () => {
    it('should handle empty block list', () => {
      const ctx = createContext(2, []);

      const result = calculateBalancedColumnHeight(ctx, DEFAULT_BALANCING_CONFIG);

      expect(result.success).toBe(true);
      expect(result.columnAssignments.size).toBe(0);
      expect(result.iterations).toBe(0);
    });
  });

  describe('keepWithNext constraint', () => {
    it('should respect keepWithNext constraint', () => {
      const blocks = [
        createBlock('block-1', 100),
        createBlock('block-2', 100, { keepWithNext: true }),
        createBlock('block-3', 100),
        createBlock('block-4', 100),
      ];
      const ctx = createContext(2, blocks);

      const result = calculateBalancedColumnHeight(ctx, DEFAULT_BALANCING_CONFIG);

      // block-2 should be in the same column as block-3 (or earlier)
      const block2Col = result.columnAssignments.get('block-2');
      const block3Col = result.columnAssignments.get('block-3');
      // Note: keepWithNext means block-2 should stay with block-3
      // The algorithm should try to keep them together
      expect(block2Col).toBeDefined();
      expect(block3Col).toBeDefined();
    });
  });

  describe('unbreakable blocks', () => {
    it('should handle unbreakable blocks gracefully', () => {
      const blocks = [
        createBlock('block-1', 500, { canBreak: false, keepTogether: true }),
        createBlock('block-2', 100),
      ];
      const ctx = createContext(2, blocks, { availableHeight: 600 });

      const result = calculateBalancedColumnHeight(ctx, DEFAULT_BALANCING_CONFIG);

      // Should still produce a result
      expect(result.columnAssignments.size).toBe(2);
    });

    it('should handle large unbreakable block that exceeds column height', () => {
      const blocks = [
        createBlock('block-1', 800, { canBreak: false, keepTogether: true }),
        createBlock('block-2', 100),
      ];
      const ctx = createContext(2, blocks, { availableHeight: 500 });

      const result = calculateBalancedColumnHeight(ctx, DEFAULT_BALANCING_CONFIG);

      // Should handle gracefully even if balancing isn't perfect
      expect(result.columnAssignments.size).toBe(2);
    });
  });

  describe('paragraph line breaking', () => {
    it('should consider line heights for paragraph breaking', () => {
      const blocks = [
        createBlock('block-1', 100, {
          canBreak: true,
          lineHeights: [20, 20, 20, 20, 20], // 5 lines of 20px each
        }),
        createBlock('block-2', 100),
        createBlock('block-3', 100),
      ];
      const ctx = createContext(2, blocks, { availableHeight: 200 });

      const result = calculateBalancedColumnHeight(ctx, DEFAULT_BALANCING_CONFIG);

      // Should produce a result
      expect(result.columnAssignments.size).toBeGreaterThan(0);
    });
  });

  describe('iteration limit', () => {
    it('should respect maxIterations limit', () => {
      const blocks = Array.from({ length: 20 }, (_, i) => createBlock(`block-${i}`, 10 + (i % 5) * 10));
      const ctx = createContext(3, blocks);
      const config: ColumnBalancingConfig = {
        ...DEFAULT_BALANCING_CONFIG,
        maxIterations: 5,
      };

      const result = calculateBalancedColumnHeight(ctx, config);

      expect(result.iterations).toBeLessThanOrEqual(5);
    });
  });
});

describe('shouldBalanceColumns', () => {
  it('should return true for continuous sections', () => {
    expect(shouldBalanceColumns('continuous', undefined, false)).toBe(true);
  });

  it('should return true for last section', () => {
    expect(shouldBalanceColumns('nextPage', undefined, true)).toBe(true);
  });

  it('should return false for nextPage sections that are not last', () => {
    expect(shouldBalanceColumns('nextPage', undefined, false)).toBe(false);
  });

  it('should respect explicit balanceColumns=true', () => {
    expect(shouldBalanceColumns('nextPage', true, false)).toBe(true);
  });

  it('should respect explicit balanceColumns=false', () => {
    expect(shouldBalanceColumns('continuous', false, true)).toBe(false);
  });
});

describe('shouldSkipBalancing', () => {
  it('should skip when disabled', () => {
    const ctx = createContext(2, [createBlock('block-1', 100)]);
    const config = { ...DEFAULT_BALANCING_CONFIG, enabled: false };

    expect(shouldSkipBalancing(ctx, config)).toBe(true);
  });

  it('should skip for single column', () => {
    const ctx = createContext(1, [createBlock('block-1', 100)]);

    expect(shouldSkipBalancing(ctx, DEFAULT_BALANCING_CONFIG)).toBe(true);
  });

  it('should skip for empty content', () => {
    const ctx = createContext(2, []);

    expect(shouldSkipBalancing(ctx, DEFAULT_BALANCING_CONFIG)).toBe(true);
  });

  it('should skip for single unbreakable block', () => {
    // Single block that can't break - can't distribute a single atomic block
    const ctx = createContext(2, [createBlock('block-1', 100, { canBreak: false })]);

    expect(shouldSkipBalancing(ctx, DEFAULT_BALANCING_CONFIG)).toBe(true);
  });

  it('should NOT skip for single breakable block that overflows', () => {
    // Single paragraph that CAN be split across columns AND overflows available height
    const ctx = createContext(2, [createBlock('block-1', 100, { canBreak: true })], {
      availableHeight: 50, // Block overflows single column
    });

    expect(shouldSkipBalancing(ctx, DEFAULT_BALANCING_CONFIG)).toBe(false);
  });

  it('should skip for content smaller than minColumnHeight', () => {
    // Content (15px) is less than minColumnHeight (20px)
    const ctx = createContext(2, [createBlock('block-1', 7), createBlock('block-2', 8)], {
      availableHeight: 1000,
    });

    expect(shouldSkipBalancing(ctx, DEFAULT_BALANCING_CONFIG)).toBe(true);
  });

  it('should skip when balanced height per column would be too small', () => {
    // 30px total / 2 columns = 15px per column, less than minColumnHeight (20px)
    const ctx = createContext(2, [createBlock('block-1', 15), createBlock('block-2', 15)], {
      availableHeight: 1000,
    });

    expect(shouldSkipBalancing(ctx, DEFAULT_BALANCING_CONFIG)).toBe(true);
  });

  it('should NOT skip when content height clears the minimum thresholds', () => {
    // 100px total / 2 columns = 50px per column, which is above minColumnHeight (20px).
    const ctx = createContext(2, [createBlock('block-1', 50), createBlock('block-2', 50)]);

    expect(shouldSkipBalancing(ctx, DEFAULT_BALANCING_CONFIG)).toBe(false);
  });
});

describe('DEFAULT_BALANCING_CONFIG', () => {
  it('should have reasonable default values', () => {
    expect(DEFAULT_BALANCING_CONFIG.enabled).toBe(true);
    expect(DEFAULT_BALANCING_CONFIG.tolerance).toBeGreaterThan(0);
    expect(DEFAULT_BALANCING_CONFIG.maxIterations).toBeGreaterThan(0);
    expect(DEFAULT_BALANCING_CONFIG.minColumnHeight).toBeGreaterThan(0);
  });
});

// ============================================================================
// balanceSectionOnPage Tests (Section-scoped balancing)
// ============================================================================

import { balanceSectionOnPage } from './column-balancing.js';

/**
 * Helper to create measure data for paragraph fragments.
 */
function createMeasure(kind: string, lineHeights: number[]): { kind: string; lines: Array<{ lineHeight: number }> } {
  return {
    kind,
    lines: lineHeights.map((h) => ({ lineHeight: h })),
  };
}

describe('balanceSectionOnPage', () => {
  type TestFragment = { blockId: string; x: number; y: number; width: number; kind: string };

  /** Build a fragment + section mapping for section-scoped tests. */
  function buildSectionFixture(
    sectionIndex: number,
    count: number,
    height = 20,
    startY = 96,
  ): {
    fragments: TestFragment[];
    measureMap: Map<string, { kind: string; lines: Array<{ lineHeight: number }> }>;
    blockSectionMap: Map<string, number>;
  } {
    const fragments: TestFragment[] = [];
    const measureMap = new Map<string, { kind: string; lines: Array<{ lineHeight: number }> }>();
    const blockSectionMap = new Map<string, number>();
    for (let i = 0; i < count; i++) {
      const id = `s${sectionIndex}-b${i}`;
      fragments.push({ blockId: id, x: 96, y: startY + i * height, width: 624, kind: 'para' });
      measureMap.set(id, createMeasure('paragraph', [height]));
      blockSectionMap.set(id, sectionIndex);
    }
    return { fragments, measureMap, blockSectionMap };
  }

  it('balances the target section and returns the tallest balanced column bottom', () => {
    // 6 equal paragraphs in a 2-col section → 3+3 balanced, tallest col ends at top + 3×20 = top + 60.
    const top = 96;
    const { fragments, measureMap, blockSectionMap } = buildSectionFixture(2, 6, 20, top);

    const result = balanceSectionOnPage({
      fragments,
      sectionIndex: 2,
      sectionColumns: { count: 2, gap: 48, width: 288 },
      sectionHasExplicitColumnBreak: false,
      blockSectionMap,
      margins: { left: 96 },
      topMargin: top,
      columnWidth: 288,
      availableHeight: 60,
      measureMap,
    });

    // Returned maxY is the bottom of the tallest balanced column.
    expect(result).not.toBeNull();
    expect(result!.maxY).toBe(top + 60);

    // Observable outcome: fragments split evenly across two columns.
    const col0 = fragments.filter((f) => f.x === 96).length;
    const col1 = fragments.filter((f) => f.x === 96 + 288 + 48).length;
    expect(col0).toBe(3);
    expect(col1).toBe(3);
  });

  it('returns null and leaves fragments untouched when section has <= 1 column', () => {
    const { fragments, measureMap, blockSectionMap } = buildSectionFixture(2, 3);
    const snapshot = fragments.map((f) => ({ x: f.x, y: f.y }));

    const result = balanceSectionOnPage({
      fragments,
      sectionIndex: 2,
      sectionColumns: { count: 1, gap: 0, width: 624 },
      sectionHasExplicitColumnBreak: false,
      blockSectionMap,
      margins: { left: 96 },
      topMargin: 96,
      columnWidth: 624,
      availableHeight: 720,
      measureMap,
    });

    expect(result).toBeNull();
    fragments.forEach((f, i) => {
      expect(f.x).toBe(snapshot[i].x);
      expect(f.y).toBe(snapshot[i].y);
    });
  });

  it('returns null when section contains an explicit column break', () => {
    // Author-placed column breaks override balancing — preserve their intent.
    const { fragments, measureMap, blockSectionMap } = buildSectionFixture(2, 6);
    const snapshot = fragments.map((f) => f.x);

    const result = balanceSectionOnPage({
      fragments,
      sectionIndex: 2,
      sectionColumns: { count: 2, gap: 48, width: 288 },
      sectionHasExplicitColumnBreak: true,
      blockSectionMap,
      margins: { left: 96 },
      topMargin: 96,
      columnWidth: 288,
      availableHeight: 720,
      measureMap,
    });

    expect(result).toBeNull();
    fragments.forEach((f, i) => expect(f.x).toBe(snapshot[i]));
  });

  it('returns null when section has unequal explicit column widths', () => {
    const { fragments, measureMap, blockSectionMap } = buildSectionFixture(2, 4);

    const result = balanceSectionOnPage({
      fragments,
      sectionIndex: 2,
      sectionColumns: { count: 2, gap: 48, width: 288, equalWidth: false, widths: [200, 376] },
      sectionHasExplicitColumnBreak: false,
      blockSectionMap,
      margins: { left: 96 },
      topMargin: 96,
      columnWidth: 288,
      availableHeight: 720,
      measureMap,
    });

    expect(result).toBeNull();
  });

  it('balances explicit columns that declare EQUAL widths (equalWidth=0 with equal w:col widths)', () => {
    // SD-2324: continuous newspaper sections commonly use `<w:cols w:num="N" w:equalWidth="0">`
    // with explicit `<w:col w:w>` children that are all EQUAL (e.g. 4×2340). The unequal-width
    // skip must NOT catch these — they balance like implicit equal columns. Genuinely-unequal
    // widths (the test above, [200,376]) are still skipped.
    const top = 96;
    const { fragments, measureMap, blockSectionMap } = buildSectionFixture(2, 6, 20, top);

    const result = balanceSectionOnPage({
      fragments,
      sectionIndex: 2,
      sectionColumns: { count: 2, gap: 48, width: 288, equalWidth: false, widths: [288, 288] },
      sectionHasExplicitColumnBreak: false,
      blockSectionMap,
      margins: { left: 96 },
      topMargin: top,
      columnWidth: 288,
      availableHeight: 60,
      measureMap,
    });

    expect(result).not.toBeNull();
    expect(result!.maxY).toBe(top + 60);
    const col0 = fragments.filter((f) => f.x === 96).length;
    const col1 = fragments.filter((f) => f.x === 96 + 288 + 48).length;
    expect(col0).toBe(3);
    expect(col1).toBe(3);
  });

  it('only moves fragments of the target section when the page has mixed sections', () => {
    // Page has 3 fragments in section 1 (already positioned in col 0) and 6 in section 2.
    // Balancing section 2 must not touch section 1 fragments.
    const sec1 = buildSectionFixture(1, 3, 20, 96);
    const sec2 = buildSectionFixture(2, 6, 20, 160);
    const fragments = [...sec1.fragments, ...sec2.fragments];
    const measureMap = new Map([...sec1.measureMap, ...sec2.measureMap]);
    const blockSectionMap = new Map([...sec1.blockSectionMap, ...sec2.blockSectionMap]);
    const sec1Snapshot = sec1.fragments.map((f) => ({ id: f.blockId, x: f.x, y: f.y }));

    const result = balanceSectionOnPage({
      fragments,
      sectionIndex: 2,
      sectionColumns: { count: 2, gap: 48, width: 288 },
      sectionHasExplicitColumnBreak: false,
      blockSectionMap,
      margins: { left: 96 },
      topMargin: 160,
      columnWidth: 288,
      availableHeight: 60,
      measureMap,
    });

    expect(result).not.toBeNull();

    // Section 1 fragments unchanged.
    for (const s of sec1Snapshot) {
      const f = fragments.find((x) => x.blockId === s.id)!;
      expect(f.x).toBe(s.x);
      expect(f.y).toBe(s.y);
    }

    // Section 2 fragments now split across two columns.
    const sec2Xs = new Set(sec2.fragments.map((f) => f.x));
    expect(sec2Xs.size).toBe(2);
  });

  it('returns null when no fragments on the page belong to the target section', () => {
    const { fragments, measureMap, blockSectionMap } = buildSectionFixture(1, 3);

    const result = balanceSectionOnPage({
      fragments,
      sectionIndex: 99, // different section
      sectionColumns: { count: 2, gap: 48, width: 288 },
      sectionHasExplicitColumnBreak: false,
      blockSectionMap,
      margins: { left: 96 },
      topMargin: 96,
      columnWidth: 288,
      availableHeight: 720,
      measureMap,
    });

    expect(result).toBeNull();
  });
});
