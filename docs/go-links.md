# Stable links for demos and examples

`go.superdoc.dev/<slug>` is the permanent public URL for a demo or
example. It redirects to wherever that demo currently lives on GitHub.

Link to it from documentation, the website, posts, and talks. Do not link
directly to a GitHub path: moving a directory does not leave a redirect behind,
so every link already published breaks silently.

```
go.superdoc.dev/react  ->  github.com/<repo>/tree/main/examples/getting-started/react
```

Move the directory, update `sourcePath`, and the public URL keeps working.

## Publishing an entry

Add a `slug` to its manifest entry:

```json
{
  "id": "getting-started-react",
  "slug": "react",
  "sourcePath": "examples/getting-started/react"
}
```

Slugs are opt-in. An entry without one is not published, which is the right
default for anything not yet worth a permanent name.

## A slug is permanent

Once a slug ships, links to it exist in places we do not control: blog posts,
Discord history, Stack Overflow answers, other people's documentation. Renaming
or removing one breaks all of them, and unlike a repository rename, GitHub gives
us nothing to fall back on.

Treat naming a slug as naming a public API. Specifically:

- Never rename a published slug. Add a second slug if a better name emerges.
- Never reuse a slug for different content, even long after the original is
  archived. A stale link should break loudly rather than land somewhere wrong.
- A slug stays when an entry becomes `hidden` or `archived`. Those mean stop
  advertising it, not stop answering links people already have. Withdrawing an
  example should not break the URL we promised was permanent.
- `id` is the internal catalog key and is free to change with section renames.
  That is the reason the two fields are separate.

`go-links/published-slugs.json` records every slug that has shipped. The
validator compares the manifests against it, so removing or renaming a published
slug is a build failure rather than something noticed after the links break.
Publishing a new one means adding a line to that file in the same change.

## Choosing a slug

- Lowercase kebab-case: `track-changes`, not `trackChanges` or `Track_Changes`.
- Short enough to say out loud and type from memory.
- Name the concept, not its place in the current taxonomy. `toolbar`, not
  `editor-built-in-toolbar`, because sections get reorganized and the URL
  cannot.
- Specific enough to leave room. `doc-rag` rather than `rag`, so a second
  retrieval example later is not stuck competing for the generic name.
- `active`, `hidden`, and `archived` entries can hold a slug. A `shim` cannot: a
  shim stands in for an old path and is not a thing deserving a permanent name.

`docs`, `live`, `source`, `health`, `index`, `api`, `assets`, and `404` are
reserved for service routes.

`pnpm run check:examples-demos` enforces all of this.

## How it is deployed

`.github/workflows/deploy-go-links.yml` builds and deploys go.superdoc.dev on
every push to `main` that touches a manifest. It uses [linkkeeper][linkkeeper],
an open-source tool, pinned to an exact version, and reads the two manifests in
this repository directly. Publishing an example is only the `slug` edit above:
no second list to update anywhere.

`go-links/` holds what the deploy needs and nothing else: which manifests to
read, and the 404 page served for a slug that is not published.

linkkeeper also has its own registry format for projects with no catalog of
their own. We do not use it here on purpose: the manifests are already the
source of truth, and keeping a parallel registry would mean editing two files
every time something moves.

Every destination is requested before the deploy, so a slug pointing at a moved
or deleted path fails the workflow rather than publishing a link that 404s.

[linkkeeper]: https://github.com/caiopizzol/linkkeeper
