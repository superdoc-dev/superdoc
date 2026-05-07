# Custom UI: selection capture

The smallest example that proves why `ui.selection.capture()` exists. Single file, no framework.

## What this teaches

A comment composer cannot read the live selection at submit time. The textarea takes focus when the composer opens, the editor's live selection visually clears, and a `ui.selection.getSnapshot()` call at submit returns null. The fix is `ui.selection.capture()` at composer-open: a frozen snapshot of the selection that survives focus changes. Pass it to `ui.comments.createFromCapture(capture, { text })` at submit, and the new comment anchors against the original selection.

This example shows that flow and nothing else. No threading, no resolve / reopen / reply, no toolbar, no mode toggle. For the full Custom UI sidebar pattern, see [`demos/custom-ui`](../../../../../demos/custom-ui).

## Run

```bash
pnpm install
pnpm dev
```

Select text in the document. Click **Add comment on selection**. Type, then post. The new comment appears in the right-hand list anchored to the original selection, even though the selection visually cleared the moment the textarea took focus.

## See also

- [Custom UI > Comments](https://docs.superdoc.dev/editor/custom-ui/comments)
- [Custom UI > Selection and viewport](https://docs.superdoc.dev/editor/custom-ui/selection-and-viewport)
- [Custom UI > Controller setup](https://docs.superdoc.dev/editor/custom-ui/controller-setup)
