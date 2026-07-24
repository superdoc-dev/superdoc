# Policy version history

A product-shaped policy workflow combining SuperDoc collaboration, explicit publishing,
version-scoped comments, tracked-change attribution, and regulation mappings.

## What it demonstrates

- A shared Hocuspocus/Yjs working draft with collaborator awareness.
- A New room action that creates a fresh shareable room URL with isolated version history.
- DOCX import parsed into the active schema and dispatched through the shared Yjs editor.
- Explicit publish actions that create `1.1`, `1.2`, … snapshots; editing does not create versions.
- In-memory version history for the lifetime of the demo server.
- SuperDoc's built-in comments UI, with comments retained in the published snapshot and cleared before the next version.
- Regulation data attached to selected text with `editor.doc.metadata.attach`.
- Custom UI highlights and hover popovers using `ui.metadata.getRect`,
  `ui.viewport.observe`, and `ui.viewport.entityAt`.
- Historical versions rendered read-only with tracked changes and comments.

## Run

```bash
pnpm install
pnpm dev
```

Open `http://localhost:5192` in two tabs to see collaboration. The backend and WebSocket
server run on `http://localhost:3011`.

All state is intentionally in memory and resets when the backend restarts.
