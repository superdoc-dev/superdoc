# SuperDoc Custom UI demo

A reference workspace built on the `superdoc/ui/react` surface. Toolbar, comment threads, tracked-change review, custom commands, DOCX round-trip, in one app.

See the [Custom UI docs](https://docs.superdoc.dev/editor/custom-ui/overview) for the conceptual guide.

This demo shows how the pieces compose in a real product, not a single-concept recipe. Read it alongside the docs above when you're wiring your own toolbar or panel.

## Run

Prerequisites: Node 20+, pnpm 9+, run from inside the SuperDoc monorepo.

```bash
pnpm install
pnpm --filter superdoc run build
pnpm --filter @superdoc-dev/react run build
pnpm --filter custom-ui run dev
```

Open http://localhost:5189.

## What you can do here

- Click toolbar buttons (bold, italic, lists, undo, redo) wired through `useSuperDocCommand`.
- Insert a custom clause registered with `ui.commands.register`. The button works, and so does its keyboard shortcut `Mod-Shift-C`, declared on the registration rather than wired in a separate keydown listener.
- Switch between Edit and Suggest. In Suggest, every edit lands as a tracked change.
- Select text and watch the floating bubble menu appear next to the selection (anchored via `ui.selection.getAnchorRect()`, not `window.getSelection()`).
- Right-click on a tracked change, comment, inside a selection, or on plain text. The menu adapts to the click target: Accept / Reject / Resolve on entities, Copy / Comment on a selection, Insert clause here on plain caret-only text.
- Add a comment. The composer captures the selection on open, posts on submit, and restores the visible range on close so the user keeps their place.
- Accept or reject tracked changes. Decided ones move to a Resolved section.
- Export the doc, edit it in Word, click Import, watch the activity feed update.

## Architecture

```
SuperDocUIProvider                one controller per app
└── EditorMount                   <SuperDocEditor> + onReady + disableContextMenu
    ├── Toolbar                   ui.commands + setDocumentMode
    ├── SelectionPopover          ui.selection.getAnchorRect, bubble menu over the selection
    ├── ContextMenu               ui.viewport.contextAt + ui.commands.getContextMenuItems(context) + item.invoke()
    ├── ContextMenuRegistrations  ui.commands.register({ contextMenu: { when } })
    └── ActivitySidebar           ui.comments + ui.trackChanges + ui.selection
        └── CommentComposer       ui.selection.capture / restore + ui.comments.createFromCapture
```

Components consume the controller via `useSuperDocUI()`. They never reach into `editor.state` or `editor.view`.

## Three surfaces, three subjects

The demo keeps a strict separation between the three editor UI surfaces. Each one answers a different "what's the subject of this action?" question:

| Surface | Subject | Items in the demo |
| --- | --- | --- |
| **Toolbar** | The **document** | Bold, Italic, Lists, Undo, Redo, Mode toggle, Insert clause, Export, Import. |
| **Floating bubble menu** | The **selection** | Bold, Italic, Comment on selection. |
| **Right-click context menu** | The **clicked target** | Accept / Reject on tracked change, Resolve on comment, Copy / Comment on selection (when the click is inside the selection rect), Insert clause here (when the click lands on plain caret-only text). |

`ui.viewport.contextAt({ x, y })` returns one bundle with the click point, the entities under it, the resolved caret position, the live selection, and `insideSelection` (whether the click landed in the painted selection rects). Each predicate filters on the same shape its handler receives, so "Copy" / "Comment on selection" gate themselves on `insideSelection === true` and "Insert clause here" gates on `position !== null && entities.length === 0 && insideSelection !== true`. A stale selection elsewhere on the page can't leak into a right-click somewhere else.

The `Insert clause here` handler reads `context.position.target` (a collapsed `SelectionTarget` at the click point) and passes it straight to `editor.doc.insert`. The same predicate the menu was filtered with becomes the target the action acts on. Without the bundle, the registration would have to insert against the user's prior selection somewhere else in the doc, making the label a lie.

Right-click on plain text where no item matches falls through to the browser's native menu. The handler deliberately doesn't `preventDefault` when `getContextMenuItems(context)` returns nothing, so the user gets Copy / Paste / Inspect from the browser instead of a dead right-click.

## The four custom-UI patterns

1. **Floating selection toolbar.** `ui.selection.getAnchorRect({ placement: 'start' })` returns viewport-relative coords for the painted selection. Re-position on `useSuperDocSelection()` change plus `scroll`/`resize`. Don't reach for `window.getSelection()`; SuperDoc's painted DOM is separate from the offscreen ProseMirror DOM and the browser API returns the wrong rect. See `SelectionPopover.tsx`.

2. **Right-click context menu.** Set `disableContextMenu` on `<SuperDocEditor>` to suppress the built-in. On `contextmenu`, call `ui.viewport.contextAt({ x, y })` to get the bundle, then `ui.commands.getContextMenuItems(context)` to get items contributed via `register({ contextMenu })`. Each item carries `invoke()`, which fires the registered `execute({ context })` with the bundle bound, so handlers act on the click target without the menu component threading payloads. Scope the listener with `ui.viewport.getHost()` instead of a CSS class. See `ContextMenu.tsx` and `ContextMenuRegistrations.tsx`.

3. **Custom command + keyboard shortcut.** Declare `shortcut: 'Mod-Shift-C'` on the registration. The controller installs a single bubble-phase keydown listener scoped to the painted host; matched shortcuts dispatch through the same path the toolbar button uses. No per-command keymap wiring. See `InsertClauseButton.tsx`.

4. **Composer capture + restore.** `ui.selection.capture()` on open holds the selection across focus moves. `ui.comments.createFromCapture(captured, { text })` posts the comment using the frozen target. `ui.selection.restore(captured)` puts the visible selection back so the user keeps their place. See `CommentComposer.tsx`.

## Adapting this to your stack

- **One provider, many components.** Toolbar, sidebar, and review panel all subscribe to the same controller via hooks. They don't pass props down a tree.
- **No design system.** Plain React, plain CSS. Drop the same patterns into Tailwind / shadcn / MUI / Mantine.
- **`modules: { comments: false }` and your own panel.** The demo turns off the built-in comments UI and renders its own. Imported comments still flow through export and import.
- **Capture, then restore.** Composers freeze the selection at open, post on submit, then `restore(capture)` on close. The user sees their range come back instead of typing into a vanished selection.
- **Activity feed merge.** `ActivitySidebar.tsx` interleaves `ui.comments` and `ui.trackChanges` into one panel with about thirty lines of merge logic. The two slices stay separate on the controller so apps that only render one don't pay for the other.

## What this demo deliberately doesn't do

- No design system. Patterns over CSS, copy them into yours.
- No backend. The clause library in `<InsertClauseButton>` is hardcoded. Real consumers fetch from their own API and call `reg.invalidate()` when permissions or availability change.
- No AI provider. Custom commands can call any LLM from `execute`. The demo picked "Insert clause" because it's concrete and self-contained.
- Telemetry is off (`telemetry: { enabled: false }` in `EditorMount.tsx`) because there's no analytics endpoint to receive events. SuperDoc defaults to enabled.
