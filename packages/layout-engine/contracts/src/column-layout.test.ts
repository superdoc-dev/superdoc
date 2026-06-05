import { describe, expect, it } from 'vitest';
import type { ColumnLayout } from './index.js';
import {
  cloneColumnLayout,
  columnLayoutsEqual,
  columnRenderLayoutsEqual,
  getColumnAtX,
  getColumnGapAfter,
  getColumnGeometry,
  getColumnSeparatorPositions,
  getColumnWidth,
  getColumnX,
  normalizeColumnLayout,
  resolveColumnCount,
  resolveColumnLayout,
  resolveColumnMode,
  widthsEqual,
} from './column-layout.js';

describe('widthsEqual', () => {
  it('treats two missing width arrays as equal', () => {
    expect(widthsEqual()).toBe(true);
  });

  it('returns false when only one width array is present', () => {
    expect(widthsEqual([72], undefined)).toBe(false);
    expect(widthsEqual(undefined, [72])).toBe(false);
  });

  it('returns true for identical width arrays', () => {
    expect(widthsEqual([72, 144], [72, 144])).toBe(true);
  });

  it('returns false for arrays with different lengths', () => {
    expect(widthsEqual([72], [72, 144])).toBe(false);
  });

  it('returns false for arrays with different values', () => {
    expect(widthsEqual([72, 144], [72, 145])).toBe(false);
  });
});

describe('cloneColumnLayout', () => {
  it('returns a default single-column layout when input is missing', () => {
    expect(cloneColumnLayout()).toEqual({ count: 1, gap: 0 });
  });

  it('clones count, gap, widths, and equalWidth', () => {
    const original: ColumnLayout = {
      count: 2,
      gap: 18,
      widths: [72, 144],
      equalWidth: false,
    };

    expect(cloneColumnLayout(original)).toEqual(original);
  });

  it('creates a defensive copy of widths', () => {
    const original: ColumnLayout = {
      count: 2,
      gap: 18,
      widths: [72, 144],
      equalWidth: false,
    };

    const cloned = cloneColumnLayout(original);

    expect(cloned).not.toBe(original);
    expect(cloned.widths).not.toBe(original.widths);

    cloned.widths?.push(216);
    expect(original.widths).toEqual([72, 144]);
  });

  it('omits optional fields that were not provided', () => {
    expect(cloneColumnLayout({ count: 2, gap: 18 })).toEqual({
      count: 2,
      gap: 18,
    });
  });
});

describe('normalizeColumnLayout', () => {
  it('returns a default single column when input is missing', () => {
    expect(normalizeColumnLayout(undefined, 480)).toEqual({
      count: 1,
      gap: 0,
      widths: [480],
      width: 480,
    });
  });

  it('computes equal-width columns from count and gap', () => {
    expect(normalizeColumnLayout({ count: 2, gap: 24 }, 624)).toEqual({
      count: 2,
      gap: 24,
      widths: [300, 300],
      width: 300,
    });
  });

  it('does not scale explicit widths; authored widths are preserved (SD-2629 step 4)', () => {
    // Word renders authored column widths as-is and leaves trailing space when they underfill, so
    // [100, 200] in a 600px content area stays [100, 200] rather than stretching to [200, 400].
    expect(normalizeColumnLayout({ count: 2, gap: 24, widths: [100, 200], equalWidth: false }, 624)).toEqual({
      count: 2,
      gap: 24,
      widths: [100, 200],
      equalWidth: false,
      width: 200,
    });
  });

  it('does not scale DOWN overfull explicit widths either; authored widths overflow (SD-2629, Word-verified)', () => {
    // Word keeps authored explicit widths even when they EXCEED the content area: a Word probe of two
    // 360pt columns + 36pt gap in a 468pt content box renders both at 360pt, with column 2 overflowing
    // off the page edge (Word re-saves the w:cols unchanged). So normalize must not scale down either -
    // [200, 400] in a 300px content box stays [200, 400] (overfull), matching Word's overflow.
    expect(normalizeColumnLayout({ count: 2, gap: 24, widths: [200, 400], equalWidth: false }, 300)).toEqual({
      count: 2,
      gap: 24,
      widths: [200, 400],
      equalWidth: false,
      width: 400,
    });
  });

  it('ignores widths when equalWidth is omitted and divides evenly (SD-2324: omitted = equal mode)', () => {
    // Omitted equalWidth is equal mode in Word; any widths present are not authoritative.
    expect(normalizeColumnLayout({ count: 2, gap: 24, widths: [100, 200] }, 624)).toEqual({
      count: 2,
      gap: 24,
      widths: [300, 300],
      width: 300,
    });
  });

  it('ignores widths when equalWidth is true and divides evenly (SD-2324)', () => {
    expect(normalizeColumnLayout({ count: 2, gap: 24, widths: [100, 200], equalWidth: true }, 624)).toEqual({
      count: 2,
      gap: 24,
      widths: [300, 300],
      equalWidth: true,
      width: 300,
    });
  });

  it('clamps count to the explicit-widths length when w:num exceeds it (SD-2324 F8)', () => {
    // w:num="4" with only two explicit widths: the surplus columns have no width and must not
    // be synthesized as ~0px slivers (the F8 phantom-column bug). Clamp to the two real columns.
    expect(normalizeColumnLayout({ count: 4, gap: 48, widths: [192, 384], equalWidth: false }, 624)).toEqual({
      count: 2,
      gap: 48,
      widths: [192, 384],
      equalWidth: false,
      width: 384,
    });
  });

  it('falls back to a single column when there is no usable content width', () => {
    expect(normalizeColumnLayout({ count: 3, gap: 24 }, 0, 0.01)).toEqual({
      count: 1,
      gap: 0,
      width: 0,
    });
  });
});

