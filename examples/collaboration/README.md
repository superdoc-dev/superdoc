# Collaboration

Open one DOCX in two browser tabs and synchronize edits through a local Hocuspocus server.

The server keeps rooms in memory. Production applications add authentication and persistence through Hocuspocus hooks without changing the editor configuration shown here.

## Run it

Requires Node 22.12 or newer and pnpm 10.

```bash
pnpm install
pnpm dev
```

Open `http://localhost:5173/?mode=create` once to create the room. Open `http://localhost:5173/` in another tab to join it.

## Verify it

```bash
pnpm typecheck
pnpm build
pnpm browsers
pnpm test
```

The browser test creates the room, joins it from a second browser page, edits the first page, and verifies that the second page exports the synchronized text in its DOCX.

See [Real-time collaboration](https://docs.superdoc.dev/editor/collaboration) for provider and room lifecycle guidance.
