import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BUNDLED_MANIFEST,
  DEFAULT_BUNDLED_FONT_BASE,
  installBundledSubstitutes,
  setBundledFontAssetBase,
} from './bundled';
import type { FontRegistry } from './registry';

/** Captures registered sources per family without a DOM. */
class CaptureRegistry {
  readonly registered: { family: string; source: string }[] = [];
  register({ family, source }: { family: string; source: string }) {
    this.registered.push({ family, source: source ?? '' });
    return { family, status: 'unloaded' as const };
  }
  asRegistry(): FontRegistry {
    return this as unknown as FontRegistry;
  }
  sourcesFor(family: string): string[] {
    return this.registered.filter((r) => r.family === family).map((r) => r.source);
  }
}

const FACE_COUNT = BUNDLED_MANIFEST.reduce((n, f) => n + f.faces.length, 0);

describe('installBundledSubstitutes URL resolution', () => {
  beforeEach(() => setBundledFontAssetBase(DEFAULT_BUNDLED_FONT_BASE));

  it('registers every manifest face once with the default /fonts/ base', () => {
    const reg = new CaptureRegistry();
    installBundledSubstitutes(reg.asRegistry());
    expect(reg.registered).toHaveLength(FACE_COUNT);
    expect(reg.sourcesFor('Carlito')).toContain('url(/fonts/Carlito-Regular.woff2)');
    expect(reg.sourcesFor('Liberation Sans')).toContain('url(/fonts/LiberationSans-Bold.woff2)');
    expect(reg.sourcesFor('Caprasimo')).toEqual(['url(/fonts/Caprasimo-Regular.woff2)']);
    expect(reg.sourcesFor('Gelasio')).toContain('url(/fonts/Gelasio-BoldItalic.woff2)');
    expect(reg.sourcesFor('Cardo')).toEqual([
      'url(/fonts/Cardo-Regular.woff2)',
      'url(/fonts/Cardo-Bold.woff2)',
      'url(/fonts/Cardo-Italic.woff2)',
    ]);
    expect(reg.sourcesFor('Comic Relief')).toEqual([
      'url(/fonts/ComicRelief-Regular.woff2)',
      'url(/fonts/ComicRelief-Bold.woff2)',
    ]);
  });

  it('uses assetBaseUrl and normalizes a missing trailing slash', () => {
    const reg = new CaptureRegistry();
    installBundledSubstitutes(reg.asRegistry(), { assetBaseUrl: 'https://cdn.example.com/superdoc-fonts/v1' });
    expect(reg.sourcesFor('Carlito')).toContain('url(https://cdn.example.com/superdoc-fonts/v1/Carlito-Regular.woff2)');
  });

  it('resolveAssetUrl wins over assetBaseUrl and receives per-face context', () => {
    const reg = new CaptureRegistry();
    const seen: { file: string; family: string; weight: string; style: string; source: string }[] = [];
    installBundledSubstitutes(reg.asRegistry(), {
      assetBaseUrl: '/ignored/',
      resolveAssetUrl: (ctx) => {
        seen.push(ctx);
        return `https://assets.example.com/${ctx.file}?v=1`;
      },
    });
    expect(reg.sourcesFor('Carlito')).toContain('url(https://assets.example.com/Carlito-Regular.woff2?v=1)');
    expect(seen.every((c) => c.source === 'bundled-substitute')).toBe(true);
    expect(seen).toContainEqual({
      file: 'Carlito-Bold.woff2',
      family: 'Carlito',
      weight: '700',
      style: 'normal',
      source: 'bundled-substitute',
    });
  });

  it('setBundledFontAssetBase overrides the default base (CDN script-relative)', () => {
    setBundledFontAssetBase('https://cdn.jsdelivr.net/npm/superdoc@1/dist/fonts/');
    const reg = new CaptureRegistry();
    installBundledSubstitutes(reg.asRegistry());
    expect(reg.sourcesFor('Caladea')).toContain(
      'url(https://cdn.jsdelivr.net/npm/superdoc@1/dist/fonts/Caladea-Regular.woff2)',
    );
  });

  it('is idempotent per registry for the same config', () => {
    const reg = new CaptureRegistry();
    const handle = reg.asRegistry();
    installBundledSubstitutes(handle, { assetBaseUrl: '/fonts/' });
    installBundledSubstitutes(handle, { assetBaseUrl: '/fonts/' });
    expect(reg.registered).toHaveLength(FACE_COUNT);
  });

  it('keeps the first config and warns on a conflicting later install (shared registry)', () => {
    const reg = new CaptureRegistry();
    const handle = reg.asRegistry();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    installBundledSubstitutes(handle, { assetBaseUrl: '/first/' });
    installBundledSubstitutes(handle, { assetBaseUrl: '/second/' }); // conflicting -> ignored + warns
    expect(reg.registered).toHaveLength(FACE_COUNT); // not re-registered
    expect(reg.sourcesFor('Carlito')).toContain('url(/first/Carlito-Regular.woff2)');
    expect(reg.sourcesFor('Carlito')).not.toContain('url(/second/Carlito-Regular.woff2)');
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });
});