describe('getColumnGeometry + geometry helpers (SD-2629)', () => {
  it('mirrors equal-width normalized output (uniform gap, content-relative x)', () => {
    const geom = getColumnGeometry(normalizeColumnLayout({ count: 2, gap: 24 }, 624));
    expect(geom).toEqual([
      { index: 0, x: 0, width: 300, gapAfter: 24 },
      { index: 1, x: 324, width: 300, gapAfter: 0 },
    ]);
  });

  it('mirrors explicit widths without scaling (SD-2629 step 4)', () => {
    const geom = getColumnGeometry(
      normalizeColumnLayout({ count: 2, gap: 24, widths: [100, 200], equalWidth: false }, 624),
    );
    expect(geom).toEqual([
      { index: 0, x: 0, width: 100, gapAfter: 24 },
      { index: 1, x: 124, width: 200, gapAfter: 0 },
    ]);
  });

  it('reflects the F8 count clamp (4 declared, 2 widths => 2 columns)', () => {
    const geom = getColumnGeometry(
      normalizeColumnLayout({ count: 4, gap: 48, widths: [192, 384], equalWidth: false }, 624),
    );
    expect(geom).toHaveLength(2);
    expect(geom.map((c) => c.width)).toEqual([192, 384]);
  });

  it('places a separator centered in the gap after each non-last column', () => {
    const geom = getColumnGeometry(normalizeColumnLayout({ count: 2, gap: 24, withSeparator: true }, 624));
    expect(geom[0].separatorX).toBe(312);
    expect(geom[1].separatorX).toBeUndefined();
    expect(getColumnSeparatorPositions(geom, 96)).toEqual([408]);
  });

  it('resolves width / x / gap / column-at-x with an explicit originX', () => {
    const geom = getColumnGeometry(normalizeColumnLayout({ count: 2, gap: 24 }, 624));
    expect(getColumnWidth(geom, 1)).toBe(300);
    expect(getColumnX(geom, 1, 96)).toBe(420);
    expect(getColumnGapAfter(geom, 0)).toBe(24);
    expect(getColumnGapAfter(geom, 1)).toBe(0);
    expect(getColumnAtX(geom, 96 + 330, 96)).toBe(1);
    expect(getColumnAtX(geom, 96 + 100, 96)).toBe(0);
  });

  it('lets per-column gaps drive geometry (SD-2629 step 4)', () => {
    // gaps[i] is the gap after column i; geometry uses it instead of the uniform scalar gap.
    const geom = getColumnGeometry({ count: 2, gap: 24, widths: [300, 300], gaps: [999], width: 300 });
    expect(geom[0].gapAfter).toBe(999);
    expect(geom[1].x).toBe(300 + 999);
  });

  it('expands an equal-mode layout with no widths array to `count` columns (SD-2629 regression)', () => {
    // A hand-built equal-mode layout (column-balancing) carries only the scalar `width`, no widths
    // array. Geometry must still yield `count` columns; collapsing to a single column mapped every
    // index past 0 onto column 0's x, stacking balanced multi-column content on the left margin.
    const geom = getColumnGeometry({ count: 2, gap: 48, width: 288 });
    expect(geom).toEqual([
      { index: 0, x: 0, width: 288, gapAfter: 48 },
      { index: 1, x: 336, width: 288, gapAfter: 0 },
    ]);
    expect(getColumnX(geom, 1, 96)).toBe(432);
  });
});

