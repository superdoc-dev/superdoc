import { describe, expect, it } from 'bun:test';

import { normalizeParagraphAttrsFromOoxml } from './paragraph-attrs.js';
import { normalizeRunAttrsFromOoxml } from './run-attrs.js';

describe('normalizeParagraphAttrsFromOoxml', () => {
  it('maps paragraph-mark vanish to suppressParagraphBreak', () => {
    const attrs = normalizeParagraphAttrsFromOoxml({
      runProperties: { vanish: true },
    });

    expect(attrs.suppressParagraphBreak).toBe(true);
  });
});

describe('normalizeRunAttrsFromOoxml', () => {
  it('maps the extended visual/script/visibility subset', () => {
    const attrs = normalizeRunAttrsFromOoxml({
      dstrike: true,
      textTransform: 'uppercase',
      smallCaps: true,
      vanish: true,
      specVanish: true,
      noProof: true,
      cs: true,
      lang: { val: 'en-US', bidi: 'ar-SA', eastAsia: 'ja-JP' },
      position: 6,
      letterSpacing: 30,
    });

    expect(attrs).toMatchObject({
      strike: true,
      doubleStrike: true,
      textTransform: 'uppercase',
      allCaps: true,
      smallCaps: true,
      vanish: true,
      specVanish: true,
      noProof: true,
      baselineShift: 3,
    });
    expect(attrs.letterSpacing).toBeCloseTo((30 * 96) / 1440, 4);
    expect(attrs.script).toEqual({
      complexScript: true,
      language: {
        default: 'en-US',
        complexScript: 'ar-SA',
        eastAsian: 'ja-JP',
      },
    });
  });

  it('preserves explicit false values for ST_OnOff properties', () => {
    const attrs = normalizeRunAttrsFromOoxml({
      bold: false,
      italic: false,
      smallCaps: false,
      vanish: false,
      specVanish: false,
      noProof: false,
      textTransform: 'none',
    });

    expect(attrs).toMatchObject({
      bold: false,
      italic: false,
      smallCaps: false,
      vanish: false,
      specVanish: false,
      noProof: false,
      textTransform: 'none',
      allCaps: false,
    });
  });

  it('materializes resolved font names as CSS-safe fallback stacks', () => {
    const attrs = normalizeRunAttrsFromOoxml({
      fontFamily: { ascii: 'Roboto', hAnsi: 'Roboto' },
    });

    expect(attrs.fontFamily).toBe('Roboto, sans-serif');
  });
});
