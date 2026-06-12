# SuperDoc — CDN

Zero build tools. A single HTML file plus the SuperDoc global bundle.

## Run locally

```bash
pnpm --filter superdoc build  # one-time, builds the CDN bundle
pnpm setup                    # copies the bundle + sample DOCX in
npx serve .
```

`pnpm setup` copies the built `superdoc.min.js`, `style.css`, and a sample `test_file.docx` into this directory so the example is self-contained.

## Use from the public CDN

Replace the local `<script>` and `<link>` with jsDelivr URLs:

```html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/superdoc@latest/dist/style.css" />
<script src="https://cdn.jsdelivr.net/npm/superdoc@latest/dist/superdoc.min.js"></script>
```

Pin to a specific version (e.g. `superdoc@1.26.0`) in production and add [SRI hashes](https://developer.mozilla.org/docs/Web/Security/Subresource_Integrity) for integrity.

## Fonts

SuperDoc's bundled fallback fonts load from `dist/fonts/` next to the script. From the public CDN they resolve automatically (`superdoc@<version>/dist/fonts/...`), so there's nothing to configure. When you self-host the bundle, serve a `fonts/` folder beside `superdoc.min.js`. The `pnpm setup` step above copies it in for you.

## Learn more

- [Vanilla JS Guide](https://docs.superdoc.dev/getting-started/frameworks/vanilla-js)
- [Configuration Reference](https://docs.superdoc.dev/editor/superdoc/configuration)
