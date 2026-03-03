# yjs-hub (barebones local server)

Minimal local collaboration server using `@y/hub`.

This is intentionally local-only:
- shared-token auth (query param `?token=...`)
- no persistence (ephemeral mode)
- local Redis + Postgres via Docker

## Run

```bash
cd /Users/nickjbernal/dev/superdoc/examples/collaboration/fastapi/yjs-hub
pnpm install --ignore-workspace --lockfile=false
pnpm run deps:up
pnpm run dev
```

`pnpm run deps:up` uses Docker Compose and requires Docker daemon running.
If Redis/Postgres are already running locally, skip `deps:up` and run `pnpm run dev`.

Node.js 22+ is required by `@y/hub`.

## Auth token

WebSocket connections must provide `token` query param matching `YHUB_AUTH_TOKEN`.

- default token: `YOUR_PRIVATE_TOKEN`
- override: `YHUB_AUTH_TOKEN=<your-token> pnpm run dev`

FastAPI example wiring:
- `main.py` passes `collaboration.tokenEnv = "YHUB_AUTH_TOKEN"`
- `main.py` sets `YHUB_AUTH_TOKEN=YOUR_PRIVATE_TOKEN` by default at startup

## Ephemeral behavior (default)

This demo is configured to be non-persistent:
- compaction worker is disabled in ephemeral mode (`worker: null`)
- Redis keys under this demo prefix are cleared on startup
- PostgreSQL `yhub_ydoc_v1` rows are truncated on startup

Result: restarting `pnpm run dev` starts with an empty collaboration state.

To opt back into persistence for debugging:

```bash
EPHEMERAL=0 pnpm run dev
```

## Endpoint shape

This demo intentionally exposes only:

```text
ws://127.0.0.1:8081/v1/collaboration/:documentId
```

For example:

```text
ws://127.0.0.1:8081/v1/collaboration/superdoc-dev-room
```

For the FastAPI sample (which passes `url` + `documentId` separately), use:
- `COLLAB_URL=ws://127.0.0.1:8081/v1/collaboration`
- `COLLAB_DOCUMENT_ID=superdoc-dev-room`

## Visibility logs

The server logs:
- websocket connect path + room + query hints (`onMissing`, `openMode`, or `seed` if present)
- websocket token pass/fail (`token=ok` on accepted connections)
- inferred room state at auth time: `existing | missing | unknown`
- each incoming `ydoc:update` with update size and a rough seed/edit guess

Debug activity endpoints (for `SuperdocDev` sidebar):
- `GET /v1/collaboration/:documentId/activity/recent` - in-memory recent update metadata
- `GET /v1/collaboration/:documentId/activity/stream` - server-sent events stream of update metadata

Activity payload includes customer-style fields derived from each update:
- `by`, `customAttributions`
- `changedKeys`, `entryKey`, `changeType`, `valueSummary`
- `activityItems[]` (all semantic change entries for the update)

User attribution note:
- websocket clients can pass `?userId=<value>` and the demo server will use that as `userid` for activity attribution.

Note: `@y/hub` itself does not define an `onMissing` protocol field; that value
is only visible if the client passes it as a websocket query param.

## Stop

```bash
pnpm run deps:down
```
