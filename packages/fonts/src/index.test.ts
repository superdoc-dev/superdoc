import { describe, expect, it } from 'vitest';
import {
  BUNDLED_FAMILY_NAMES,
  BUNDLED_FONT_ASSET_URLS,
  createSuperDocFonts,
  resolveBundledFontAssetUrl,
  superdocFonts,
} from './index';

describe('superdocFonts / resolveBundledFontAssetUrl', () => {
  it('superdocFonts is a ready-made resolveAssetUrl config', () => {
    expect(typeof superdocFonts.resolveAssetUrl).toBe('function');
  });

  it('resolves a known bundled face to its emitted URL', () => {
    const file = Object.keys(BUNDLED_FONT_ASSET_URLS)[0];
    expect(file).toBeTruthy();
    expect(superdocFonts.resolveAssetUrl({ file })).toBe(BUNDLED_FONT_ASSET_URLS[file]);
  });

  it('throws on an unknown file so a version mismatch surfaces immediately', () => {
    expect(() => resolveBundledFontAssetUrl({ file: 'NotAFont.woff2' })).toThrow(/no bundled asset/);
  });
});

describe('createSuperDocFonts', () => {
  it('with no options is the full pack: resolver only, no curation', () => {
    const config = createSuperDocFonts();
    expect(typeof config.resolveAssetUrl).toBe('function');
    expect(config.bundled).toBeUndefined();
  });

  it('include sets an allow-list', () => {
    expect(createSuperDocFonts({ include: ['Calibri', 'Cambria'] }).bundled).toEqual({
      include: ['Calibri', 'Cambria'],
    });
  });

  it('exclude sets a block-list', () => {
    expect(createSuperDocFonts({ exclude: ['Cooper Black'] }).bundled).toEqual({ exclude: ['Cooper Black'] });
  });

  it('trims entries and drops empty lists', () => {
    expect(createSuperDocFonts({ include: ['  Calibri  '] }).bundled).toEqual({ include: ['Calibri'] });
    expect(createSuperDocFonts({ include: [] }).bundled).toBeUndefined();
    expect(createSuperDocFonts({ exclude: [] }).bundled).toBeUndefined();
  });

  it('throws when include and exclude are both given (mutually exclusive intents)', () => {
    expect(() => createSuperDocFonts({ include: ['Calibri'], exclude: ['Cambria'] })).toThrow(/not both/);
  });

  it('throws on a non-array list or non-string entries', () => {
    expect(() => createSuperDocFonts({ include: 'Calibri' as unknown as string[] })).toThrow(/must be an array/);
    expect(() => createSuperDocFonts({ exclude: ['Calibri', 42 as unknown as string] })).toThrow(
      /non-empty font name strings/,
    );
  });

  it('throws on a font name SuperDoc does not bundle, suggesting the closest match for a typo', () => {
    expect(() => createSuperDocFonts({ include: ['Calbri'] })).toThrow(/does not bundle/);
    expect(() => createSuperDocFonts({ include: ['Calbri'] })).toThrow(/did you mean "Calibri"\?/);
    // A real Word font with no bundled clone is also rejected (curating it would be a no-op).
    expect(() => createSuperDocFonts({ exclude: ['Aptos'] })).toThrow(/does not bundle/);
  });

  it('accepts every family the toolbar advertises, including category fallbacks like Verdana', () => {
    // Regression: the curatable list must mirror the resolver/offerings, not the manifest's narrower
    // metric-clone `replaces` (which omits Verdana). A font shown in the toolbar must be curatable.
    expect(() => createSuperDocFonts({ exclude: ['Verdana'] })).not.toThrow();
    expect(() => createSuperDocFonts({ include: ['Verdana', 'Calibri'] })).not.toThrow();
    expect(createSuperDocFonts({ exclude: ['Verdana'] }).bundled).toEqual({ exclude: ['Verdana'] });
  });

  it('accepts case- and quote-variant spellings of bundled families (matched normalized)', () => {
    expect(() => createSuperDocFonts({ include: ['  calibri  ', '"Cambria"'] })).not.toThrow();
  });
});

describe('BUNDLED_FAMILY_NAMES', () => {
  it('is exported as a non-empty list of curatable Word family names', () => {
    expect(BUNDLED_FAMILY_NAMES.length).toBeGreaterThan(0);
    expect(BUNDLED_FAMILY_NAMES).toContain('Calibri');
    // Every advertised name is accepted by the curation API (the list and the validator agree).
    expect(() => createSuperDocFonts({ include: [...BUNDLED_FAMILY_NAMES] })).not.toThrow();
  });
});
