import { describe, expect, it } from 'vitest';
import {
  resolveAnchoredGraphicY,
  computeParagraphContentStartY,
  computeParagraphLayoutStartY,
} from './graphic-placement.js';

const base = {
  objectHeight: 100,
  contentTop: 72,
  contentBottom: 720,
  pageBottomMargin: 72,
};

describe('resolveAnchoredGraphicY', () => {
  it('positions margin-relative top with offset', () => {
    expect(
      resolveAnchoredGraphicY({
        ...base,
        anchor: { vRelativeFrom: 'margin', alignV: 'top', offsetV: 10 },
      }),
    ).toBe(82);
  });

  it('positions page-relative bottom with page margin', () => {
    expect(
      resolveAnchoredGraphicY({
        ...base,
        anchor: { vRelativeFrom: 'page', alignV: 'bottom', offsetV: 5 },
      }),
    ).toBe(720 + 72 - 100 + 5);
  });

  it('positions paragraph-relative center on first line', () => {
    expect(
      resolveAnchoredGraphicY({
        ...base,
        anchor: { vRelativeFrom: 'paragraph', alignV: 'center', offsetV: 0 },
        anchorParagraphY: 200,
        firstLineHeight: 24,
      }),
    ).toBe(200 + (24 - 100) / 2);
  });

  it('uses pre-registered fallback when vRelativeFrom is paragraph without paragraph context', () => {
    expect(
      resolveAnchoredGraphicY({
        ...base,
        anchor: { vRelativeFrom: 'paragraph', offsetV: 20 },
        preRegisteredFallbackToContentTop: true,
      }),
    ).toBe(92);
  });

  it('ignores paragraph alignV when pre-registered fallback has no paragraph context', () => {
    expect(
      resolveAnchoredGraphicY({
        ...base,
        anchor: { vRelativeFrom: 'paragraph', alignV: 'center', offsetV: 0 },
        preRegisteredFallbackToContentTop: true,
      }),
    ).toBe(72);
    expect(
      resolveAnchoredGraphicY({
        ...base,
        objectHeight: 50,
        anchor: { vRelativeFrom: 'paragraph', alignV: 'bottom', offsetV: 10 },
        preRegisteredFallbackToContentTop: true,
      }),
    ).toBe(82);
  });

  it('legacy undefined vRelativeFrom uses anchor paragraph Y', () => {
    expect(
      resolveAnchoredGraphicY({
        ...base,
        anchor: { offsetV: 15 },
        anchorParagraphY: 300,
      }),
    ).toBe(315);
  });
});

describe('computeParagraphLayoutStartY', () => {
  it('rewinds trailing then applies full spacing-before without double collapse', () => {
    expect(
      computeParagraphLayoutStartY({
        cursorY: 120,
        spacingBefore: 24,
        trailingSpacing: 12,
        rewindTrailingFromPrevious: true,
      }),
    ).toBe(132);
  });

  it('collapses spacing-before against trailing when previous after-spacing is kept', () => {
    expect(
      computeParagraphLayoutStartY({
        cursorY: 100,
        spacingBefore: 24,
        trailingSpacing: 8,
        rewindTrailingFromPrevious: false,
      }),
    ).toBe(116);
  });
});

describe('computeParagraphContentStartY', () => {
  it('adds spacing-before minus trailing collapse', () => {
    expect(computeParagraphContentStartY(100, 24, false, 8)).toBe(116);
  });

  it('returns cursorY when spacing already applied', () => {
    expect(computeParagraphContentStartY(100, 24, true, 0)).toBe(100);
  });
});
