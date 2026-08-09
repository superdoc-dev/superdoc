# Search

Enable SuperDoc's built-in find surface and move between matches in the open DOCX.

## Run it

Requires Node 22.12 or newer and pnpm 10.

```bash
pnpm install
pnpm dev
```

Choose **Search** in the toolbar, enter a term, then use the previous and next controls.

## Verify it

```bash
pnpm typecheck
pnpm build
pnpm browsers
pnpm test
```

The browser test opens the real find surface, searches a DOCX, and verifies navigation between matches.

See [Find and replace in the built-in UI](https://docs.superdoc.dev/editor/built-in-ui/search-and-replace) for replacement and advanced search options.
