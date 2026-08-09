# Releasing @superdoc/fonts

> **This checkout cannot release fonts.** The public `release-fonts.yml`
> workflow was deleted from the V2 tree before the export cutover, so there is
> no release path here — automated or manual. Its absence is expected and is not
> a CI failure.
>
> The fonts train runs from Orbit `main`, which keeps its own copy of the
> workflow and remains the owner of both `@superdoc/fonts` and the deprecated
> `@superdoc-dev/fonts` mirror. See `scripts/superdoc-release-ownership.mjs` in
> Orbit for the recorded owner and recovery path.
>
> The rest of this document describes how that Orbit-`main`-owned release
> behaves. It is kept because the packaging rules, the bootstrap history, and
> the two-name publishing model still govern what ships — but nothing below can
> be initiated from this repository.

`@superdoc/fonts` is wired into semantic-release on the branch that owns it:

- pushes to `main` there publish prereleases on the `next` dist-tag
- stable releases are cut by the maintainers, not from this repository
- tags use `fonts-v${version}`

## Bootstrap history

Automated releases require both a `fonts-v0.1.0` tag and a published `0.1.0`, and
the owning workflow checks for them before running semantic-release. A tag
without the npm package would make semantic-release believe `0.1.0` shipped when
consumers cannot install it.

Both already exist. `0.1.0` predates the move to `@superdoc/fonts`, so it was
published under the legacy name and that gate still checks
`@superdoc-dev/fonts@0.1.0`. It proves the release history is intact, not that
the canonical package is present; do not repoint it at a `@superdoc/fonts`
version that never existed. `@superdoc/fonts` has in fact never been published —
`scripts/fonts-release-scope.mjs` holds the version boundary that decides which
names a given release ships under.

There is nothing to bootstrap again. If a future package needs the same
treatment, publish the npm package and push the git tag together.

## Automated releases (from the owning branch)

semantic-release owns every version after the bootstrap, and the owning workflow
verifies both bootstrap artifacts before it runs. Changes under
`packages/fonts/**`, `shared/**`, or `pnpm-workspace.yaml` can trigger the
package release **there**; pushing those paths in this checkout releases
nothing. The publish helper (`scripts/publish-fonts.cjs`, still present here)
rebuilds the package before publishing so `dist/` and `assets/` are present in
the npm tarball.

Each release publishes two names from one build: the canonical `@superdoc/fonts`
and a deprecated `@superdoc-dev/fonts` compatibility mirror for consumers who
installed before the scope change. The mirror version is deprecated immediately
after it publishes, because `npm deprecate` only marks versions that exist when
it runs.

To inspect what a release would ship:

```bash
cd packages/fonts
npm pack --dry-run
```

Expect `dist/*`, `src/*`, `assets/LICENSES.md`, license texts, and the bundled `.woff2` assets.

## Keeping in sync with `superdoc`

The font set is owned by SuperDoc core (`shared/font-system`). This package ships the binaries and
bundler URLs for that set. When core adds, removes, or renames bundled font assets, the package needs
a release so installed `superdoc` and `@superdoc/fonts` stay aligned — which now has to be requested
from the Orbit `main` train rather than cut from here.
