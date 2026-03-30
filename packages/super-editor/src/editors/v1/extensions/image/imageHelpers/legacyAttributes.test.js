import { describe, expect, it } from 'vitest';
import { getNormalizedImageAttrs, normalizeMarginOffset, normalizeWrap } from './legacyAttributes.js';

describe('normalizeWrap', () => {
  it('returns existing non-inline wrap unchanged', () => {
    const result = normalizeWrap({ wrap: { type: 'Square', attrs: { wrapText: 'left' } } });
    expect(result).toEqual({ type: 'Square', attrs: { wrapText: 'left' } });
  });

  it('keeps inline wrap when attrs present', () => {
    const result = normalizeWrap({ wrap: { type: 'Inline', attrs: { dummy: true } } });
    expect(result).toEqual({ type: 'Inline', attrs: { dummy: true } });
  });

  it('falls back to square only when wrap missing', () => {
    const result = normalizeWrap({ wrapText: 'bothSides' });
    expect(result).toEqual({ type: 'Square', attrs: { wrapText: 'bothSides' } });
  });

  it('does not override explicit inline wrap when legacy wrapText exists', () => {
    const result = normalizeWrap({
      wrap: { type: 'Inline', attrs: {} },
      wrapText: 'largest',
    });
    expect(result).toEqual({ type: 'Inline', attrs: {} });
  });

  it('defaults to inline when nothing provided', () => {
    const result = normalizeWrap();
    expect(result).toEqual({ type: 'Inline', attrs: {} });
  });
});

describe('normalizeMarginOffset', () => {
  it('maps legacy left to horizontal when horizontal missing', () => {
    const result = normalizeMarginOffset({ left: 10, top: 5 });
    expect(result).toEqual({ top: 5, horizontal: 10 });
  });

  it('honors explicit horizontal value', () => {
    const result = normalizeMarginOffset({ horizontal: 7, left: 12 });
    expect(result).toEqual({ horizontal: 7 });
  });
});

describe('getNormalizedImageAttrs', () => {
  it('returns normalized wrap and margin offset', () => {
    const result = getNormalizedImageAttrs({
      wrap: { type: 'Inline', attrs: {} },
      wrapText: 'left',
      marginOffset: { left: 3, top: 4 },
    });

    expect(result).toEqual({
      wrap: { type: 'Inline', attrs: {} },
      marginOffset: { horizontal: 3, top: 4 },
    });
  });
});
