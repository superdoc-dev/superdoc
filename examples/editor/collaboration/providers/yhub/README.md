# SuperDoc + YHub

Self-hosted collaboration using [YHub](https://github.com/yjs/yhub), backed by Redis and Postgres. YHub speaks the standard y-websocket protocol, so the SuperDoc client uses `WebsocketProvider` from `y-websocket` and the integration shape stays the same as any other Yjs provider: `modules.collaboration: { ydoc, provider }`.

> **Reference implementation.** The bundled YHub server (in `examples/editor/collaboration/backends/fastapi/yjs-hub/`) is local-only: shared-token auth, ephemeral by default, no production hardening. YHub itself is in beta (Node 22+, AGPL or proprietary licensing). Validate license, beta status, and your operational needs before committing to YHub for production.

## Why YHub?

YHub is worth evaluating when revision history, identity attribution, activity streaming, changesets, or rollback are central to your product. The bundled example server demonstrates the attribution and activity-stream plumbing.

For most teams, [Hocuspocus](https://docs.superdoc.dev/guides/collaboration/hocuspocus) is the simpler self-hosted default.

## Getting started

### 1. Start the YHub server

In a separate terminal:

```bash
cd ../../backends/fastapi/yjs-hub
pnpm install --ignore-workspace --lockfile=false
pnpm run deps:up      # Docker: Redis + Postgres
pnpm run dev          # YHub on ws://127.0.0.1:8081/v1/collaboration
```

Requires Docker and Node.js 22+. See that directory's README for details.

**Postgres port conflict.** The bundled `docker-compose.yml` maps Postgres to `5432`. If that's already in use locally (other dev databases, system Postgres), edit the compose file to use another port and override the server's connection string:

```bash
POSTGRES_URL=postgres://postgres:postgres@127.0.0.1:5436/yhub pnpm run dev
```

### 2. Start the SuperDoc client

```bash
npm install
npm run dev
```

Open http://localhost:3000 in two browser tabs to see real-time collaboration.

**Vite port conflict.** If `3000` is in use, pass `--port`:

```bash
npm run dev -- --port 3001
```

## Configuration

Copy `.env.example` to `.env` and adjust:

| Variable | Default | Notes |
|----------|---------|-------|
| `VITE_YHUB_URL` | `ws://127.0.0.1:8081/v1/collaboration` | Matches the bundled YHub server's `BASE_PATH`. |
| `VITE_DOCUMENT_ID` | `superdoc-dev-room` | Joined as the room name. |
| `VITE_AUTH_TOKEN` | `YOUR_PRIVATE_TOKEN` | Shared dev secret. Override with `YHUB_AUTH_TOKEN` on the server. |
| `VITE_USER_ID` | random | Used for attribution in activity events. |

## Integration shape

The client-side code is provider-agnostic. The only YHub-specific detail is the URL and the query params for auth and user id:

```ts
import { WebsocketProvider } from 'y-websocket';
import * as Y from 'yjs';
import { SuperDoc } from 'superdoc';

const ydoc = new Y.Doc();
const provider = new WebsocketProvider(
  'ws://127.0.0.1:8081/v1/collaboration',
  'superdoc-dev-room',
  ydoc,
  { params: { token: 'YOUR_PRIVATE_TOKEN', userId: 'user-123' } },
);

provider.on('sync', (isSynced) => {
  if (!isSynced) return;
  new SuperDoc({
    selector: '#superdoc',
    modules: { collaboration: { ydoc, provider } },
  });
});
```

## Docs

- [SuperDoc self-hosted overview](https://docs.superdoc.dev/guides/collaboration/self-hosted-overview)
- [YHub repo](https://github.com/yjs/yhub) and [YHub API](https://github.com/yjs/yhub/blob/master/API.md)
- Bundled YHub server: [`examples/editor/collaboration/backends/fastapi/yjs-hub`](../../backends/fastapi/yjs-hub)
