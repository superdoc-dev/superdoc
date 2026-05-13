# Version History Demo

A Google Docs-style version history demo using SuperDoc's tracked changes infrastructure.

## Features

- **Real-time collaboration** - Multiple users can edit simultaneously via Yjs/Hocuspocus
- **Hidden tracked changes** - Edits are tracked but not visually displayed during editing
- **Manual version snapshots** - Click "Save Version" to capture the current state
- **Version history sidebar** - Browse all saved versions with timestamps and contributors
- **Version preview** - Click a version to view it with tracked changes visible as a diff
- **Per-change attribution** - See who made each change in the version

## How It Works

1. **Editing**: Users edit in "suggesting" mode (tracked changes enabled) but changes are hidden via `enableTrackChangesShowFinal()`
2. **Saving**: When "Save Version" is clicked:
   - Current document state is captured (including tracked change marks)
   - Tracked changes are extracted with author attribution
   - All tracked changes are accepted (creating a clean baseline)
   - A new version record is stored
3. **Viewing**: Click a version in the sidebar to see it with tracked changes visible

## Running the Demo

```bash
# From the example directory
cd examples/features/version-history

# Install dependencies
pnpm install

# Start both server and client
pnpm dev
```

This starts:
- Hocuspocus collaboration server on `ws://localhost:1234`
- Vite dev server on `http://localhost:3000`

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Version History Flow                      │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  User Edits (TC hidden)                                     │
│         │                                                   │
│         ▼                                                   │
│  ┌─────────────┐     ┌──────────────────┐                   │
│  │ "Save       │────▶│ Extract TCs with │                   │
│  │  Version"   │     │ author info      │                   │
│  └─────────────┘     └────────┬─────────┘                   │
│                               │                             │
│                               ▼                             │
│  ┌─────────────────────────────────────────┐                │
│  │ Store: { docJson, trackedChanges,       │                │
│  │          timestamp, contributors }       │                │
│  └────────────────────┬────────────────────┘                │
│                       │                                     │
│                       ▼                                     │
│  ┌─────────────────────────────────────────┐                │
│  │ Accept all TCs → Clean baseline         │                │
│  └─────────────────────────────────────────┘                │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## Future Enhancements

- [ ] Automatic timed versioning (save every N minutes)
- [ ] Backend persistence (store versions on server)
- [ ] Version restore functionality
- [ ] Compare arbitrary versions (not just adjacent)
- [ ] Diff visualization between non-adjacent versions
