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
- No floating bubble menu or link popover. To position one today, read the browser's selection rect from a `useSuperDocSelection()` effect: `window.getSelection()?.getRangeAt(0)?.getBoundingClientRect()`.

## Three takeaways for your own UI

1. **One provider, many components.** The toolbar, sidebar, and review panel all subscribe to the same controller via hooks. They don't pass props down a tree.
2. **`modules: { comments: false }` and your own panel.** The demo turns off the built-in comments UI and renders its own. Imported comments still flow through export and import.
3. **Capture, then post.** Composers freeze the selection at open and pass the snapshot at submit. The textarea taking focus doesn't lose the anchor.

## Telemetry

`telemetry: { enabled: false }` is set in `EditorMount.tsx`. SuperDoc defaults to enabled.
