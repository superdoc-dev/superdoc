import { describe, expect, it } from 'vite-plus/test';
import {
  mapBodyColumnToFootnoteColumn,
  resolveFootnoteBandColumns,
  resolveFootnoteColumnCount,
} from './footnote-band-columns.js';
import { getColumnGeometry, normalizeColumnLayout } from './column-layout.js';

const TWO_COLUMN_BODY = { count: 2, gap: 47.2 } as const;

describe('footnote band columns', () => {
  describe('resolveFootnoteColumnCount', () => {
    it('matches the body when the section declares nothing', () => {
      expect(resolveFootnoteColumnCount(TWO_COLUMN_BODY, undefined)).toBe(2);
      expect(resolveFootnoteColumnCount({ count: 3, gap: 24 }, undefined)).toBe(3);
    });

    it('matches the body for the schema default 0', () => {
      expect(resolveFootnoteColumnCount(TWO_COLUMN_BODY, 0)).toBe(2);
    });

    it('honors a declared count below the body count', () => {
      expect(resolveFootnoteColumnCount(TWO_COLUMN_BODY, 1)).toBe(1);
      expect(resolveFootnoteColumnCount({ count: 4, gap: 24 }, 2)).toBe(2);
    });

    it('clamps a declared count above the body count back to the body', () => {
      // The note planner carries a column's overflow to the SAME column on the next page, never
      // sideways into the next band column, so a band with more columns than the body would paint a
      // half-width strip with an empty neighbour and push notes onto later pages. Matching the body
      // is both the safer geometry and the meaning of the default.
      expect(resolveFootnoteColumnCount({ count: 1, gap: 0 }, 2)).toBe(1);
      expect(resolveFootnoteColumnCount(TWO_COLUMN_BODY, 4)).toBe(2);
    });

    it('ignores values that are not usable counts', () => {
      expect(resolveFootnoteColumnCount(TWO_COLUMN_BODY, Number.NaN)).toBe(2);
      expect(resolveFootnoteColumnCount(TWO_COLUMN_BODY, -3)).toBe(2);
      expect(resolveFootnoteColumnCount(TWO_COLUMN_BODY, 1.9)).toBe(1);
    });
  });

  describe('resolveFootnoteBandColumns', () => {
    it('returns the body layout unchanged when the band matches the body', () => {
      const body = {
        count: 2,
        gap: 47.2,
        equalWidth: false,
        widths: [200, 300],
        gaps: [47.2],
        direction: 'rtl' as const,
      };
      expect(resolveFootnoteBandColumns(body, 0)).toEqual(body);
      expect(resolveFootnoteBandColumns(body, undefined)).toEqual(body);
    });

    it('builds equal columns across the content area when the band is narrower than the body', () => {
      // Explicit body widths describe a different number of columns and cannot be reused, so a
      // merged band divides the content area evenly instead.
      expect(
        resolveFootnoteBandColumns({ count: 2, gap: 47.2, equalWidth: false, widths: [200, 300], gaps: [47.2] }, 1),
      ).toEqual({ count: 1, gap: 47.2 });
    });

    it('keeps the body gutter and fill direction', () => {
      expect(resolveFootnoteBandColumns({ count: 3, gap: 24, direction: 'rtl' }, 2)).toEqual({
        count: 2,
        gap: 24,
        direction: 'rtl',
      });
    });

    it('never carries the body column separator into the band', () => {
      // `w:cols/@w:sep` draws the vertical rules between BODY columns; the band draws its own
      // horizontal `w:separator` and no vertical rules.
      expect(resolveFootnoteBandColumns({ count: 2, gap: 24, withSeparator: true }, 1)).toEqual({
        count: 1,
        gap: 24,
      });
    });

    it('spans the whole content area once normalized', () => {
      const contentWidth = 553.73;
      const band = normalizeColumnLayout(resolveFootnoteBandColumns(TWO_COLUMN_BODY, 1), contentWidth);
      expect(band.count).toBe(1);
      expect(band.width).toBeCloseTo(contentWidth, 4);
      expect(getColumnGeometry(band)[0].x).toBeCloseTo(0, 4);
    });

    it('starts an RTL band at the content-area left edge', () => {
      // A single full-width column has no order to flip: mirroring it about the content area is a
      // no-op, and the band opens at the left margin exactly as an LTR one does.
      const contentWidth = 553.73;
      const band = normalizeColumnLayout(
        resolveFootnoteBandColumns({ ...TWO_COLUMN_BODY, direction: 'rtl' }, 1),
        contentWidth,
      );
      expect(getColumnGeometry(band)[0].x).toBeCloseTo(0, 4);
    });

    it('puts band column 0 on the right in an RTL section with two band columns', () => {
      const contentWidth = 553.73;
      const band = normalizeColumnLayout(
        resolveFootnoteBandColumns({ count: 4, gap: 47.2, direction: 'rtl' }, 2),
        contentWidth,
      );
      const geometry = getColumnGeometry(band);
      expect(geometry).toHaveLength(2);
      expect(geometry[0].x).toBeGreaterThan(geometry[1].x);
      expect(geometry[1].x).toBeCloseTo(0, 4);
    });
  });

  describe('mapBodyColumnToFootnoteColumn', () => {
    it('sends every body column to the single stack of a merged band', () => {
      expect(mapBodyColumnToFootnoteColumn(0, 2, 1)).toBe(0);
      expect(mapBodyColumnToFootnoteColumn(1, 2, 1)).toBe(0);
      expect(mapBodyColumnToFootnoteColumn(3, 4, 1)).toBe(0);
    });

    it('is the identity when the band matches the body', () => {
      expect(mapBodyColumnToFootnoteColumn(0, 3, 3)).toBe(0);
      expect(mapBodyColumnToFootnoteColumn(1, 3, 3)).toBe(1);
      expect(mapBodyColumnToFootnoteColumn(2, 3, 3)).toBe(2);
    });

    it('splits monotonically when the band has fewer columns than the body', () => {
      // Monotone matters: references are visited in document order, so a monotone map leaves each
      // band stack in ascending note order without a re-sort.
      expect([0, 1, 2].map((index) => mapBodyColumnToFootnoteColumn(index, 3, 2))).toEqual([0, 0, 1]);
      expect([0, 1, 2, 3].map((index) => mapBodyColumnToFootnoteColumn(index, 4, 2))).toEqual([0, 0, 1, 1]);
    });

    it('clamps out-of-range and unusable inputs', () => {
      expect(mapBodyColumnToFootnoteColumn(7, 2, 2)).toBe(1);
      expect(mapBodyColumnToFootnoteColumn(-1, 2, 2)).toBe(0);
      expect(mapBodyColumnToFootnoteColumn(Number.NaN, 2, 2)).toBe(0);
    });
  });
});
