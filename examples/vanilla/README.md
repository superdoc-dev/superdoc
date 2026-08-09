# Vanilla TypeScript quickstart

Open a DOCX in SuperDoc, edit it in the browser, and export the result.

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

The behavior test opens the real sample document, types into the editor, exports a DOCX, and verifies the edit in `word/document.xml`.

Inside this monorepo the example is tested against the current workspace build. A standalone copy installs the `superdoc` version range declared in `package.json`.

See the [Editor quickstart](https://docs.superdoc.dev/editor/quickstart) for the guided explanation.
