# SuperDoc Custom UI demo

A reference workspace built on the `superdoc/ui/react` surface. Toolbar, comment threads, tracked-change review, custom commands, DOCX round-trip, in one app.

See the [Custom UI docs](https://docs.superdoc.dev/editor/custom-ui/overview) for the conceptual guide.

This is a demo, not a minimal canonical recipe. It shows how the pieces compose in a real product. For copy-paste-ready single-concept patterns (toolbar only, comments only, etc.), see the `examples/` folder once those land.

## Run

```bash
pnpm install
pnpm --filter superdoc run build
pnpm --filter @superdoc-dev/react run build
pnpm --filter custom-ui run dev
```

Open http://localhost:5189.

## What you can do here

- Click toolbar buttons (bold, italic, lists, undo, redo) wired through `useSuperDocCommand`.
- Insert a custom clause registered with `ui.commands.register` — the button works, and so does its keyboard shortcut `Mod-Shift-C` (declared on the registration, not wired in a separate keydown listener).
- Switch between Edit and Suggest. In Suggest, every edit lands as a tracked change.
- Select text and watch the floating bubble menu appear next to the selection (anchored via `ui.selection.getAnchorRect()`, not `window.getSelection()`).
- Right-click on a tracked change or comment to see the custom context menu — items appear via `register({ contextMenu: { when } })` and the click target's entities come from `ui.viewport.entityAt({ x, y })`.
- Add a comment. The composer captures the selection on open, posts on submit, and `restore`s the visible range on close so the user keeps their place.
- Accept or reject tracked changes. Decided ones move to a Resolved section.
- Export the doc, edit it in Word, click Import, watch the activity feed update.

## Architecture

```
SuperDocUIProvider                one controller per app
└── EditorMount                   <SuperDocEditor> + onReady + disableContextMenu
    ├── Toolbar                   ui.commands + setDocumentMode
    ├── SelectionPopover          ui.selection.getAnchorRect — bubble menu over the selection
    ├── ContextMenu               ui.viewport.entityAt + ui.commands.getContextMenuItems
    ├── ContextMenuRegistrations  ui.commands.register({ contextMenu: { when } })
    └── ActivitySidebar           ui.comments + ui.trackChanges + ui.selection
        └── CommentComposer       ui.selection.capture / restore + ui.comments.createFromCapture
```

Components consume the controller via `useSuperDocUI()`. They never reach into `editor.state` or `editor.view`.

## App-level: a merged Activity feed

The demo's `ActivitySidebar` shows a single panel that interleaves comments and tracked changes — Word / Google Docs style. The controller exposes `ui.comments` and `ui.trackChanges` as separate slices on purpose, so apps that only render one don't pay for the other. If you want the merged view, compose it in your component:

```tsx
import { useMemo } from 'react';
import { useSuperDocComments, useSuperDocTrackChanges } from 'superdoc/ui/react';

function useActivityFeed() {
  const comments = useSuperDocComments();
  const trackChanges = useSuperDocTrackChanges();

  return useMemo(() => {
    const feed = [];
    for (const c of comments.items) feed.push({ kind: 'comment', id: c.id, comment: c });
    for (const tc of trackChanges.items) feed.push({ kind: 'change', id: tc.id, change: tc.change });
    return feed;
  }, [comments.items, trackChanges.items]);
}
```

Sort or partition the result however the UI wants. This demo's `ActivitySidebar` partitions by Active vs Resolved, threads replies under their parent, and tracks locally-decided changes in a roll-up so accepted suggestions still show as audit rows. Roughly thirty lines of merge logic on top of the two slices.

## What this demo deliberately doesn't do

- No design system. Plain React, plain CSS. Drop the same patterns into your Tailwind / shadcn / MUI / Mantine stack.
- No backend. The clause library in `<InsertClauseButton>` is hardcoded. Real consumers fetch from their own API and call `reg.invalidate()` when permissions or availability change.
- No AI provider. Custom commands can call any LLM from `execute`; the demo picked "Insert clause" because it's concrete and self-contained.

## Three surfaces, three subjects

The demo follows a strict separation between the three editor UI surfaces. Each one answers a different "what's the subject of this action?" question:

| Surface | Subject | Belongs here |
| --- | --- | --- |
| **Toolbar** | The **document** | Mode toggle, Export, Import, Insert clause, Undo / Redo, review nav. Persistent controls that don't depend on a selection or a click target. |
| **Floating bubble menu** | The **selection** | Bold, Italic, Link, Copy, Comment on selection. Format-on-selection actions where the user's eyes stay on the work. |
| **Right-click context menu** | The **clicked target** | Accept / Reject (on tracked change), Resolve (on comment), Copy / Comment on selection (only when the click is *inside* the selection rect). |

The right-click menu deliberately stays empty when the click lands on plain caret-only text. To honor the "click target = subject" rule for items like "Paste here" or "Insert clause at this point", the demo would need a `ui.viewport.positionAt({ x, y })` API (paired with `entityAt`) that resolves a coordinate to a `SelectionPoint`. Without it, those items would dispatch against the stale selection from before the right-click — a misleading teaching example. The API gap is filed as a SD-2936 follow-up; the demo stays honest until it lands.

The `ContextMenu` component hit-tests the click against `ui.selection.getRects()` to separate "click landed inside the selection" from "click landed somewhere else with a stale selection elsewhere on the page". Without that hit-test, every right-click anywhere would surface selection-scoped items.

## The custom-UI recipe (after SD-2936)

1. **Floating selection toolbar** — `ui.selection.getAnchorRect({ placement: 'start' })` returns viewport-relative coords for the painted selection. Re-position on `useSuperDocSelection()` change + `scroll`/`resize`. Don't reach for `window.getSelection()`; SuperDoc's painted DOM is separate from the offscreen ProseMirror DOM and the browser API returns the wrong rect. See `SelectionPopover.tsx`.

2. **Right-click context menu** — set `disableContextMenu` on `<SuperDocEditor>` to suppress the built-in. On `contextmenu`, call `ui.viewport.entityAt({ x: event.clientX, y: event.clientY })` to get the entities under the cursor, then `ui.commands.getContextMenuItems({ entities })` to get items contributed via `register({ contextMenu })`. Pass `entities` as the payload when dispatching so `execute` can act on the right id. See `ContextMenu.tsx` + `ContextMenuRegistrations.tsx`.

3. **Custom command + keyboard shortcut** — declare `shortcut: 'Mod-Shift-C'` on the registration. The controller installs a single bubble-phase keydown listener scoped to the painted host; matched shortcuts dispatch through the same path the toolbar button uses. No per-command keymap wiring. See `InsertClauseButton.tsx`.

4. **Composer capture + restore** — `ui.selection.capture()` on open holds the selection across focus moves. `ui.comments.createFromCapture(captured, { text })` posts the comment using the frozen target. `ui.selection.restore(captured)` puts the visible selection back so the user keeps their place. See `CommentComposer.tsx`.

## Three takeaways for your own UI

1. **One provider, many components.** The toolbar, sidebar, and review panel all subscribe to the same controller via hooks. They don't pass props down a tree.
2. **`modules: { comments: false }` and your own panel.** The demo turns off the built-in comments UI and renders its own. Imported comments still flow through export and import.
3. **Capture, then restore.** Composers freeze the selection at open, post on submit, then `restore(capture)` on close. The user sees their range come back instead of typing into a vanished selection.

## Telemetry

`telemetry: { enabled: false }` is set in `EditorMount.tsx`. SuperDoc defaults to enabled.
