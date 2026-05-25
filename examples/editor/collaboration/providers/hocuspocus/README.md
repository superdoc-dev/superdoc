# SuperDoc + Hocuspocus

Self-hosted collaboration using [Hocuspocus](https://hocuspocus.dev/).

This example shows one integration pattern:

1. The server stores the Yjs document with `Y.encodeStateAsUpdate`.
2. The client waits for Hocuspocus to sync.
3. If the synced Yjs document is empty, SuperDoc seeds it from `public/seed.docx`.
4. Later loads use the stored Yjs document. The DOCX seed is not passed again.

**Docs:** [Hocuspocus guide](https://docs.superdoc.dev/guides/collaboration/hocuspocus)

## Production note

This example decides DOCX seeding client-side, after sync. That keeps the
integration small but is racy under concurrent first-loads: two clients can
both see an empty Yjs document and both import `seed.docx`, producing
duplicated content. In production, gate the seeding decision once per room
from your backend, using room metadata or a lock. See the
[Hocuspocus guide](https://docs.superdoc.dev/guides/collaboration/hocuspocus)
for the pattern.

## Getting started

```bash
pnpm install
pnpm dev
```

This starts the Hocuspocus server at `ws://localhost:1234` and the React client
at `http://localhost:3000`.

Yjs snapshots are written to `.data/`. Delete that folder if you want the next
load to seed from `public/seed.docx` again.
