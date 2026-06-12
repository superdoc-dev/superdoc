/**
 * `@superdoc/fonts` - the reviewed metric-compatible font substitutes SuperDoc renders for
 * proprietary Word fonts (Carlito for Calibri, Liberation Serif for Times New Roman, etc.).
 *
 * Optional: install it to make the bundled fallbacks load automatically in any bundler app, with
 * no copy step and no `assetBaseUrl`. The asset URLs are written as
 * `new URL('../assets/<file>', import.meta.url)`, which Vite, Webpack 5, Next, Nuxt, esbuild, and
 * Parcel detect, emit, and rewrite to the final hashed path.
 *
 * @beta This package is in preview; its surface may change before 1.0.
 */
import { BUNDLED_FONT_ASSET_URLS } from './asset-urls';

/**
 * The full filename -> bundler-emitted URL map for every bundled face. Most consumers use
 * {@link superdocFonts} or {@link resolveBundledFontAssetUrl} instead of reading this directly.
 *
 * @beta
 */
export { BUNDLED_FONT_ASSET_URLS };

/**
 * Minimal structural shape of SuperDoc's bundled-font asset context. Kept LOCAL so this
 * package has no dependency on `@superdoc/font-system`; only `file` is read. Assignable to
 * SuperDoc's `FontAssetUrlResolver` by structural typing.
 *
 * @beta
 */
export interface BundledFontAssetContext {
  /** Asset filename, e.g. `Carlito-Regular.woff2`. */
  file: string;
  family?: string;
  weight?: string;
  style?: 'normal' | 'italic';
  source?: string;
}

/**
 * Resolve a bundled substitute face filename to a bundler-emitted URL.
 *
 * Pass as SuperDoc's `fonts.resolveAssetUrl` so the reviewed fallback pack loads from THIS
 * package's emitted assets, with no manual copy step and no `assetBaseUrl`:
 *
 *     import { resolveBundledFontAssetUrl } from '@superdoc/fonts';
 *     new SuperDoc({ selector: '#editor', document, fonts: { resolveAssetUrl: resolveBundledFontAssetUrl } });
 *
 * Throws on an unknown file, which signals a version mismatch between `@superdoc/fonts` and
 * the `superdoc` core manifest rather than silently degrading to the logical font name.
 *
 * @beta
 */
export function resolveBundledFontAssetUrl(context: BundledFontAssetContext): string {
  const url = BUNDLED_FONT_ASSET_URLS[context.file];
  if (!url) {
    throw new Error(
      `[@superdoc/fonts] no bundled asset for "${context.file}". This pack ships ` +
        `${Object.keys(BUNDLED_FONT_ASSET_URLS).length} faces; the file is unknown, so ` +
        `@superdoc/fonts and superdoc are likely version-mismatched. Align their versions.`,
    );
  }
  return url;
}

/**
 * Drop-in value for SuperDoc's `fonts` config: `new SuperDoc({ fonts: superdocFonts })`.
 * Equivalent to `{ resolveAssetUrl: resolveBundledFontAssetUrl }`.
 *
 * @beta
 */
export const superdocFonts: { resolveAssetUrl: (context: BundledFontAssetContext) => string } = {
  resolveAssetUrl: resolveBundledFontAssetUrl,
};
