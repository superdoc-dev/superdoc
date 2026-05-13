# Version History Demo

A proof-of-concept for Google Docs-style version history using SuperDoc's tracked changes.

## What This Demo Shows

- **Real-time collaboration** - Multiple users edit simultaneously via Yjs/Hocuspocus
- **Hidden tracked changes** - Edits are tracked but hidden in the main editor
- **Manual version snapshots** - Click "Save Version" to capture the current state as DOCX
- **Version preview** - View saved versions with tracked changes visible
- **Revert to version** - Restore any previous version (syncs to all collaborators)

## Current Limitations

- **Client-side only** - Versions stored in memory, not persisted to backend
- **Manual saves** - No automatic versioning
- **TC-based history** - Shows tracked changes within a version, not a computed diff between versions

## How It Works

1. **Editing**: Users edit in "suggesting" mode with TC hidden (`mode: 'final'`)
2. **Saving**: "Save Version" exports the document as DOCX (preserving TC marks), then accepts all changes
3. **Viewing**: Click a version to preview it with TC marks visible
4. **Reverting**: "Revert" parses the DOCX and replaces editor content (broadcasts via Yjs)

## Running Locally

```bash
cd examples/features/version-history
pnpm install
pnpm dev
```

Starts:
- Hocuspocus server on `ws://localhost:1234`
- Vite dev server on `http://localhost:3000`

## Production Deployment

See the deployed demo: https://superdoc-version-history.pages.dev

For production use, you would:
- Deploy the Hocuspocus server (e.g., Railway)
- Store versions on a backend (S3, database, etc.)
- Add automatic versioning triggers