describe('columnLayoutsEqual', () => {
  it('treats layouts differing only by gaps as not equal', () => {
    const a: ColumnLayout = { count: 2, gap: 24, widths: [200, 400], gaps: [24], equalWidth: false };
    const b: ColumnLayout = { count: 2, gap: 24, widths: [200, 400], gaps: [48], equalWidth: false };
    expect(columnLayoutsEqual(a, b)).toBe(false);
    expect(columnLayoutsEqual(a, { ...a, gaps: [24] })).toBe(true);
  });

  it('matches on the full shape and handles missing inputs', () => {
    expect(columnLayoutsEqual(undefined, undefined)).toBe(true);
    expect(columnLayoutsEqual({ count: 2, gap: 24 }, { count: 3, gap: 24 })).toBe(false);
  });
});

describe('resolveColumnMode (SD-2629)', () => {
  it('is explicit only when equalWidth is false AND usable widths exist', () => {
    expect(resolveColumnMode({ count: 2, gap: 24, widths: [100, 200], equalWidth: false })).toBe('explicit');
  });

  it('is equal when equalWidth is true, even with widths present', () => {
    expect(resolveColumnMode({ count: 2, gap: 24, widths: [100, 200], equalWidth: true })).toBe('equal');
  });

  it('is equal when equalWidth is omitted (Word divides evenly)', () => {
    expect(resolveColumnMode({ count: 2, gap: 24, widths: [100, 200] })).toBe('equal');
  });

  it('is equal when explicit mode is declared but no usable widths are supplied', () => {
    expect(resolveColumnMode({ count: 2, gap: 24, equalWidth: false })).toBe('equal');
    expect(resolveColumnMode({ count: 2, gap: 24, widths: [0, -5], equalWidth: false })).toBe('equal');
  });

  it('is equal for missing input', () => {
    expect(resolveColumnMode(undefined)).toBe('equal');
  });
});

describe('resolveColumnCount (SD-2629)', () => {
  it('clamps explicit count to the usable-width count (min(num, widths))', () => {
    expect(resolveColumnCount({ count: 4, gap: 20, widths: [192, 384], equalWidth: false })).toBe(2);
    expect(resolveColumnCount({ count: 4, gap: 20, widths: [192], equalWidth: false })).toBe(1);
  });

  it('keeps num when it does not exceed the usable-width count', () => {
    expect(resolveColumnCount({ count: 2, gap: 20, widths: [192, 384], equalWidth: false })).toBe(2);
  });

  it('does not clamp in equal mode (no usable explicit widths)', () => {
    expect(resolveColumnCount({ count: 3, gap: 20 })).toBe(3);
    expect(resolveColumnCount({ count: 4, gap: 20, widths: [192, 384], equalWidth: true })).toBe(4);
    expect(resolveColumnCount({ count: 4, gap: 20, equalWidth: false })).toBe(4);
  });

  it('floors to a minimum of 1', () => {
    expect(resolveColumnCount({ count: 0, gap: 0 })).toBe(1);
    expect(resolveColumnCount(undefined)).toBe(1);
  });

  it('agrees with normalizeColumnLayout.count (single count authority)', () => {
    const input: ColumnLayout = { count: 4, gap: 20, widths: [192, 384], equalWidth: false };
    expect(normalizeColumnLayout(input, 600).count).toBe(resolveColumnCount(input));
  });
});

