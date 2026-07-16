# @superdoc-dev/fonts

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
import { resolveBundledFontAssetUrl } from '@superdoc-dev/fonts';

new SuperDoc({
  selector: '#editor',
  document: 'contract.docx',
  fonts: { resolveAssetUrl: resolveBundledFontAssetUrl },
});
```

Or pass the ready-made config object:

```js
import { superdocFonts } from '@superdoc-dev/fonts';

new SuperDoc({ selector: '#editor', document, fonts: superdocFonts });
```

That is the whole setup. No copying files into `public/`, no `assetBaseUrl`. The asset URLs are
written as `new URL('../assets/<file>', import.meta.url)`, which Vite, Webpack 5, Next, Nuxt,
esbuild, and Parcel all detect, emit, and rewrite to the final hashed path.

### CDN / `<script>` tag (no bundler)

For a plain HTML page, load the browser build and use the `SuperDocFonts` global. It exposes the
same API, and the faces resolve relative to the script, so there is no bundler and no path config:

```html
<script src="https://cdn.jsdelivr.net/npm/superdoc/dist/superdoc.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/@superdoc-dev/fonts/dist/superdoc-fonts.min.js"></script>
<script>
  new SuperDoc({
    selector: '#editor',
    document: 'contract.docx',
    fonts: SuperDocFonts.superdocFonts, // or SuperDocFonts.createSuperDocFonts({ exclude: [...] })
  });
</script>
```

The `superdoc` CDN build ships no fonts and shows the baseline until you add this script. Self-hosting
works too: keep the package's `dist/` and `assets/` in their relative layout, since the faces resolve
to `../assets/` next to `superdoc-fonts.min.js`.

### Choosing which fonts

`superdocFonts` enables every reviewed family. To narrow the set, use `createSuperDocFonts` and name
the families by their Word name (`Calibri`, not the substitute `Carlito`):

```js
import { createSuperDocFonts } from '@superdoc-dev/fonts';

// Everything except a couple:
new SuperDoc({ selector: '#editor', document, fonts: createSuperDocFonts({ exclude: ['Cooper Black'] }) });

// Or only an explicit set:
new SuperDoc({ selector: '#editor', document, fonts: createSuperDocFonts({ include: ['Calibri', 'Cambria'] }) });
```

`include` is an allow-list; `exclude` keeps everything but the named families. Curation drives the
toolbar list and which families SuperDoc substitutes. Your own licensed fonts stay separate
(`fonts.families`).

### Hosting the assets another way

If you serve the fonts from a CDN or a signed path instead, you do not need this package's
resolver. Point SuperDoc at your location with `fonts.assetBaseUrl` or your own
`fonts.resolveAssetUrl`.

## Versioning

`@superdoc-dev/fonts` and `superdoc` version independently, but they share the bundled font set.
Update them together. If the two drift, the resolver throws on an unknown face filename rather
than degrading silently, so a mismatch surfaces immediately instead of turning into a missing
font at render time.

## Licenses

Each bundled family keeps its upstream license. See `assets/LICENSES.md` and the license texts
in `assets/`.
