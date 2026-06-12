# Releasing @superdoc/fonts

This package is not yet wired into the automated release pipeline. The first publish is manual;
recurring CI publishing is a follow-up.

## First publish (manual, required once)

We are not wiring release automation into this PR. The first publish is done by hand so we can
publish `0.1.0` under the new `@superdoc` org with a deliberate version, rather than letting
automation pick it. Use the `caio-pizzol` account / a token with publish rights to the `@superdoc`
org.

```bash
# from the repo root
pnpm --filter @superdoc/fonts build   # runs sync-assets + generate + tsc; produces dist/ + assets/
cd packages/fonts
npm publish --access public           # publishes @superdoc/fonts@0.1.0
```

`npm publish` runs `prepare` first, so `dist/` and `assets/` (the 65 `.woff2` + license texts) are
rebuilt and included in the tarball via `package.json` "files". Verify with `npm pack --dry-run`
before publishing (expect ~65 `.woff2` plus `dist/*` and license files).

After this, the getting-started examples can move from `@superdoc/fonts: workspace:*` to a published
version range, and the docs link resolves.

## Recurring publishing (follow-up)

To publish later versions from CI, mirror the `react` package wiring:

- `scripts/publish-fonts.cjs` (a semantic-release `publish` plugin, modeled on `scripts/publish-react.cjs`)
- `.github/workflows/release-fonts.yml` (modeled on `.github/workflows/release-react.yml`)
- an entry in the `packages` array in `scripts/release-local-stable.mjs` (with a `resumeFontsPublish`)
- a `fonts-v*` tag prefix

Until that lands, bump the version and re-run the manual publish above when the bundled font set
changes (which is rare).

## Keeping in sync with `superdoc`

The font set is owned by `superdoc` core (`shared/font-system`); this package only ships the binaries
for it. When core adds or removes a bundled family, republish this package so the two stay aligned.
The resolver throws on an unknown face filename, so a mismatch surfaces immediately rather than
rendering a missing font.
