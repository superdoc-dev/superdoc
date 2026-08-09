# Permanent source links

Use `go.superdoc.dev` for links to examples in documentation, posts, and support replies. GitHub preserves repository renames, but not paths moved inside a repository.

The first route mirrors the code path:

```text
go.superdoc.dev/examples/react -> github.com/superdoc/docx-editor/tree/main/examples/react
```

That route is permanent. If the React example moves, update its `path` in `go-links/links.json`; do not rename the `examples/react` key. Old routes such as `go.superdoc.dev/react` remain separate entries pointing to the same destination.

## Add an example link

Add the route and current destination to `go-links/links.json`, then record the route in `go-links/published-routes.json` in the same change:

```json
"examples/my-example": { "path": "examples/my-example" }
```

Run `pnpm check:go-links`. It verifies route syntax, local destinations, and compatibility aliases. CI and deployment also compare the permanent-route record with committed history. The deployment checks every destination over the network before publishing.

Once published, never remove, rename, or reuse a route. A retired route should point to an honest retirement page until a real replacement exists.
