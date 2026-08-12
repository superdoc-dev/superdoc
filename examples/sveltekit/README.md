# SvelteKit quickstart

Mount SuperDoc from a SvelteKit route, wait for the document to open, and destroy the editor when the route tears down.
SuperDoc starts inside `$effect`, so it only runs after the route mounts in the browser.

## Run it

Requires Node 22.12 or newer and pnpm 10.

```bash
pnpm install
pnpm dev
```

Open the printed URL. When the document is ready, edit its text and choose **Export DOCX**.

## Verify it

```bash
pnpm typecheck
pnpm build
pnpm browsers
pnpm test
```

The browser test edits a real DOCX, exports it, and verifies the edit in `word/document.xml`.

Inside this monorepo the example is tested against the current workspace build. A standalone copy installs the versions declared in `package.json`.

See the [configuration reference](https://docs.superdoc.dev/editor/superdoc/configuration).
