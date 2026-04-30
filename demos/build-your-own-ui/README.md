# Build your own SuperDoc UI

A reference workspace built on the `superdoc/ui/react` surface. Toolbar, comment threads, tracked-change review, custom commands, DOCX round-trip - in one app.

This is a demo, not a minimal canonical recipe. It shows how the pieces compose in a real product. For copy-paste-ready single-concept patterns (toolbar only, comments only, etc.), see the `examples/` folder once those land.

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
- Switch between Edit and Suggest. In Suggest, every edit lands as a tracked change.
- Select text and add a comment. Reply threads render under their parent.
- Accept or reject tracked changes. Decided ones move to a Resolved section.
- Export the doc, edit it in Word, click Import, watch the activity feed update.

## Architecture

```
SuperDocUIProvider          one controller per app
└── EditorMount             <SuperDocEditor> + onReady
    ├── Toolbar             ui.commands + setDocumentMode
    └── ActivitySidebar     ui.comments + ui.trackChanges + ui.selection
        └── CommentComposer ui.selection.capture()
```

Components consume the controller via `useSuperDocUI()`. They never reach into `editor.state` or `editor.view`.

## Telemetry

`telemetry: { enabled: false }` is set in `EditorMount.tsx`. SuperDoc defaults to enabled.
