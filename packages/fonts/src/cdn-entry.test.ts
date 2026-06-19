import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// cdn-entry resolves faces relative to its own <script> (document.currentScript), captured at module
// eval. The fonts test env is `node` (no document), so we stub a minimal document.currentScript and
// re-import the module per case to re-run that capture, mirroring what the browser sees.
const SCRIPT = 'https://cdn.jsdelivr.net/npm/@superdoc-dev/fonts@0.1.0/dist/superdoc-fonts.min.js';
const ASSET_BASE = 'https://cdn.jsdelivr.net/npm/@superdoc-dev/fonts@0.1.0/assets/';

describe('cdn-entry (browser/IIFE): script-relative resolver', () => {
  beforeEach(() => {
    vi.stubGlobal('document', { currentScript: { src: SCRIPT } });
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('resolves a known face to ../assets/<file> relative to the script', async () => {
    const { resolveBundledFontAssetUrl, superdocFonts } = await import('./cdn-entry');
    expect(resolveBundledFontAssetUrl({ file: 'Carlito-Regular.woff2' })).toBe(`${ASSET_BASE}Carlito-Regular.woff2`);
    // superdocFonts wires the same resolver.
    expect(superdocFonts.resolveAssetUrl({ file: 'Carlito-Regular.woff2' })).toBe(`${ASSET_BASE}Carlito-Regular.woff2`);
  });

  it('throws on an unknown face so a version mismatch surfaces', async () => {
    const { resolveBundledFontAssetUrl } = await import('./cdn-entry');
    expect(() => resolveBundledFontAssetUrl({ file: 'NotAFont.woff2' })).toThrow(/no bundled asset/);
  });

  it('createSuperDocFonts shares the bundler entry validation', async () => {
    const { createSuperDocFonts } = await import('./cdn-entry');
    expect(createSuperDocFonts({ exclude: ['Cooper Black'] }).bundled).toEqual({ exclude: ['Cooper Black'] });
    expect(createSuperDocFonts().bundled).toBeUndefined();
    expect(() => createSuperDocFonts({ include: ['Calbri'] })).toThrow(/did you mean "Calibri"\?/);
  });

  it('throws a clear error when no script URL can be determined', async () => {
    vi.stubGlobal('document', { currentScript: null });
    vi.resetModules();
    const { resolveBundledFontAssetUrl } = await import('./cdn-entry');
    // Known file, so it passes the file check and reaches the missing-script-URL guard.
    expect(() => resolveBundledFontAssetUrl({ file: 'Carlito-Regular.woff2' })).toThrow(
      /could not determine the script URL/,
    );
  });
});
