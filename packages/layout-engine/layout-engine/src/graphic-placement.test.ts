import { describe, expect, it } from 'bun:test';
import { resolveGraphicPlacement, resolveTablePlacement } from './graphic-placement.js';
import type { TableMeasure } from '@superdoc/contracts';

describe('resolveGraphicPlacement', () => {
  const columns = { width: 400, gap: 20, count: 1 };
  const pageMargins = { left: 50, right: 50, bottom: 60 };

  it('uses one resolved coordinate set for paint and exclusion bounds', () => {
    const placement = resolveGraphicPlacement({
      anchor: {
        isAnchored: true,
        hRelativeFrom: 'margin',
        vRelativeFrom: 'paragraph',
        offsetH: 25,
        offsetV: 30,
      },
      objectWidth: 120,
      objectHeight: 80,
      columnIndex: 0,
      columns,
      pageMargins,
      pageWidth: 500,
      contentTop: 40,
      contentBottom: 700,
      anchorParagraphY: 100,
      firstLineHeight: 20,
      wrapType: 'Square',
      layer: { zIndex: 7 },
    });

    expect(placement.paint).toEqual({ x: 75, y: 130, width: 120, height: 80 });
    expect(placement.exclusion).toEqual(placement.paint);
    expect(placement.exclusion).not.toBe(placement.paint);
    expect(placement.layer).toEqual({ behindDoc: false, zIndex: 7 });
  });

  it('does not expose exclusion bounds for overlay or inline graphics', () => {
    const placement = resolveGraphicPlacement({
      anchor: { isAnchored: true, behindDoc: true, offsetV: 200 },
      objectWidth: 100,
      objectHeight: 50,
      columnIndex: 0,
      columns,
      pageMargins,
      pageWidth: 500,
      contentTop: 40,
      contentBottom: 700,
      anchorParagraphY: 100,
      wrapType: 'None',
    });

    expect(placement.paint.y).toBe(300);
    expect(placement.exclusion).toBeNull();
    expect(placement.layer.behindDoc).toBe(true);
  });

  it('normalizes table inside/outside alignment through the shared horizontal path', () => {
    const measure: TableMeasure = {
      kind: 'table',
      rows: [],
      columnWidths: [100],
      totalWidth: 100,
      totalHeight: 40,
    };

    const inside = resolveTablePlacement(
      { isAnchored: true, hRelativeFrom: 'margin', alignH: 'inside', offsetH: 15 },
      measure,
      { type: 'Square' },
      {
        columnIndex: 0,
        columns,
        pageMargins,
        pageWidth: 500,
        contentTop: 40,
        contentBottom: 700,
        anchorParagraphY: 100,
      },
    );
    const outside = resolveTablePlacement(
      { isAnchored: true, hRelativeFrom: 'margin', alignH: 'outside', offsetH: 15 },
      measure,
      { type: 'Square' },
      {
        columnIndex: 0,
        columns,
        pageMargins,
        pageWidth: 500,
        contentTop: 40,
        contentBottom: 700,
        anchorParagraphY: 100,
      },
    );

    expect(inside.paint.x).toBe(65);
    expect(outside.paint.x).toBe(335);
    expect(inside.exclusion).toEqual(inside.paint);
    expect(outside.exclusion).toEqual(outside.paint);
  });
});
