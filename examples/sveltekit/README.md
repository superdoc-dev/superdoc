# SvelteKit quickstart

Mount SuperDoc from a SvelteKit route, wait for the document to open, and destroy the editor when the route tears down.

SuperDoc is browser-only. Instantiating it during SSR throws `ReferenceError: document is not defined`. This example scopes SSR off on the editor route so the rest of a real SvelteKit app can keep server-side rendering:

```ts
// src/routes/+page.ts
export const ssr = false;
```

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

See [SvelteKit page options](https://svelte.dev/docs/kit/page-options#ssr) and the [configuration reference](https://docs.superdoc.dev/editor/superdoc/configuration).
