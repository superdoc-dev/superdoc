# Version history

Save DOCX snapshots in browser memory and restore an earlier version.

This example keeps storage deliberately small: versions last only until the page reloads. A production application can persist the same exported `Blob` objects in its own backend or browser storage.

## Run it

Requires Node 22.12 or newer and pnpm 10.

```bash
pnpm install
pnpm dev
```

Edit the document, choose **Save version**, and use a version button to restore a snapshot.

## Verify it

```bash
pnpm typecheck
pnpm build
pnpm browsers
pnpm test
```

The browser test saves a real DOCX, edits it, saves another version, restores the first version, and verifies the restored DOCX bytes.

See [Manage document files](https://docs.superdoc.dev/editor/platform/document-management) for the storage ownership model.
