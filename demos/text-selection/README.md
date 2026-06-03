# Archived: programmatic text selection

This demo is no longer recommended and has been removed from the demo gallery.

## Why archived

This demo reached into ProseMirror's `TextSelection` and `activeEditor.view` directly, which predates the supported Custom UI selection surface. The recommended path is the `ui.selection.*` and `ui.viewport.*` handles, which give you capture, restore, anchor rects, and viewport-relative geometry without reaching into editor internals.

## Use instead

- [`examples/editor/custom-ui/selection-capture`](../../examples/editor/custom-ui/selection-capture) for the smallest selection-capture/restore lesson.
- [Custom UI: selection and viewport](https://docs.superdoc.dev/editor/custom-ui/selection-and-viewport) for the conceptual guide.
- `ui.selection.capture`, `ui.selection.restore`, `ui.selection.getAnchorRect`, `ui.viewport.scrollIntoView` for the supported APIs.

The source in this directory is kept for archival reference but is not maintained.
