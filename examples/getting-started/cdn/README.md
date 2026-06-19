# SuperDoc — CDN

Zero build tools. A single HTML file plus the SuperDoc global bundle.

## Run locally

```bash
pnpm --filter superdoc build              # builds superdoc.min.js
pnpm --filter @superdoc-dev/fonts build   # builds superdoc-fonts.min.js + the font faces
pnpm setup                                # copies both bundles + fonts + sample DOCX in
npx serve .
```

`pnpm setup` copies the built `superdoc.min.js`, `superdoc-fonts.min.js`, `style.css`, the font `assets/`, and a sample `test_file.docx` into this directory so the example is self-contained.

## Use from the public CDN

Replace the local `<script>` and `<link>` with jsDelivr URLs:

```html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/superdoc@latest/dist/style.css" />
<script src="https://cdn.jsdelivr.net/npm/superdoc@latest/dist/superdoc.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/@superdoc-dev/fonts@latest/dist/superdoc-fonts.min.js"></script>
```

Pin to a specific version (e.g. `superdoc@1.26.0`) in production and add [SRI hashes](https://developer.mozilla.org/docs/Web/Security/Subresource_Integrity) for integrity.

## Fonts

The `superdoc` CDN build ships no fonts: by default the toolbar shows the baseline (one font per CSS generic) and documents render with system fonts. The reviewed fallback pack comes from the optional `@superdoc-dev/fonts` browser build, loaded as a second `<script>`. Pass its global to the editor:

```js
new SuperDoc({ /* ... */ fonts: SuperDocFonts.superdocFonts });
```

From the public CDN the faces resolve automatically, relative to `superdoc-fonts.min.js`. Self-hosting copies both `superdoc-fonts.min.js` and the `assets/` faces, keeping their relative layout; `pnpm setup` does this for you.

## Learn more

- [Vanilla JS Guide](https://docs.superdoc.dev/getting-started/frameworks/vanilla-js)
- [Configuration Reference](https://docs.superdoc.dev/editor/superdoc/configuration)
