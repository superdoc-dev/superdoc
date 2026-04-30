/**
 * Direct unit tests for the now-public helpers `resolveTableFrame` and
 * `resolveRenderedTableWidth`. These functions decide whether a table extends
 * past its column (wide-table overflow, SD-2544) and where the fragment lives
 * inside that column. The broader `layoutTableBlock` tests cover them via
 * full table layout; these focus the contract for direct callers like
 * `incrementalLayout`.
 */

import type { TableAttrs } from '@superdoc/contracts';
import { describe, expect, it } from 'bun:test';
import { resolveRenderedTableWidth, resolveTableFrame } from './layout-table.js';

describe('resolveRenderedTableWidth', () => {
  it('returns measured width when no tableWidth attr is set', () => {
    expect(resolveRenderedTableWidth(500, 800, {} as TableAttrs)).toBe(800);
  });

  it('falls back to columnWidth when measured is zero', () => {
    expect(resolveRenderedTableWidth(500, 0, {} as TableAttrs)).toBe(500);
  });

  it('falls back to columnWidth when measured is non-finite', () => {
    expect(resolveRenderedTableWidth(500, NaN, {} as TableAttrs)).toBe(500);
    expect(resolveRenderedTableWidth(500, Infinity, {} as TableAttrs)).toBe(500);
  });

  it('falls back to columnWidth when measured is negative', () => {
    expect(resolveRenderedTableWidth(500, -100, {} as TableAttrs)).toBe(500);
  });

  it('computes pct width as columnWidth * (value / OOXML_PCT_DIVISOR)', () => {
    expect(resolveRenderedTableWidth(500, 400, { tableWidth: { value: 5000, type: 'pct' } } as TableAttrs)).toBe(500);
    expect(resolveRenderedTableWidth(500, 400, { tableWidth: { value: 2500, type: 'pct' } } as TableAttrs)).toBe(250);
    expect(resolveRenderedTableWidth(500, 400, { tableWidth: { value: 7500, type: 'pct' } } as TableAttrs)).toBe(750);
  });

  it('reads pct width from the width field as well as value', () => {
    expect(resolveRenderedTableWidth(500, 400, { tableWidth: { width: 2500, type: 'pct' } } as TableAttrs)).toBe(250);
  });

  it('returns measured width for px/pixel/dxa types (measure already applied them)', () => {
    expect(resolveRenderedTableWidth(500, 700, { tableWidth: { width: 700, type: 'px' } } as TableAttrs)).toBe(700);
    expect(resolveRenderedTableWidth(500, 700, { tableWidth: { width: 700, type: 'pixel' } } as TableAttrs)).toBe(700);
    expect(resolveRenderedTableWidth(500, 700, { tableWidth: { width: 700, type: 'dxa' } } as TableAttrs)).toBe(700);
  });

  it('returns measured width when the tableWidth attr is invalid', () => {
    expect(resolveRenderedTableWidth(500, 600, { tableWidth: { type: 'pct' } } as TableAttrs)).toBe(600);
    expect(resolveRenderedTableWidth(500, 600, { tableWidth: { width: -1, type: 'pct' } } as TableAttrs)).toBe(600);
  });
});

describe('resolveTableFrame', () => {
  describe('left-aligned (default)', () => {
    it('returns baseX with measured width when table fits in column', () => {
      const result = resolveTableFrame(50, 500, 400, {} as TableAttrs);
      expect(result).toEqual({ x: 50, width: 400 });
    });

    it('preserves wide measured width past the column', () => {
      const result = resolveTableFrame(50, 500, 700, {} as TableAttrs);
      expect(result).toEqual({ x: 50, width: 700 });
    });

    it('shifts by positive tableIndent and preserves width when wide', () => {
      const result = resolveTableFrame(50, 500, 700, {
        tableIndent: { width: 30 },
      } as TableAttrs);
      expect(result).toEqual({ x: 80, width: 700 });
    });

    it('shifts left and expands width for negative indent (legacy behavior)', () => {
      const result = resolveTableFrame(50, 500, 400, {
        tableIndent: { width: -40 },
      } as TableAttrs);
      expect(result).toEqual({ x: 10, width: 440 });
    });
  });

  describe('center-aligned', () => {
    it('centers a narrow table within the column', () => {
      const result = resolveTableFrame(0, 500, 300, { justification: 'center' } as TableAttrs);
      expect(result).toEqual({ x: 100, width: 300 });
    });

    it('returns negative x for a wide centered table (overflows both margins)', () => {
      const result = resolveTableFrame(0, 500, 600, { justification: 'center' } as TableAttrs);
      expect(result).toEqual({ x: -50, width: 600 });
    });

    it('ignores tableIndent for centered tables', () => {
      const result = resolveTableFrame(0, 500, 300, {
        justification: 'center',
        tableIndent: { width: 100 },
      } as TableAttrs);
      expect(result).toEqual({ x: 100, width: 300 });
    });
  });

  describe('right-aligned', () => {
    it('aligns to right edge of column when table fits', () => {
      const result = resolveTableFrame(0, 500, 300, { justification: 'right' } as TableAttrs);
      expect(result).toEqual({ x: 200, width: 300 });
    });

    it('returns negative x for a wide right-aligned table (overflows left)', () => {
      const result = resolveTableFrame(0, 500, 600, { justification: 'right' } as TableAttrs);
      expect(result).toEqual({ x: -100, width: 600 });
    });

    it('treats end as right', () => {
      const result = resolveTableFrame(0, 500, 600, { justification: 'end' } as TableAttrs);
      expect(result).toEqual({ x: -100, width: 600 });
    });
  });

  describe('with pct tableWidth', () => {
    it('uses computed pct width even when measured is wider', () => {
      const result = resolveTableFrame(0, 500, 800, {
        tableWidth: { value: 5000, type: 'pct' },
      } as TableAttrs);
      expect(result).toEqual({ x: 0, width: 500 });
    });

    it('overflows when pct exceeds 100%', () => {
      const result = resolveTableFrame(0, 500, 750, {
        tableWidth: { value: 7500, type: 'pct' },
        justification: 'center',
      } as TableAttrs);
      expect(result.width).toBe(750);
      expect(result.x).toBe(-125);
    });
  });
});
