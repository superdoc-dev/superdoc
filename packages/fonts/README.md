# @superdoc/fonts

The reviewed metric-compatible font substitutes SuperDoc renders when a document asks for a
proprietary font (Carlito for Calibri, Liberation Serif for Times New Roman, and so on). This
package holds the `.woff2` binaries and hands SuperDoc a URL for each face that your bundler
emits and rewrites automatically.

It is optional. Install it when you want SuperDoc's built-in fallbacks to render everywhere
without hosting the fonts yourself. If you load your own fonts (or only need fonts the user's
OS already has), you can skip it.

## Why a separate package

The pack is about 6 MB of font binaries. Keeping it out of the `superdoc` core means the core
stays small, and apps that do not need the fallbacks do not pay for them. The faces still load
lazily in the browser: only the few a document actually uses are fetched.

## Usage

```js
import { SuperDoc } from 'superdoc';
import { resolveBundledFontAssetUrl } from '@superdoc/fonts';

new SuperDoc({
  selector: '#editor',
  document: 'contract.docx',
  fonts: { resolveAssetUrl: resolveBundledFontAssetUrl },
});
```

Or pass the ready-made config object:

```js
import { superdocFonts } from '@superdoc/fonts';

new SuperDoc({ selector: '#editor', document, fonts: superdocFonts });
```

That is the whole setup. No copying files into `public/`, no `assetBaseUrl`. The asset URLs are
written as `new URL('../assets/<file>', import.meta.url)`, which Vite, Webpack 5, Next, Nuxt,
esbuild, and Parcel all detect, emit, and rewrite to the final hashed path.

### Hosting the assets another way

If you serve the fonts from a CDN or a signed path instead, you do not need this package's
resolver. Point SuperDoc at your location with `fonts.assetBaseUrl` or your own
`fonts.resolveAssetUrl`.

## Versioning

`@superdoc/fonts` and `superdoc` version independently, but they share the bundled font set.
Update them together. If the two drift, the resolver throws on an unknown face filename rather
than degrading silently, so a mismatch surfaces immediately instead of turning into a missing
font at render time.

## Licenses

Each bundled family keeps its upstream license. See `assets/LICENSES.md` and the license texts
in `assets/`.
