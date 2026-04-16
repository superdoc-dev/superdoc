# SuperDoc — CDN

Zero build tools. A single HTML file plus the SuperDoc global bundle.

## Run locally

```bash
pnpm prepare
npx serve .
```

`pnpm prepare` copies the built `superdoc.min.js`, `style.css`, and a sample `test_file.docx` into this directory so the example is self-contained.

## Use from the public CDN

Replace the local `<script>` and `<link>` with jsDelivr URLs:

```html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/superdoc@1.27/dist/style.css" />
<script src="https://cdn.jsdelivr.net/npm/superdoc@1.27/dist/superdoc.min.js"></script>
```

Pin to a minor (`@1.27`) in production and add [SRI hashes](https://developer.mozilla.org/docs/Web/Security/Subresource_Integrity) for integrity.

## Learn more

- [Vanilla JS Guide](https://docs.superdoc.dev/getting-started/frameworks/vanilla-js)
- [Configuration Reference](https://docs.superdoc.dev/core/superdoc/configuration)
