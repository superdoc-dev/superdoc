# Built-in track changes UI

The smallest setup that turns on SuperDoc's built-in tracked-changes review surface: insertions and deletions are marked, and the built-in panel surfaces an accept / reject flow without any custom UI.

## What this teaches

- Switching the editor into `documentMode: 'suggesting'` so edits land as tracked changes.
- Enabling the built-in review panel and binding the active user so suggestions are attributed correctly.
- Letting users accept or reject suggestions with no extra wiring.

## Run it

```bash
pnpm install
pnpm dev
```

Open the local URL Vite prints. Edit text to produce tracked changes; the panel renders the accept/reject controls.

## When to reach for it

- You want tracked changes shipped quickly with SuperDoc's default UI.
- You're evaluating the default review experience before deciding whether to build a custom one.

## When not

- You need a custom review surface (your own sidebar, custom diff rendering, batch accept/reject UI). Use [`superdoc/ui/react`](https://docs.superdoc.dev/editor/custom-ui/track-changes) plus `editor.doc.trackChanges.*` instead. The composed reference workspace at [`demos/custom-ui`](../../../../demos/custom-ui) shows the custom-UI pattern.

## Docs

[Built-in UI: track changes](https://docs.superdoc.dev/editor/built-in-ui/track-changes).
