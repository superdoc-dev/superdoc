# Document diffing

A Vue example that compares two DOCX files side by side, highlighting insertions and deletions as tracked changes on the right pane while keeping the left pane as the original.

## What this teaches

- Driving SuperDoc's diff surface from two DOCX inputs (no editor instance hosting the diff).
- Rendering the diff result as tracked changes so reviewers see familiar review semantics.
- A reset / re-compare flow without re-mounting the editor.

## Run it

```bash
pnpm install
pnpm dev
```

Open the local URL Vite prints. Pick two DOCX files, click **Compare documents**.

## When to reach for it

- You're shipping a "compare two versions" surface in your product.
- You want to evaluate SuperDoc's diff output quality before committing to it.

## When not

- You want server-side diffing without rendering. The Document Engine SDK exposes the same diff primitives headlessly; see the [Document Engine SDKs](https://docs.superdoc.dev/document-engine/sdks).

## Docs

[Document Engine: diffing](https://docs.superdoc.dev/document-engine/diffing).
