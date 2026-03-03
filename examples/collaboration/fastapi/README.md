# FastAPI + SuperDoc Collaboration (Barebones)

Tiny demo focused on one thing: open a realtime collaboration session from Python and mutate it via HTTP.

`main.py` is currently hardcoded for the local `@y/hub` server in `./yjs-hub`.
It is also hardcoded to use the repo CLI at `apps/cli/src/index.ts` (via bun)
and local state at `examples/collaboration/fastapi/.superdoc-state`.

## 1) FastAPI setup

```bash
cd /Users/nickjbernal/dev/superdoc/examples/collaboration/fastapi
uv venv .venv
source .venv/bin/activate
uv pip install -r requirements.txt
```

## 2) Start a collaboration server

### Option A: Local `@y/hub` (for this example)

From the FastAPI folder:

```bash
cd /Users/nickjbernal/dev/superdoc/examples/collaboration/fastapi
./run-yjs-hub.sh
```

Or manually:

```bash
cd /Users/nickjbernal/dev/superdoc/examples/collaboration/fastapi/yjs-hub
pnpm install --ignore-workspace --lockfile=false
pnpm run deps:up
pnpm run dev
```

`deps:up` requires Docker daemon running (Docker Desktop on macOS).
If you already run Redis/Postgres locally, use:

```bash
./run-yjs-hub.sh --no-docker
```

The bundled `yjs-hub` demo is ephemeral by default (no persistence across server restarts).

This serves websocket rooms at:

```text
ws://127.0.0.1:8081/v1/collaboration/:documentId
```

### Option B: Internal repo dev collab server

```bash
cd /Users/nickjbernal/dev/superdoc
pnpm dev:collab
```

If you use Option B, update `main.py` to point back to that server URL.

## 3) Start FastAPI

```bash
cd /Users/nickjbernal/dev/superdoc/examples/collaboration/fastapi
uvicorn main:app --reload --port 8000
```

## 4) Test Python API

```bash
curl "http://127.0.0.1:8000/status"
curl "http://127.0.0.1:8000/insert?text=hello%20world"
```

## Endpoints

- `GET /` returns open result + collab config.
- `GET /status` returns current document/session status.
- `GET /insert?text=...` inserts text into the live collaborative doc.
- `GET /download` exports the current session as `.docx` and downloads it.
