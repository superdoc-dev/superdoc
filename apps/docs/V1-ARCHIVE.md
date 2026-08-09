# The V1 documentation archive

`docs.superdoc.dev` serves this application. Documentation published before it
answers a different host, `docs-v1.superdoc.dev`, and both are still reachable
from links people have installed.

`config/v1-dispositions.json` decides which is which. Every URL V1 answered is
listed there exactly once, with one of three outcomes:

| Kind      | Where the visitor lands                    | Status |
| --------- | ------------------------------------------ | ------ |
| `v2`      | The page here that replaced it             | 301    |
| `archive` | The same page on `docs-v1.superdoc.dev`    | 302    |
| `retired` | This app's 404 page, which offers a search  | 404    |

Archive redirects are 302 rather than 301 because a page that later gains a real
replacement here should not have been cached as a permanent move.

## What the archive is

A Mintlify deployment of the V1 documentation. Its source is still maintained:
it lives on the V1 release line, in `apps/docs` on this repository's `main`
branch, and reaches the deployment through `stable` and the `docs-stable`
branch of the OSS mirror. Removing that tree from the V2 line does not remove
it from V1, so the archive keeps building and keeps receiving V1 documentation
fixes.

That is why nothing here is a countdown. `config/v1-manifest.json` is a record
of what the archive answered when V2 took over the canonical host, taken from
`superdoc/public/apps/docs` at the commit named in the file. It is not the
archive's build input, and nothing in this branch regenerates or republishes it.

## Keeping it alive

The archive is a deployment someone else owns. Two things have to remain true or
295 of the 742 recorded URLs stop resolving:

1. **The V1 line keeps publishing it.** As long as `apps/docs` exists on `main`
   and the `stable` release lane keeps advancing `docs-stable`, this holds with
   no action. `promote-stable-docs.yml` is what does the advancing, and it lives
   on `main`; the copy this branch deletes only ever fired for `stable`, which
   is not on the V2 line.
2. **`docs-v1.superdoc.dev` keeps pointing at that project.**

### When V1 is retired

Retiring the V1 line is what turns the archive from maintained into frozen, and
that is the point at which it needs its own ref. None of this can be done from
this repository.

1. Find the Mintlify project serving `docs-v1.superdoc.dev` and record its
   repository, branch, docs root, and **deployed commit**. Read the deployed
   commit from the dashboard rather than assuming it matches a branch head.
2. Create `docs-v1-archive` at that exact commit, in the repository the project
   already builds from. A branch is preferred over extracting `apps/docs` into a
   new repository: the app resolves workspace catalog dependencies and may not
   build on its own.
3. Repoint the project at `docs-v1-archive`.
4. Turn off automatic deployment and protect the branch.
5. Verify, on the archive host: an authored guide, a generated Document API
   page, an OpenAPI page, an image, a download, in-page navigation, search,
   `llms.txt`, and one path that V1 answers with its own redirect.
6. Confirm the archive dispositions still resolve end to end:
   `pnpm --filter @superdoc/docs verify:v1-routes`.

Only after all six should `main`'s `promote-stable-docs.yml` be removed. Until
the project is detached, that workflow is what keeps `docs-stable` current.

### Verifying it

```bash
pnpm --filter @superdoc/docs check:v1-routes   # the registry is complete and internally consistent
pnpm --filter @superdoc/docs verify:v1-routes  # every recorded URL resolves where it is meant to
```

The first reads only committed files. The second makes real requests, so it
needs a deployed target and is the one that catches an archive that has gone
away.

## Changing a disposition

Moving a route from `archive` to `v2` is a content decision: it claims a page
here replaces the V1 one. Add the `v2` destination in
`config/v1-dispositions.json`, keep the trailing slash, and run both commands
above. `check:v1-routes` fails if the destination does not exist or is itself
redirected.

Never remove a route from `v1-manifest.json`. It is a record of what V1 served,
not a list of what is convenient to support. A URL that no longer deserves a
page becomes `retired`, with a reason, and gets an honest 404.
