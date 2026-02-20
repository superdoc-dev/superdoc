import { describe, expect, it } from 'vitest';

import { computeWordParagraphLayout, DEFAULT_LIST_HANGING_PX } from '../src/index.js';
import type { WordParagraphLayoutInput } from '../src/types.js';

const buildInput = (overrides: Partial<WordParagraphLayoutInput> = {}): WordParagraphLayoutInput => ({
  paragraph: {
    indent: { left: 36, hanging: 18 },
    tabs: [{ pos: 1080, val: 'start' }],
    tabIntervalTwips: 720,
    numberingProperties: { numId: 1, ilvl: 0 },
  },
  listRenderingAttrs: {
    markerText: '3.',
    justification: 'left',
    path: [3],
    numberingType: 'decimal',
    suffix: 'tab',
  },
  markerRun: { fontFamily: 'Calibri', fontSize: 12 },
  ...overrides,
});

describe('computeWordParagraphLayout', () => {
  it('computes marker layout with list rendering data', () => {
    const layout = computeWordParagraphLayout(buildInput());

    expect(layout.indentLeftPx).toBe(36);
    expect(layout.hangingPx).toBe(18);
    expect(layout.tabsPx).toEqual([72]);
    expect(layout.defaultTabIntervalPx).toBe(720);
    expect(layout.marker?.markerText).toBe('3.');
    expect(layout.marker?.justification).toBe('left');
    expect(layout.marker?.suffix).toBe('tab');
    expect(layout.marker?.run.fontFamily).toBe('Calibri');
  });

  it('accepts preformatted marker text and list alignment', () => {
    const layout = computeWordParagraphLayout(
      buildInput({
        listRenderingAttrs: {
          markerText: 'IV)',
          justification: 'right',
          path: [4],
          numberingType: 'upperRoman',
          suffix: 'space',
        },
      }),
    );

    expect(layout.marker?.markerText).toBe('IV)');
    expect(layout.marker?.justification).toBe('right');
    expect(layout.marker?.suffix).toBe('space');
  });
});

describe('computeWordParagraphLayout edge cases', () => {
  it('handles paragraph without numbering properties', () => {
    const layout = computeWordParagraphLayout(
      buildInput({
        paragraph: {
          indent: { left: 24 },
          tabs: [],
          numberingProperties: null,
        },
      }),
    );

    expect(layout.marker?.markerText).toBe('3.');
    expect(layout.indentLeftPx).toBe(24);
    expect(layout.hangingPx).toBe(DEFAULT_LIST_HANGING_PX);
  });

  it('handles negative indent values', () => {
    const layout = computeWordParagraphLayout(
      buildInput({
        paragraph: {
          indent: { left: -10, hanging: -5 },
          tabs: [],
          numberingProperties: null,
        },
      }),
    );

    expect(layout.indentLeftPx).toBe(-10);
    expect(layout.hangingPx).toBe(-5);
  });

  it('handles both firstLine and hanging defined (hanging disables firstLine mode)', () => {
    const layout = computeWordParagraphLayout(
      buildInput({
        paragraph: {
          indent: { left: 36, firstLine: 12, hanging: 18 },
          tabs: [],
        },
      }),
    );

    expect(layout.firstLinePx).toBe(12);
    expect(layout.hangingPx).toBe(18);
    expect(layout.firstLineIndentMode).toBeUndefined();
  });

  it('handles negative firstLine without enabling firstLine mode', () => {
    const layout = computeWordParagraphLayout(
      buildInput({
        paragraph: {
          indent: { left: 36, firstLine: -18 },
          tabs: [],
        },
      }),
    );

    expect(layout.firstLinePx).toBe(-18);
    expect(layout.firstLineIndentMode).toBeUndefined();
  });

  it('handles empty tabs array', () => {
    const layout = computeWordParagraphLayout(
      buildInput({
        paragraph: {
          indent: { left: 24 },
          tabs: [],
        },
      }),
    );

    expect(layout.tabsPx).toEqual([]);
  });

  it('handles undefined tabs array', () => {
    const layout = computeWordParagraphLayout(
      buildInput({
        paragraph: {
          indent: { left: 24 },
        },
      }),
    );

    expect(layout.tabsPx).toEqual([]);
  });

  it('handles very large indent values', () => {
    const layout = computeWordParagraphLayout(
      buildInput({
        paragraph: {
          indent: { left: 10000, hanging: 5000 },
          tabs: [],
        },
      }),
    );

    expect(layout.indentLeftPx).toBe(10000);
    expect(layout.hangingPx).toBe(5000);
  });

  it('handles zero indent values', () => {
    const layout = computeWordParagraphLayout(
      buildInput({
        paragraph: {
          indent: { left: 0, hanging: 0 },
          tabs: [],
        },
      }),
    );

    expect(layout.indentLeftPx).toBe(0);
    expect(layout.hangingPx).toBe(DEFAULT_LIST_HANGING_PX);
  });

  it('handles undefined indent with defaults falling back to zero', () => {
    const layout = computeWordParagraphLayout(
      buildInput({
        paragraph: {
          tabs: [],
          numberingProperties: null,
        },
      }),
    );

    expect(layout.indentLeftPx).toBe(0);
  });
});

