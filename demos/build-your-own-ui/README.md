# Build your own SuperDoc UI

A reference workspace built on the `superdoc/ui/react` surface. Toolbar, comment threads, tracked-change review, custom commands, DOCX round-trip - in one app.

This is a demo, not a minimal canonical recipe. It shows how the pieces compose in a real product, and it carries a few documented workarounds where the public API isn't yet enough on its own. For copy-paste-ready single-concept patterns (toolbar only, comments only, etc.), see the `examples/` folder once those land.

## Run

```bash
pnpm install
pnpm --filter superdoc run build
pnpm --filter @superdoc-dev/react run build
pnpm --filter build-your-own-ui run dev
```

Open http://localhost:5189.

## What you can do here

- Click toolbar buttons (bold, italic, lists, undo, redo) wired through `useSuperDocCommand`.
- Insert a custom clause registered with `ui.commands.register`.
- Select text and add a comment. Reply threads render under their parent.
- Accept or reject tracked changes. Decided ones move to a Resolved section.
- Export the doc, edit it in Word, click Import, watch the activity feed update.

## Architecture

```
SuperDocUIProvider          one controller per app
└── EditorMount             <SuperDocEditor> + onReady
    ├── Toolbar             ui.commands
    └── ActivitySidebar     ui.review + ui.selection
        └── CommentComposer ui.selection.capture()
```

Components consume the controller via `useSuperDocUI()`. They never reach into `editor.state` or `editor.view`.

## Caveats this app reveals

- Comment composer routes through `editor.doc.comments.create` directly. A typed `ui.comments.createFromCapture` is on the way (SD-2817).
- Reimport with `modules.comments: false` needs a manual `commentsLoaded` re-emit. Tracked under SD-2839.
- Smooth scroll for tracked changes in headers and footers still snaps. Tracked under SD-2841.

## Telemetry

`telemetry: { enabled: false }` is set in `EditorMount.tsx`. SuperDoc defaults to enabled.
