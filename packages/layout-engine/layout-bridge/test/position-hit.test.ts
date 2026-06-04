import { describe, expect, it } from 'vitest';
import type { FlowBlock, ParagraphAttrs, Layout } from '@superdoc/contracts';
import { isRtlBlock, determineColumn } from '../src/position-hit';

const paragraph = (attrs?: Record<string, unknown>): FlowBlock => ({
  kind: 'paragraph',
  id: 'p1',
  runs: [],
  attrs: attrs as ParagraphAttrs | undefined,
});

describe('isRtlBlock', () => {
  it('uses resolved paragraph direction context for inline direction', () => {
    expect(
      isRtlBlock(
        paragraph({
          directionContext: {
            inlineDirection: 'rtl',
            writingMode: 'horizontal-tb',
          },
        }),
      ),
    ).toBe(true);
  });

  it('does not treat writing mode as inline RTL direction', () => {
    expect(isRtlBlock(paragraph({ textDirection: 'tbRl' }))).toBe(false);
  });

  it('lets resolved direction context override paragraphProperties.rightToLeft', () => {
    expect(
      isRtlBlock(
        paragraph({
          paragraphProperties: { rightToLeft: true },
          directionContext: {
            inlineDirection: 'ltr',
            writingMode: 'horizontal-tb',
          },
        }),
      ),
    ).toBe(false);
  });

  it('falls through to paragraphProperties.rightToLeft when directionContext.inlineDirection is undefined', () => {
    // The resolver may produce inlineDirection: undefined when no paragraph w:bidi is set
    // anywhere in the cascade. In that case the typed context carries no inline-direction
    // signal, and the PM-node paragraphProperties.rightToLeft fallback still applies.
    expect(
      isRtlBlock(
        paragraph({
          paragraphProperties: { rightToLeft: true },
          directionContext: {
            inlineDirection: undefined,
            writingMode: 'horizontal-tb',
          },
        }),
      ),
    ).toBe(true);
  });

  // SD-2778: switching to getParagraphInlineDirection is strictly broader on
  // fallback than the prior inline read. Specifically, the helper picks up
  // paragraphProperties.rightToLeft when neither directionContext nor the legacy
  // scalar field is present. Pin that case so the broader fallback is intentional.
  it('falls back to paragraphProperties.rightToLeft when no other direction signal is present', () => {
    expect(isRtlBlock(paragraph({ paragraphProperties: { rightToLeft: true } }))).toBe(true);
    expect(isRtlBlock(paragraph({ paragraphProperties: { rightToLeft: false } }))).toBe(false);
  });
});

describe('determineColumn (SD-2629: resolved per-column boundaries)', () => {
  const makeLayout = (columns: Layout['columns']): Layout =>
    ({ pageSize: { w: 600, h: 800 }, pages: [], columns }) as unknown as Layout;

  it('returns 0 for single-column or missing columns', () => {
    expect(determineColumn(makeLayout(undefined), 300)).toBe(0);
    expect(determineColumn(makeLayout({ count: 1, gap: 0 }), 300)).toBe(0);
  });

  it('maps x to equal columns by uniform boundaries', () => {
    // Two equal columns in a 600px page (gap 0): boundary at 300.
    const layout = makeLayout({ count: 2, gap: 0 });
    expect(determineColumn(layout, 100)).toBe(0);
    expect(determineColumn(layout, 350)).toBe(1);
  });

  it('honors per-column widths for explicit columns, not a uniform stride', () => {
    // Explicit unequal widths [100, 400] (gap 0): the boundary is at the authored 100px, not the
    // equal-split 300px. x=150 lands in column 1, where a uniform stride would say column 0.
    const layout = makeLayout({ count: 2, gap: 0, widths: [100, 400], equalWidth: false });
    expect(determineColumn(layout, 50)).toBe(0);
    expect(determineColumn(layout, 150)).toBe(1);
  });
});