describe('resolveColumnLayout (SD-2629)', () => {
  it('clamps count without advertising phantom columns (count:4 with two widths -> 2)', () => {
    expect(resolveColumnLayout({ count: 4, gap: 20, widths: [192, 384], equalWidth: false })).toEqual({
      count: 2,
      gap: 20,
      widths: [192, 384],
      equalWidth: false,
    });
  });

  it('slices surplus widths/gaps when num is below the supplied widths', () => {
    expect(
      resolveColumnLayout({ count: 2, gap: 20, widths: [100, 200, 300, 400], gaps: [10, 20, 30], equalWidth: false }),
    ).toEqual({ count: 2, gap: 20, widths: [100, 200], gaps: [10], equalWidth: false });
  });

  it('leaves an already-consistent config unchanged', () => {
    const input: ColumnLayout = { count: 2, gap: 20, widths: [100, 400], equalWidth: false, withSeparator: true };
    expect(resolveColumnLayout(input)).toEqual(input);
  });

  it('does not slice in equal mode (no explicit widths)', () => {
    expect(resolveColumnLayout({ count: 3, gap: 20 })).toEqual({ count: 3, gap: 20 });
  });

  it('drops stray widths/gaps in equal mode (the renderer would treat any widths as explicit)', () => {
    expect(resolveColumnLayout({ count: 2, gap: 20, widths: [100, 200], gaps: [10], equalWidth: true })).toEqual({
      count: 2,
      gap: 20,
      equalWidth: true,
    });
    // Omitted equalWidth is equal mode too.
    expect(resolveColumnLayout({ count: 2, gap: 20, widths: [100, 200] })).toEqual({ count: 2, gap: 20 });
  });

  it('drops unusable widths by record, not by position, and stays idempotent (SD-2629)', () => {
    // resolveColumnCount counts usable widths ([192, 384] -> 2). A positional slice would keep the
    // leading 0 and drop the valid 384 ([0, 192]); that metadata re-resolves to count 1, so the
    // fill (count 2) and the render metadata disagree. Record-filtering keeps [192, 384].
    const resolved = resolveColumnLayout({ count: 3, gap: 20, widths: [0, 192, 384], equalWidth: false });
    expect(resolved).toEqual({ count: 2, gap: 20, widths: [192, 384], equalWidth: false });
    // Resolving the resolved metadata is a no-op (idempotent), which the positional slice was not.
    expect(resolveColumnLayout(resolved)).toEqual(resolved);
  });

  it('keeps the gap following each surviving column when an unusable width is dropped (SD-2629)', () => {
    // gaps[i] is the gap after column i. Dropping the leading 0-width column must keep the gap that
    // sits between the surviving columns (after col 1 = 30), not the dropped column's gap (10).
    expect(
      resolveColumnLayout({ count: 3, gap: 20, widths: [0, 192, 384], gaps: [10, 30], equalWidth: false }),
    ).toEqual({ count: 2, gap: 20, widths: [192, 384], gaps: [30], equalWidth: false });
  });
});

describe('columnRenderLayoutsEqual (SD-2629)', () => {
  it('treats equalWidth:true and omitted equalWidth as render-equal (both equal mode)', () => {
    expect(columnRenderLayoutsEqual({ count: 2, gap: 24, equalWidth: true }, { count: 2, gap: 24 })).toBe(true);
  });

  it('treats num>widths and num===widths as render-equal when the resolved columns match', () => {
    expect(
      columnRenderLayoutsEqual(
        { count: 4, gap: 24, widths: [192, 384], equalWidth: false },
        { count: 2, gap: 24, widths: [192, 384], equalWidth: false },
      ),
    ).toBe(true);
  });

  it('distinguishes a separator toggle', () => {
    expect(
      columnRenderLayoutsEqual({ count: 2, gap: 24, withSeparator: true }, { count: 2, gap: 24, withSeparator: false }),
    ).toBe(false);
  });

  it('distinguishes a different gap', () => {
    expect(columnRenderLayoutsEqual({ count: 2, gap: 24 }, { count: 2, gap: 48 })).toBe(false);
  });

  it('treats explicit layouts differing only by per-column gaps as render-equal until geometry flips', () => {
    expect(
      columnRenderLayoutsEqual(
        { count: 3, gap: 24, widths: [100, 100, 300], gaps: [24, 24], equalWidth: false },
        { count: 3, gap: 24, widths: [100, 100, 300], gaps: [24, 96], equalWidth: false },
      ),
    ).toBe(true);
  });

  it('distinguishes explicit vs equal mode and different resolved widths', () => {
    expect(
      columnRenderLayoutsEqual({ count: 2, gap: 24, widths: [192, 384], equalWidth: false }, { count: 2, gap: 24 }),
    ).toBe(false);
    expect(
      columnRenderLayoutsEqual(
        { count: 2, gap: 24, widths: [192, 384], equalWidth: false },
        { count: 2, gap: 24, widths: [100, 400], equalWidth: false },
      ),
    ).toBe(false);
  });

  it('handles missing inputs', () => {
    expect(columnRenderLayoutsEqual(undefined, undefined)).toBe(true);
    expect(columnRenderLayoutsEqual({ count: 2, gap: 24 }, undefined)).toBe(false);
  });
});
