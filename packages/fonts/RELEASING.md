# Releasing @superdoc-dev/fonts

`@superdoc-dev/fonts` is wired into semantic-release:

- pushes to `main` publish prereleases on the `next` dist-tag
- stable releases run through `release-stable.yml`
- tags use `fonts-v${version}`

## One-time 0.1.0 bootstrap

Bootstrap must publish npm and push the git tag together. A tag without the npm package makes
semantic-release think `0.1.0` shipped even though consumers cannot install it.

```bash
# from the repo root, on the commit whose bytes should become 0.1.0
pnpm --filter @superdoc-dev/fonts build
cd packages/fonts
npm publish --access public
cd ../..
git tag fonts-v0.1.0
git push origin fonts-v0.1.0
```

Before publishing, verify the tarball:

```bash
cd packages/fonts
npm pack --dry-run
```

Expect `dist/*`, `src/*`, `assets/LICENSES.md`, license texts, and the bundled `.woff2` assets.

## Automated releases

After `@superdoc-dev/fonts@0.1.0` and `fonts-v0.1.0` exist, semantic-release owns all later
versions. The automated workflow verifies both bootstrap artifacts before it runs semantic-release.
Changes under `packages/fonts/**`, `shared/**`, or `pnpm-workspace.yaml` can trigger the package
release. The publish helper rebuilds the package before publishing so `dist/` and `assets/` are
present in the npm tarball.

## Keeping in sync with `superdoc`

The font set is owned by SuperDoc core (`shared/font-system`). This package ships the binaries and
bundler URLs for that set. When core adds, removes, or renames bundled font assets, release this
package so installed `superdoc` and `@superdoc-dev/fonts` stay aligned.
