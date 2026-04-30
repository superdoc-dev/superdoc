# Build your own SuperDoc UI

A small React app showing how to wire your existing toolbar, sidebar, and custom command components to SuperDoc through the official `superdoc/ui/react` provider and hooks.

The point isn't *"replace your editor with SuperDoc."* It's: **you already have UI components — here's how you connect them.**

## Run

From the repo root:

```bash
pnpm install
pnpm --filter superdoc run build           # one-time: builds workspace types + dist
pnpm --filter @superdoc-dev/react run build # one-time: react wrapper dist
pnpm --filter build-your-own-ui run dev
```

Open http://localhost:5189.

## What the example demonstrates

- **`<SuperDocEditor>` mounted inside a custom three-pane layout** with `contained` + `hideToolbar` so the wrapper doesn't take over the page.
- **Custom toolbar** driven by `useSuperDocCommand(id)` (per-button state subscription) and `ui.commands.get(id).execute(payload?)` (typed dispatch). Bold / italic / underline / lists / undo / redo / comment / insert clause.
- **Selection-driven enable/disable** — the comment button uses `useSuperDocSelection()` to disable itself when there's no positional selection.
- **Capture-based comment composer** — `ui.selection.capture()` freezes the selection at composer-open time, so the user can click into the textarea (which clears the live editor selection) and the post still anchors to the right text. Routed through `editor.doc.comments.create({ target, text })` via `useSuperDocHost()` until a typed `ui.comments.createFromCapture(capture, { text })` lands (SD-2817).
- **Unified Activity sidebar** — one panel merging comments + tracked changes via `useSuperDocReview()`, instead of separate Comments / Review tabs. Active card highlight is driven by `useSuperDocSelection().activeCommentIds` / `activeChangeIds`.
- **Comment thread display** — replies (`comment.parentCommentId` linkage from OOXML `paraIdParent`) render inline under their parent card.
- **Tracked-change accept / reject** with a Google-Docs-style "Resolved" rollup. The decided-change snapshot is captured locally before the doc-api mutation so the row can keep rendering after the live tracked-change feed drops it.
- **Independent paired replacements** — `modules.trackChanges.replacements: 'independent'` opts out of the default 'paired' replacement model so a typed-over selection surfaces as two distinct entries (one deletion + one insertion).
- **Custom command registration** via `ui.commands.register({ id, execute, getState })` — the `<InsertClauseButton>` registers `'company.insertClause'` from its own component lifecycle. Real consumer apps hold the registration for the session, but the pattern is the same.
- **`modules.comments: false` BYO posture** — disables SuperDoc's built-in floating comment bubble / right sidebar so the consumer's UI is the only comments surface. Imported comments still flow through the engine: `Editor.exportDocx` falls back to `converter.comments` when the UI store hasn't hydrated, so the round-trip is preserved regardless of the UI flag.
- **Smooth scroll on card click** — `ui.review.scrollTo(id)` and `ui.comments.scrollTo(id)` thread `behavior: 'smooth'` through `presentation.navigateTo`. Body comments and body tracked changes animate; non-body tracked changes (header / footer / footnote / endnote) still snap instantly today, tracked separately.
- **Round-trip Import / Export** — Export DOCX with comments and tracked-change marks intact, edit in Word, reimport via `editor.replaceFile(file)`, see the updated activity feed refresh automatically.

## Architecture

```
SuperDocUIProvider          official provider from 'superdoc/ui/react'
└── EditorMount             <SuperDocEditor> + onReady → useSetSuperDoc()
    ├── Toolbar             useSuperDocCommand / ui.commands.get(id).execute
    │   ├── CommentButton   useSuperDocSelection + onComposeComment
    │   └── InsertClauseButton  ui.commands.register({...})
    └── ActivitySidebar     useSuperDocReview / useSuperDocSelection
        └── CommentComposer ui.selection.capture() + editor.doc.comments.create
```

The provider holds **one** controller per app, created on the editor's first `onReady` and destroyed on unmount. Components consume it via `useSuperDocUI()` — they don't reach into `editor.doc.*` directly except for the documented escape hatches.

## What this intentionally does not do

- **No drop-in adapter for another editor.** Consumers don't wrap SuperDoc to make it look like another editor — they bind their UI to `createSuperDocUI`.
- **No UI kit dependency.** No Mantine / shadcn / Material / Radix. Plain React + minimal CSS so consumers can paste pieces into whatever kit they're already using.
- **No backend.** The clause library in `<InsertClauseButton>` is hardcoded local data. Real consumers would fetch this from their own API and call `reg.invalidate()` when permissions or availability change.
- **No AI provider.** Custom commands can absolutely call out to AI services from their `execute` — but a working AI demo distracts from the wiring story. We picked "Insert clause" because it's concrete and self-contained.
- **No direct ProseMirror access.** The point is `editor.doc.*` (mutations) and `superdoc/ui` (UI affordances) are the public surface. The example never touches `editor.state`, `editor.view`, or PM positions.
- **Standard editing toolbar features** (search, hyperlink, heading style picker, font, image insertion) are intentionally absent — they exercise the SuperDoc *editing surface*, not the BYO-UI *controller surface* this app is meant to demonstrate.

## File map

| File | What it shows |
|---|---|
| `src/App.tsx` | `<SuperDocUIProvider>` at the layout root + composer open/close lift. |
| `src/editor/EditorMount.tsx` | `<SuperDocEditor>` config + `onReady` handoff via `useSetSuperDoc`. Documents the `modules.comments: false` and `replacements: 'independent'` choices. |
| `src/components/Toolbar.tsx` | `useSuperDocCommand(id)` per-button binding + `ui.commands.get(id).execute()` dynamic dispatch. Import / Export buttons that drive `host.export` and `editor.replaceFile`. |
| `src/components/ActivitySidebar.tsx` | Unified comments + tracked-changes feed, thread reply nesting, decided-change rollup. |
| `src/components/CommentComposer.tsx` | `ui.selection.capture()` flow + capture-aware `editor.doc.comments.create`. |
| `src/components/InsertClauseButton.tsx` | `ui.commands.register({...})` lifecycle. The custom-command pattern. |

## Known limitations and follow-ups

- **`commentsLoaded` re-emit after `replaceFile`** — when `modules.comments: false` is set, the engine's `Editor.#initComments()` short-circuits and never fires `commentsLoaded`, so the controller's `ui.comments` cache doesn't refresh on reimport. The Import button manually re-emits the event as a workaround. Tracked under SD-2839 (split comment data ingest from comment UI).
- **Capture-aware comment create routes through the host instance** — until `ui.comments.createFromCapture(capture, { text })` lands (SD-2817), the composer reaches `editor.doc.comments.create` via `useSuperDocHost()`.
- **Floating bubble menu / link popover** would need viewport text-rect helpers (SD-2822). The example doesn't include one for that reason.
- **`ui.viewport.scrollIntoView` doesn't accept block targets yet** — citation-style "scroll to paragraph by id" use cases (e.g. RAG demos) currently route through the legacy `superdoc.scrollToElement(id)` instance method. Tracked under SD-2840.
- **Non-body tracked-change smooth scroll** — header / footer / footnote / endnote tracked-change navigation goes through a flag-driven reveal path and doesn't honor caller `behavior` today. Body-only demo is unaffected. Tracked under SD-2841.

## Telemetry

`telemetry: { enabled: false }` is set explicitly in `EditorMount.tsx`. SuperDoc defaults to enabled; consumers building their own consent / privacy story typically want it off until that path is wired.
