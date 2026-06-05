import { describe, expect, it } from 'vitest';
import { resolveAnchoredGraphicY, resolveAnchoredGraphicX } from './graphic-placement.js';

const yBase = {
  objectHeight: 100,
  contentTop: 72,
  contentBottom: 720,
  pageBottomMargin: 72,
};

const columns = { width: 200, gap: 20, count: 2 };
const margins = { left: 72, right: 72 };
const pageWidth = 600;
const objectWidth = 80;

describe('resolveAnchoredGraphicY', () => {
  it('positions margin-relative top with offset', () => {
    expect(
      resolveAnchoredGraphicY({
        ...yBase,
        anchor: { vRelativeFrom: 'margin', alignV: 'top', offsetV: 10 },
      }),
    ).toBe(82);
  });

  it('positions page-relative bottom with page margin', () => {
    expect(
      resolveAnchoredGraphicY({
        ...yBase,
        anchor: { vRelativeFrom: 'page', alignV: 'bottom', offsetV: 5 },
      }),
    ).toBe(720 + 72 - 100 + 5);
  });

  it('positions paragraph-relative center on first line', () => {
    expect(
      resolveAnchoredGraphicY({
        ...yBase,
        anchor: { vRelativeFrom: 'paragraph', alignV: 'center', offsetV: 0 },
        anchorParagraphY: 200,
        firstLineHeight: 24,
      }),
    ).toBe(200 + (24 - 100) / 2);
  });

  it('uses pre-registered fallback when vRelativeFrom is paragraph without paragraph context', () => {
    expect(
      resolveAnchoredGraphicY({
        ...yBase,
        anchor: { vRelativeFrom: 'paragraph', offsetV: 20 },
        preRegisteredFallbackToContentTop: true,
      }),
    ).toBe(92);
  });

  it('ignores paragraph alignV when pre-registered fallback has no paragraph context', () => {
    expect(
      resolveAnchoredGraphicY({
        ...yBase,
        anchor: { vRelativeFrom: 'paragraph', alignV: 'center', offsetV: 0 },
        preRegisteredFallbackToContentTop: true,
      }),
    ).toBe(72);
    expect(
      resolveAnchoredGraphicY({
        ...yBase,
        objectHeight: 50,
        anchor: { vRelativeFrom: 'paragraph', alignV: 'bottom', offsetV: 10 },
        preRegisteredFallbackToContentTop: true,
      }),
    ).toBe(82);
  });

  it('legacy undefined vRelativeFrom uses anchor paragraph Y plus offsetV', () => {
    expect(
      resolveAnchoredGraphicY({
        ...yBase,
        anchor: { offsetV: 15 },
        anchorParagraphY: 300,
      }),
    ).toBe(315);
  });

  it('legacy undefined vRelativeFrom with preRegisteredFallbackToContentTop uses contentTop', () => {
    expect(
      resolveAnchoredGraphicY({
        ...yBase,
        anchor: { alignV: 'center', offsetV: 20 },
        anchorParagraphY: 300,
        preRegisteredFallbackToContentTop: true,
      }),
    ).toBe(92);
  });

  it('legacy undefined vRelativeFrom does not use paragraph alignV without vRelativeFrom paragraph', () => {
    expect(
      resolveAnchoredGraphicY({
        ...yBase,
        anchor: { alignV: 'bottom', offsetV: 0 },
        anchorParagraphY: 200,
        firstLineHeight: 24,
      }),
    ).toBe(200);
  });
});

describe('resolveAnchoredGraphicX', () => {
  const columnIndex = 1;
  const columnLeft = margins.left + columnIndex * (columns.width + columns.gap);

  describe('column-relative (default)', () => {
    it.each([
      { alignH: 'left' as const, offsetH: 10, expected: columnLeft + 10 },
      { alignH: 'center' as const, offsetH: 5, expected: columnLeft + (columns.width - objectWidth) / 2 + 5 },
      { alignH: 'right' as const, offsetH: 3, expected: columnLeft + columns.width - objectWidth - 3 },
    ])('alignH=$alignH offsetH=$offsetH', ({ alignH, offsetH, expected }) => {
      expect(resolveAnchoredGraphicX({ alignH, offsetH }, columnIndex, columns, objectWidth, margins, pageWidth)).toBe(
        expected,
      );
    });
  });

  describe('margin-relative', () => {
    const baseX = margins.left;
    const availableWidth = pageWidth - margins.left - margins.right;

    it.each([
      { alignH: 'left' as const, offsetH: 10, expected: baseX + 10 },
      { alignH: 'center' as const, offsetH: 5, expected: baseX + (availableWidth - objectWidth) / 2 + 5 },
      { alignH: 'right' as const, offsetH: 3, expected: baseX + availableWidth - objectWidth - 3 },
    ])('alignH=$alignH offsetH=$offsetH', ({ alignH, offsetH, expected }) => {
      expect(
        resolveAnchoredGraphicX(
          { hRelativeFrom: 'margin', alignH, offsetH },
          columnIndex,
          columns,
          objectWidth,
          margins,
          pageWidth,
        ),
      ).toBe(expected);
    });
  });

  describe('page-relative', () => {
    const baseX = 0;
    const availableWidth = pageWidth;

    it.each([
      { alignH: 'left' as const, offsetH: 10, expected: baseX + 10 },
      { alignH: 'center' as const, offsetH: 5, expected: baseX + (availableWidth - objectWidth) / 2 + 5 },
      { alignH: 'right' as const, offsetH: 3, expected: baseX + availableWidth - objectWidth - 3 },
    ])('alignH=$alignH offsetH=$offsetH', ({ alignH, offsetH, expected }) => {
      expect(
        resolveAnchoredGraphicX(
          { hRelativeFrom: 'page', alignH, offsetH },
          columnIndex,
          columns,
          objectWidth,
          margins,
          pageWidth,
        ),
      ).toBe(expected);
    });
  });

  it('defaults alignH to left and offsetH to zero', () => {
    expect(resolveAnchoredGraphicX({}, 0, columns, objectWidth, margins, pageWidth)).toBe(margins.left);
  });

  describe('column-relative honors the authored per-column origin (SD-2629)', () => {
    // Explicit unequal columns: col0 = 100px, gap-after-col0 = 40px, col1 = 300px. The column ORIGIN
    // follows the resolved geometry (not a uniform columnIndex * (width + gap) stride); the available
    // width stays the scalar (max) column width to match anchored-object measurement.
    const unequal = { width: 300, gap: 20, count: 2, widths: [100, 300], gaps: [40] };

    it('places a column-1 anchor at the authored column origin, not the uniform stride', () => {
      // Geometry col1 x = 100 + 40 = 140; + left margin 72 = 212. The uniform stride would place it
      // at 72 + (300 + 20) = 392; ignoring per-column gaps (scalar 20) would give 192.
      expect(resolveAnchoredGraphicX({ alignH: 'left', offsetH: 0 }, 1, unequal, objectWidth, margins, pageWidth)).toBe(
        212,
      );
    });

    it('right-aligns within the scalar (max) column width to match object measurement', () => {
      // Available width is the scalar max (columns.width = 300), matching the measurement clamp, so a
      // max-sized object is not pushed into the margin/gap: col0 right edge = 72 + 300 - 80 = 292.
      // (Per-column width 100 would give 92, but the object was measured against the max width.)
      expect(
        resolveAnchoredGraphicX({ alignH: 'right', offsetH: 0 }, 0, unequal, objectWidth, margins, pageWidth),
      ).toBe(292);
    });
  });
});
