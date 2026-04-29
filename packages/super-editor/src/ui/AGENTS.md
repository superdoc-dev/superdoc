# `superdoc/ui` — agent guidance

`ui.commands` is a UI affordance layer.

- **Document mutations route through `editor.doc.*`.** If a toolbar command produces a document change, its executor must call the Document API, not `editor.commands.*`.
- **UI/session behavior stays in `superdoc/ui`.** Zoom, ruler, document mode, copy-format, and similar gestures don't belong on `editor.doc.*` and must not be smuggled there.
- **Legacy editor-command fallback requires an explicit routing entry and gap ticket.** The fallback exists for cases where the Document API has no equivalent yet (or the equivalent is intentionally narrower than the UI gesture). Each fallback is enumerated in `packages/super-editor/src/headless-toolbar/command-routing.ts` with a Linear ticket linking the work to close it.

The full routing table lives in `command-routing.ts`. Adding a new public toolbar id requires an entry there — the type system enforces it. The runtime test in `command-routing.test.ts` enforces that the entry's shape matches its route (operations declared for `document-api`, gap ticket for `legacy-editor-command`, etc.).
