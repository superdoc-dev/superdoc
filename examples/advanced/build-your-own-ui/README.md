# Build your own SuperDoc UI

A small React app showing how to wire your existing toolbar, sidebar, and custom command components to SuperDoc through `createSuperDocUI({ superdoc })`.

The point isn't *"replace your editor with SuperDoc."* It's: **you already have UI components — here's how you connect them.**

## Run

From the repo root:

```bash
pnpm install
pnpm --filter superdoc run build           # one-time: builds workspace types
pnpm --filter @superdoc-dev/react run build # one-time: react wrapper dist
pnpm --filter build-your-own-ui run dev
```

Open http://localhost:5189.

## What the example demonstrates

- **`<SuperDocEditor>` mounted inside a custom three-pane layout** with `contained` + `hideToolbar` so the wrapper doesn't take over the page.
- **Custom toolbar** driven by `ui.toolbar` (snapshot) and `ui.commands.<id>` (per-button observe + execute). Bold / italic / underline / lists / undo / redo / comment.
- **Comments sidebar** driven by `ui.comments.subscribe` plus `ui.comments.createFromSelection`, `resolve`, `reopen`, `scrollTo`.
- **Review sidebar** (merged comments + tracked changes feed) driven by `ui.review.subscribe` plus `accept`, `reject`, `next`, `previous`, `scrollTo`.
- **Custom command registration** via `ui.commands.register({ id, execute, getState })` — the `<InsertClauseButton>` registers `'company.insertClause'` from its own component, not at boot. Real consumer apps hold the registration for the session, but the pattern is the same.
- **`useSuperDocSlice(pickSubscribable, initial)`** — a tiny hook in `src/lib/SuperDocUIProvider.tsx` that turns a `Subscribable<T>` from `ui.select(...)` into a React state binding. Copy it into your app; consumers will reach for this glue immediately.

## Architecture

```
SuperDocUIProvider          createSuperDocUI({ superdoc }) lifecycle
└── EditorMount             <SuperDocEditor> + onReady → setSuperDoc(instance)
    ├── Toolbar             ui.toolbar / ui.commands
    │   ├── CommentButton   ui.selection + ui.comments.createFromSelection
    │   └── InsertClauseButton  ui.commands.register(...)
    ├── CommentsSidebar     ui.comments
    └── ReviewSidebar       ui.review
```

The provider holds **one** controller per app, created on the editor's first `onReady` and destroyed on unmount. Components consume it via `useSuperDocUI()` — they don't reach into `editor.doc.*` directly.

## What this intentionally does not do

- **No drop-in adapter for another editor.** This isn't a TipTap-vs-SuperDoc harness; the `EditorAdapter` abstraction was useful for internal validation but teaches the wrong mental model. Consumers don't wrap SuperDoc to make it look like another editor — they bind their UI to `createSuperDocUI`.
- **No UI kit dependency.** No Mantine / shadcn / Material / Radix. Plain React + minimal CSS so consumers can paste pieces into whatever kit they're already using.
- **No backend.** The clause library in `<InsertClauseButton>` is hardcoded local data. Real consumers would fetch this from their own API and call `reg.invalidate()` when permissions or availability change.
- **No AI provider.** Custom commands can absolutely call out to AI services from their `execute` — but a working AI demo distracts from the wiring story. We picked "Insert clause" precisely because it's concrete and self-contained.
- **No direct ProseMirror access.** The point is `editor.doc.*` (mutations) and `superdoc/ui` (UI affordances) are the public surface. The example never touches `editor.state`, `editor.view`, or PM positions.

## File map

| File | What it shows |
|---|---|
| `src/lib/SuperDocUIProvider.tsx` | One controller per app via React context. `useSuperDocSlice(pickSubscribable, initial)` glue. |
| `src/editor/EditorMount.tsx` | `<SuperDocEditor>` config + `onReady` handoff. |
| `src/components/Toolbar.tsx` | `ui.toolbar` snapshot binding + `ui.commands.<id>.execute`. |
| `src/components/CommentsSidebar.tsx` | `ui.comments` subscribe / resolve / reopen / scrollTo. |
| `src/components/ReviewSidebar.tsx` | `ui.review` merged feed / accept / reject / next / previous. |
| `src/components/InsertClauseButton.tsx` | `ui.commands.register({...})` lifecycle. The custom-command pattern. |

## Telemetry

`telemetry: { enabled: false }` is set explicitly in `EditorMount.tsx`. SuperDoc defaults to enabled; consumers building their own consent / privacy story typically want it off until that path is wired. See FRICTION.md (S12) for context.
