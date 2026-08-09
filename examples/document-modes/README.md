# Document modes

Switch one browser editor between viewing, editing, and suggesting.

This example demonstrates editor behavior, not authorization. Your application still decides who may open a document or change its mode.

## Run it

Requires Node 22.12 or newer and pnpm 10.

```bash
pnpm install
pnpm dev
```

Choose a mode and edit the sample document. Suggesting records edits as tracked changes. Viewing prevents edits.

## Verify it

```bash
pnpm typecheck
pnpm build
pnpm browsers
pnpm test
```

The browser test confirms that viewing blocks an edit and suggesting exports the same edit as tracked-change XML.

See [Document modes](https://docs.superdoc.dev/editor/document-modes) for the mode contract.