describe('firstLineIndentMode detection and behavior', () => {
  it('detects firstLine indent pattern when firstLine > 0 and no hanging', () => {
    const layout = computeWordParagraphLayout(
      buildInput({
        paragraph: {
          indent: { left: 0, firstLine: 720 },
          tabs: [],
        },
      }),
    );

    expect(layout.firstLineIndentMode).toBe(true);
    expect(layout.firstLinePx).toBe(720);
    expect(layout.hangingPx).toBe(0);
  });

  it('does NOT detect firstLine mode when firstLine is 0', () => {
    const layout = computeWordParagraphLayout(
      buildInput({
        paragraph: {
          indent: { left: 360, firstLine: 0 },
          tabs: [],
        },
      }),
    );

    expect(layout.firstLineIndentMode).toBeUndefined();
    expect(layout.firstLinePx).toBe(0);
  });

  it('does NOT detect firstLine mode when firstLine is undefined', () => {
    const layout = computeWordParagraphLayout(
      buildInput({
        paragraph: {
          indent: { left: 360 },
          tabs: [],
        },
      }),
    );

    expect(layout.firstLineIndentMode).toBeUndefined();
    expect(layout.firstLinePx).toBeUndefined();
  });

  it('does NOT detect firstLine mode when hanging is also defined', () => {
    const layout = computeWordParagraphLayout(
      buildInput({
        paragraph: {
          indent: { left: 360, firstLine: 720, hanging: 360 },
          tabs: [],
        },
      }),
    );

    expect(layout.firstLineIndentMode).toBeUndefined();
    expect(layout.firstLinePx).toBe(720);
    expect(layout.hangingPx).toBe(360);
  });

  it('calculates textStartPx correctly in firstLine mode', () => {
    const layout = computeWordParagraphLayout(
      buildInput({
        paragraph: {
          indent: { left: 0, firstLine: 720 },
          tabs: [],
        },
      }),
    );

    expect(layout.firstLineIndentMode).toBe(true);
    expect(layout.indentLeftPx).toBe(0);
    expect(layout.firstLinePx).toBe(720);
    expect(layout.textStartPx).toBe(720 + DEFAULT_LIST_HANGING_PX);
  });

  it('handles negative firstLine without enabling firstLine mode', () => {
    const layout = computeWordParagraphLayout(
      buildInput({
        paragraph: {
          indent: { left: 360, firstLine: -360 },
          tabs: [],
        },
      }),
    );

    expect(layout.firstLineIndentMode).toBeUndefined();
    expect(layout.firstLinePx).toBe(-360);
  });

  it('handles very small positive firstLine correctly', () => {
    const layout = computeWordParagraphLayout(
      buildInput({
        paragraph: {
          indent: { left: 360, firstLine: 1 },
          tabs: [],
        },
      }),
    );

    expect(layout.firstLineIndentMode).toBe(true);
    expect(layout.firstLinePx).toBe(1);
  });

  it('handles NaN firstLine gracefully (not detected as firstLine mode)', () => {
    const layout = computeWordParagraphLayout(
      buildInput({
        paragraph: {
          indent: { left: 360, firstLine: Number.NaN },
          tabs: [],
        },
      }),
    );

    expect(layout.firstLineIndentMode).toBeUndefined();
    expect(Number.isNaN(layout.firstLinePx)).toBe(true);
  });

  it('handles Infinity firstLine gracefully (not detected as firstLine mode)', () => {
    const layout = computeWordParagraphLayout(
      buildInput({
        paragraph: {
          indent: { left: 360, firstLine: Number.POSITIVE_INFINITY },
          tabs: [],
        },
      }),
    );

    expect(layout.firstLineIndentMode).toBeUndefined();
    expect(layout.firstLinePx).toBe(Number.POSITIVE_INFINITY);
  });

  it('handles -Infinity firstLine gracefully (not detected as firstLine mode)', () => {
    const layout = computeWordParagraphLayout(
      buildInput({
        paragraph: {
          indent: { left: 360, firstLine: Number.NEGATIVE_INFINITY },
          tabs: [],
        },
      }),
    );

    expect(layout.firstLineIndentMode).toBeUndefined();
    expect(layout.firstLinePx).toBe(Number.NEGATIVE_INFINITY);
  });
});
