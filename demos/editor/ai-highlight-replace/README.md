# SuperDoc Custom UI demo

A reference workspace built on the `superdoc/ui/react` surface. The headline use case is **source-grounded citations**: insert a mock RAG-generated draft, see anchored citation highlights with hover previews, navigate from a sources panel, edit or remove citations. Wrapped in a full editor workspace: custom toolbar, comment threads, tracked-change review, custom commands, and DOCX round-trip.

See the [Custom UI docs](https://docs.superdoc.dev/editor/custom-ui/overview) for the conceptual guide, and the upcoming [source-grounded citations feature page](https://docs.superdoc.dev/document-api/features/anchored-metadata) for the citation story.

This demo shows how the pieces compose in a real product, not a single-concept recipe. Read it alongside the docs above when you're wiring your own toolbar, sources panel, or citation overlay.

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

- Open the **Sources** tab and click **Insert sample cited draft**. A mocked RAG-generated paragraph is inserted at the end of the document; each cited span is anchored with `editor.doc.metadata.attach` and rendered with a highlight overlay.
- Hover a citation highlight to see the source's display text, locator, provider, and confidence. The popover reads the payload via `ui.viewport.entityAt` + `metadata.get`.
- Click **Scroll to** in the sources panel to navigate to a cited span. Uses `ui.metadata.scrollIntoView({ id })`.
- Click **Edit** on a citation to change `displayText`, `locator`, or `excerpt`. Calls `editor.doc.metadata.update`.
- Click **Remove** to strip the anchor and payload. Calls `editor.doc.metadata.remove`.
- Click toolbar buttons (bold, italic, lists, undo, redo) wired through `useSuperDocCommand`, and use the font-family picker powered by `useSuperDocFontOptions`. The picker uses a button menu so opening it does not move focus away from the editor selection.
- Insert a custom clause registered with `ui.commands.register`. The button works, and so does its keyboard shortcut `Mod-Shift-C`, declared on the registration rather than wired in a separate keydown listener.
- Switch between Edit and Suggest. In Suggest, every edit lands as a tracked change.
- Select text and watch the floating bubble menu appear next to the selection (anchored via `ui.selection.getAnchorRect()`, not `window.getSelection()`).
- Right-click on a tracked change, comment, inside a selection, or on plain text. The menu adapts to the click target: Accept / Reject / Resolve on entities, Copy / Comment on a selection, Insert clause here on plain caret-only text.
- Add a comment. The composer captures the selection on open, posts on submit, and restores the visible range on close so the user keeps their place.
- Accept or reject tracked changes. Decided ones move to a Resolved section.
- Export the doc, edit it in Word, click Import, watch the activity feed update.

## Source-grounded citations

The demo composes anchored citation pointers on top of `editor.doc.metadata.*` and `ui.metadata.*`:

| Layer | What it does | Code |
| --- | --- | --- |
| **Mock RAG output** | Pre-canned text + per-citation payloads (sourceId, displayText, locator, excerpt, confidence). Stand-in for a real generation pipeline. | `mockDraft.ts` |
| **Insert + attach** | Inserts the text via `editor.doc.insert`, then computes a `SelectionTarget` for each cited span and calls `editor.doc.metadata.attach` per citation. | `GenerateDraftButton.tsx`, `useCitations.ts` |
| **Sources panel** | Lists citations grouped by `sourceId`. Scroll-to navigation uses `ui.metadata.scrollIntoView({ id })`. Edit form calls `editor.doc.metadata.update`. | `CitationsPanel.tsx` |
| **Highlight overlay** | Renders one absolute-positioned rectangle per painted line of each cited span. Rects come from `ui.metadata.getRect({ id })` and remeasure through `ui.viewport.observe`. | `CitationHighlights.tsx` |
| **Hover popover** | `ui.viewport.entityAt({ x, y })` returns the content control under the cursor; `metadata.get({ id })` fetches the payload to render. | `CitationPopover.tsx` |
| **Persistence** | Hidden inline content controls in the body carry the stable id in `w:tag`; payloads live in a namespaced custom XML data part. Survives DOCX export, reopen, and Word save (validated by the `word-roundtrip` fixtures in the monorepo). | `editor.doc.metadata.*` |

`ui.metadata.*` is the supported public surface for consumer-side geometry and navigation; consumers carry the metadata id and never see the SDT node id underneath.

## Architecture

```
SuperDocUIProvider                one controller per app
└── EditorMount                   <SuperDocEditor> + onReady + disableContextMenu
    ├── Toolbar                   ui.commands + ui.fonts + setDocumentMode
    ├── SelectionPopover          ui.selection.getAnchorRect, bubble menu over the selection
    ├── ContextMenu               ui.viewport.contextAt + ui.commands.getContextMenuItems(context) + item.invoke()
    ├── ContextMenuRegistrations  ui.commands.register({ contextMenu: { when } })
    ├── TrackedChangeActivation   ui.trackChanges.getAt + setActive for document-click review focus
    ├── CitationHighlights        ui.metadata.getRect, painted overlay across cited spans
    ├── CitationPopover           ui.viewport.entityAt + metadata.get, hover preview
    └── ActivitySidebar           ui.comments + ui.trackChanges + ui.selection (Activity tab)
        ├── CitationsPanel        editor.doc.metadata.list/get/update/remove + ui.metadata.scrollIntoView (Sources tab)
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

## The custom-UI patterns

1. **Toolbar controls.** `useSuperDocCommand(id)` binds each button to one command. `useSuperDocFontOptions()` gives the font-family picker its built-in defaults plus fonts used by the active document. Apply a selected font with `ui.toolbar.execute('font-family', option.value)`. See `Toolbar.tsx`.

2. **Floating selection toolbar.** `ui.selection.getAnchorRect({ placement: 'start' })` returns viewport-relative coords for the painted selection. Re-position on `useSuperDocSelection()` change plus `scroll`/`resize`. Don't reach for `window.getSelection()`; SuperDoc's painted DOM is separate from the offscreen ProseMirror DOM and the browser API returns the wrong rect. See `SelectionPopover.tsx`.

3. **Right-click context menu.** Set `disableContextMenu` on `<SuperDocEditor>` to suppress the built-in. On `contextmenu`, call `ui.viewport.contextAt({ x, y })` to get the bundle, then `ui.commands.getContextMenuItems(context)` to get items contributed via `register({ contextMenu })`. Each item carries `invoke()`, which fires the registered `execute({ context })` with the bundle bound, so handlers act on the click target without the menu component threading payloads. Scope the listener with `ui.viewport.getHost()` instead of a CSS class. See `ContextMenu.tsx` and `ContextMenuRegistrations.tsx`.

4. **Tracked-change review focus.** On document pointerdown, `ui.trackChanges.getAt({ x, y })` returns the public tracked-change item under the cursor; `ui.trackChanges.setActive(hit.id)` highlights the matching Activity card without scrolling or moving selection. Sidebar card clicks call `scrollTo(id)` for document movement and caret placement, then `setActive(id)` so overlapping synthetic comments do not steal the card highlight after navigation. See `TrackedChangeActivation.tsx` and `ActivitySidebar.tsx`.

5. **Custom command + keyboard shortcut.** Declare `shortcut: 'Mod-Shift-C'` on the registration. The controller installs a single bubble-phase keydown listener scoped to the painted host; matched shortcuts dispatch through the same path the toolbar button uses. No per-command keymap wiring. See `InsertClauseButton.tsx`.

6. **Composer capture + restore.** `ui.selection.capture()` on open holds the selection across focus moves. `ui.comments.createFromCapture(captured, { text })` posts the comment using the frozen target. `ui.selection.restore(captured)` puts the visible selection back so the user keeps their place. See `CommentComposer.tsx`.

## Adapting this to your stack

- **One provider, many components.** Toolbar, sidebar, and review panel all subscribe to the same controller via hooks. They don't pass props down a tree.
- **No design system.** Plain React, plain CSS. Drop the same patterns into Tailwind / shadcn / MUI / Mantine.
- **`modules: { comments: false }` and your own panel.** The demo turns off the built-in comments UI and renders its own. Imported comments still flow through export and import.
- **Capture, then restore.** Composers freeze the selection at open, post on submit, then `restore(capture)` on close. The user sees their range come back instead of typing into a vanished selection.
- **Activity feed merge.** `ActivitySidebar.tsx` interleaves `ui.comments` and `ui.trackChanges` into one panel with about thirty lines of merge logic. The two slices stay separate on the controller so apps that only render one don't pay for the other.

## What this demo deliberately doesn't do

- No design system. Patterns over CSS, copy them into yours.
- No backend. The clause library in `<InsertClauseButton>` is hardcoded. Real consumers fetch from their own API and call `reg.invalidate()` when permissions or availability change.
- No live AI provider. The citation flow uses pre-canned draft text + payloads in `mockDraft.ts` instead of calling an LLM. Real consumers replace this with their RAG output, but the shape that flows into `editor.doc.metadata.attach` (text + cited ranges + payloads) stays the same.
- Telemetry is off (`telemetry: { enabled: false }` in `EditorMount.tsx`) because there's no analytics endpoint to receive events. SuperDoc defaults to enabled.
