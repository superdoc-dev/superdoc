# Custom UI: vanilla comments

A custom SuperDoc comments sidebar in plain TypeScript. Single file, no framework, copy-paste into your own app.

## What this teaches

- `ui.selection.capture()` to freeze the editor selection at the moment the user clicks "Add comment", so the anchor survives the textarea taking focus.
- `ui.comments.createFromCapture(capture, { text })` to anchor the new comment against that frozen snapshot, not the live (now-empty) selection.
- `ui.comments.observe(snapshot => ...)` to render the sidebar list from a single subscription.
- Resolve, reopen, and reply per card via `ui.comments.resolve / .reopen / .reply`.
- `ui.createScope()` for lifecycle, plus `ui.destroy()` cascading on tear-down.

## Run

```bash
pnpm install
pnpm dev
```

The `predev` script builds the local `superdoc` workspace package so type imports resolve from `dist/`. From a published `npm` install this step is unnecessary.

## See also

- Docs: [Custom UI > Comments](https://docs.superdoc.dev/editor/custom-ui/comments)
- Sibling examples: [`toolbar/vanilla`](../../toolbar/vanilla), [`track-changes/vanilla`](../../track-changes/vanilla)
