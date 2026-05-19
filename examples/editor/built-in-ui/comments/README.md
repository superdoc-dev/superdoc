# Built-in comments UI

The smallest setup that turns on SuperDoc's built-in comments panel and lets the current user create, resolve, and reply to threaded comments without writing any UI yourself.

## What this teaches

- Enabling the `comments` module on a `SuperDoc` instance.
- Wiring the comments panel to a sibling DOM container so threads render outside the document canvas.
- Setting the active user (`name`, `email`) so new comments are attributed correctly.

## Run it

```bash
pnpm install
pnpm dev
```

Open the local URL Vite prints, then select text and click the comment affordance.

## When to reach for it

- You want comments shipped quickly with SuperDoc's default UI.
- You're evaluating whether the built-in panel covers your review workflow before deciding whether to build a custom one.

## When not

- You need a custom comments UI (your own sidebar, panel, popovers). Use [`superdoc/ui/react`](https://docs.superdoc.dev/editor/custom-ui/comments) plus the `editor.doc.comments.*` Document API instead. The custom-UI demo at [`demos/custom-ui`](../../../../demos/custom-ui) is the worked composed example.

## Docs

[Built-in UI: comments](https://docs.superdoc.dev/editor/built-in-ui/comments).
