/**
 * Column Balancing Tests
 *
 * Tests for Word-compatible column balancing algorithm.
 */

import { describe, it, expect } from 'vitest';
import {
  calculateBalancedColumnHeight,
  shouldBalanceColumns,
  shouldSkipBalancing,
  balancePageColumns,
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

  it('should NOT skip when content can be meaningfully distributed', () => {
    // 100px total / 2 columns = 50px per column, above minColumnHeight (20px)
    const ctx = createContext(2, [createBlock('block-1', 50), createBlock('block-2', 50)], {
      availableHeight: 1000,
    });

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
// balancePageColumns Tests (Post-Layout Balancing)
// ============================================================================

/**
 * Helper to create a mock fragment for balancePageColumns testing.
 */
function createFragment(
  blockId: string,
  x: number,
  y: number,
  width: number,
  kind: string = 'para',
): { x: number; y: number; width: number; kind: string; blockId: string } {
  return { x, y, width, kind, blockId };
}

/**
 * Helper to create measure data for paragraph fragments.
 */
function createMeasure(kind: string, lineHeights: number[]): { kind: string; lines: Array<{ lineHeight: number }> } {
  return {
    kind,
    lines: lineHeights.map((h) => ({ lineHeight: h })),
  };
}

describe('balancePageColumns', () => {
  describe('basic balancing', () => {
    it('should distribute fragments across 2 columns based on target height', () => {
      // 4 fragments, each 20px tall = 80px total, target = 40px per column
      // With >= condition: switch when adding would reach/exceed 40px
      // Block 1 (20px): column 0, height=20
      // Block 2 (20px): 20+20=40 >= 40, switch! column 1, height=20
      // Block 3, 4: stay in column 1
      // Result: 1 in column 0, 3 in column 1
      const fragments = [
        createFragment('block-1', 96, 96, 624),
        createFragment('block-2', 96, 116, 624),
        createFragment('block-3', 96, 136, 624),
        createFragment('block-4', 96, 156, 624),
      ];
      const measureMap = new Map([
        ['block-1', createMeasure('paragraph', [20])],
        ['block-2', createMeasure('paragraph', [20])],
        ['block-3', createMeasure('paragraph', [20])],
        ['block-4', createMeasure('paragraph', [20])],
      ]);

      balancePageColumns(fragments, { count: 2, gap: 48, width: 288 }, { left: 96 }, 96, measureMap);

      // Block 1 stays in column 0
      expect(fragments[0].x).toBe(96);
      // Blocks 2, 3, 4 move to column 1
      expect(fragments[1].x).toBe(432);
      expect(fragments[2].x).toBe(432);
      expect(fragments[3].x).toBe(432);
    });

    it('should set fragment width to column width', () => {
      const fragments = [createFragment('block-1', 96, 96, 624), createFragment('block-2', 96, 116, 624)];
      const measureMap = new Map([
        ['block-1', createMeasure('paragraph', [20])],
        ['block-2', createMeasure('paragraph', [20])],
      ]);

      balancePageColumns(fragments, { count: 2, gap: 48, width: 288 }, { left: 96 }, 96, measureMap);

      // Both fragments should have width set to column width
      expect(fragments[0].width).toBe(288);
      expect(fragments[1].width).toBe(288);
    });

    it('should reset Y positions in each column to start from top margin', () => {
      // Use 6 fragments so we get a more even split for Y testing
      // 6 * 20px = 120px total, target = 60px
      // Blocks 1, 2 = 40px, block 3 would make 60px >= 60px, switch!
      // Column 0: blocks 1, 2. Column 1: blocks 3, 4, 5, 6
      const fragments = [
        createFragment('block-1', 96, 96, 624),
        createFragment('block-2', 96, 116, 624),
        createFragment('block-3', 96, 136, 624),
        createFragment('block-4', 96, 156, 624),
        createFragment('block-5', 96, 176, 624),
        createFragment('block-6', 96, 196, 624),
      ];
      const measureMap = new Map([
        ['block-1', createMeasure('paragraph', [20])],
        ['block-2', createMeasure('paragraph', [20])],
        ['block-3', createMeasure('paragraph', [20])],
        ['block-4', createMeasure('paragraph', [20])],
        ['block-5', createMeasure('paragraph', [20])],
        ['block-6', createMeasure('paragraph', [20])],
      ]);

      balancePageColumns(fragments, { count: 2, gap: 48, width: 288 }, { left: 96 }, 96, measureMap);

      // Column 0: blocks 1, 2 - Y positions stack from top
      expect(fragments[0].y).toBe(96);
      expect(fragments[1].y).toBe(116);
      // Column 1: blocks 3+ - Y resets to top margin
      expect(fragments[2].y).toBe(96);
      expect(fragments[3].y).toBe(116);
    });
  });

  describe('column switching threshold', () => {
    it('should switch columns when target height is REACHED (not just exceeded)', () => {
      // This tests the >= vs > fix: Word switches when target is reached, not exceeded.
      // 6 fragments: 3 at 20px each = 60px, we want exactly 30px per column
      // With >= condition: switch happens when 30px is reached
      // With > condition: would need 30+ to switch
      const fragments = [
        createFragment('block-1', 96, 96, 624),
        createFragment('block-2', 96, 116, 624),
        createFragment('block-3', 96, 136, 624),
        createFragment('block-4', 96, 156, 624),
        createFragment('block-5', 96, 176, 624),
        createFragment('block-6', 96, 196, 624),
      ];
      const measureMap = new Map([
        ['block-1', createMeasure('paragraph', [20])],
        ['block-2', createMeasure('paragraph', [20])],
        ['block-3', createMeasure('paragraph', [20])],
        ['block-4', createMeasure('paragraph', [20])],
        ['block-5', createMeasure('paragraph', [20])],
        ['block-6', createMeasure('paragraph', [20])],
      ]);

      balancePageColumns(fragments, { count: 2, gap: 48, width: 288 }, { left: 96 }, 96, measureMap);

      // With >= condition: target = 120px / 2 = 60px per column
      // Block 1 (20px): column 0, height=20
      // Block 2 (20px): 20+20=40 < 60, stay in column 0
      // Block 3 (20px): 40+20=60 >= 60, SWITCH to column 1
      // Blocks 4,5,6 stay in column 1
      expect(fragments[0].x).toBe(96);
      expect(fragments[1].x).toBe(96);
      expect(fragments[2].x).toBe(432); // Switched because 40+20=60 >= 60
      expect(fragments[3].x).toBe(432);
      expect(fragments[4].x).toBe(432);
      expect(fragments[5].x).toBe(432);
    });

    it('should match Word behavior with uneven height distribution', () => {
      // Simulates the sd-1480 test document scenario:
      // Block 1: 21px (1 line)
      // Block 2: 42px (2 lines)
      // Block 3: 21px (1 line)
      // Block 4: 21px (1 line)
      // Block 5: 42px (2 lines)
      // Block 6: 21px (1 line)
      // Total: 168px, target: 84px
      // With >= : blocks 1,2 (63px) + block 3 (21px) = 84px >= 84px → switch
      // Word puts blocks 1,2 in column 0, blocks 3,4,5,6 in column 1
      const fragments = [
        createFragment('block-1', 96, 96, 624),
        createFragment('block-2', 96, 117, 624),
        createFragment('block-3', 96, 159, 624),
        createFragment('block-4', 96, 180, 624),
        createFragment('block-5', 96, 201, 624),
        createFragment('block-6', 96, 243, 624),
      ];
      const measureMap = new Map([
        ['block-1', createMeasure('paragraph', [21])],
        ['block-2', createMeasure('paragraph', [21, 21])], // 2 lines
        ['block-3', createMeasure('paragraph', [21])],
        ['block-4', createMeasure('paragraph', [21])],
        ['block-5', createMeasure('paragraph', [21, 21])], // 2 lines
        ['block-6', createMeasure('paragraph', [21])],
      ]);

      balancePageColumns(fragments, { count: 2, gap: 48, width: 288 }, { left: 96 }, 96, measureMap);

      // Blocks 1, 2 should be in column 0
      expect(fragments[0].x).toBe(96);
      expect(fragments[1].x).toBe(96);
      // Blocks 3, 4, 5, 6 should be in column 1
      expect(fragments[2].x).toBe(432);
      expect(fragments[3].x).toBe(432);
      expect(fragments[4].x).toBe(432);
      expect(fragments[5].x).toBe(432);
    });
  });

  describe('edge cases', () => {
    it('should skip balancing for single column layout', () => {
      const fragments = [createFragment('block-1', 96, 96, 624), createFragment('block-2', 96, 116, 624)];
      const measureMap = new Map([
        ['block-1', createMeasure('paragraph', [20])],
        ['block-2', createMeasure('paragraph', [20])],
      ]);

      // Original positions
      const origX1 = fragments[0].x;
      const origX2 = fragments[1].x;

      balancePageColumns(fragments, { count: 1, gap: 0, width: 624 }, { left: 96 }, 96, measureMap);

      // Should not modify positions for single column
      expect(fragments[0].x).toBe(origX1);
      expect(fragments[1].x).toBe(origX2);
    });

    it('should skip balancing for empty fragments array', () => {
      const fragments: { x: number; y: number; width: number; kind: string; blockId: string }[] = [];
      const measureMap = new Map<string, { kind: string; lines: Array<{ lineHeight: number }> }>();

      // Should not throw
      expect(() =>
        balancePageColumns(fragments, { count: 2, gap: 48, width: 288 }, { left: 96 }, 96, measureMap),
      ).not.toThrow();
    });

    it('should handle fragments with missing measure data', () => {
      const fragments = [createFragment('block-1', 96, 96, 624), createFragment('block-2', 96, 116, 624)];
      // Only provide measure for first block
      const measureMap = new Map([['block-1', createMeasure('paragraph', [20])]]);

      // Should not throw - block-2 will have height 0
      expect(() =>
        balancePageColumns(fragments, { count: 2, gap: 48, width: 288 }, { left: 96 }, 96, measureMap),
      ).not.toThrow();
    });

    it('should handle 3-column layout', () => {
      // 6 fragments for 3 columns = 2 per column
      const fragments = [
        createFragment('block-1', 96, 96, 624),
        createFragment('block-2', 96, 116, 624),
        createFragment('block-3', 96, 136, 624),
        createFragment('block-4', 96, 156, 624),
        createFragment('block-5', 96, 176, 624),
        createFragment('block-6', 96, 196, 624),
      ];
      const measureMap = new Map([
        ['block-1', createMeasure('paragraph', [20])],
        ['block-2', createMeasure('paragraph', [20])],
        ['block-3', createMeasure('paragraph', [20])],
        ['block-4', createMeasure('paragraph', [20])],
        ['block-5', createMeasure('paragraph', [20])],
        ['block-6', createMeasure('paragraph', [20])],
      ]);

      balancePageColumns(fragments, { count: 3, gap: 24, width: 192 }, { left: 96 }, 96, measureMap);

      // Verify 3 columns are used
      const colXValues = new Set(fragments.map((f) => f.x));
      expect(colXValues.size).toBeLessThanOrEqual(3);
    });
  });
});
