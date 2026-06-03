import { describe, it, expect, vi, afterEach } from 'vitest';

// The CDN entry defaults the bundled-font asset base to `./fonts/` next to the executing
// <script>, captured via `document.currentScript` at module-eval time. Each test stubs
// currentScript, re-evaluates cdn-entry, and reads the real base through the font-system
// getter. The heavy SuperDoc graph is stubbed so re-evaluation stays cheap and isolated;
// @superdoc/font-system is left real (vite.config aliases it to source under Vitest).
vi.mock('./core/SuperDoc.js', () => ({ SuperDoc: class SuperDoc {} }));
vi.mock('./index.js', () => ({}));

describe('cdn-entry bundled-font asset base default', () => {
  afterEach(() => {
    Object.defineProperty(document, 'currentScript', { configurable: true, value: null });
    vi.resetModules();
  });

  it('defaults the asset base to ./fonts/ next to the executing script', async () => {
    Object.defineProperty(document, 'currentScript', {
      configurable: true,
      value: { src: 'https://cdn.example.com/superdoc/1.0/superdoc.min.js' },
    });
    vi.resetModules();
    await import('./cdn-entry.js');
    const { getBundledFontAssetBase } = await import('@superdoc/font-system');
    expect(getBundledFontAssetBase()).toBe('https://cdn.example.com/superdoc/1.0/fonts/');
  });

  it('swallows errors while defaulting the asset base (best-effort)', async () => {
    // An invalid script src makes `new URL('./fonts/', src)` throw; the try/catch must
    // swallow it and leave the default base unchanged.
    Object.defineProperty(document, 'currentScript', {
      configurable: true,
      value: { src: 'not-a-valid-url' },
    });
    vi.resetModules();
    const { getBundledFontAssetBase, DEFAULT_BUNDLED_FONT_BASE } = await import('@superdoc/font-system');
    await expect(import('./cdn-entry.js')).resolves.toBeTruthy();
    expect(getBundledFontAssetBase()).toBe(DEFAULT_BUNDLED_FONT_BASE);
  });
});
